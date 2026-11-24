import { useState } from 'react';
import { Button, MenuItem, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { DataTable, Col } from '../../components/DataTable';
import { FilterBar, SearchBox, DateRange } from '../../components/Filters';
import { PartyPicker, PartyOption } from '../../components/Pickers';
import { StatusChip } from '../../components/StatusChip';
import { useFetch, useDebounced } from '../../lib/hooks';
import { amt, fdate, monthStart, today } from '../../lib/format';
import { exportExcel } from '../../lib/excel';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import type { Voucher } from '../../lib/types';

export default function SalesList() {
  const nav = useNavigate();
  const { can } = useAuth();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [search, setSearch] = useState('');
  const [party, setParty] = useState<PartyOption | null>(null);
  const [paymentStatus, setPaymentStatus] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
  const q = useDebounced(search);
  const params = { from, to, search: q, party: party?._id, paymentStatus, status, page: page + 1, limit };
  const { data, loading } = useFetch<{ data: Voucher[]; pagination: { total: number }; totals: { total: number; balance: number; count: number } }>('/sales', params);
  const rows = data?.data || [];

  const columns: Col<Voucher>[] = [
    { key: 'number', label: 'Bill No', nowrap: true, render: (r) => <Typography fontWeight={600} fontSize={13}>{r.number}</Typography> },
    { key: 'date', label: 'Date', nowrap: true, render: (r) => fdate(r.date) },
    { key: 'partyName', label: 'Party', render: (r) => <>{r.partyName}{r.paymentMode === 'cash' && <Typography component="span" fontSize={11} color="text.secondary"> · cash</Typography>}</> },
    { key: 'salesmanName', label: 'Salesman' },
    { key: 'items', label: 'Items', align: 'right', render: (r) => r.items?.length },
    { key: 'taxableAmount', label: 'Taxable', align: 'right', render: (r) => amt(r.taxableAmount) },
    { key: 'tax', label: 'GST', align: 'right', render: (r) => amt(r.cgst + r.sgst + r.igst) },
    { key: 'grandTotal', label: 'Total', align: 'right', render: (r) => <b>{amt(r.grandTotal)}</b>, footer: amt(data?.totals?.total) },
    { key: 'balance', label: 'Balance', align: 'right', render: (r) => (r.status === 'cancelled' ? '—' : amt(r.balance)), footer: amt(data?.totals?.balance) },
    { key: 'dueDate', label: 'Due', nowrap: true, render: (r) => fdate(r.dueDate) },
    { key: 'paymentStatus', label: 'Status', render: (r) => <StatusChip status={r.status === 'cancelled' ? 'cancelled' : r.paymentStatus} /> },
    { key: 'deliveryStatus', label: 'Delivery', render: (r) => (r.status === 'active' ? <StatusChip status={r.deliveryStatus} /> : null) },
  ];

  // Export pulls the full filtered register, not just the visible page.
  const exportAll = async () => {
    const r = await api.get('/sales', { params: { ...params, page: 1, limit: 500 } });
    exportExcel(`sales-register-${from}-to-${to}`, [{
      name: 'Sales Register',
      rows: r.data.data as Voucher[],
      columns: [
        { key: 'number', label: 'Bill No' }, { key: 'date', label: 'Date', value: (v) => fdate(v.date) },
        { key: 'partyName', label: 'Party' }, { key: 'partyGstin', label: 'GSTIN' },
        { key: 'taxableAmount', label: 'Taxable' }, { key: 'cgst', label: 'CGST' }, { key: 'sgst', label: 'SGST' }, { key: 'igst', label: 'IGST' },
        { key: 'roundOff', label: 'Round Off' }, { key: 'grandTotal', label: 'Total' }, { key: 'balance', label: 'Balance' },
        { key: 'status', label: 'Status', value: (v) => (v.status === 'cancelled' ? 'Cancelled' : v.paymentStatus) },
      ],
    }]);
  };

  return (
    <>
      <PageHeader
        title="Sales Bills"
        subtitle={data ? `${data.totals?.count || 0} bills · ₹${amt(data.totals?.total)}` : undefined}
        actions={
          <>
            <Button variant="outlined" startIcon={<FileDownloadOutlinedIcon />} onClick={exportAll}>Excel</Button>
            {can('sales:create') && <Button variant="contained" startIcon={<AddIcon />} onClick={() => nav('/sales/new')}>New Bill (Alt+N)</Button>}
          </>
        }
      />
      <FilterBar>
        <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(0); }} placeholder="Bill no / party" />
        <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); setPage(0); }} />
        <PartyPicker type="customer" value={party} onChange={(v) => { setParty(v); setPage(0); }} sx={{ width: 240 }} />
        <TextField select label="Payment" value={paymentStatus} onChange={(e) => { setPaymentStatus(e.target.value); setPage(0); }} sx={{ width: 130 }}>
          <MenuItem value="">All</MenuItem><MenuItem value="unpaid">Unpaid</MenuItem><MenuItem value="partial">Partial</MenuItem><MenuItem value="paid">Paid</MenuItem>
        </TextField>
        <TextField select label="Bill status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} sx={{ width: 130 }}>
          <MenuItem value="">All</MenuItem><MenuItem value="active">Active</MenuItem><MenuItem value="cancelled">Cancelled</MenuItem>
        </TextField>
      </FilterBar>
      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        total={data?.pagination?.total || 0}
        page={page}
        limit={limit}
        onPage={setPage}
        onLimit={(l) => { setLimit(l); setPage(0); }}
        onRowClick={(r) => nav(`/sales/${r._id}`)}
        rowSx={(r) => (r.status === 'cancelled' ? { opacity: 0.5 } : undefined)}
      />
    </>
  );
}
