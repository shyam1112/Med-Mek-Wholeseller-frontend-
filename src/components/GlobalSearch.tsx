import React, { useEffect, useState } from 'react';
import { Box, Dialog, InputAdornment, List, ListItemButton, ListItemText, TextField, Typography, Chip } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useDebounced, useHotkey } from '../lib/hooks';
import { NAV } from './nav';
import { useAuth } from '../auth/AuthContext';

interface Hit { type: string; id: string; title: string; subtitle?: string }

const PATH: Record<string, (id: string) => string> = {
  product: (id) => `/products/${id}`,
  customer: (id) => `/parties/${id}`,
  supplier: (id) => `/parties/${id}`,
  sale: (id) => `/sales/${id}`,
  purchase: (id) => `/purchases/${id}`,
  batch: (id) => `/products/${id}`,
};

// Ctrl+K: jump to any screen, product, party, bill or batch.
export const GlobalSearch: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [sel, setSel] = useState(0);
  const dq = useDebounced(q, 200);
  const nav = useNavigate();
  const { can } = useAuth();

  const screens: Hit[] = NAV.flatMap((s) => s.items.filter((i) => !i.perm || can(i.perm)).map((i) => ({ type: 'screen', id: i.path, title: i.label, subtitle: s.label })))
    .filter((h) => q && h.title.toLowerCase().includes(q.toLowerCase())).slice(0, 5);

  useEffect(() => {
    if (dq.length < 2) { setHits([]); return; }
    api.get('/search', { params: { q: dq } }).then((r) => setHits(r.data.data)).catch(() => {});
  }, [dq]);
  useEffect(() => { if (open) { setQ(''); setSel(0); } }, [open]);

  const all = [...screens, ...hits];
  const go = (h: Hit) => { onClose(); nav(h.type === 'screen' ? h.id : PATH[h.type](h.id)); };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" PaperProps={{ sx: { position: 'absolute', top: 80 } }}>
      <TextField
        autoFocus fullWidth value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }}
        placeholder="Search screens, products, parties, bill numbers, batches…"
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, all.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
          if (e.key === 'Enter' && all[sel]) go(all[sel]);
        }}
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0, fontSize: 16 }, '& fieldset': { border: 'none' } }}
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
      />
      <List dense sx={{ maxHeight: 420, overflow: 'auto', borderTop: 1, borderColor: 'divider' }}>
        {all.map((h, i) => (
          <ListItemButton key={`${h.type}-${h.id}-${i}`} selected={i === sel} onClick={() => go(h)}>
            <ListItemText primary={h.title} secondary={h.subtitle} />
            <Chip label={h.type} variant="outlined" />
          </ListItemButton>
        ))}
        {!all.length && <Box sx={{ p: 2 }}><Typography color="text.secondary" fontSize={13}>Type at least 2 letters. Tip: Alt+N new bill · Alt+P new purchase · Alt+R receipt</Typography></Box>}
      </List>
    </Dialog>
  );
};

export const useGlobalSearchHotkey = (open: () => void) => useHotkey('ctrl+k', open);
