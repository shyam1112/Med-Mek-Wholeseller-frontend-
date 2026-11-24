import { useCallback, useEffect, useRef, useState } from 'react';
import { api, API_BASE, TOKEN_KEY } from '../api/client';
import { useAuth } from '../auth/AuthContext';

// Auto-save for entry screens. Unsaved work is written to this browser at
// once (switching screens, refresh) and to the server a moment later (power
// cut, another computer). A draft never touches stock or accounts — the
// screen's own Save still makes the real document.

export interface Stored<T> { data: T; savedAt: number }
export type DraftStatus = 'idle' | 'pending' | 'saved' | 'offline';

const SERVER_DELAY = 1200;
const localKey = (user: string, key: string) => `mmw_draft_${user}_${key}`;

const readLocal = <T,>(k: string): Stored<T> | null => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; }
};
const writeLocal = (k: string, v: Stored<unknown> | null) => {
  try { if (v) localStorage.setItem(k, JSON.stringify(v)); else localStorage.removeItem(k); } catch { /* storage full/blocked */ }
};

// Last-chance server write when the page is going away (tab closed, app
// switched on a phone). keepalive lets the request finish after unload.
const beacon = (key: string, body: Stored<unknown>) => {
  try {
    fetch(`${API_BASE}/drafts/${key}`, {
      method: 'PUT', keepalive: true,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${localStorage.getItem(TOKEN_KEY) || ''}` },
      body: JSON.stringify(body),
    }).catch(() => {});
  } catch { /* ignore */ }
};

export function useDraft<T>(opts: {
  /** Screen + document, e.g. "sales_order:new" or "sales_order:<id>". null turns it off. */
  key: string | null;
  /** The screen finished its own first load (edit doc, query params…). */
  ready: boolean;
  /** Restore straight away (screen opened empty). Otherwise the draft waits for the user. */
  autoRestore: boolean;
  /** The screen's current entry, or null when there is nothing worth keeping.
   *  Equal to what the screen showed when it finished loading = nothing to keep. */
  value: T | null;
  /** Put a draft back on the screen. */
  apply: (d: T) => void;
  /** Stop saving (e.g. the document was just saved). */
  paused?: boolean;
  /** Ignore drafts older than this (ms) — e.g. the document's last update. */
  notBefore?: number;
}) {
  const { user } = useAuth();
  const { key, ready, autoRestore, value, apply, paused, notBefore } = opts;
  const raw = value === null ? '' : JSON.stringify(value);
  const rawRef = useRef(raw);
  rawRef.current = raw;
  const lk = key && user ? localKey(user._id, key) : null;
  // Loaded per key: a screen that saves a new document moves to its edit key.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loaded = !!key && loadedKey === key;
  const [restored, setRestored] = useState<Stored<T> | null>(null);
  const [waiting, setWaiting] = useState<Stored<T> | null>(null);
  const [status, setStatus] = useState<DraftStatus>('idle');
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const timer = useRef<number>();
  const pending = useRef<Stored<T> | null>(null);
  const stored = useRef(false);
  const lastJson = useRef('');
  const baseline = useRef('');
  const applyRef = useRef(apply);
  applyRef.current = apply;

  const pushServer = useCallback(async () => {
    window.clearTimeout(timer.current);
    const body = pending.current;
    if (!key || !body) return;
    pending.current = null;
    try {
      await api.put(`/drafts/${key}`, body);
      setStatus((s) => (pending.current ? s : 'saved'));
      setLastSaved(body.savedAt);
    } catch {
      setStatus('offline');
      if (!pending.current) pending.current = body; // retry with the next change
    }
  }, [key]);

  // First load: newest of browser and server copy.
  useEffect(() => {
    if (!ready || !key || !lk || loaded) return;
    stored.current = false; lastJson.current = ''; setRestored(null); setWaiting(null);
    let off = false;
    (async () => {
      const local = readLocal<T>(lk);
      let server: Stored<T> | null = null;
      try { server = (await api.get(`/drafts/${key}`)).data.data; } catch { /* offline: local only */ }
      if (off) return;
      // What the screen shows untouched (blank form, or the document being edited).
      baseline.current = rawRef.current;
      let d = [local, server].filter(Boolean).sort((a, b) => b!.savedAt - a!.savedAt)[0] || null;
      if (d && notBefore && d.savedAt < notBefore) {
        // The document changed after this draft was written — drop it.
        writeLocal(lk, null); api.delete(`/drafts/${key}`).catch(() => {}); d = null;
      }
      if (d) {
        stored.current = true;
        lastJson.current = JSON.stringify(d.data);
        if (autoRestore) { applyRef.current(d.data); setRestored(d); setLastSaved(d.savedAt); setStatus('saved'); } else setWaiting(d);
      }
      setLoadedKey(key);
    })();
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key, lk]);

  // Save on every change.
  const json = raw === baseline.current ? '' : raw;
  useEffect(() => {
    if (!loaded || !key || !lk || waiting || paused) return;
    if (json === lastJson.current) return;
    lastJson.current = json;
    if (!json) {
      if (stored.current) { writeLocal(lk, null); api.delete(`/drafts/${key}`).catch(() => {}); stored.current = false; }
      window.clearTimeout(timer.current); pending.current = null; setStatus('idle');
      return;
    }
    const body: Stored<T> = { data: JSON.parse(json), savedAt: Date.now() };
    writeLocal(lk, body);
    stored.current = true;
    pending.current = body;
    setStatus('pending');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(pushServer, SERVER_DELAY);
  }, [json, loaded, key, lk, waiting, paused, pushServer]);

  // Leaving the screen, hiding the tab or closing it: send what's pending now.
  useEffect(() => {
    const flush = () => { if (pending.current && key) { beacon(key, pending.current); pending.current = null; window.clearTimeout(timer.current); } };
    const vis = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('pagehide', flush);
    return () => { document.removeEventListener('visibilitychange', vis); window.removeEventListener('pagehide', flush); flush(); };
  }, [key]);

  /** The real document was saved (or the user threw the work away). Resolves when the server copy is gone. */
  const clear = useCallback(() => {
    window.clearTimeout(timer.current);
    pending.current = null;
    if (lk) writeLocal(lk, null);
    const done = key ? api.delete(`/drafts/${key}`).then(() => undefined, () => undefined) : Promise.resolve();
    stored.current = false;
    lastJson.current = '';
    // What is on screen now is saved — only later changes are new work.
    baseline.current = rawRef.current;
    setRestored(null);
    setWaiting(null);
    setStatus('idle');
    return done;
  }, [key, lk]);

  const openWaiting = useCallback(() => {
    if (!waiting) return;
    applyRef.current(waiting.data);
    setRestored(waiting);
    setWaiting(null);
  }, [waiting]);

  const discardWaiting = useCallback(() => {
    if (lk) writeLocal(lk, null);
    if (key) api.delete(`/drafts/${key}`).catch(() => {});
    stored.current = false;
    lastJson.current = '';
    setWaiting(null);
  }, [key, lk]);

  return { restored, waiting, status, lastSaved, clear, openWaiting, discardWaiting, dismissRestored: () => setRestored(null) };
}

export type DraftApi = ReturnType<typeof useDraft>;
