import React from 'react';
import { Box, Chip, Grid, Paper, TextField, TextFieldProps, Tooltip, Typography } from '@mui/material';
import dayjs from 'dayjs';
import { fdate, fexp } from '../../lib/format';
import { STATES } from '../../lib/types';
import { useFetch } from '../../lib/hooks';
import type { User } from '../../lib/types';

// Small UI helpers shared by the masters / inventory screens.

export const Section: React.FC<{ title: string; hint?: React.ReactNode; children: React.ReactNode; actions?: React.ReactNode }> = ({ title, hint, children, actions }) => (
  <Paper sx={{ p: 2, mb: 2 }}>
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1.5 }}>
      <Typography variant="subtitle2" sx={{ textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 12, color: 'primary.dark' }}>{title}</Typography>
      {hint && <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>{hint}</Typography>}
      {actions && <Box sx={{ ml: 'auto' }}>{actions}</Box>}
    </Box>
    <Grid container spacing={1.5}>{children}</Grid>
  </Paper>
);

// Number input that keeps the raw string while typing but reports a number.
export const NumField: React.FC<Omit<TextFieldProps, 'value' | 'onChange'> & { value: number | string | undefined; onChange: (v: number) => void; suffix?: string }> = ({ value, onChange, suffix, InputProps, ...rest }) => (
  <TextField
    {...rest}
    type="number"
    fullWidth={rest.fullWidth ?? true}
    value={value === undefined || value === null || Number.isNaN(value) ? '' : value}
    onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
    onFocus={(e) => e.target.select()}
    inputProps={{ step: 'any', min: 0, ...(rest.inputProps || {}) }}
    InputProps={{ ...(InputProps || {}), endAdornment: suffix ? <Typography fontSize={12} color="text.secondary">{suffix}</Typography> : InputProps?.endAdornment }}
  />
);

export const daysTo = (d?: string | Date | null) => (d ? dayjs(d).startOf('day').diff(dayjs().startOf('day'), 'day') : null);

// Expiry shown MM/YY, red when expired, amber when within `nearDays`.
export const ExpiryText: React.FC<{ expiry?: string | null; nearDays?: number; bold?: boolean }> = ({ expiry, nearDays = 90, bold }) => {
  if (!expiry) return <>—</>;
  const d = daysTo(expiry) ?? 0;
  const color = d < 0 ? 'error.main' : d < nearDays ? 'warning.dark' : 'text.primary';
  return (
    <Tooltip title={d < 0 ? `Expired ${-d} days ago` : `${d} days left`}>
      <Typography component="span" fontSize={13} fontWeight={bold || d < nearDays ? 700 : 400} color={color}>{fexp(expiry)}</Typography>
    </Tooltip>
  );
};

// Drug-licence expiry chip: expired / expiring within 30 days / ok.
export const DlChip: React.FC<{ expiry?: string | null; showOk?: boolean }> = ({ expiry, showOk }) => {
  if (!expiry) return showOk ? <Chip label="No DL expiry" variant="outlined" sx={{ height: 20, fontSize: 11 }} /> : null;
  const d = daysTo(expiry) ?? 0;
  if (d < 0) return <Chip label={`DL expired ${fdate(expiry)}`} color="error" sx={{ height: 20, fontSize: 11, fontWeight: 600 }} />;
  if (d <= 30) return <Chip label={`DL exp ${fdate(expiry)}`} color="warning" sx={{ height: 20, fontSize: 11, fontWeight: 600 }} />;
  return showOk ? <Chip label={`DL valid till ${fdate(expiry)}`} color="success" variant="outlined" sx={{ height: 20, fontSize: 11 }} /> : null;
};

export const SmallChip: React.FC<{ label: string; color?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'primary'; variant?: 'filled' | 'outlined' }> = ({ label, color = 'default', variant = 'filled' }) => (
  <Chip label={label} color={color} variant={variant} sx={{ height: 18, fontSize: 10.5, fontWeight: 700, ml: 0.5 }} />
);

// ---- GSTIN (mirror of backend utils/gst.ts so the operator sees mistakes while typing) ----
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const checkDigit = (first14: string) => {
  let total = 0;
  for (let i = 0; i < 14; i++) {
    const v = CHARSET.indexOf(first14[i]);
    const p = v * (i % 2 === 0 ? 1 : 2);
    total += Math.floor(p / 36) + (p % 36);
  }
  return CHARSET[(36 - (total % 36)) % 36];
};

// Returns an error message, or '' when valid / empty.
export const gstinIssue = (g: string): string => {
  const s = g.trim().toUpperCase();
  if (!s) return '';
  if (s.length < 15) return `${s.length}/15 characters`;
  if (s.length > 15) return 'GSTIN has 15 characters';
  if (!STATES[s.slice(0, 2)]) return `Invalid state code ${s.slice(0, 2)}`;
  if (!GSTIN_REGEX.test(s)) return 'Format should be 22AAAAA0000A1Z5';
  if (checkDigit(s.slice(0, 14)) !== s[14]) return 'Check digit does not match — likely a typo';
  return '';
};

export const useUsers = (role?: string) => {
  const { data } = useFetch<{ data: User[] }>('/users');
  return (data?.data || []).filter((u) => u.isActive !== false && (!role || u.role === role));
};

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const scheme = (buy?: number, free?: number) => (buy && free ? `${buy}+${free}` : '');

export const KV: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <Box sx={{ minWidth: 0 }}>
    <Typography variant="caption" color="text.secondary" display="block" noWrap>{label}</Typography>
    <Typography fontSize={13} fontWeight={600} component="div" sx={{ wordBreak: 'break-word' }}>{children || '—'}</Typography>
  </Box>
);

// Pull the _id out of a populated ref or a raw id.
export const refId = (v: unknown): string => (v && typeof v === 'object' ? String((v as { _id: string })._id) : v ? String(v) : '');
export const refName = (v: unknown): string => (v && typeof v === 'object' ? String((v as { name?: string }).name || '') : '');
