import { useMemo, useState } from 'react';
import { FormControlLabel, Grid, Switch, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { ReportShell } from '../../components/ReportShell';
import { DataTable, Col } from '../../components/DataTable';
import { SearchBox } from '../../components/Filters';
import { ManufacturerPicker } from '../../components/Pickers';
import { StatCard } from '../../components/StatCard';
import { useFetch } from '../../lib/hooks';
import { amt, fexp, inrShort, num, round2 } from '../../lib/format';
import { exportExcel } from '../../lib/excel';
import { useAuth } from '../../auth/AuthContext';
import { ErrorBox, PrintSupport } from './reportKit';

interface Row {
  product: string; name: string; manufacturerName: string; packing: string; rack?: string; reorderLevel?: number;
  stock: number; damaged: number; batches: number; nearestExpiry?: string | null; costValue: number; ptrValue: number; mrpValue: number;
}
type Basis = 'costValue' | 'ptrValue' | 'mrpValue';
const BASIS: Record<Basis, string> = { costValue: 'Cost', ptrValue: 'PTR', mrpValue: 'MRP' };

export default function StockSummary() {
  const nav = useNavigate();
  const { business } = useAuth();
  const [company, setCompany] = useState<{ _id: string; name: string } | null>(null);
  const [includeZero, setIncludeZero] = useState(false);
  const [basis, setBasis] = useState<Basis>('costValue');
  const [search, setSearch] = useState('');
  const { data, loading, error, reload } = useFetch<{ data: Row[]; totals: Record<Basis, number> }>('/reports/stock-summary', {
    manufacturer: company?._id, includeZero: includeZero ? 'true' : '',
  });
  const all = data?.data || [];
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((r) => `${r.name} ${r.manufacturerName} ${r.rack || ''}`.toLowerCase().includes(q));
  }, [all, search]);
  const t = useMemo(() => rows.reduce((a, r) => ({
    stock: a.stock + r.stock, damaged: a.damaged + r.damaged, costValue: round2(a.costValue + r.costValue), ptrValue: round2(a.ptrValue + r.ptrValue), mrpValue: round2(a.mrpValue + r.mrpValue),
  }), { stock: 0, damaged: 0, costValue: 0, ptrValue: 0, mrpValue: 0 }), [rows]);
  const nearDays = business?.settings?.nearExpiryDays || 90;
  const nearLimit = dayjs().add(nearDays, 'day');
  const lowCount = rows.filter((r) => r.reorderLevel && r.stock <= r.reorderLevel).length;

  const hl = (k: Basis) => (k === basis ? { fontWeight: 700, color: 'primary.main' } : {});
  const valCol = (k: Basis): Col<Row> => ({
    key: k, label: <Typography component="span" fontSize={12} fontWeight={k === basis ? 800 : 600}>{BASIS[k]} value</Typography>, align: 'right',
    render: (r) => <Typography component="span" fontSize={13} sx={hl(k)}>{amt(r[k])}</Typography>, footer: amt(t[k]),
  });
  const columns: Col<Row>[] = [
    { key: 'name', label: 'Product', render: (r) => <><Typography fontSize={13} fontWeight={600}>{r.name}</Typography><Typography fontSize={11} color="text.secondary">{r.packing}{r.rack ? ` · Rack ${r.rack}` : ''}</Typography></>, footer: `${rows.length} items` },
    { key: 'manufacturerName', label: 'Company' },
    { key: 'stock', label: 'Stock', align: 'right', render: (r) => <Typography component="span" fontSize={13} fontWeight={700} color={r.stock <= 0 ? 'error.main' : r.reorderLevel && r.stock <= r.reorderLevel ? 'warning.main' : undefined}>{num(r.stock)}</Typography>, footer: num(t.stock) },
    { key: 'damaged', label: 'Damaged', align: 'right', render: (r) => (r.damaged ? <Typography component="span" fontSize={13} color="error.main">{num(r.damaged)}</Typography> : ''), footer: t.damaged ? num(t.damaged) : '' },
    { key: 'batches', label: 'Batches', align: 'right' },
    { key: 'nearestExpiry', label: 'Nearest Exp', nowrap: true, render: (r) => r.nearestExpiry ? <Typography component="span" fontSize={13} color={dayjs(r.nearestExpiry).isBefore(dayjs()) ? 'error.main' : dayjs(r.nearestExpiry).isBefore(nearLimit) ? 'warning.main' : undefined}>{fexp(r.nearestExpiry)}</Typography> : '' },
    valCol('costValue'), valCol('ptrValue'), valCol('mrpValue'),
  ];

  const doExport = () => exportExcel(`stock-summary-${dayjs().format('YYYY-MM-DD')}`, [{
    name: 'Stock Summary',
    rows,
    columns: [
      { key: 'name', label: 'Product' }, { key: 'packing', label: 'Pack' }, { key: 'manufacturerName', label: 'Company' }, { key: 'rack', label: 'Rack' },
      { key: 'stock', label: 'Stock' }, { key: 'damaged', label: 'Damaged' }, { key: 'batches', label: 'Batches' },
      { key: 'nearestExpiry', label: 'Nearest Expiry', value: (r: Row) => fexp(r.nearestExpiry) },
      { key: 'costValue', label: 'Cost Value' }, { key: 'ptrValue', label: 'PTR Value' }, { key: 'mrpValue', label: 'MRP Value' },
    ],
  }]);

  const subtitle = `As on ${dayjs().format('DD-MM-YYYY')}${company ? ` · ${company.name}` : ' · all companies'}${includeZero ? ' · incl. zero stock' : ''}`;
  return (
    <ReportShell
      title="Stock Summary"
      subtitle={subtitle}
      onExport={rows.length ? doExport : undefined}
      filters={
        <>
          <SearchBox value={search} onChange={setSearch} placeholder="Product / company / rack" />
          <ManufacturerPicker value={company} onChange={setCompany} label="Company" sx={{ width: 220 }} />
          <ToggleButtonGroup size="small" exclusive value={basis} onChange={(_, v) => v && setBasis(v)}>
            {(Object.keys(BASIS) as Basis[]).map((k) => <ToggleButton key={k} value={k} sx={{ px: 1.5 }}>{BASIS[k]}</ToggleButton>)}
          </ToggleButtonGroup>
          <FormControlLabel control={<Switch checked={includeZero} onChange={(e) => setIncludeZero(e.target.checked)} />} label="Include zero stock" />
        </>
      }
    >
      <PrintSupport title="Stock Summary" subtitle={`${subtitle} · value at ${BASIS[basis]}`} landscape />
      <ErrorBox error={error} onRetry={reload} />
      <Grid container spacing={1.5} sx={{ mb: 1.5 }} className="print-hide">
        <Grid item xs={6} md={3}><StatCard label={`Stock value @ ${BASIS[basis]}`} value={inrShort(t[basis])} hint={`Cost ${inrShort(t.costValue)} · MRP ${inrShort(t.mrpValue)}`} /></Grid>
        <Grid item xs={6} md={3}><StatCard label="Items" value={num(rows.length)} hint={`${num(t.stock)} units saleable`} /></Grid>
        <Grid item xs={6} md={3}><StatCard label="Damaged / expired bucket" value={num(t.damaged)} tone={t.damaged ? 'bad' : 'default'} hint="non-saleable units" /></Grid>
        <Grid item xs={6} md={3}><StatCard label="At / below reorder level" value={num(lowCount)} tone={lowCount ? 'warn' : 'default'} onClick={lowCount ? () => nav('/reports/reorder') : undefined} hint={lowCount ? 'open reorder report' : undefined} /></Grid>
      </Grid>
      <DataTable columns={columns} rows={rows} loading={loading} rowKey={(r) => String(r.product)} onRowClick={(r) => nav(`/products/${r.product}`)}
        empty={search ? 'No product matches the search.' : 'No stock.'} maxHeight="calc(100vh - 300px)" />
    </ReportShell>
  );
}
