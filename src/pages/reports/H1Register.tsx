import { useMemo, useState } from 'react';
import { Box, Chip, Typography } from '@mui/material';
import { ReportShell } from '../../components/ReportShell';
import { DataTable, Col } from '../../components/DataTable';
import { DateRange, SearchBox } from '../../components/Filters';
import { useFetch } from '../../lib/hooks';
import { fdate, fexp, monthStart, num, today } from '../../lib/format';
import { useAuth } from '../../auth/AuthContext';
import { ErrorBox, PrintSupport, periodLabel } from './reportKit';
import { exportTitledExcel } from './titledExcel';

interface Row {
  _id: string; date: string; number: string; partyName: string; partyAddress: string; partyDl: string; productName: string;
  manufacturerName: string; schedule: string; batchNo: string; expiry: string; qty: number;
}
const SCHEDULES = ['H1', 'X', 'Narcotic', 'H'];

export default function H1Register() {
  const { business } = useAuth();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [sched, setSched] = useState<string[]>(['H1', 'X', 'Narcotic']);
  const [search, setSearch] = useState('');
  const { data, loading, error, reload } = useFetch<{ data: Row[] }>(sched.length ? '/reports/h1-register' : null, { from, to, schedules: sched.join(',') });
  const all = sched.length ? data?.data || [] : [];
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? all.filter((r) => `${r.partyName} ${r.productName} ${r.number} ${r.batchNo}`.toLowerCase().includes(q)) : all;
  }, [all, search]);
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const toggle = (s: string) => setSched((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]));

  const columns: Col<Row>[] = [
    { key: 'sr', label: 'Sr', align: 'right', width: 40, render: (_r, i) => i + 1 },
    { key: 'date', label: 'Date', nowrap: true, render: (r) => fdate(r.date) },
    { key: 'number', label: 'Bill No', nowrap: true },
    { key: 'partyName', label: 'Name & address of buyer', render: (r) => <><Typography fontSize={13} fontWeight={600}>{r.partyName}</Typography><Typography fontSize={11} color="text.secondary">{r.partyAddress}</Typography></> },
    { key: 'partyDl', label: 'Buyer DL No', render: (r) => r.partyDl || <Typography component="span" fontSize={12} color="error.main">missing</Typography> },
    { key: 'productName', label: 'Drug', render: (r) => <><Typography fontSize={13}>{r.productName}</Typography><Typography fontSize={11} color="text.secondary">{r.manufacturerName}</Typography></> },
    { key: 'schedule', label: 'Sch.', render: (r) => <Chip size="small" label={r.schedule} color={r.schedule === 'H' ? 'default' : 'warning'} sx={{ height: 18, fontSize: 10 }} /> },
    { key: 'batchNo', label: 'Batch', nowrap: true },
    { key: 'expiry', label: 'Exp', nowrap: true, render: (r) => fexp(r.expiry) },
    { key: 'qty', label: 'Qty', align: 'right', render: (r) => <b>{num(r.qty)}</b>, footer: num(totalQty) },
  ];

  const period = periodLabel(from, to);
  const doExport = () => exportTitledExcel(
    `schedule-register-${from}-to-${to}`, 'Schedule H1 Register',
    [
      `SCHEDULE ${sched.join(' / ')} DRUG REGISTER (Drugs & Cosmetics Rules)`,
      `${business?.name || ''} · DL: ${[business?.dl20b, business?.dl21b].filter(Boolean).join(', ') || '-'} · GSTIN: ${business?.gstin || '-'}`,
      `Period: ${period}`,
    ],
    ['Sr', 'Date', 'Bill No', 'Buyer Name', 'Buyer Address', 'Buyer DL No', 'Drug', 'Manufacturer', 'Schedule', 'Batch', 'Expiry', 'Qty'],
    rows.map((r, i) => [i + 1, fdate(r.date), r.number, r.partyName, r.partyAddress, r.partyDl, r.productName, r.manufacturerName, r.schedule, r.batchNo, fexp(r.expiry), r.qty]),
    ['', '', '', '', '', '', '', '', '', '', 'Total', totalQty],
  );

  return (
    <ReportShell
      help={['schedule']}
      title="Schedule H1 / X / Narcotic Register"
      subtitle={`${period} · statutory register of scheduled-drug sales`}
      onExport={rows.length ? doExport : undefined}
      filters={
        <>
          <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
          <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
            {SCHEDULES.map((s) => (
              <Chip key={s} label={s === 'H' ? 'H (optional)' : s} clickable color={sched.includes(s) ? 'primary' : 'default'} variant={sched.includes(s) ? 'filled' : 'outlined'} onClick={() => toggle(s)} />
            ))}
          </Box>
          <SearchBox value={search} onChange={setSearch} placeholder="Buyer / drug / bill / batch" />
        </>
      }
    >
      <PrintSupport title={`Schedule ${sched.join(' / ')} Drug Register`} subtitle={`Period: ${period}`} landscape />
      <ErrorBox error={error} onRetry={reload} />
      <DataTable columns={columns} rows={rows} loading={loading} rowKey={(r, i) => `${r._id}-${i}`}
        empty={sched.length ? 'No scheduled-drug sales in this period.' : 'Select at least one schedule.'} maxHeight="calc(100vh - 230px)" />
    </ReportShell>
  );
}
