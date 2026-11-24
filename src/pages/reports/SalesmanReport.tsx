import { useMemo, useState } from 'react';
import { Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { ReportShell } from '../../components/ReportShell';
import { DataTable, Col } from '../../components/DataTable';
import { DateRange } from '../../components/Filters';
import { useFetch } from '../../lib/hooks';
import { amt, monthStart, num, round2, today } from '../../lib/format';
import { exportExcel } from '../../lib/excel';
import { ErrorBox, PrintSupport, TopBarChart, periodLabel } from './reportKit';

interface Row { salesman: string | null; name: string; sales: number; taxable: number; bills: number; parties: number; collected: number; orders: number; orderValue: number }

export default function SalesmanReport() {
  const nav = useNavigate();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const { data, loading, error, reload } = useFetch<{ data: Row[] }>('/reports/salesman', { from, to });
  const rows = data?.data || [];
  const t = useMemo(() => rows.reduce((a, r) => ({
    sales: round2(a.sales + r.sales), taxable: round2(a.taxable + r.taxable), bills: a.bills + r.bills, parties: a.parties + r.parties,
    collected: round2(a.collected + r.collected), orders: a.orders + r.orders, orderValue: round2(a.orderValue + r.orderValue),
  }), { sales: 0, taxable: 0, bills: 0, parties: 0, collected: 0, orders: 0, orderValue: 0 }), [rows]);

  const columns: Col<Row>[] = [
    { key: 'name', label: 'Salesman', render: (r) => <Typography fontSize={13} fontWeight={600} color={r.salesman ? undefined : 'text.secondary'}>{r.name}</Typography>, footer: 'Total' },
    { key: 'bills', label: 'Bills', align: 'right', render: (r) => num(r.bills), footer: num(t.bills) },
    { key: 'parties', label: 'Parties billed', align: 'right', render: (r) => num(r.parties) },
    { key: 'taxable', label: 'Taxable', align: 'right', render: (r) => amt(r.taxable), footer: amt(t.taxable) },
    { key: 'sales', label: 'Sales (incl. GST)', align: 'right', render: (r) => <b>{amt(r.sales)}</b>, footer: amt(t.sales) },
    { key: 'avg', label: 'Avg bill', align: 'right', render: (r) => (r.bills ? amt(r.sales / r.bills) : '') },
    { key: 'collected', label: 'Collected', align: 'right', render: (r) => amt(r.collected), footer: amt(t.collected) },
    { key: 'collPct', label: 'Coll. % of sales', align: 'right', render: (r) => (r.sales ? `${((r.collected / r.sales) * 100).toFixed(0)}%` : '') },
    { key: 'orders', label: 'Orders', align: 'right', render: (r) => num(r.orders), footer: num(t.orders) },
    { key: 'orderValue', label: 'Order value', align: 'right', render: (r) => amt(r.orderValue), footer: amt(t.orderValue) },
  ];
  const doExport = () => exportExcel(`salesman-performance-${from}-to-${to}`, [{
    name: 'Salesman',
    rows,
    columns: [
      { key: 'name', label: 'Salesman' }, { key: 'bills', label: 'Bills' }, { key: 'parties', label: 'Parties' }, { key: 'taxable', label: 'Taxable' },
      { key: 'sales', label: 'Sales' }, { key: 'collected', label: 'Collected' }, { key: 'orders', label: 'Orders' }, { key: 'orderValue', label: 'Order Value' },
    ],
  }]);

  return (
    <ReportShell
      title="Salesman Performance"
      subtitle={periodLabel(from, to)}
      onExport={rows.length ? doExport : undefined}
      filters={<DateRange from={from} to={to} onChange={(f, tt) => { setFrom(f); setTo(tt); }} />}
    >
      <PrintSupport title="Salesman Performance" subtitle={periodLabel(from, to)} />
      <ErrorBox error={error} onRetry={reload} />
      <TopBarChart rows={rows.slice(0, 15)} label={(r) => r.name} value={(r) => r.sales} valueLabel="Sales by salesman (incl. GST)" />
      <DataTable columns={columns} rows={rows} loading={loading} rowKey={(r, i) => `${r.salesman}-${i}`}
        onRowClick={(r) => r.salesman && nav(`/reports/sales?${new URLSearchParams({ salesman: r.salesman, salesmanName: r.name, from, to, by: 'party' })}`)}
        empty="No sales, collections or orders in this period." />
    </ReportShell>
  );
}
