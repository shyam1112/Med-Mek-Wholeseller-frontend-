import { Box, Chip, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { amt, fdate, fexp, num } from '../../lib/format';
import type { Batch } from '../../lib/types';

// What this customer bought of a product, per batch (GET /parties/:id/sold-batches).
export interface SoldBatch {
  batch: string; batchNo: string; expiry: string; mrp: number; sold: number; returned: number; returnable: number;
  billCount: number; lastRate: number; lastDiscountPct: number; lastBill: string; lastBillId: string; lastDate: string;
}

// Default batch for a sales return: when only one sold batch is still
// returnable take it; for expiry/breakage take the oldest expiry (that is
// what comes back); otherwise the most recently billed one.
export const defaultReturnBatch = (batches: Batch[], sold: Record<string, SoldBatch>, damagedReason: boolean): Batch | null => {
  const open = batches.filter((b) => (sold[b._id]?.returnable || 0) > 0);
  if (!open.length) return batches.length === 1 ? batches[0] : null;
  if (open.length === 1 || damagedReason) return open[0]; // batches arrive expiry-sorted
  return [...open].sort((a, b) => sold[b._id].lastDate.localeCompare(sold[a._id].lastDate))[0];
};

// Typed / scanned batch number → the batch (exact match, else a unique prefix).
export const matchBatchNo = (batches: Batch[], text: string): Batch | null => {
  const t = text.trim().toUpperCase();
  if (!t) return null;
  const exact = batches.filter((b) => b.batchNo.toUpperCase() === t);
  if (exact.length === 1) return exact[0];
  const pre = batches.filter((b) => b.batchNo.toUpperCase().startsWith(t));
  return pre.length === 1 ? pre[0] : null;
};

// Batch-wise view for a sales return: batches sold to this customer first
// (sold / returned / returnable and the billed rate), then the other batches
// of the product, dimmed, for goods we can't trace to a bill.
export default function ReturnBatchStrip({ batches, sold, selectedId, filter, onSelect }: {
  batches: Batch[];
  sold: Record<string, SoldBatch>;
  selectedId?: string;
  filter?: string;
  onSelect: (b: Batch) => void;
}) {
  const f = (filter || '').trim().toUpperCase();
  const shown = f ? batches.filter((b) => b.batchNo.toUpperCase().includes(f)) : batches;
  const mine = shown.filter((b) => sold[b._id]);
  const others = shown.filter((b) => !sold[b._id]);
  const totalReturnable = Object.values(sold).reduce((s, x) => s + x.returnable, 0);

  if (!batches.length) return <Typography fontSize={12} color="text.secondary" sx={{ py: 1 }}>This product has no batches.</Typography>;

  const row = (b: Batch, s?: SoldBatch) => {
    const isSel = b._id === selectedId;
    return (
      <TableRow key={b._id} hover selected={isSel} onClick={() => onSelect(b)}
        sx={{ cursor: 'pointer', opacity: s ? (s.returnable > 0 ? 1 : 0.6) : 0.55, '&.Mui-selected': { bgcolor: 'rgba(15,92,140,0.12)' } }}>
        <TableCell sx={{ fontWeight: isSel ? 700 : 500 }}>{b.batchNo}</TableCell>
        <TableCell sx={{ color: b.isExpired ? 'error.main' : undefined, fontWeight: 600, whiteSpace: 'nowrap' }}>{fexp(b.expiry)}{b.isExpired ? ' · expired' : ''}</TableCell>
        <TableCell align="right">{amt(b.mrp)}</TableCell>
        <TableCell align="right">{s ? num(s.sold) : '—'}</TableCell>
        <TableCell align="right">{s?.returned ? num(s.returned) : s ? '0' : '—'}</TableCell>
        <TableCell align="right"><b>{s ? num(s.returnable) : '—'}</b></TableCell>
        <TableCell align="right">{s ? <>{amt(s.lastRate)}{s.lastDiscountPct ? <Typography component="span" fontSize={10} color="text.secondary"> −{s.lastDiscountPct}%</Typography> : null}</> : <Typography component="span" fontSize={11} color="text.secondary">PTR {amt(b.ptr)}</Typography>}</TableCell>
        <TableCell sx={{ whiteSpace: 'nowrap' }}>
          {s ? <Typography fontSize={11} color="text.secondary">{s.lastBill} · {fdate(s.lastDate)}{s.billCount > 1 ? ` (+${s.billCount - 1})` : ''}</Typography>
            : <Chip label="Not sold to this party" color="warning" variant="outlined" sx={{ height: 16, fontSize: 10 }} />}
        </TableCell>
      </TableRow>
    );
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', mb: 0.5 }}>
        <Typography fontSize={12}>
          {Object.keys(sold).length
            ? <>Sold to this party in <b>{Object.keys(sold).length}</b> batch(es) · <b>{num(totalReturnable)}</b> returnable</>
            : <Typography component="span" fontSize={12} color="warning.dark">Never sold to this party — check the goods before accepting.</Typography>}
        </Typography>
        <Typography fontSize={11} color="text.secondary" sx={{ ml: 'auto' }}>Type the batch no. printed on the strip, or click a row</Typography>
      </Box>
      <Box sx={{ maxHeight: 220, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
        <Table size="small" stickyHeader sx={{ '& td, & th': { py: 0.4, fontSize: 12 } }}>
          <TableHead>
            <TableRow>
              <TableCell>Batch</TableCell><TableCell>Expiry</TableCell><TableCell align="right">MRP</TableCell>
              <TableCell align="right">Sold</TableCell><TableCell align="right">Returned</TableCell><TableCell align="right">Returnable</TableCell>
              <TableCell align="right">Billed rate</TableCell><TableCell>Last bill</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {mine.map((b) => row(b, sold[b._id]))}
            {others.length > 0 && mine.length > 0 && (
              <TableRow><TableCell colSpan={8} sx={{ bgcolor: 'action.hover' }}><Typography fontSize={11} color="text.secondary">Other batches of this product</Typography></TableCell></TableRow>
            )}
            {others.map((b) => row(b))}
            {!shown.length && <TableRow><TableCell colSpan={8}><Typography fontSize={12} color="text.secondary">No batch matches “{filter}”.</Typography></TableCell></TableRow>}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
}
