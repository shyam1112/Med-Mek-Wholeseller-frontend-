import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, MenuItem, Paper, TextField, Typography } from '@mui/material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ReportShell } from '../../components/ReportShell';
import { DataTable, Col } from '../../components/DataTable';
import { DateRange } from '../../components/Filters';
import { ProductOption, ProductPicker } from '../../components/Pickers';
import { useFetch } from '../../lib/hooks';
import { amt, fdate, fexp, monthStart, num, today } from '../../lib/format';
import { exportExcel } from '../../lib/excel';
import type { Batch, Product } from '../../lib/types';
import { ErrorBox, PrintSupport, periodLabel, safeName, vLabel, voucherPath } from './reportKit';

interface Move {
  _id: string; date: string; type: string; bucket: 'saleable' | 'damaged'; qtyIn: number; qtyOut: number; rate: number;
  voucherType: string; voucherId?: string; voucherNo: string; partyName: string; note: string;
  batch?: { _id: string; batchNo: string; expiry: string } | null; balance: number; damagedBalance: number;
}
interface Resp { product: Product; opening: number; openingDamaged: number; data: Move[]; closing: number; closingDamaged: number }

export default function StockLedger() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const productId = sp.get('product') || '';
  const [product, setProduct] = useState<ProductOption | null>(null);
  const [batch, setBatch] = useState(sp.get('batch') || '');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());

  const { data, loading, error, reload } = useFetch<Resp>(productId ? '/reports/stock-ledger' : null, { product: productId, batch, from, to });
  const batches = useFetch<{ data: Batch[] }>(productId ? `/products/${productId}/batches` : null, { all: 'true' });

  // Opened via ?product= — fill the picker from the response.
  useEffect(() => {
    if (data?.product && (!product || product._id !== data.product._id)) setProduct({ ...(data.product as unknown as ProductOption), stock: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.product?._id]);

  const pick = (p: ProductOption | null) => {
    setProduct(p);
    setBatch('');
    setSp(p ? { product: p._id } : {}, { replace: true });
  };

  const rows = data?.data || [];
  const tIn = useMemo(() => rows.filter((r) => r.bucket !== 'damaged').reduce((s, r) => s + r.qtyIn, 0), [rows]);
  const tOut = useMemo(() => rows.filter((r) => r.bucket !== 'damaged').reduce((s, r) => s + r.qtyOut, 0), [rows]);
  const hasDamaged = !!(data && (data.openingDamaged || data.closingDamaged || rows.some((r) => r.bucket === 'damaged')));
  const batchLabel = batches.data?.data.find((b) => b._id === batch)?.batchNo;

  const columns: Col<Move>[] = [
    { key: 'date', label: 'Date', nowrap: true, render: (r) => fdate(r.date), footer: 'Closing' },
    { key: 'type', label: 'Type', render: (r) => <>{vLabel(r.type)}{r.bucket === 'damaged' && <Typography component="span" fontSize={11} color="error.main"> · damaged</Typography>}</> },
    { key: 'voucherNo', label: 'Voucher', nowrap: true, render: (r) => <Typography component="span" fontSize={13} fontWeight={600}>{r.voucherNo}</Typography> },
    { key: 'partyName', label: 'Party / Note', render: (r) => <>{r.partyName}{r.note && <Typography fontSize={11} color="text.secondary">{r.note}</Typography>}</> },
    { key: 'batch', label: 'Batch', nowrap: true, render: (r) => r.batch ? <>{r.batch.batchNo} <Typography component="span" fontSize={11} color="text.secondary">{fexp(r.batch.expiry)}</Typography></> : '' },
    { key: 'rate', label: 'Rate', align: 'right', render: (r) => (r.rate ? amt(r.rate) : '') },
    { key: 'qtyIn', label: 'In', align: 'right', render: (r) => (r.qtyIn ? <Typography component="span" fontSize={13} color="success.main">{num(r.qtyIn)}</Typography> : ''), footer: num(tIn) },
    { key: 'qtyOut', label: 'Out', align: 'right', render: (r) => (r.qtyOut ? <Typography component="span" fontSize={13} color="error.main">{num(r.qtyOut)}</Typography> : ''), footer: num(tOut) },
    { key: 'balance', label: 'Balance', align: 'right', render: (r) => <b>{num(r.balance)}</b>, footer: num(data?.closing) },
    ...(hasDamaged ? [{ key: 'damagedBalance', label: 'Damaged', align: 'right' as const, render: (r: Move) => num(r.damagedBalance), footer: num(data?.closingDamaged) }] : []),
  ];

  const title = data?.product ? `${data.product.name} ${data.product.packing || ''}`.trim() : 'Stock Ledger';
  const subtitle = data ? `${data.product.manufacturerName} · ${periodLabel(from, to)}${batchLabel ? ` · Batch ${batchLabel}` : ''}` : 'Every stock movement of a product with running balance';

  const doExport = () => data && exportExcel(`stock-ledger-${safeName(data.product.name)}-${from}-to-${to}`, [{
    name: 'Stock Ledger',
    rows: [
      { date: from, type: 'Opening', voucherNo: '', partyName: '', batchNo: '', expiry: '', rate: '', qtyIn: '', qtyOut: '', balance: data.opening, damagedBalance: data.openingDamaged },
      ...rows.map((r) => ({ date: r.date, type: vLabel(r.type) + (r.bucket === 'damaged' ? ' (damaged)' : ''), voucherNo: r.voucherNo, partyName: r.partyName || r.note, batchNo: r.batch?.batchNo || '', expiry: fexp(r.batch?.expiry), rate: r.rate, qtyIn: r.qtyIn, qtyOut: r.qtyOut, balance: r.balance, damagedBalance: r.damagedBalance })),
      { date: to, type: 'Closing', voucherNo: '', partyName: '', batchNo: '', expiry: '', rate: '', qtyIn: tIn, qtyOut: tOut, balance: data.closing, damagedBalance: data.closingDamaged },
    ],
    columns: [
      { key: 'date', label: 'Date', value: (r) => fdate(r.date as string) }, { key: 'type', label: 'Type' }, { key: 'voucherNo', label: 'Voucher' },
      { key: 'partyName', label: 'Party / Note' }, { key: 'batchNo', label: 'Batch' }, { key: 'expiry', label: 'Expiry' }, { key: 'rate', label: 'Rate' },
      { key: 'qtyIn', label: 'In' }, { key: 'qtyOut', label: 'Out' }, { key: 'balance', label: 'Balance' }, { key: 'damagedBalance', label: 'Damaged Balance' },
    ],
  }]);

  return (
    <ReportShell
      title={title}
      subtitle={subtitle}
      onExport={data && rows.length ? doExport : undefined}
      filters={
        <>
          <ProductPicker value={product} onChange={pick} sx={{ width: 320 }} autoFocus={!productId} />
          <TextField select label="Batch" value={batch} onChange={(e) => setBatch(e.target.value)} sx={{ width: 200 }} disabled={!productId}>
            <MenuItem value="">All batches</MenuItem>
            {(batches.data?.data || []).map((b) => (
              <MenuItem key={b._id} value={b._id}>{b.batchNo} · {fexp(b.expiry)} · {num(b.qty)}{b.damagedQty ? ` (+${b.damagedQty} dmg)` : ''}</MenuItem>
            ))}
          </TextField>
          <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        </>
      }
    >
      <PrintSupport title={`Stock Ledger — ${title}`} subtitle={subtitle} landscape />
      <ErrorBox error={error} onRetry={reload} />
      {!productId ? (
        <Alert severity="info">Pick a product to see its stock ledger — every purchase, sale, return and adjustment, batch-wise, with running balance.</Alert>
      ) : (
        <>
          {data && (
            <Paper sx={{ px: 2, py: 1, mb: 1, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <Box><Typography variant="caption" color="text.secondary">Opening ({fdate(from)})</Typography><Typography fontWeight={700}>{num(data.opening)}{data.openingDamaged ? <Typography component="span" fontSize={12} color="error.main"> + {num(data.openingDamaged)} damaged</Typography> : null}</Typography></Box>
              <Box><Typography variant="caption" color="text.secondary">Inward</Typography><Typography fontWeight={700} color="success.main">{num(tIn)}</Typography></Box>
              <Box><Typography variant="caption" color="text.secondary">Outward</Typography><Typography fontWeight={700} color="error.main">{num(tOut)}</Typography></Box>
              <Box><Typography variant="caption" color="text.secondary">Closing ({fdate(to)})</Typography><Typography fontWeight={700}>{num(data.closing)}{data.closingDamaged ? <Typography component="span" fontSize={12} color="error.main"> + {num(data.closingDamaged)} damaged</Typography> : null}</Typography></Box>
            </Paper>
          )}
          <DataTable
            columns={columns}
            rows={rows}
            loading={loading}
            onRowClick={(r) => { const p = voucherPath(r.voucherType, r.voucherId); if (p) nav(p); }}
            rowSx={(r) => (r.type.endsWith('_cancel') ? { opacity: 0.6 } : undefined)}
            empty="No movement in this period."
            maxHeight="calc(100vh - 300px)"
          />
        </>
      )}
    </ReportShell>
  );
}
