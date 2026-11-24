import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errMsg } from '../api/client';
import { useSnackbar } from 'notistack';

// GET with params; refetches when params change. Returns the raw response body.
export function useFetch<T = any>(url: string | null, params?: Record<string, unknown>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(params || {});
  const { enqueueSnackbar } = useSnackbar();

  const load = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    setError(null);
    try {
      const clean = Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== '' && v !== undefined && v !== null));
      const r = await api.get(url, { params: clean });
      setData(r.data);
    } catch (e) {
      const m = errMsg(e);
      setError(m);
      enqueueSnackbar(m, { variant: 'error' });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, key]);

  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load, setData };
}

export function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

// Global keyboard shortcut (e.g. F2 to save). Ignores repeats.
export function useHotkey(key: string, handler: (e: KeyboardEvent) => void, deps: unknown[] = []) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      const combo = `${e.ctrlKey || e.metaKey ? 'ctrl+' : ''}${e.altKey ? 'alt+' : ''}${e.key.toLowerCase()}`;
      if (combo === key.toLowerCase() && !e.repeat) { e.preventDefault(); ref.current(e); }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ...deps]);
}
