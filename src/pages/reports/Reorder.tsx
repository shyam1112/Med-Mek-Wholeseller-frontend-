import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, TextField, Typography } from '@mui/material';
import ShoppingCartCheckoutIcon from '@mui/icons-material/ShoppingCartCheckout';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { ReportShell } from '../../components/ReportShell';
import { DataTable, Col } from '../../components/DataTable';
import { SearchBox } from '../../components/Filters';
import { ManufacturerPicker, PartyOption, PartyPicker } from '../../components/Pickers';
import { useFetch } from '../../lib/hooks';
import { amt, num, round2 } from '../../lib/format';
import { exportExcel } from '../../lib/excel';
import { api, errMsg } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { ErrorBox, PrintSupport } from './reportKit';

interface Row {
  product: string; productName: string; manufacturerName: string; packing: string; stock: number; pendingOrders: number;
  monthlySales: number; reorderLevel: number; suggestQty: number; rate: number; gstRate: number; supplier: string | null; supplierName: string;
}

export default function Reorder() {
  const nav = useNavigate();
  const { can } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const [company, setCompany] = useState<{ _id: string; name: string } | null>(null);
  const [supplier, setSupplier] = useState<PartyOption | null>(null);
  const [search, setSearch] = useState('');
  const { data, loading, error, reload } = useFetch<{ data: Row[] }>('/purchase-orders/suggest', { manufacturer: company?._id, supplier: supplier?._id });
  const all = data?.data || [];
  const [qty, setQty] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assign, setAssign] = useState<Record<string, { _id: string; name: string }>>({});
  const [askSupplier, setAskSupplier] = useState(false);
  const [pickSupplier, setPickSupplier] = useState<PartyOption | null>(null);
  const [busy, setBusy] = useState(false);

  // Fresh suggestions → reset edits and select everything.
  useEffect(() => {
    setQty(Object.fromEntries(all.map((r) => [r.product, String(r.suggestQty)])));
    setSelected(new Set(all.map((r) => r.product)));
    setAssign({});
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? all.filter((r) => `${r.productName} ${r.manufacturerName} ${r.supplierName}`.toLowerCase().includes(q)) : all;
  }, [all, search]);
  const qtyOf = (r: Row) => Math.max(0, Math.floor(Number(qty[r.product]) || 0));
  const supOf = (r: Row) => (r.supplier ? { _id: String(r.supplier), name: r.supplierName } : assign[r.product] || null);
  const chosen = rows.filter((r) => selected.has(r.product) && qtyOf(r) > 0);
  const chosenValue = round2(chosen.reduce((s, r) => s + qtyOf(r) * r.rate, 0));
  const missingSupplier = chosen.filter((r) => !supOf(r));
  const supplierCount = new Set(chosen.map((r) => supOf(r)?._id).filter(Boolean)).size + (missingSupplier.length ? 1 : 0);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.product));
  const toggleAll = () => setSelected(allOn ? new Set() : new Set(rows.map((r) => r.product)));

  const create = async (extra?: Record<string, { _id: string; name: string }>) => {
    const sup = (r: Row) => (r.supplier ? { _id: String(r.supplier), name: r.supplierName } : extra?.[r.product] || assign[r.product]);
    const groups = new Map<string, { name: string; items: { product: string; qty: number; rate: number }[] }>();
    for (const r of chosen) {
      const s = sup(r);
      if (!s) continue;
      if (!groups.has(s._id)) groups.set(s._id, { name: s.name, items: [] });
      groups.get(s._id)!.items.push({ product: r.product, qty: qtyOf(r), rate: r.rate });
    }
    setBusy(true);
    const done: string[] = [];
    try {
      for (const [party, g] of groups) {
        const res = await api.post('/purchase-orders', { party, items: g.items, narration: 'From reorder report' });
        done.push(`${res.data.data?.number || ''} ${g.name}`.trim());
      }
      enqueueSnackbar(`${done.length} purchase order(s) created: ${done.join(', ')}`, { variant: 'success' });
      nav('/purchase-orders');
    } catch (e) {
      enqueueSnackbar(`${done.length ? `Created ${done.join(', ')}; then failed: ` : ''}${errMsg(e)}`, { variant: 'error' });
      if (done.length) reload();
    } finally {
      setBusy(false);
    }
  };

  const start = () => {
    if (!chosen.length) return;
    if (missingSupplier.length) { setPickSupplier(null); setAskSupplier(true); return; }
    create();
  };
  const confirmSupplier = () => {
    if (!pickSupplier) return;
    const extra = Object.fromEntries(missingSupplier.map((r) => [r.product, { _id: pickSupplier._id, name: pickSupplier.name }]));
    setAssign((a) => ({ ...a, ...extra }));
    setAskSupplier(false);
    create(extra);
  };

  const columns: Col<Row>[] = [
    { key: 'sel', label: <Checkbox size="small" checked={allOn} indeterminate={!allOn && rows.some((r) => selected.has(r.product))} onChange={toggleAll} />, width: 42,
      render: (r) => <Checkbox size="small" checked={selected.has(r.product)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(r.product)} /> },
    { key: 'productName', label: 'Product', render: (r) => <><Typography fontSize={13} fontWeight={600}>{r.productName}</Typography><Typography fontSize={11} color="text.secondary">{r.manufacturerName} · {r.packing}</Typography></>, footer: `${chosen.length} of ${rows.length} selected` },
    { key: 'stock', label: 'Stock', align: 'right', render: (r) => <Typography component="span" fontSize={13} fontWeight={700} color={r.stock <= 0 ? 'error.main' : 'warning.main'}>{num(r.stock)}</Typography> },
    { key: 'pendingOrders', label: 'Pending SO', align: 'right', render: (r) => (r.pendingOrders ? num(r.pendingOrders) : '') },
    { key: 'monthlySales', label: 'Sales/mo', align: 'right', render: (r) => num(r.monthlySales) },
    { key: 'reorderLevel', label: 'Reorder lvl', align: 'right', render: (r) => (r.reorderLevel ? num(r.reorderLevel) : '') },
    { key: 'suggestQty', label: 'Suggested', align: 'right', render: (r) => num(r.suggestQty) },
    { key: 'qty', label: 'Order qty', align: 'right', width: 100,
      render: (r) => <TextField size="small" type="number" value={qty[r.product] ?? ''} onClick={(e) => e.stopPropagation()}
        onChange={(e) => setQty((m) => ({ ...m, [r.product]: e.target.value }))} inputProps={{ min: 0, style: { textAlign: 'right', padding: '4px 6px' } }} sx={{ width: 80 }} /> },
    { key: 'rate', label: 'Rate', align: 'right', render: (r) => amt(r.rate) },
    { key: 'value', label: 'Value', align: 'right', render: (r) => amt(qtyOf(r) * r.rate), footer: amt(chosenValue) },
    { key: 'supplierName', label: 'Supplier', render: (r) => { const s = supOf(r); return s ? s.name : <Typography component="span" fontSize={12} color="warning.main">not set</Typography>; } },
  ];

  const doExport = () => exportExcel('reorder-list', [{
    name: 'Reorder',
    rows: rows.map((r) => ({ ...r, orderQty: qtyOf(r), value: round2(qtyOf(r) * r.rate), supplierName: supOf(r)?.name || '' })),
    columns: [
      { key: 'productName', label: 'Product' }, { key: 'packing', label: 'Pack' }, { key: 'manufacturerName', label: 'Company' },
      { key: 'stock', label: 'Stock' }, { key: 'pendingOrders', label: 'Pending SO' }, { key: 'monthlySales', label: 'Sales / month' },
      { key: 'reorderLevel', label: 'Reorder level' }, { key: 'suggestQty', label: 'Suggested' }, { key: 'orderQty', label: 'Order qty' },
      { key: 'rate', label: 'Rate' }, { key: 'value', label: 'Value' }, { key: 'supplierName', label: 'Supplier' },
    ],
  }]);

  return (
    <ReportShell
      help={['reorder', 'purchaseorder']}
      title="Reorder / Shortage"
      subtitle="Items at or below reorder level, or short against pending orders and last 3 months' sales"
      onExport={rows.length ? doExport : undefined}
      actions={can('purchase_orders:create') && (
        <Button variant="contained" startIcon={<ShoppingCartCheckoutIcon />} disabled={!chosen.length || busy} onClick={start} className="no-print">
          Create Purchase Order{supplierCount > 1 ? 's' : ''}{chosen.length ? ` (${supplierCount})` : ''}
        </Button>
      )}
      filters={
        <>
          <SearchBox value={search} onChange={setSearch} placeholder="Product / company / supplier" />
          <ManufacturerPicker value={company} onChange={setCompany} label="Company" sx={{ width: 220 }} />
          <PartyPicker type="supplier" value={supplier} onChange={setSupplier} label="Last supplier" sx={{ width: 220 }} />
        </>
      }
    >
      <PrintSupport title="Reorder / Shortage List" subtitle={[company?.name, supplier?.name].filter(Boolean).join(' · ')} landscape />
      <ErrorBox error={error} onRetry={reload} />
      {chosen.length > 0 && (
        <Box className="no-print" sx={{ mb: 1 }}>
          <Typography fontSize={13} color="text.secondary">
            {chosen.length} items · ₹{amt(chosenValue)} (before GST) · {supplierCount} supplier{supplierCount === 1 ? '' : 's'}
            {missingSupplier.length > 0 && <> · <Typography component="span" fontSize={13} color="warning.main">{missingSupplier.length} without a last supplier</Typography></>}
          </Typography>
        </Box>
      )}
      <DataTable columns={columns} rows={rows} loading={loading} rowKey={(r) => String(r.product)} onRowClick={(r) => toggle(r.product)}
        empty="Nothing to reorder — stock is above reorder levels." maxHeight="calc(100vh - 260px)" />

      <Dialog open={askSupplier} onClose={() => setAskSupplier(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Choose a supplier</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {missingSupplier.length} selected item{missingSupplier.length === 1 ? ' has' : 's have'} never been purchased, so there is no last supplier. Order {missingSupplier.length === 1 ? 'it' : 'them'} from:
          </DialogContentText>
          <Alert severity="info" sx={{ mb: 2, fontSize: 12 }}>{missingSupplier.slice(0, 6).map((r) => r.productName).join(', ')}{missingSupplier.length > 6 ? ` +${missingSupplier.length - 6} more` : ''}</Alert>
          <PartyPicker type="supplier" value={pickSupplier} onChange={setPickSupplier} autoFocus />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAskSupplier(false)}>Cancel</Button>
          <Button variant="contained" disabled={!pickSupplier || busy} onClick={confirmSupplier}>Create orders</Button>
        </DialogActions>
      </Dialog>
    </ReportShell>
  );
}
