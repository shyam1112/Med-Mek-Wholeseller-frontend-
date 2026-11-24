import { useState } from 'react';
import { Alert, FormControlLabel, Skeleton, Switch, TextField } from '@mui/material';
import { ReportShell } from '../../components/ReportShell';
import { useFetch } from '../../lib/hooks';
import { amt, fdate, round2, today } from '../../lib/format';
import { useAuth } from '../../auth/AuthContext';
import { ErrorBox, PrintSupport, groupIndex, groupLabel } from './reportKit';
import { TAccount, TItem, tAccountRows } from './TAccount';
import { exportTitledExcel } from './titledExcel';

type Groups = Record<string, { total: number; ledgers: { name: string; amount: number }[] }>;
interface BS {
  assets: Groups; liabilities: Groups; closingStock: number; profitLoss: number; openingStockCapital: number;
  difference: number; totalAssets: number; totalLiabilities: number;
}

const toItems = (g: Groups): TItem[] => Object.entries(g)
  .sort((a, b) => groupIndex(a[0]) - groupIndex(b[0]))
  .map(([k, v]) => ({ label: groupLabel(k), amount: v.total, detail: [...v.ledgers].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)) }));

export default function BalanceSheet() {
  const { business } = useAuth();
  const [asOf, setAsOf] = useState(today());
  const [expand, setExpand] = useState(false);
  const { data, loading, error, reload } = useFetch<{ data: BS }>('/reports/balance-sheet', { asOf });
  const b = data?.data;
  const diff = b?.difference || 0;
  const hasDiff = Math.abs(diff) > 0.009;

  const liab: TItem[] = b ? [
    ...toItems(b.liabilities),
    { label: 'Profit & Loss A/c', amount: b.profitLoss, tone: b.profitLoss < 0 ? 'bad' : undefined, note: b.profitLoss < 0 ? 'loss' : 'accumulated profit' },
    { label: 'Opening Stock (capital)', amount: b.openingStockCapital, note: 'stock entered as opening' },
    // Assets > liabilities: show the gap on this side so both totals agree, as Tally does.
    ...(hasDiff && diff > 0 ? [{ label: 'Difference in opening balances', amount: diff, tone: 'bad' as const }] : []),
  ] : [];
  const assets: TItem[] = b ? [
    ...toItems(b.assets),
    { label: 'Closing Stock', amount: b.closingStock, note: 'at landing cost' },
    ...(hasDiff && diff < 0 ? [{ label: 'Difference in opening balances', amount: -diff, tone: 'bad' as const }] : []),
  ] : [];
  const total = b ? round2(Math.max(b.totalAssets, b.totalLiabilities)) : 0;

  const doExport = () => exportTitledExcel(
    `balance-sheet-${asOf}`, 'Balance Sheet',
    [business?.name || '', `Balance Sheet as on ${fdate(asOf)}`, ...(business?.gstin ? [`GSTIN: ${business.gstin}`] : [])],
    ['Liabilities', 'Amount', 'Assets', 'Amount'],
    tAccountRows(liab, assets, true),
    ['Total', total, 'Total', total],
  );

  return (
    <ReportShell
      help={['balancesheet', 'drcr']}
      title="Balance Sheet"
      subtitle={`As on ${fdate(asOf)}`}
      onExport={b ? doExport : undefined}
      filters={
        <>
          <TextField type="date" label="As on" value={asOf} onChange={(e) => setAsOf(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: 160 }} />
          <FormControlLabel control={<Switch checked={expand} onChange={(e) => setExpand(e.target.checked)} />} label="Show ledgers" />
        </>
      }
    >
      <PrintSupport title="Balance Sheet" subtitle={`As on ${fdate(asOf)}`} />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !b && <Skeleton variant="rounded" height={360} />}
      {b && (
        <>
          {hasDiff && (
            <Alert severity="warning" sx={{ mb: 1.5 }}>
              Difference in opening balances: ₹{amt(Math.abs(diff))}. Ledger opening balances (parties, bank, cash, capital, loans) don't add up —
              usually the capital account or some opening balances haven't been entered yet. It's shown as a separate line so both sides total;
              correct the opening balances in Ledgers to clear it.
            </Alert>
          )}
          <TAccount leftTitle="Liabilities" rightTitle="Assets" left={liab} right={assets} leftTotal={total} rightTotal={total} expandAll={expand} />
        </>
      )}
    </ReportShell>
  );
}
