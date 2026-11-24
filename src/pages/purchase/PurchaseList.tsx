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

export default function PurchaseList() {
  const nav = useNavigate();
  const { can } = useAuth();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [search, setSearch] = useState('');
  const [party, setParty] = useState<PartyOption | null>(null);
  const [paymentStatus, setPaymentStatus] = useState('');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
  const q = useDebounced(search);
  const params = { from, to, search: q, party: party?._id, paymentStatus, page: page + 1, limit };
  const { data, loading } = useFetch<{ data: Voucher[]; pagination: { total: number }; totals: { total: number; balance: number; count: number } }>('/purchases', params);

  const columns: Col<Voucher>[] = [
    { key: 'number', label: 'Our No', nowrap: true, render: (r) => <Typography fontWeight={600} fontSize={13}>{r.number}</Typography> },
    { key: 'date', label: 'Received', nowrap: true, render: (r) => fdate(r.date) },
    { key: 'partyName', label: 'Supplier' },
    { key: 'supplierInvoiceNo', label: 'Supplier Bill', nowrap: true, render: (r) => <>{r.supplierInvoiceNo} <Typography component="span" fontSize={11} color="text.secondary">{fdate(r.supplierInvoiceDate)}</Typography></> },
    { key: 'items', label: 'Lines', align: 'right', render: (r) => r.items?.length },
    { key: 'taxableAmount', label: 'Taxable', align: 'right', render: (r) => amt(r.taxableAmount) },
    { key: 'tax', label: 'GST', align: 'right', render: (r) => amt(r.cgst + r.sgst + r.igst) },
    { key: 'grandTotal', label: 'Total', align: 'right', render: (r) => <b>{amt(r.grandTotal)}</b>, footer: amt(data?.totals?.total) },
    { key: 'balance', label: 'Payable', align: 'right', render: (r) => (r.status === 'cancelled' ? '—' : amt(r.balance)), footer: amt(data?.totals?.balance) },
    { key: 'dueDate', label: 'Due', nowrap: true, render: (r) => fdate(r.dueDate) },
    { key: 'status', label: 'Status', render: (r) => <StatusChip status={r.status === 'cancelled' ? 'cancelled' : r.paymentStatus} /> },
  ];

  const exportAll = async () => {
    const r = await api.get('/purchases', { params: { ...params, page: 1, limit: 500 } });
    exportExcel(`purchase-register-${from}-to-${to}`, [{
      name: 'Purchase Register', rows: r.data.data as Voucher[],
      columns: [
        { key: 'number', label: 'Our No' }, { key: 'date', label: 'Date', value: (v) => fdate(v.date) }, { key: 'partyName', label: 'Supplier' },
        { key: 'partyGstin', label: 'GSTIN' }, { key: 'supplierInvoiceNo', label: 'Supplier Bill' }, { key: 'sid', label: 'Bill Date', value: (v) => fdate(v.supplierInvoiceDate) },
        { key: 'taxableAmount', label: 'Taxable' }, { key: 'cgst', label: 'CGST' }, { key: 'sgst', label: 'SGST' }, { key: 'igst', label: 'IGST' },
        { key: 'grandTotal', label: 'Total' }, { key: 'balance', label: 'Payable' }, { key: 'status', label: 'Status' },
      ],
    }]);
  };

  return (
    <>
      <PageHeader
        title="Purchase Bills"
        subtitle={data ? `${data.totals?.count || 0} bills · ₹${amt(data.totals?.total)}` : undefined}
        actions={<>
          <Button variant="outlined" startIcon={<FileDownloadOutlinedIcon />} onClick={exportAll}>Excel</Button>
          {can('purchases:create') && <Button variant="contained" startIcon={<AddIcon />} onClick={() => nav('/purchases/new')}>New Purchase (Alt+P)</Button>}
        </>}
      />
      <FilterBar>
        <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(0); }} placeholder="Our no / supplier bill / supplier" />
        <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); setPage(0); }} />
        <PartyPicker type="supplier" value={party} onChange={(v) => { setParty(v); setPage(0); }} sx={{ width: 240 }} />
        <TextField select label="Payment" value={paymentStatus} onChange={(e) => { setPaymentStatus(e.target.value); setPage(0); }} sx={{ width: 130 }}>
          <MenuItem value="">All</MenuItem><MenuItem value="unpaid">Unpaid</MenuItem><MenuItem value="partial">Partial</MenuItem><MenuItem value="paid">Paid</MenuItem>
        </TextField>
      </FilterBar>
      <DataTable columns={columns} rows={data?.data || []} loading={loading} total={data?.pagination?.total || 0} page={page} limit={limit}
        onPage={setPage} onLimit={(l) => { setLimit(l); setPage(0); }} onRowClick={(r) => nav(`/purchases/${r._id}`)} rowSx={(r) => (r.status === 'cancelled' ? { opacity: 0.5 } : undefined)} />
    </>
  );
}
