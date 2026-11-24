// Shared bits for the report screens (kept inside pages/reports so shared
// components stay untouched).
import React from 'react';
import dayjs from 'dayjs';
import { Alert, Box, Button, GlobalStyles, Paper, Typography } from '@mui/material';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '../../auth/AuthContext';
import { inr, inrShort, num } from '../../lib/format';

export const fyStartDate = () => {
  const y = dayjs().month() >= 3 ? dayjs().year() : dayjs().year() - 1;
  return `${y}-04-01`;
};
export const lastMonthRange = (): [string, string] => [
  dayjs().subtract(1, 'month').startOf('month').format('YYYY-MM-DD'),
  dayjs().subtract(1, 'month').endOf('month').format('YYYY-MM-DD'),
];
export const prevMonth = () => dayjs().subtract(1, 'month').format('YYYY-MM');
export const periodLabel = (from: string, to: string) => `${dayjs(from).format('DD-MM-YYYY')} to ${dayjs(to).format('DD-MM-YYYY')}`;
export const monthLabel = (ym: string) => dayjs(`${ym}-01`).format('MMMM YYYY');

// Margin % colour: loss red, thin (<5%) amber, healthy green.
export const marginColor = (pct: number) => (pct < 0 ? 'error.main' : pct < 5 ? 'warning.main' : 'success.main');
export const MarginPct: React.FC<{ value: number }> = ({ value }) => (
  <Typography component="span" fontSize={13} fontWeight={600} color={marginColor(value)}>{(value || 0).toFixed(1)}%</Typography>
);

export const safeName = (s: string) => s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-');

// Error with retry; shown above the table when a fetch fails.
export const ErrorBox: React.FC<{ error?: string | null; onRetry?: () => void }> = ({ error, onRetry }) =>
  error ? (
    <Alert severity="error" sx={{ mb: 1.5 }} action={onRetry && <Button color="inherit" size="small" onClick={onRetry}>Retry</Button>}>{error}</Alert>
  ) : null;

// Window print support: business header visible only on paper, tables
// un-clipped (DataTable has a max-height on screen), optional landscape.
export const PrintSupport: React.FC<{ title: string; subtitle?: string; landscape?: boolean }> = ({ title, subtitle, landscape }) => {
  const { business } = useAuth();
  return (
    <>
      <GlobalStyles styles={{
        '.print-only': { display: 'none' },
        '@media print': {
          '.print-only': { display: 'block !important' },
          '.MuiTableContainer-root': { maxHeight: 'none !important', overflow: 'visible !important' },
          '.MuiTableCell-root': { padding: '3px 6px !important', fontSize: '10.5px !important' },
          '.MuiTableCell-stickyHeader, .MuiTableFooter-root td': { position: 'static !important' },
          '.MuiPaper-root': { boxShadow: 'none !important' },
          '.print-hide': { display: 'none !important' },
        },
        ...(landscape ? { '@page': { size: 'A4 landscape', margin: '8mm' } } : { '@page': { size: 'A4', margin: '8mm' } }),
      }} />
      <Box className="print-only" sx={{ mb: 1.5, borderBottom: '1px solid #444', pb: 1 }}>
        <Typography fontWeight={800} fontSize={16}>{business?.name}</Typography>
        <Typography fontSize={11}>
          {[business?.address, business?.city].filter(Boolean).join(', ')}
          {business?.gstin ? ` · GSTIN ${business.gstin}` : ''}
          {business?.dl20b || business?.dl21b ? ` · DL ${[business?.dl20b, business?.dl21b].filter(Boolean).join(', ')}` : ''}
        </Typography>
        <Typography fontWeight={700} fontSize={13} sx={{ mt: 0.5 }}>{title}</Typography>
        {subtitle && <Typography fontSize={11}>{subtitle}</Typography>}
      </Box>
    </>
  );
};

const CHART_COLOR = '#0f5c8c';
const tickMoney = (v: number) => inrShort(v).replace('₹', '');

// Single-series bar (top N) — one hue, rounded data-ends, hover tooltip.
export function TopBarChart<T>({ rows, label, value, valueLabel, height = 240, onClick, money = true }: {
  rows: T[]; label: (r: T) => string; value: (r: T) => number; valueLabel: string; height?: number; onClick?: (r: T) => void; money?: boolean;
}) {
  const data = rows.map((r) => ({ name: label(r), v: value(r), row: r }));
  if (!data.length) return null;
  return (
    <Paper className="print-hide" sx={{ p: 1.5, mb: 1.5 }}>
      <Typography variant="caption" color="text.secondary">{valueLabel}</Typography>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 4 }} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke="#e8edf2" />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} tickFormatter={(s: string) => (s.length > 12 ? `${s.slice(0, 11)}…` : s)} stroke="#9aa8b6" />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={money ? tickMoney : (v: number) => num(v)} stroke="#9aa8b6" width={56} />
          <Tooltip cursor={{ fill: 'rgba(15,92,140,0.06)' }} formatter={(v: number) => [money ? inr(v) : num(v), valueLabel]} />
          <Bar dataKey="v" fill={CHART_COLOR} radius={[4, 4, 0, 0]} maxBarSize={36}
            onClick={onClick ? (d: { row?: T }) => d?.row && onClick(d.row) : undefined} cursor={onClick ? 'pointer' : undefined} />
        </BarChart>
      </ResponsiveContainer>
    </Paper>
  );
}

export function TrendChart<T>({ rows, label, value, valueLabel, height = 240 }: { rows: T[]; label: (r: T) => string; value: (r: T) => number; valueLabel: string; height?: number }) {
  const data = rows.map((r) => ({ name: label(r), v: value(r) }));
  if (!data.length) return null;
  return (
    <Paper className="print-hide" sx={{ p: 1.5, mb: 1.5 }}>
      <Typography variant="caption" color="text.secondary">{valueLabel}</Typography>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
          <CartesianGrid vertical={false} stroke="#e8edf2" />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#9aa8b6" />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={tickMoney} stroke="#9aa8b6" width={56} />
          <Tooltip formatter={(v: number) => [inr(v), valueLabel]} />
          <Line type="monotone" dataKey="v" stroke={CHART_COLOR} strokeWidth={2} dot={data.length <= 31 ? { r: 3 } : false} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </Paper>
  );
}

// Only sales bills and purchases have a view screen; other vouchers open their list.
export const voucherPath = (voucherType: string, id?: string | null): string | null => {
  if (voucherType === 'sales' || voucherType === 'sale') return id ? `/sales/${id}` : '/sales';
  if (voucherType === 'purchase') return id ? `/purchases/${id}` : '/purchases';
  const lists: Record<string, string> = {
    sales_return: '/sales-returns', purchase_return: '/purchase-returns', receipt: '/receipts', payment: '/payments',
    journal: '/journals', contra: '/journals', expense: '/journals', stock_adjustment: '/stock-adjustments',
    pdc_clear: '/receipts', cheque_bounce: '/receipts',
  };
  return lists[voucherType] || null;
};

export const VOUCHER_LABEL: Record<string, string> = {
  sales: 'Sales', sale: 'Sale', purchase: 'Purchase', receipt: 'Receipt', payment: 'Payment', sales_return: 'Credit Note',
  purchase_return: 'Debit Note', journal: 'Journal', contra: 'Contra', expense: 'Expense', pdc_clear: 'PDC Cleared',
  cheque_bounce: 'Cheque Bounce', stock_adjustment: 'Stock Adj.', opening: 'Opening', adjustment: 'Adjustment',
  purchase_cancel: 'Purchase (cancelled)', sale_cancel: 'Sale (cancelled)', sales_return_cancel: 'Credit Note (cancelled)',
  purchase_return_cancel: 'Debit Note (cancelled)',
};
export const vLabel = (t: string) => VOUCHER_LABEL[t] || t.replace(/_/g, ' ');

// Ledger groups in Tally-like display order.
export const GROUP_LABEL: Record<string, string> = {
  capital: 'Capital Account', loans: 'Loans (Liability)', current_liabilities: 'Current Liabilities', sundry_creditors: 'Sundry Creditors',
  duties_taxes: 'Duties & Taxes', fixed_assets: 'Fixed Assets', loans_advances: 'Loans & Advances (Asset)', current_assets: 'Current Assets',
  sundry_debtors: 'Sundry Debtors', cash: 'Cash-in-hand', bank: 'Bank Accounts', sales: 'Sales Accounts', direct_income: 'Direct Incomes',
  indirect_income: 'Indirect Incomes', purchase: 'Purchase Accounts', direct_expenses: 'Direct Expenses', indirect_expenses: 'Indirect Expenses',
};
export const GROUP_ORDER = Object.keys(GROUP_LABEL);
export const groupLabel = (g: string) => GROUP_LABEL[g] || g.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
export const groupIndex = (g: string) => { const i = GROUP_ORDER.indexOf(g); return i < 0 ? 99 : i; };
