import { useMemo, useState } from 'react';
import { ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { ReportShell } from '../../components/ReportShell';
import { DataTable, Col } from '../../components/DataTable';
import { DateRange } from '../../components/Filters';
import { ManufacturerPicker, PartyOption, PartyPicker } from '../../components/Pickers';
import { useFetch } from '../../lib/hooks';
import { amt, monthStart, num, round2, today } from '../../lib/format';
import { exportExcel } from '../../lib/excel';
import { ErrorBox, PrintSupport, TopBarChart, TrendChart, periodLabel } from './reportKit';

interface Row { key: string; label: string; qty: number; free: number; taxable: number; tax: number; total: number; bills: number }

const BY = [['party', 'Supplier'], ['product', 'Product'], ['manufacturer', 'Company'], ['hsn', 'HSN'], ['month', 'Month']] as const;
type By = (typeof BY)[number][0];

export default function PurchaseAnalysis() {
  const nav = useNavigate();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [by, setBy] = useState<By>('party');
  const [party, setParty] = useState<PartyOption | null>(null);
  const [company, setCompany] = useState<{ _id: string; name: string } | null>(null);
  const { data, loading, error, reload } = useFetch<{ data: Row[] }>('/reports/purchase-analysis', { by, from, to, party: party?._id, manufacturer: company?.name });
  const rows = data?.data || [];
  // Backend doesn't send totals for purchases — sum here.
  const t = useMemo(() => rows.reduce((a, r) => ({
    qty: a.qty + r.qty, free: a.free + (r.free || 0), taxable: round2(a.taxable + r.taxable), tax: round2(a.tax + r.tax), total: round2(a.total + r.total), bills: a.bills + r.bills,
  }), { qty: 0, free: 0, taxable: 0, tax: 0, total: 0, bills: 0 }), [rows]);
  const byLabel = BY.find((b) => b[0] === by)![1];
  const billsAdd = by === 'party' || by === 'month';
  const top = useMemo(() => [...rows].sort((a, b) => b.taxable - a.taxable).slice(0, 15), [rows]);
  const open = (r: Row) => { if (!r.key) return; if (by === 'party') nav(`/parties/${r.key}`); else if (by === 'product') nav(`/products/${r.key}`); };
  const clickable = by === 'party' || by === 'product';

  const columns: Col<Row>[] = [
    { key: 'label', label: byLabel, render: (r) => <Typography fontSize={13} fontWeight={600}>{r.label}</Typography>, footer: `Total (${rows.length})` },
    { key: 'bills', label: 'Bills', align: 'right', render: (r) => num(r.bills), footer: billsAdd ? num(t.bills) : '' },
    { key: 'qty', label: 'Qty', align: 'right', render: (r) => num(r.qty), footer: num(t.qty) },
    { key: 'free', label: 'Free', align: 'right', render: (r) => (r.free ? num(r.free) : ''), footer: t.free ? num(t.free) : '' },
    { key: 'taxable', label: 'Taxable', align: 'right', render: (r) => <b>{amt(r.taxable)}</b>, footer: amt(t.taxable) },
    { key: 'tax', label: 'GST (ITC)', align: 'right', render: (r) => amt(r.tax), footer: amt(t.tax) },
    { key: 'total', label: 'Total', align: 'right', render: (r) => amt(r.total), footer: amt(t.total) },
    { key: 'share', label: 'Share %', align: 'right', render: (r) => (t.taxable ? `${((r.taxable / t.taxable) * 100).toFixed(1)}%` : '') },
  ];

  const doExport = () => exportExcel(`purchases-by-${by}-${from}-to-${to}`, [{
    name: `Purchases by ${byLabel}`,
    rows: [...rows, { key: '', label: 'TOTAL', ...t, bills: billsAdd ? t.bills : 0 }],
    columns: [
      { key: 'label', label: byLabel }, { key: 'bills', label: 'Bills' }, { key: 'qty', label: 'Qty' }, { key: 'free', label: 'Free' },
      { key: 'taxable', label: 'Taxable' }, { key: 'tax', label: 'GST' }, { key: 'total', label: 'Total' },
    ],
  }]);
  const subtitle = `${periodLabel(from, to)}${company ? ` · ${company.name}` : ''}${party ? ` · ${party.name}` : ''}`;

  return (
    <ReportShell
      title="Purchase Analysis"
      subtitle={subtitle}
      onExport={rows.length ? doExport : undefined}
      filters={
        <>
          <DateRange from={from} to={to} onChange={(f, tt) => { setFrom(f); setTo(tt); }} />
          <PartyPicker type="supplier" value={party} onChange={setParty} sx={{ width: 220 }} />
          <ManufacturerPicker value={company} onChange={setCompany} label="Company" sx={{ width: 200 }} />
        </>
      }
    >
      <PrintSupport title={`Purchase Analysis — by ${byLabel}`} subtitle={subtitle} />
      <ToggleButtonGroup className="no-print" size="small" exclusive value={by} onChange={(_, v) => v && setBy(v)} sx={{ mb: 1.5, flexWrap: 'wrap' }}>
        {BY.map(([v, l]) => <ToggleButton key={v} value={v} sx={{ px: 1.5 }}>{l}</ToggleButton>)}
      </ToggleButtonGroup>
      <ErrorBox error={error} onRetry={reload} />
      {by === 'month'
        ? <TrendChart rows={rows} label={(r) => r.label} value={(r) => r.taxable} valueLabel="Taxable purchases by month" />
        : <TopBarChart rows={top} label={(r) => r.label} value={(r) => r.taxable} valueLabel={`Top ${top.length} by taxable purchases`} onClick={clickable ? open : undefined} />}
      <DataTable columns={columns} rows={rows} loading={loading} rowKey={(r, i) => `${r.key ?? 'none'}-${i}`}
        onRowClick={clickable ? open : undefined} empty="No purchases in this period." maxHeight="calc(100vh - 220px)" />
    </ReportShell>
  );
}
