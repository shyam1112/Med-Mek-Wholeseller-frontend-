import React, { useMemo, useState } from 'react';
import { Box, Chip, MenuItem, TextField, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { ReportShell } from '../../components/ReportShell';
import { DataTable, Col } from '../../components/DataTable';
import { DateRange, SearchBox } from '../../components/Filters';
import { useFetch } from '../../lib/hooks';
import { amt, fdate, round2, today } from '../../lib/format';
import { exportExcel } from '../../lib/excel';
import { ErrorBox, PrintSupport, periodLabel, vLabel, voucherPath } from './reportKit';

interface Line { ledger: string; debit: number; credit: number }
interface V { voucherId: string; voucherType: string; voucherNo: string; date: string; narration: string; lines: Line[]; amount: number }

const TYPES = ['sales', 'purchase', 'receipt', 'payment', 'sales_return', 'purchase_return', 'journal', 'contra', 'expense', 'pdc_clear', 'cheque_bounce'];
const TYPE_COLOR: Record<string, 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info' | 'default'> = {
  sales: 'primary', purchase: 'secondary', receipt: 'success', payment: 'warning', sales_return: 'info', purchase_return: 'info', cheque_bounce: 'error',
};

const LineCell: React.FC<{ v: V; kind: 'name' | 'dr' | 'cr' }> = ({ v, kind }) => (
  <Box>
    {v.lines.map((l, i) => (
      <Typography key={i} fontSize={12.5} lineHeight="20px" noWrap sx={{ pl: kind === 'name' && l.credit ? 3 : 0 }}>
        {kind === 'name' ? <>{l.debit ? 'Dr' : 'Cr'} &nbsp;{l.ledger || '—'}</> : kind === 'dr' ? (l.debit ? amt(l.debit) : ' ') : (l.credit ? amt(l.credit) : ' ')}
      </Typography>
    ))}
  </Box>
);

export default function DayBook() {
  const nav = useNavigate();
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [voucherType, setVoucherType] = useState('');
  const [search, setSearch] = useState('');
  const { data, loading, error, reload } = useFetch<{ data: V[] }>('/reports/day-book', { from, to, voucherType });
  const all = data?.data || [];
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? all.filter((v) => `${v.voucherNo} ${v.narration} ${v.lines.map((l) => l.ledger).join(' ')}`.toLowerCase().includes(q)) : all;
  }, [all, search]);
  const dr = round2(rows.reduce((s, v) => s + v.lines.reduce((a, l) => a + l.debit, 0), 0));
  const cr = round2(rows.reduce((s, v) => s + v.lines.reduce((a, l) => a + l.credit, 0), 0));

  const columns: Col<V>[] = [
    { key: 'date', label: 'Date', nowrap: true, width: 96, render: (v) => fdate(v.date) },
    { key: 'type', label: 'Type', width: 110, render: (v) => <Chip size="small" label={vLabel(v.voucherType)} color={TYPE_COLOR[v.voucherType] || 'default'} variant="outlined" sx={{ height: 20, fontSize: 11 }} /> },
    { key: 'voucherNo', label: 'Voucher No', nowrap: true, render: (v) => <Typography fontSize={13} fontWeight={600}>{v.voucherNo}</Typography>, footer: `${rows.length} vouchers` },
    { key: 'particulars', label: 'Particulars', render: (v) => <><LineCell v={v} kind="name" />{v.narration && <Typography fontSize={11} color="text.secondary" fontStyle="italic" sx={{ mt: 0.25 }}>{v.narration}</Typography>}</> },
    { key: 'debit', label: 'Debit', align: 'right', render: (v) => <LineCell v={v} kind="dr" />, footer: amt(dr) },
    { key: 'credit', label: 'Credit', align: 'right', render: (v) => <LineCell v={v} kind="cr" />, footer: amt(cr) },
  ];

  const doExport = () => exportExcel(`day-book-${from}-to-${to}`, [{
    name: 'Day Book',
    rows: rows.flatMap((v) => v.lines.map((l, i) => ({ date: fdate(v.date), type: i ? '' : vLabel(v.voucherType), no: i ? '' : v.voucherNo, ledger: l.ledger, debit: l.debit || '', credit: l.credit || '', narration: i ? '' : v.narration }))),
    columns: [
      { key: 'date', label: 'Date' }, { key: 'type', label: 'Type' }, { key: 'no', label: 'Voucher No' }, { key: 'ledger', label: 'Ledger' },
      { key: 'debit', label: 'Debit' }, { key: 'credit', label: 'Credit' }, { key: 'narration', label: 'Narration' },
    ],
  }]);

  const subtitle = `${from === to ? fdate(from) : periodLabel(from, to)}${voucherType ? ` · ${vLabel(voucherType)}` : ''}`;
  return (
    <ReportShell
      help={['daybook', 'drcr']}
      title="Day Book"
      subtitle={subtitle}
      onExport={rows.length ? doExport : undefined}
      filters={
        <>
          <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
          <TextField select label="Voucher type" value={voucherType} onChange={(e) => setVoucherType(e.target.value)} sx={{ width: 170 }}>
            <MenuItem value="">All</MenuItem>
            {TYPES.map((t) => <MenuItem key={t} value={t}>{vLabel(t)}</MenuItem>)}
          </TextField>
          <SearchBox value={search} onChange={setSearch} placeholder="Voucher / ledger / narration" />
        </>
      }
    >
      <PrintSupport title="Day Book" subtitle={subtitle} />
      <ErrorBox error={error} onRetry={reload} />
      {Math.abs(dr - cr) > 0.01 && !voucherType && !search && (
        <Typography color="error.main" fontSize={13} sx={{ mb: 1 }}>Debit and credit differ by {amt(dr - cr)} — check the entries.</Typography>
      )}
      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        rowKey={(v) => `${v.voucherId}-${v.voucherType}`}
        onRowClick={(v) => { const p = voucherPath(v.voucherType, v.voucherId); if (p) nav(p); }}
        empty="No vouchers on this day."
        maxHeight="calc(100vh - 230px)"
      />
    </ReportShell>
  );
}
