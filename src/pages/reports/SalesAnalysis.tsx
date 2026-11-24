import { useMemo, useState } from 'react';
import { FormControlLabel, Switch, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ReportShell } from '../../components/ReportShell';
import { DataTable, Col } from '../../components/DataTable';
import { DateRange } from '../../components/Filters';
import { ManufacturerPicker, PartyOption, PartyPicker, RoutePicker, SimplePicker } from '../../components/Pickers';
import { useFetch } from '../../lib/hooks';
import { amt, monthStart, num, today } from '../../lib/format';
import { exportExcel } from '../../lib/excel';
import { ErrorBox, MarginPct, PrintSupport, TopBarChart, TrendChart, periodLabel } from './reportKit';

export interface AnalysisRow {
  key: string; label: string; qty: number; free: number; taxable: number; tax: number; total: number;
  returns?: number; cost?: number; margin?: number; marginPct?: number; bills: number;
}

const BY = [
  ['party', 'Party'], ['product', 'Product'], ['manufacturer', 'Company'], ['salesman', 'Salesman'],
  ['route', 'Route'], ['hsn', 'HSN'], ['day', 'Day'], ['month', 'Month'],
] as const;
type By = (typeof BY)[number][0];
type Opt = { _id: string; name: string };

export default function SalesAnalysis() {
  const nav = useNavigate();
  // Drill-in from other reports: ?salesman=&salesmanName=&from=&to=&by=
  const [sp] = useSearchParams();
  const [from, setFrom] = useState(sp.get('from') || monthStart());
  const [to, setTo] = useState(sp.get('to') || today());
  const [by, setBy] = useState<By>((BY.find((b) => b[0] === sp.get('by'))?.[0]) || 'party');
  const [party, setParty] = useState<PartyOption | null>(null);
  const [salesman, setSalesman] = useState<Opt | null>(sp.get('salesman') ? { _id: sp.get('salesman')!, name: sp.get('salesmanName') || 'Salesman' } : null);
  const [route, setRoute] = useState<Opt | null>(null);
  const [company, setCompany] = useState<Opt | null>(null);
  const [netReturns, setNetReturns] = useState(true);

  const { data, loading, error, reload } = useFetch<{ data: AnalysisRow[]; totals: Record<string, number> }>('/reports/sales-analysis', {
    by, from, to, party: party?._id, salesman: salesman?._id, route: route?._id, manufacturer: company?.name, returns: netReturns ? 'true' : 'false',
  });
  const rows = data?.data || [];
  const t = data?.totals || {};
  const totalFree = rows.reduce((s, r) => s + (r.free || 0), 0);
  const totalBills = by === 'day' || by === 'month' || by === 'party' || by === 'salesman' || by === 'route' ? rows.reduce((s, r) => s + r.bills, 0) : null;
  const totalMarginPct = t.taxable ? ((t.margin || 0) / t.taxable) * 100 : 0;
  const byLabel = BY.find((b) => b[0] === by)![1];
  const isTime = by === 'day' || by === 'month';
  const top = useMemo(() => [...rows].sort((a, b) => b.taxable - a.taxable).slice(0, 15), [rows]);

  const open = (r: AnalysisRow) => {
    if (!r.key) return;
    if (by === 'party') nav(`/parties/${r.key}`);
    else if (by === 'product') nav(`/products/${r.key}`);
  };

  const columns: Col<AnalysisRow>[] = [
    { key: 'label', label: byLabel, render: (r) => <Typography fontSize={13} fontWeight={600}>{r.label}</Typography>, footer: `Total (${rows.length})` },
    { key: 'bills', label: 'Bills', align: 'right', render: (r) => num(r.bills), footer: totalBills !== null ? num(totalBills) : '' },
    { key: 'qty', label: 'Qty', align: 'right', render: (r) => num(r.qty), footer: num(t.qty) },
    { key: 'free', label: 'Free', align: 'right', render: (r) => (r.free ? num(r.free) : ''), footer: totalFree ? num(totalFree) : '' },
    ...(netReturns ? [{ key: 'returns', label: 'Returns', align: 'right' as const, render: (r: AnalysisRow) => (r.returns ? amt(r.returns) : ''), footer: amt(t.returns) }] : []),
    { key: 'taxable', label: 'Taxable', align: 'right', render: (r) => <b>{amt(r.taxable)}</b>, footer: amt(t.taxable) },
    { key: 'tax', label: 'GST', align: 'right', render: (r) => amt(r.tax), footer: amt(t.tax) },
    { key: 'total', label: 'Total', align: 'right', render: (r) => amt(r.total), footer: amt(t.total) },
    { key: 'cost', label: 'Cost', align: 'right', render: (r) => amt(r.cost), footer: amt(t.cost) },
    { key: 'margin', label: 'Margin', align: 'right', render: (r) => amt(r.margin), footer: amt(t.margin) },
    { key: 'marginPct', label: 'Margin %', align: 'right', render: (r) => <MarginPct value={r.marginPct || 0} />, footer: <MarginPct value={totalMarginPct} /> },
  ];

  const doExport = () => exportExcel(`sales-by-${by}-${from}-to-${to}`, [{
    name: `Sales by ${byLabel}`,
    rows: [...rows, { key: '', label: 'TOTAL', bills: totalBills ?? 0, qty: t.qty, free: totalFree, returns: t.returns, taxable: t.taxable, tax: t.tax, total: t.total, cost: t.cost, margin: t.margin, marginPct: Math.round(totalMarginPct * 100) / 100 } as AnalysisRow],
    columns: [
      { key: 'label', label: byLabel }, { key: 'bills', label: 'Bills' }, { key: 'qty', label: 'Qty' }, { key: 'free', label: 'Free' },
      ...(netReturns ? [{ key: 'returns', label: 'Returns' }] : []),
      { key: 'taxable', label: 'Taxable' }, { key: 'tax', label: 'GST' }, { key: 'total', label: 'Total' },
      { key: 'cost', label: 'Cost' }, { key: 'margin', label: 'Margin' }, { key: 'marginPct', label: 'Margin %' },
    ],
  }]);

  const subtitle = `${periodLabel(from, to)} · ${netReturns ? 'net of returns' : 'gross (returns excluded)'}${company ? ` · ${company.name}` : ''}${party ? ` · ${party.name}` : ''}`;

  return (
    <ReportShell
      title="Sales Analysis"
      subtitle={subtitle}
      onExport={rows.length ? doExport : undefined}
      filters={
        <>
          <DateRange from={from} to={to} onChange={(f, tt) => { setFrom(f); setTo(tt); }} />
          <PartyPicker type="customer" value={party} onChange={setParty} sx={{ width: 220 }} />
          <ManufacturerPicker value={company} onChange={setCompany} label="Company" sx={{ width: 200 }} />
          <SimplePicker url="/users" value={salesman} onChange={setSalesman} label="Salesman" sx={{ width: 170 }} />
          <RoutePicker value={route} onChange={setRoute} sx={{ width: 160 }} />
          <FormControlLabel control={<Switch checked={netReturns} onChange={(e) => setNetReturns(e.target.checked)} />} label="Net of returns" />
        </>
      }
    >
      <PrintSupport title={`Sales Analysis — by ${byLabel}`} subtitle={subtitle} landscape />
      <ToggleButtonGroup className="no-print" size="small" exclusive value={by} onChange={(_, v) => v && setBy(v)} sx={{ mb: 1.5, flexWrap: 'wrap' }}>
        {BY.map(([v, l]) => <ToggleButton key={v} value={v} sx={{ px: 1.5 }}>{l}</ToggleButton>)}
      </ToggleButtonGroup>
      <ErrorBox error={error} onRetry={reload} />
      {isTime
        ? <TrendChart rows={rows} label={(r) => r.label} value={(r) => r.taxable} valueLabel={`Taxable sales by ${byLabel.toLowerCase()}`} />
        : <TopBarChart rows={top} label={(r) => r.label} value={(r) => r.taxable} valueLabel={`Top ${top.length} by taxable sales`} onClick={by === 'party' || by === 'product' ? open : undefined} />}
      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        rowKey={(r, i) => `${r.key ?? 'none'}-${i}`}
        onRowClick={by === 'party' || by === 'product' ? open : undefined}
        empty="No sales in this period."
        maxHeight="calc(100vh - 220px)"
      />
    </ReportShell>
  );
}
