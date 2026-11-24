// Helpers shared by the GST return screens.
import React from 'react';
import dayjs from 'dayjs';
import { TextField } from '@mui/material';
import { DataTable, Col } from '../../components/DataTable';
import { amt, num, round2 } from '../../lib/format';
import { STATES } from '../../lib/types';

export const prevMonth = () => dayjs().subtract(1, 'month').format('YYYY-MM');
export const monthLabel = (ym: string) => dayjs(`${ym}-01`).format('MMMM YYYY');
export const posLabel = (code?: string) => (code ? `${code}-${STATES[code] || ''}` : '');

export const MonthInput: React.FC<{ value: string; onChange: (v: string) => void; label?: string }> = ({ value, onChange, label = 'Return period' }) => (
  <TextField type="month" label={label} value={value} onChange={(e) => e.target.value && onChange(e.target.value)} InputLabelProps={{ shrink: true }}
    inputProps={{ max: dayjs().format('YYYY-MM') }} sx={{ width: 170 }} />
);

// A column spec that drives both the on-screen table and the Excel sheet.
export interface GCol<T> { key: string; label: string; kind?: 'money' | 'qty' | 'text' | 'pct'; get?: (r: T) => string | number | null | undefined; total?: boolean }

const val = <T,>(c: GCol<T>, r: T) => (c.get ? c.get(r) : (r as Record<string, unknown>)[c.key]) as string | number | null | undefined;

export function GTable<T>({ cols, rows, loading, empty, maxHeight }: { cols: GCol<T>[]; rows: T[]; loading?: boolean; empty?: string; maxHeight?: string }) {
  const columns: Col<T>[] = cols.map((c, i) => {
    const numeric = c.kind === 'money' || c.kind === 'qty' || c.kind === 'pct';
    const totalable = c.total ?? (c.kind === 'money' || c.kind === 'qty');
    const sum = totalable ? round2(rows.reduce((s, r) => s + (Number(val(c, r)) || 0), 0)) : 0;
    return {
      key: c.key,
      label: c.label,
      align: numeric ? 'right' : undefined,
      nowrap: true,
      render: (r: T) => { const v = val(c, r); return c.kind === 'money' ? amt(Number(v)) : c.kind === 'qty' ? num(Number(v)) : c.kind === 'pct' ? `${v}%` : (v ?? ''); },
      footer: i === 0 ? `Total (${rows.length})` : totalable ? (c.kind === 'qty' ? num(sum) : amt(sum)) : '',
    };
  });
  return <DataTable columns={columns} rows={rows} loading={loading} rowKey={(_r, i) => String(i)} empty={empty} maxHeight={maxHeight ?? 'calc(100vh - 330px)'} />;
}

// Excel sheet spec from the same columns, with a total row.
export const sheetOf = <T,>(name: string, cols: GCol<T>[], rows: T[]) => {
  const totals: Record<string, unknown> = {};
  cols.forEach((c, i) => {
    if (i === 0) totals[c.key] = 'TOTAL';
    else if (c.total ?? (c.kind === 'money' || c.kind === 'qty')) totals[c.key] = round2(rows.reduce((s, r) => s + (Number(val(c, r)) || 0), 0));
  });
  const out = rows.map((r) => Object.fromEntries(cols.map((c) => [c.key, val(c, r)]))) as Record<string, unknown>[];
  if (rows.length) out.push(totals);
  return { name, rows: out, columns: cols.map((c) => ({ key: c.key, label: c.label })) };
};
