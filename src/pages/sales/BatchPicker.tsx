import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Chip, Dialog, DialogContent, DialogTitle, LinearProgress, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { api, errMsg } from '../../api/client';
import { amt, fexp } from '../../lib/format';
import type { Batch, Product } from '../../lib/types';
import { fefoPick } from './BatchStrip';

// FEFO batch chooser shown after picking a product on the bill. Arrow keys +
// Enter, like Marg's batch window. Rates shown are already the party's rate.
export default function BatchPicker({ productId, partyId, onPick, onClose, inCart, autoSingle, title, leftOf }: {
  productId: string | null;
  // Units this bill may still take from a batch (defaults to stock − in cart).
  leftOf?: (b: Batch) => number;
  // Pick straight away (no window) when exactly one batch can be sold.
  autoSingle?: boolean;
  title?: string;
  partyId?: string;
  onPick: (batch: Batch, product: Product, all: Batch[]) => void;
  onClose: () => void;
  // Qty already on this bill per batch, so "available" reflects what's left.
  inCart: Record<string, number>;
}) {
  const [rows, setRows] = useState<Batch[]>([]);
  const [product, setProduct] = useState<Product | null>(null);
  const [sel, setSel] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [minDays, setMinDays] = useState(0);
  const leftFor = (b: Batch) => (leftOf ? leftOf(b) : b.qty - (inCart[b._id] || 0));
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!productId) return;
    setLoading(true); setError(''); setRows([]); setSel(0);
    api.get(`/products/${productId}/batches`, { params: { party: partyId } })
      .then((r) => {
        const list: Batch[] = r.data.data;
        const left = leftFor;
        const usableNow = list.filter((b) => !b.isExpired && !b.isBlocked && left(b) > 0);
        if (autoSingle && usableNow.length === 1 && !usableNow[0].isNearExpiry) { onPick(usableNow[0], r.data.product, list); return; }
        setRows(list);
        setProduct(r.data.product);
        setMinDays(r.data.minExpiryDays || 0);
        // Default to the FEFO batch; fall back to a short-expiry one only if
        // nothing else is left (saving will then ask for an override).
        const fefo = fefoPick(list, left);
        const first = fefo ? list.indexOf(fefo) : list.findIndex((b) => usableNow.includes(b));
        setSel(first >= 0 ? first : 0);
      })
      .catch((e) => setError(errMsg(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, partyId]);

  useEffect(() => { tableRef.current?.focus(); }, [rows]);

  const usable = (b: Batch) => !b.isExpired && !b.isBlocked && leftFor(b) > 0;
  const pick = (i: number) => { const b = rows[i]; if (b && usable(b) && product) onPick(b, product, rows); };

  return (
    <Dialog open={!!productId && !(autoSingle && loading)} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        {title ? `${title} — ` : ''}{product?.name || 'Select batch'}
        <Typography fontSize={12} color="text.secondary">{[product?.manufacturerName, product?.packing, product && `GST ${product.gstRate}%`, product?.schemeBuy ? `Scheme ${product.schemeBuy}+${product.schemeFree}` : '', minDays ? `min shelf life ${minDays} days` : ''].filter(Boolean).join(' · ')} — ↑↓ to move, Enter to pick, Esc to close</Typography>
      </DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        {loading && <LinearProgress />}
        {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}
        {!loading && !rows.length && !error && <Alert severity="warning" sx={{ m: 2 }}>No stock for this product. Raise a purchase or check the Batches screen.</Alert>}
        <Box
          ref={tableRef}
          tabIndex={0}
          sx={{ outline: 'none', maxHeight: 420, overflow: 'auto' }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, rows.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            if (e.key === 'Enter') { e.preventDefault(); pick(sel); }
          }}
        >
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Batch</TableCell><TableCell>Exp</TableCell><TableCell align="right">MRP</TableCell><TableCell align="right">PTR</TableCell>
                <TableCell align="right">Party rate</TableCell><TableCell align="right">Disc</TableCell><TableCell align="right">Stock</TableCell><TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((b, i) => {
                const left = Math.max(0, leftFor(b));
                return (
                  <TableRow key={b._id} hover selected={i === sel} onClick={() => pick(i)} onMouseEnter={() => setSel(i)}
                    sx={{ cursor: usable(b) ? 'pointer' : 'not-allowed', opacity: usable(b) ? 1 : 0.45, '&.Mui-selected': { bgcolor: 'rgba(15,92,140,0.12)' } }}>
                    <TableCell><b>{b.batchNo}</b></TableCell>
                    <TableCell sx={{ color: b.isExpired ? 'error.main' : b.isNearExpiry ? 'warning.dark' : undefined, fontWeight: 600 }}>{fexp(b.expiry)}</TableCell>
                    <TableCell align="right">{amt(b.mrp)}</TableCell>
                    <TableCell align="right">{amt(b.ptr)}</TableCell>
                    <TableCell align="right"><b>{amt(b.quote?.rate)}</b>{b.quote?.source === 'special' && <Chip label="special" color="secondary" sx={{ ml: 0.5, height: 16, fontSize: 10 }} />}</TableCell>
                    <TableCell align="right">{b.quote?.discountPct ? `${b.quote.discountPct}%` : ''}</TableCell>
                    <TableCell align="right"><b>{left}</b>{inCart[b._id] ? <Typography component="span" fontSize={10} color="text.secondary"> ({inCart[b._id]} on bill)</Typography> : null}{b.reservedQty ? <Typography component="span" fontSize={10} color="warning.dark" display="block">{b.reservedQty} reserved for orders</Typography> : null}</TableCell>
                    <TableCell>
                      {b.isExpired && <Chip label="Expired" color="error" />}
                      {b.isNearExpiry && <Chip label="Near expiry" color="warning" />}
                      {b.isBlocked && <Chip label="Blocked" />}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
