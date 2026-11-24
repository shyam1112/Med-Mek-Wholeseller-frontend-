import { useEffect, useState } from 'react';
import { Box, Button, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import AcUnitIcon from '@mui/icons-material/AcUnit';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/PageHeader';
import { DataTable, Col } from '../../components/DataTable';
import { FilterBar, SearchBox } from '../../components/Filters';
import { ManufacturerPicker } from '../../components/Pickers';
import { useFetch, useDebounced, useHotkey } from '../../lib/hooks';
import { amt, fexp, num } from '../../lib/format';
import { exportExcel } from '../../lib/excel';
import { api, errMsg } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import type { Product } from '../../lib/types';
import { ExpiryText, SmallChip, scheme } from './masterUi';

const SCHEDULES = ['None', 'H', 'H1', 'X', 'G', 'Narcotic'];

export default function Products() {
  const nav = useNavigate();
  const { can, business } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const [sp, setSp] = useSearchParams();
  const [search, setSearch] = useState(sp.get('search') || '');
  const [mfr, setMfr] = useState<{ _id: string; name: string } | null>(null);
  const [schedule, setSchedule] = useState('');
  const [active, setActive] = useState('true');
  const [stockFilter, setStockFilter] = useState('');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
  const [exporting, setExporting] = useState(false);
  const q = useDebounced(search);
  const nearDays = business?.settings?.nearExpiryDays || 90;

  // ?manufacturer=ID (from the Companies screen) preselects the company filter.
  const mfrParam = sp.get('manufacturer') || '';
  useEffect(() => {
    if (!mfrParam) return;
    if (mfr?._id === mfrParam) return;
    api.get(`/manufacturers/${mfrParam}`).then((r) => setMfr({ _id: r.data.data._id, name: r.data.data.name })).catch(() => setMfr({ _id: mfrParam, name: 'Selected company' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mfrParam]);

  const pickMfr = (v: { _id: string; name: string } | null) => {
    setMfr(v);
    setPage(0);
    const next = new URLSearchParams(sp);
    if (v) next.set('manufacturer', v._id); else next.delete('manufacturer');
    setSp(next, { replace: true });
  };

  const params = { search: q, manufacturer: mfr?._id || mfrParam, schedule, active, page: page + 1, limit };
  const { data, loading } = useFetch<{ data: Product[]; pagination: { total: number } }>('/products', params);
  let rows = data?.data || [];
  // Stock filters are applied on the visible page (the list API has no stock filter).
  if (stockFilter === 'in') rows = rows.filter((r) => (r.stock || 0) > 0);
  if (stockFilter === 'out') rows = rows.filter((r) => !(r.stock || 0));
  if (stockFilter === 'low') rows = rows.filter((r) => r.reorderLevel > 0 && (r.stock || 0) <= r.reorderLevel);

  useHotkey('alt+n', () => can('products:create') && nav('/products/new'));

  const columns: Col<Product>[] = [
    {
      key: 'name', label: 'Product',
      render: (r) => (
        <Box sx={{ minWidth: 200 }}>
          <Typography fontSize={13} fontWeight={600} component="span">{r.name}</Typography>
          {r.schedule && r.schedule !== 'None' && <SmallChip label={r.schedule} color={r.schedule === 'H1' || r.schedule === 'X' || r.schedule === 'Narcotic' ? 'error' : 'warning'} />}
          {r.isBanned && <SmallChip label="BANNED" color="error" />}
          {!r.isActive && <SmallChip label="Inactive" variant="outlined" />}
          {r.coldChain && <Tooltip title="Cold chain (2–8°C)"><AcUnitIcon sx={{ fontSize: 14, ml: 0.5, color: 'info.main', verticalAlign: 'middle' }} /></Tooltip>}
          {(r.salt || r.code) && <Typography fontSize={11} color="text.secondary" noWrap sx={{ maxWidth: 320 }}>{[r.code, r.salt].filter(Boolean).join(' · ')}</Typography>}
        </Box>
      ),
    },
    { key: 'packing', label: 'Packing', nowrap: true },
    { key: 'manufacturerName', label: 'Company', render: (r) => <Typography fontSize={12.5} noWrap sx={{ maxWidth: 160 }}>{r.manufacturerName}</Typography> },
    { key: 'hsn', label: 'HSN' },
    { key: 'gstRate', label: 'GST', align: 'right', render: (r) => `${r.gstRate}%` },
    { key: 'mrp', label: 'MRP', align: 'right', render: (r) => amt(r.mrp) },
    { key: 'ptr', label: 'PTR', align: 'right', render: (r) => amt(r.ptr) },
    {
      key: 'stock', label: 'Stock', align: 'right',
      render: (r) => {
        const s = r.stock || 0;
        const low = r.reorderLevel > 0 && s <= r.reorderLevel;
        return (
          <Tooltip title={`${low ? `At/below reorder level ${r.reorderLevel}. ` : ''}${r.damaged ? `${r.damaged} damaged/expired held separately.` : ''}`}>
            <Box>
              <Typography fontSize={13} fontWeight={700} color={s <= 0 ? 'error.main' : low ? 'warning.dark' : 'success.dark'}>{num(s)}</Typography>
              {!!r.damaged && <Typography fontSize={10.5} color="error.main">+{num(r.damaged)} dmg</Typography>}
            </Box>
          </Tooltip>
        );
      },
    },
    { key: 'nearestExpiry', label: 'Near Exp', align: 'center', render: (r) => <ExpiryText expiry={r.nearestExpiry} nearDays={nearDays} /> },
    { key: 'scheme', label: 'Scheme', align: 'center', render: (r) => scheme(r.schemeBuy, r.schemeFree) || '—' },
    { key: 'rack', label: 'Rack', nowrap: true },
  ];

  // Export the full filtered master (pages of 500).
  const exportAll = async () => {
    setExporting(true);
    try {
      const all: Product[] = [];
      for (let p = 1; p < 100; p++) {
        const r = await api.get('/products', { params: { ...params, page: p, limit: 500 } });
        all.push(...r.data.data);
        if (p >= (r.data.pagination?.pages || 1)) break;
      }
      exportExcel(`products${mfr ? '-' + mfr.name : ''}`, [{
        name: 'Products',
        rows: all,
        columns: [
          { key: 'code', label: 'Code' }, { key: 'name', label: 'Product' }, { key: 'packing', label: 'Packing' },
          { key: 'manufacturerName', label: 'Company' }, { key: 'salt', label: 'Salt' }, { key: 'form', label: 'Form' },
          { key: 'category', label: 'Category' }, { key: 'hsn', label: 'HSN' }, { key: 'gstRate', label: 'GST %' },
          { key: 'schedule', label: 'Schedule' }, { key: 'mrp', label: 'MRP' }, { key: 'ptr', label: 'PTR' }, { key: 'pts', label: 'PTS' },
          { key: 'purchaseRate', label: 'Purchase Rate' }, { key: 'stock', label: 'Stock' }, { key: 'damaged', label: 'Damaged' },
          { key: 'stockValue', label: 'Stock Value' }, { key: 'nearestExpiry', label: 'Nearest Expiry', value: (r) => fexp(r.nearestExpiry) },
          { key: 'scheme', label: 'Scheme', value: (r) => scheme(r.schemeBuy, r.schemeFree) },
          { key: 'rack', label: 'Rack' }, { key: 'barcode', label: 'Barcode' }, { key: 'reorderLevel', label: 'Reorder Level' },
          { key: 'reorderQty', label: 'Reorder Qty' }, { key: 'isActive', label: 'Active', value: (r) => (r.isActive ? 'Yes' : 'No') },
        ],
      }]);
    } catch (e) {
      enqueueSnackbar(errMsg(e), { variant: 'error' });
    } finally {
      setExporting(false);
    }
  };

  const hasFilters = !!(q || mfr || schedule || active !== 'true' || stockFilter);

  return (
    <>
      <PageHeader
        title="Products"
        crumbs={[{ label: 'Masters' }]}
        subtitle={data ? `${num(data.pagination?.total || 0)} products${mfr ? ` of ${mfr.name}` : ''}` : 'Item master with live stock'}
        actions={
          <>
            {can('products:create') && <Button variant="outlined" startIcon={<UploadFileOutlinedIcon />} onClick={() => nav('/import')}>Import</Button>}
            <Button variant="outlined" startIcon={<FileDownloadOutlinedIcon />} onClick={exportAll} disabled={exporting}>{exporting ? 'Exporting…' : 'Excel'}</Button>
            {can('products:create') && <Button variant="contained" startIcon={<AddIcon />} onClick={() => nav('/products/new')}>New Product (Alt+N)</Button>}
          </>
        }
      />
      <FilterBar>
        <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(0); }} placeholder="Name / salt / code / barcode / company" width={300} />
        <ManufacturerPicker value={mfr} onChange={pickMfr} sx={{ width: 240 }} />
        <TextField select label="Schedule" value={schedule} onChange={(e) => { setSchedule(e.target.value); setPage(0); }} sx={{ width: 120 }}>
          <MenuItem value="">All</MenuItem>
          {SCHEDULES.map((s) => <MenuItem key={s} value={s}>{s === 'None' ? 'Non-scheduled' : s}</MenuItem>)}
        </TextField>
        <TextField select label="Stock" value={stockFilter} onChange={(e) => setStockFilter(e.target.value)} sx={{ width: 140 }}>
          <MenuItem value="">All</MenuItem>
          <MenuItem value="in">In stock</MenuItem>
          <MenuItem value="out">Out of stock</MenuItem>
          <MenuItem value="low">At reorder level</MenuItem>
        </TextField>
        <TextField select label="Status" value={active} onChange={(e) => { setActive(e.target.value); setPage(0); }} sx={{ width: 110 }}>
          <MenuItem value="true">Active</MenuItem>
          <MenuItem value="false">Inactive</MenuItem>
          <MenuItem value="all">All</MenuItem>
        </TextField>
        {hasFilters && <Button onClick={() => { setSearch(''); pickMfr(null); setSchedule(''); setActive('true'); setStockFilter(''); }}>Clear</Button>}
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
        onRowClick={(r) => nav(`/products/${r._id}`)}
        rowSx={(r) => (!r.isActive || r.isBanned ? { opacity: 0.6 } : undefined)}
        empty={hasFilters ? 'No products match these filters.' : 'No products yet — add one or import your item master from Excel.'}
      />
      {stockFilter && <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>Stock filter applies to the rows on this page.</Typography>}
    </>
  );
}
