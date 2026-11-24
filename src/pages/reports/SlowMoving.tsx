import { useMemo, useState } from 'react';
import { Grid, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { ReportShell } from '../../components/ReportShell';
import { DataTable, Col } from '../../components/DataTable';
import { SearchBox } from '../../components/Filters';
import { StatCard } from '../../components/StatCard';
import { useFetch } from '../../lib/hooks';
import { amt, fdate, inrShort, num, round2 } from '../../lib/format';
import { exportExcel } from '../../lib/excel';
import { ErrorBox, PrintSupport } from './reportKit';

interface Row { product: string; name: string; manufacturerName: string; packing: string; stock: number; value: number; lastSale: string | null }

export default function SlowMoving() {
  const nav = useNavigate();
  const [days, setDays] = useState(90);
  const [search, setSearch] = useState('');
  const { data, loading, error, reload } = useFetch<{ data: Row[]; totalValue: number }>('/reports/slow-moving', { days });
  const all = data?.data || [];
  const rows = useMemo(() => { const q = search.trim().toLowerCase(); return q ? all.filter((r) => `${r.name} ${r.manufacturerName}`.toLowerCase().includes(q)) : all; }, [all, search]);
  const shownValue = round2(rows.reduce((s, r) => s + r.value, 0));
  const neverSold = rows.filter((r) => !r.lastSale).length;

  const columns: Col<Row>[] = [
    { key: 'name', label: 'Product', render: (r) => <><Typography fontSize={13} fontWeight={600}>{r.name}</Typography><Typography fontSize={11} color="text.secondary">{r.packing}</Typography></>, footer: `${rows.length} items` },
    { key: 'manufacturerName', label: 'Company' },
    { key: 'stock', label: 'Stock', align: 'right', render: (r) => num(r.stock) },
    { key: 'value', label: 'Value (cost)', align: 'right', render: (r) => <b>{amt(r.value)}</b>, footer: amt(shownValue) },
    { key: 'lastSale', label: 'Last sale', nowrap: true, render: (r) => (r.lastSale ? fdate(r.lastSale) : <Typography component="span" fontSize={12} color="error.main">Never sold</Typography>) },
    { key: 'idle', label: 'Days idle', align: 'right', render: (r) => (r.lastSale ? num(dayjs().diff(dayjs(r.lastSale), 'day')) : '—') },
  ];
  const doExport = () => exportExcel(`slow-moving-${days}-days`, [{
    name: `No sale ${days} days`,
    rows,
    columns: [
      { key: 'name', label: 'Product' }, { key: 'packing', label: 'Pack' }, { key: 'manufacturerName', label: 'Company' },
      { key: 'stock', label: 'Stock' }, { key: 'value', label: 'Value (cost)' }, { key: 'lastSale', label: 'Last Sale', value: (r: Row) => (r.lastSale ? fdate(r.lastSale) : 'Never') },
    ],
  }]);

  return (
    <ReportShell
      title="Slow / Non-moving Stock"
      subtitle={`Items in stock with no sale in the last ${days} days`}
      onExport={rows.length ? doExport : undefined}
      filters={
        <>
          <ToggleButtonGroup size="small" exclusive value={days} onChange={(_, v) => v && setDays(v)}>
            {[30, 60, 90, 180, 365].map((d) => <ToggleButton key={d} value={d} sx={{ px: 1.5 }}>{d} days</ToggleButton>)}
          </ToggleButtonGroup>
          <SearchBox value={search} onChange={setSearch} placeholder="Product / company" />
        </>
      }
    >
      <PrintSupport title="Slow / Non-moving Stock" subtitle={`No sale in the last ${days} days · as on ${dayjs().format('DD-MM-YYYY')}`} />
      <ErrorBox error={error} onRetry={reload} />
      <Grid container spacing={1.5} sx={{ mb: 1.5 }} className="print-hide">
        <Grid item xs={6} md={3}><StatCard label="Money locked (cost)" value={inrShort(data?.totalValue || 0)} tone={(data?.totalValue || 0) > 0 ? 'warn' : 'default'} /></Grid>
        <Grid item xs={6} md={3}><StatCard label="Items" value={num(all.length)} /></Grid>
        <Grid item xs={6} md={3}><StatCard label="Never sold" value={num(neverSold)} tone={neverSold ? 'bad' : 'default'} hint="since stock came in" /></Grid>
      </Grid>
      <DataTable columns={columns} rows={rows} loading={loading} rowKey={(r) => String(r.product)} onRowClick={(r) => nav(`/products/${r.product}`)}
        empty="No slow-moving stock." maxHeight="calc(100vh - 300px)" />
    </ReportShell>
  );
}
