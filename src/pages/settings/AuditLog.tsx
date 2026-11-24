import { useState } from 'react';
import { Button, Chip, MenuItem, TextField, Typography } from '@mui/material';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/PageHeader';
import { DataTable, Col } from '../../components/DataTable';
import { FilterBar } from '../../components/Filters';
import { useFetch } from '../../lib/hooks';
import { fdatetime } from '../../lib/format';
import { exportExcel } from '../../lib/excel';
import { api, errMsg } from '../../api/client';
import type { User } from '../../lib/types';

interface Audit { _id: string; user?: string; userName: string; action: string; entity: string; entityId?: string; refNo: string; summary: string; ip: string; createdAt: string }

const ENTITIES: [string, string][] = [
  ['sales', 'Sales bill'], ['sales_transport', 'Bill transport / e-way'], ['sales_return', 'Credit note'], ['sales_order', 'Sales order'],
  ['purchase', 'Purchase'], ['purchase_return', 'Debit note'], ['purchase_order', 'Purchase order'],
  ['receipt', 'Receipt'], ['payment', 'Payment'], ['journal', 'Journal'], ['stock_adjustment', 'Stock adjustment'], ['batch', 'Batch'],
  ['delivery_run', 'Delivery run'], ['product', 'Product'], ['product_import', 'Product import'], ['party', 'Party'], ['party_import', 'Party import'],
  ['ledger', 'Ledger'], ['special_rate', 'Special rate'], ['manufacturer', 'Manufacturer'], ['route', 'Route'], ['user', 'User'], ['business', 'Business settings'],
];
const entityLabel = (e: string) => ENTITIES.find(([k]) => k === e)?.[1] || e.replace(/_/g, ' ');

const ACTION_COLOR: Record<string, 'success' | 'info' | 'error' | 'warning' | 'default' | 'secondary'> = {
  create: 'success', update: 'info', cancel: 'error', delete: 'error', status: 'warning', settings: 'secondary', login: 'default',
};

// Where a row can be opened.
const LINKS: Record<string, (id: string) => string> = {
  sales: (id) => `/sales/${id}`, sales_transport: (id) => `/sales/${id}`, purchase: (id) => `/purchases/${id}`,
  sales_order: (id) => `/sales-orders/${id}`, purchase_order: (id) => `/purchase-orders/${id}`, delivery_run: (id) => `/delivery/${id}`,
  product: (id) => `/products/${id}`, party: (id) => `/parties/${id}`,
};

export default function AuditLog() {
  const nav = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [entity, setEntity] = useState('');
  const [user, setUser] = useState('');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
  const params = { entity, user, page: page + 1, limit };
  const { data, loading } = useFetch<{ data: Audit[]; pagination: { total: number } }>('/audit', params);
  const { data: users } = useFetch<{ data: User[] }>('/users');

  const columns: Col<Audit>[] = [
    { key: 'createdAt', label: 'Time', nowrap: true, render: (r) => fdatetime(r.createdAt) },
    { key: 'userName', label: 'User', render: (r) => r.userName || '—' },
    { key: 'action', label: 'Action', render: (r) => <Chip label={r.action} color={ACTION_COLOR[r.action] || 'default'} sx={{ height: 20, fontSize: 11, fontWeight: 600, textTransform: 'capitalize' }} /> },
    { key: 'entity', label: 'Record', render: (r) => entityLabel(r.entity) },
    { key: 'refNo', label: 'Ref No', nowrap: true, render: (r) => <Typography fontSize={13} fontWeight={600} color={r.entityId && LINKS[r.entity] ? 'primary.main' : undefined}>{r.refNo}</Typography> },
    { key: 'summary', label: 'Details', render: (r) => <Typography fontSize={12.5} color="text.secondary">{r.summary}</Typography> },
    { key: 'ip', label: 'IP', render: (r) => <Typography fontSize={11} color="text.secondary">{r.ip}</Typography> },
  ];

  const exportAll = async () => {
    try {
      const r = await api.get('/audit', { params: { entity: entity || undefined, user: user || undefined, page: 1, limit: 500 } });
      exportExcel<Audit>('audit-log', [{ name: 'Audit log', rows: r.data.data, columns: [
        { key: 'createdAt', label: 'Time', value: (a) => fdatetime(a.createdAt) }, { key: 'userName', label: 'User' }, { key: 'action', label: 'Action' },
        { key: 'entity', label: 'Record', value: (a) => entityLabel(a.entity) }, { key: 'refNo', label: 'Ref No' }, { key: 'summary', label: 'Details' }, { key: 'ip', label: 'IP' },
      ] }]);
    } catch (e) { enqueueSnackbar(errMsg(e), { variant: 'error' }); }
  };

  return (
    <>
      <PageHeader title="Audit Log" subtitle="Who created, changed or cancelled what — every voucher and master edit is recorded"
        actions={<Button variant="outlined" startIcon={<FileDownloadOutlinedIcon />} onClick={exportAll}>Excel</Button>} />
      <FilterBar>
        <TextField select label="Record type" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(0); }} sx={{ width: 220 }}>
          <MenuItem value="">All</MenuItem>
          {ENTITIES.map(([k, l]) => <MenuItem key={k} value={k}>{l}</MenuItem>)}
        </TextField>
        <TextField select label="User" value={user} onChange={(e) => { setUser(e.target.value); setPage(0); }} sx={{ width: 200 }}>
          <MenuItem value="">All users</MenuItem>
          {(users?.data || []).map((u) => <MenuItem key={u._id} value={u._id}>{u.name}</MenuItem>)}
        </TextField>
      </FilterBar>
      <DataTable columns={columns} rows={data?.data || []} loading={loading} total={data?.pagination?.total || 0} page={page} limit={limit}
        onPage={setPage} onLimit={(l) => { setLimit(l); setPage(0); }} empty="No activity recorded."
        onRowClick={(r) => { const f = LINKS[r.entity]; if (r.entityId && f) nav(f(r.entityId)); }} />
    </>
  );
}
