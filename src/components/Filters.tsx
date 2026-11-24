import React, { useState } from 'react';
import { Box, Button, InputAdornment, Menu, MenuItem, TextField } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import dayjs from 'dayjs';

export const FilterBar: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 1.5 }}>{children}</Box>
);

export const SearchBox: React.FC<{ value: string; onChange: (v: string) => void; placeholder?: string; width?: number }> = ({ value, onChange, placeholder = 'Search…', width = 260 }) => (
  <TextField
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    sx={{ width: { xs: '100%', sm: width } }}
    InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
  />
);

const PRESETS: { label: string; range: () => [string, string] }[] = [
  { label: 'Today', range: () => [dayjs().format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')] },
  { label: 'Yesterday', range: () => [dayjs().subtract(1, 'day').format('YYYY-MM-DD'), dayjs().subtract(1, 'day').format('YYYY-MM-DD')] },
  { label: 'This month', range: () => [dayjs().startOf('month').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')] },
  { label: 'Last month', range: () => [dayjs().subtract(1, 'month').startOf('month').format('YYYY-MM-DD'), dayjs().subtract(1, 'month').endOf('month').format('YYYY-MM-DD')] },
  { label: 'This quarter', range: () => { const q = Math.floor(dayjs().month() / 3) * 3; return [dayjs().month(q).startOf('month').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')]; } },
  {
    label: 'This financial year',
    range: () => { const y = dayjs().month() >= 3 ? dayjs().year() : dayjs().year() - 1; return [`${y}-04-01`, dayjs().format('YYYY-MM-DD')]; },
  },
  {
    label: 'Last financial year',
    range: () => { const y = (dayjs().month() >= 3 ? dayjs().year() : dayjs().year() - 1) - 1; return [`${y}-04-01`, `${y + 1}-03-31`]; },
  },
];

export const DateRange: React.FC<{ from: string; to: string; onChange: (from: string, to: string) => void }> = ({ from, to, onChange }) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', width: { xs: '100%', sm: 'auto' } }}>
      <TextField type="date" label="From" value={from} onChange={(e) => onChange(e.target.value, to)} InputLabelProps={{ shrink: true }} sx={{ width: { xs: 'auto', sm: 150 }, flex: { xs: 1, sm: 'none' }, minWidth: 0 }} />
      <TextField type="date" label="To" value={to} onChange={(e) => onChange(from, e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: { xs: 'auto', sm: 150 }, flex: { xs: 1, sm: 'none' }, minWidth: 0 }} />
      <Button variant="outlined" onClick={(e) => setAnchor(e.currentTarget)} sx={{ flexShrink: 0 }}>Period</Button>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {PRESETS.map((p) => (
          <MenuItem key={p.label} onClick={() => { const [f, t] = p.range(); onChange(f, t); setAnchor(null); }}>{p.label}</MenuItem>
        ))}
      </Menu>
    </Box>
  );
};
