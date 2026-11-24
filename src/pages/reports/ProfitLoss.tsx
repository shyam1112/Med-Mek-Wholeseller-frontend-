import { useState } from 'react';
import { Alert, FormControlLabel, Grid, Skeleton, Switch } from '@mui/material';
import { ReportShell } from '../../components/ReportShell';
import { DateRange } from '../../components/Filters';
import { StatCard } from '../../components/StatCard';
import { useFetch } from '../../lib/hooks';
import { inrShort, round2, today } from '../../lib/format';
import { useAuth } from '../../auth/AuthContext';
import { ErrorBox, PrintSupport, fyStartDate, periodLabel } from './reportKit';
import { TAccount, TItem, tAccountRows } from './TAccount';
import { exportTitledExcel } from './titledExcel';

type D = { name: string; amount: number }[];
interface PL {
  openingStock: number; closingStock: number; sales: number; directIncome: number; purchases: number; directExpenses: number;
  grossProfit: number; indirectIncome: number; indirectExpenses: number; netProfit: number;
  detail: { sales: D; purchases: D; directExpenses: D; directIncome: D; indirectIncome: D; indirectExpenses: D };
}

export default function ProfitLoss() {
  const { business } = useAuth();
  const [from, setFrom] = useState(fyStartDate());
  const [to, setTo] = useState(today());
  const [expand, setExpand] = useState(false);
  const { data, loading, error, reload } = useFetch<{ data: PL }>('/reports/profit-loss', { from, to });
  const p = data?.data;

  const gp = p?.grossProfit || 0;
  const np = p?.netProfit || 0;
  const tradeL: TItem[] = p ? [
    { label: 'Opening Stock', amount: p.openingStock },
    { label: 'Purchase Accounts', amount: p.purchases, detail: p.detail.purchases, note: 'net of returns' },
    { label: 'Direct Expenses', amount: p.directExpenses, detail: p.detail.directExpenses },
    ...(gp > 0 ? [{ label: 'Gross Profit c/o', amount: gp, bold: true, tone: 'good' as const }] : []),
  ] : [];
  const tradeR: TItem[] = p ? [
    { label: 'Sales Accounts', amount: p.sales, detail: p.detail.sales, note: 'net of returns' },
    { label: 'Direct Incomes', amount: p.directIncome, detail: p.detail.directIncome },
    { label: 'Closing Stock', amount: p.closingStock, note: 'at landing cost' },
    ...(gp < 0 ? [{ label: 'Gross Loss c/o', amount: -gp, bold: true, tone: 'bad' as const }] : []),
  ] : [];
  const tradeTotal = p ? round2(Math.max(p.openingStock + p.purchases + p.directExpenses + Math.max(gp, 0), p.sales + p.directIncome + p.closingStock + Math.max(-gp, 0))) : 0;

  const plL: TItem[] = p ? [
    ...(gp < 0 ? [{ label: 'Gross Loss b/f', amount: -gp, tone: 'bad' as const }] : []),
    { label: 'Indirect Expenses', amount: p.indirectExpenses, detail: p.detail.indirectExpenses },
    ...(np > 0 ? [{ label: 'Net Profit', amount: np, bold: true, tone: 'good' as const }] : []),
  ] : [];
  const plR: TItem[] = p ? [
    ...(gp > 0 ? [{ label: 'Gross Profit b/f', amount: gp, tone: 'good' as const }] : []),
    { label: 'Indirect Incomes', amount: p.indirectIncome, detail: p.detail.indirectIncome },
    ...(np < 0 ? [{ label: 'Net Loss', amount: -np, bold: true, tone: 'bad' as const }] : []),
  ] : [];
  const plTotal = p ? round2(Math.max(Math.max(-gp, 0) + p.indirectExpenses + Math.max(np, 0), Math.max(gp, 0) + p.indirectIncome + Math.max(-np, 0))) : 0;

  const pct = (v: number) => (p?.sales ? `${((v / p.sales) * 100).toFixed(2)}%` : '—');
  const period = periodLabel(from, to);

  const doExport = () => exportTitledExcel(
    `profit-and-loss-${from}-to-${to}`, 'Profit & Loss',
    [business?.name || '', `Trading and Profit & Loss Account for ${period}`],
    ['Particulars (Dr)', 'Amount', 'Particulars (Cr)', 'Amount'],
    [
      ['TRADING ACCOUNT', '', '', ''],
      ...tAccountRows(tradeL, tradeR, true),
      ['Total', tradeTotal, 'Total', tradeTotal],
      ['', '', '', ''],
      ['PROFIT & LOSS ACCOUNT', '', '', ''],
      ...tAccountRows(plL, plR, true),
      ['Total', plTotal, 'Total', plTotal],
    ],
    [`Gross margin ${pct(gp)}`, '', `Net margin ${pct(np)}`, ''],
  );

  return (
    <ReportShell
      help={['pl', 'landing']}
      title="Profit & Loss"
      subtitle={period}
      onExport={p ? doExport : undefined}
      filters={
        <>
          <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
          <FormControlLabel control={<Switch checked={expand} onChange={(e) => setExpand(e.target.checked)} />} label="Show ledgers" />
        </>
      }
    >
      <PrintSupport title="Trading and Profit & Loss Account" subtitle={period} />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !p && <Skeleton variant="rounded" height={320} />}
      {p && (
        <>
          <Grid container spacing={1.5} sx={{ mb: 1.5 }}>
            <Grid item xs={6} md={3}><StatCard label="Sales (net)" value={inrShort(p.sales)} /></Grid>
            <Grid item xs={6} md={3}><StatCard label="Gross profit" value={inrShort(gp)} hint={`Gross margin ${pct(gp)}`} tone={gp >= 0 ? 'good' : 'bad'} /></Grid>
            <Grid item xs={6} md={3}><StatCard label="Indirect expenses" value={inrShort(p.indirectExpenses)} hint={`${pct(p.indirectExpenses)} of sales`} /></Grid>
            <Grid item xs={6} md={3}><StatCard label={np >= 0 ? 'Net profit' : 'Net loss'} value={inrShort(np)} hint={`Net margin ${pct(np)}`} tone={np >= 0 ? 'good' : 'bad'} /></Grid>
          </Grid>
          {p.closingStock === 0 && p.sales > 0 && (
            <Alert severity="warning" sx={{ mb: 1.5 }}>Closing stock is zero — gross profit will be understated if stock is actually on hand.</Alert>
          )}
          <TAccount heading="Trading Account" leftTitle="Particulars (Dr)" rightTitle="Particulars (Cr)" left={tradeL} right={tradeR} leftTotal={tradeTotal} rightTotal={tradeTotal} expandAll={expand} />
          <TAccount heading="Profit & Loss Account" leftTitle="Particulars (Dr)" rightTitle="Particulars (Cr)" left={plL} right={plR} leftTotal={plTotal} rightTotal={plTotal} expandAll={expand} />
        </>
      )}
    </ReportShell>
  );
}
