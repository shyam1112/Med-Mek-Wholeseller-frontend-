import React, { useMemo, useState } from 'react';
import {
  Box, Button, Dialog, DialogContent, DialogTitle, IconButton, InputAdornment, Popover, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import { GLOSSARY, openHelp, Word, word } from './glossary';

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box component="kbd" sx={{ px: 0.75, py: 0.1, border: 1, borderColor: 'divider', borderBottomWidth: 2, borderRadius: 1, fontSize: 11.5, fontFamily: 'inherit', fontWeight: 600, bgcolor: '#f7f9fc', whiteSpace: 'nowrap' }}>{children}</Box>
);

const WordRow: React.FC<{ w: Word }> = ({ w }) => (
  <Box sx={{ py: 1, borderBottom: 1, borderColor: '#f0f3f7' }}>
    <Typography fontSize={13.5} fontWeight={700}>
      {w.term}
      {w.aka && <Typography component="span" fontSize={12.5} color="text.secondary" fontWeight={500}> — {w.aka}</Typography>}
    </Typography>
    <Typography fontSize={13} color="text.primary" mt={0.25}>{w.meaning}</Typography>
    {w.example && <Typography fontSize={12} color="text.secondary" mt={0.25}>e.g. {w.example}</Typography>}
  </Box>
);

export const SHORTCUTS: { group: string; keys: [string, string][] }[] = [
  { group: 'Anywhere', keys: [['Ctrl + K', 'Search products, parties, bills or any screen'], ['Alt + N', 'New sales bill'], ['Alt + P', 'New purchase bill'], ['Alt + R', 'New receipt'], ['?', 'This help']] },
  { group: 'Sales bill', keys: [['F4', 'Customer'], ['F3', 'Product search'], ['F6', 'Batch window for the product'], ['Enter', 'Next field / add the line'], ['Esc', 'Clear the entry row'], ['F2  or  Ctrl + S', 'Save bill']] },
  { group: 'Batch window', keys: [['↑ ↓', 'Move between batches'], ['Enter', 'Pick batch'], ['Esc', 'Close']] },
  { group: 'Other entry screens', keys: [['Ctrl + S', 'Save (orders, purchases, returns, receipts…)'], ['Enter', 'Add the line being typed']] },
];

// Whole help: meanings of words (searchable) and keyboard shortcuts.
export const HelpDialog: React.FC<{ open: boolean; tab: 'words' | 'keys'; search: string; onTab: (t: 'words' | 'keys') => void; onSearch: (s: string) => void; onClose: () => void }> = ({
  open, tab, search, onTab, onSearch, onClose,
}) => {
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? GLOSSARY.filter((w) => `${w.term} ${w.aka || ''} ${w.meaning}`.toLowerCase().includes(q)) : GLOSSARY;
  }, [search]);
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth scroll="paper">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', pb: 0 }}>
        Help
        <IconButton onClick={onClose} sx={{ ml: 'auto' }} aria-label="Close"><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <Box sx={{ px: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tab} onChange={(_, v) => onTab(v)}>
          <Tab value="words" label="What does it mean?" />
          <Tab value="keys" label="Keyboard shortcuts" />
        </Tabs>
      </Box>
      <DialogContent sx={{ minHeight: 420 }}>
        {tab === 'words' ? (
          <>
            <TextField fullWidth autoFocus placeholder="Search a word — PTR, CD, Dr, DL…" value={search} onChange={(e) => onSearch(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} sx={{ mb: 1 }} />
            {list.map((w) => <WordRow key={w.id} w={w} />)}
            {!list.length && <Typography color="text.secondary" fontSize={13} py={3} textAlign="center">No word matches “{search}”.</Typography>}
          </>
        ) : SHORTCUTS.map((g) => (
          <Box key={g.group} sx={{ mb: 2 }}>
            <Typography fontSize={11.5} fontWeight={700} color="text.secondary" textTransform="uppercase" letterSpacing={0.5} mb={0.75}>{g.group}</Typography>
            {g.keys.map(([k, d]) => (
              <Box key={k} sx={{ display: 'flex', alignItems: 'center', py: 0.6, borderBottom: 1, borderColor: '#f0f3f7' }}>
                <Typography fontSize={13.5} sx={{ flex: 1 }}>{d}</Typography>
                <Box sx={{ display: 'flex', gap: 0.5 }}>{k.split('  or  ').map((x) => <Kbd key={x}>{x}</Kbd>)}</Box>
              </Box>
            ))}
          </Box>
        ))}
      </DialogContent>
    </Dialog>
  );
};

// "Words on this screen" button: the meanings of the terms a screen uses.
export const WordsHelp: React.FC<{ ids: string[] }> = ({ ids }) => {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const words = ids.map(word).filter(Boolean) as Word[];
  if (!words.length) return null;
  return (
    <>
      <Button size="small" startIcon={<HelpOutlineIcon fontSize="small" />} onClick={(e) => setEl(e.currentTarget)}
        sx={{ color: 'text.secondary', fontWeight: 500, minHeight: 28, px: 1, '&:hover': { color: 'primary.main' } }}>
        What do these words mean?
      </Button>
      <Popover open={!!el} anchorEl={el} onClose={() => setEl(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { width: 400, maxWidth: 'calc(100vw - 32px)', maxHeight: 460, p: 2, pt: 1 } } }}>
        {words.map((w) => <WordRow key={w.id} w={w} />)}
        <Button size="small" sx={{ mt: 1 }} onClick={() => { setEl(null); openHelp('words'); }}>See all words</Button>
      </Popover>
    </>
  );
};
