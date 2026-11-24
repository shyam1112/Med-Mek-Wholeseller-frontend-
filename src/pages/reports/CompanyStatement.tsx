import { useMemo, useState } from 'react';
import { Alert, FormControlLabel, Switch, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { ReportShell } from '../../components/ReportShell';
import { DataTable, Col } from '../../components/DataTable';
import { DateRange, SearchBox } from '../../components/Filters';
import { ManufacturerPicker } from '../../components/Pickers';
import { useFetch } from '../../lib/hooks';
import { amt, num, round2 } from '../../lib/format';
import { useAuth } from '../../auth/AuthContext';
import { ErrorBox, PrintSupport, lastMonthRange, periodLabel, safeName } from './reportKit';
import { exportTitledExcel } from './titledExcel';

interface Row {
  product: string; name: string; packing: string; manufacturerName: string; ptr: number;
  opening: number; purchase: number; sales: number; salesReturn: number; purchaseReturn: number; adjustment: number; closing: number;
  salesValue: number; closingValue: number;
}
const QTY_KEYS = ['opening', 'purchase', 'salesReturn', 'sales', 'purchaseReturn', 'adjustment', 'closing'] as const;

export default function CompanyStatement() {
  const nav = useNavigate();
  const { business } = useAuth();
  const [lmFrom, lmTo] = lastMonthRange();
  const [from, setFrom] = useState(lmFrom);
  const [to, setTo] = useState(lmTo);
  const [company, setCompany] = useState<{ _id: string; name: string } | null>(null);
  const [includeZero, setIncludeZero] = useState(false);
  const [search, setSearch] = useState('');
  const { data, loading, error, reload } = useFetch<{ data: Row[] }>(company ? '/reports/company-statement' : null, {
    manufacturer: company?._id, from, to, includeZero: includeZero ? 'true' : '',
  });
  const all = company ? data?.data || [] : [];
  const rows = useMemo(() => { const q = search.trim().toLowerCase(); return q ? all.filter((r) => r.name.toLowerCase().includes(q)) : all; }, [all, search]);
  const t = useMemo(() => {
    const o: Record<string, number> = { salesValue: 0, closingValue: 0 };
    for (const k of QTY_KEYS) o[k] = 0;
    for (const r of rows) { for (const k of QTY_KEYS) o[k] += r[k]; o.salesValue = round2(o.salesValue + r.salesValue); o.closingValue = round2(o.closingValue + r.closingValue); }
    return o;
  }, [rows]);

  const q = (k: (typeof QTY_KEYS)[number], label: string, color?: string): Col<Row> => ({
    key: k, label, align: 'right', footer: num(t[k]),
    render: (r) => (r[k] ? <Typography component="span" fontSize={13} color={color} fontWeight={k === 'closing' ? 700 : 400}>{num(r[k])}</Typography> : <Typography component="span" fontSize={13} color="text.disabled">0</Typography>),
  });
  const columns: Col<Row>[] = [
    { key: 'name', label: 'Product', render: (r) => <><Typography fontSize={13} fontWeight={600}>{r.name}</Typography><Typography fontSize={11} color="text.secondary">{r.packing}</Typography></>, footer: `${rows.length} items` },
    { key: 'ptr', label: 'PTR', align: 'right', render: (r) => amt(r.ptr) },
    q('opening', 'Opening'), q('purchase', 'Receipt', 'success.main'), q('salesReturn', 'Sales Ret.'), q('sales', 'Sales', 'primary.main'),
    q('purchaseReturn', 'Pur. Ret.'), q('adjustment', 'Adj.'), q('closing', 'Closing'),
    { key: 'salesValue', label: 'Sales Value', align: 'right', render: (r) => amt(r.salesValue), footer: amt(t.salesValue) },
    { key: 'closingValue', label: 'Closing Value', align: 'right', render: (r) => amt(r.closingValue), footer: amt(t.closingValue) },
  ];

  const period = periodLabel(from, to);
  const monthName = dayjs(from).isSame(dayjs(to), 'month') ? dayjs(from).format('MMM-YYYY') : `${from}_to_${to}`;
  const doExport = () => {
    if (!company) return;
    exportTitledExcel(
      `Stock-Sales-Statement_${safeName(company.name)}_${monthName}`,
      `${company.name} ${monthName}`,
      [
        `STOCK & SALES STATEMENT — ${company.name.toUpperCase()}`,
        `Distributor: ${business?.name || ''}${business?.city ? `, ${business.city}` : ''}`,
        `GSTIN: ${business?.gstin || '-'}   DL No: ${[business?.dl20b, business?.dl21b].filter(Boolean).join(', ') || '-'}`,
        `Period: ${period}   (quantities in units; values at PTR)`,
      ],
      ['Product', 'Pack', 'PTR', 'Opening', 'Receipt', 'Sales Return', 'Sales', 'Purchase Return', 'Adjustment', 'Closing', 'Sales Value', 'Closing Value'],
      rows.map((r) => [r.name, r.packing, r.ptr, r.opening, r.purchase, r.salesReturn, r.sales, r.purchaseReturn, r.adjustment, r.closing, r.salesValue, r.closingValue]),
      ['TOTAL', '', '', t.opening, t.purchase, t.salesReturn, t.sales, t.purchaseReturn, t.adjustment, t.closing, t.salesValue, t.closingValue],
    );
  };

  const subtitle = company ? `${company.name} · ${period}` : 'Monthly stock & sales statement for a company';
  return (
    <ReportShell
      title="Company Stock & Sales Statement"
      subtitle={subtitle}
      onExport={rows.length ? doExport : undefined}
      filters={
        <>
          <ManufacturerPicker value={company} onChange={setCompany} label="Company *" sx={{ width: 260 }} autoFocus />
          <DateRange from={from} to={to} onChange={(f, tt) => { setFrom(f); setTo(tt); }} />
          <SearchBox value={search} onChange={setSearch} placeholder="Product" width={200} />
          <FormControlLabel control={<Switch checked={includeZero} onChange={(e) => setIncludeZero(e.target.checked)} />} label="Include no-movement items" />
        </>
      }
    >
      <PrintSupport title={`Stock & Sales Statement — ${company?.name || ''}`} subtitle={`Period: ${period} · quantities in units, values at PTR`} landscape />
      <ErrorBox error={error} onRetry={reload} />
      {!company ? (
        <Alert severity="info">Choose a company. The statement lists opening, receipts, sales, returns and closing per item — the format companies ask distributors to email every month. Excel includes your name, GSTIN, DL and the period on top.</Alert>
      ) : (
        <DataTable columns={columns} rows={rows} loading={loading} rowKey={(r) => String(r.product)} onRowClick={(r) => nav(`/reports/stock-ledger?product=${r.product}`)}
          empty="No stock movement for this company in the period." maxHeight="calc(100vh - 240px)" />
      )}
    </ReportShell>
  );
}
