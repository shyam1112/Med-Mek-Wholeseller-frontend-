import { Box, Chip, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import dayjs from 'dayjs';
import { amt, fexp, num } from '../../lib/format';
import type { Batch } from '../../lib/types';

// A batch can go on a bill by default only if it isn't expired, blocked or
// under the party's minimum shelf life, and has stock left.
export const sellable = (b: Batch, left: number) => !b.isExpired && !b.isBlocked && !b.isNearExpiry && left > 0;

// FEFO default: earliest-expiring sellable batch (rows arrive expiry-sorted).
export const fefoPick = (rows: Batch[], leftOf: (b: Batch) => number) => rows.find((b) => sellable(b, leftOf(b))) || null;

const daysLeft = (d: string) => dayjs(d).startOf('day').diff(dayjs().startOf('day'), 'day');

// Batch-wise stock of one product, shown under the bill's entry row (click a
// row to switch batch) and read-only on purchase orders.
export default function BatchStrip({ batches, selectedId, leftOf, onSelect, showRate = true, showPurchase = false, minExpiryDays, maxHeight = 190 }: {
  batches: Batch[];
  selectedId?: string;
  leftOf: (b: Batch) => number;
  onSelect?: (b: Batch) => void;
  showRate?: boolean;
  // Purchase side: what each batch was bought at.
  showPurchase?: boolean;
  minExpiryDays?: number;
  maxHeight?: number;
}) {
  if (!batches.length) return <Typography fontSize={12} color="text.secondary" sx={{ py: 1 }}>No batches in stock.</Typography>;

  const fefo = fefoPick(batches, leftOf);
  const selected = batches.find((b) => b._id === selectedId) || fefo;
  const sum = (f: (b: Batch) => boolean) => batches.filter(f).reduce((s, b) => s + Math.max(0, leftOf(b)), 0);
  const good = sum((b) => !b.isExpired && !b.isBlocked && !b.isNearExpiry);
  const short = sum((b) => !b.isExpired && !b.isBlocked && !!b.isNearExpiry);
  const dead = sum((b) => !!b.isExpired || b.isBlocked);
  const mrps = new Set(batches.filter((b) => !b.isExpired && leftOf(b) > 0).map((b) => b.mrp));

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', mb: 0.5 }}>
        <Typography fontSize={12}><b>{num(good)}</b> sellable</Typography>
        {short > 0 && <Typography fontSize={12} color="warning.dark"><b>{num(short)}</b> short expiry{minExpiryDays ? ` (< ${minExpiryDays} days)` : ''}</Typography>}
        {dead > 0 && <Typography fontSize={12} color="error.main"><b>{num(dead)}</b> expired / blocked</Typography>}
        {mrps.size > 1 && <Chip size="small" color="warning" variant="outlined" label="MRP differs between batches" sx={{ height: 20, fontSize: 11 }} />}
        {onSelect && <Typography fontSize={11} color="text.secondary" sx={{ ml: 'auto' }}>Click a batch to switch · F6 batch window</Typography>}
      </Box>
      <Box sx={{ maxHeight, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
        <Table size="small" stickyHeader sx={{ '& td, & th': { py: 0.4, fontSize: 12 } }}>
          <TableHead>
            <TableRow>
              <TableCell>Batch</TableCell><TableCell>Expiry</TableCell><TableCell align="right">MRP</TableCell><TableCell align="right">PTR</TableCell>
              {showRate && <TableCell align="right">Party rate</TableCell>}
              {showPurchase && <TableCell align="right">Bought at</TableCell>}
              {showPurchase && <TableCell align="right">Landing</TableCell>}
              {showPurchase && <TableCell>Received</TableCell>}
              <TableCell align="right">Stock</TableCell><TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {batches.map((b) => {
              const left = leftOf(b);
              const usable = !b.isExpired && !b.isBlocked && left > 0;
              const isSel = selected?._id === b._id;
              const d = daysLeft(b.expiry);
              return (
                <TableRow key={b._id} hover={!!onSelect && usable} selected={isSel} onClick={() => onSelect && usable && onSelect(b)}
                  sx={{ cursor: onSelect ? (usable ? 'pointer' : 'not-allowed') : 'default', opacity: usable ? 1 : 0.5, '&.Mui-selected': { bgcolor: 'rgba(15,92,140,0.12)' } }}>
                  <TableCell sx={{ fontWeight: isSel ? 700 : 500 }}>{b.batchNo}</TableCell>
                  <TableCell sx={{ color: b.isExpired ? 'error.main' : b.isNearExpiry ? 'warning.dark' : undefined, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {fexp(b.expiry)} <Typography component="span" fontSize={10} color="text.secondary" fontWeight={400}>{d < 0 ? 'expired' : d < 365 ? `${Math.round(d / 30.4)} mo` : `${(d / 365).toFixed(1)} yr`}</Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ color: selected && b.mrp !== selected.mrp && usable ? 'warning.dark' : undefined }}>{amt(b.mrp)}</TableCell>
                  <TableCell align="right">{amt(b.ptr)}</TableCell>
                  {showRate && <TableCell align="right">{b.quote ? amt(b.quote.rate) : '—'}{b.quote?.discountPct ? <Typography component="span" fontSize={10} color="text.secondary"> −{b.quote.discountPct}%</Typography> : null}</TableCell>}
                  {showPurchase && <TableCell align="right">{b.purchaseRate ? amt(b.purchaseRate) : '—'}</TableCell>}
                  {showPurchase && <TableCell align="right">{b.landingCost ? amt(b.landingCost) : '—'}</TableCell>}
                  {showPurchase && <TableCell sx={{ whiteSpace: 'nowrap' }}>{b.createdAt ? dayjs(b.createdAt).format('DD-MM-YY') : '—'}</TableCell>}
                  <TableCell align="right"><b>{num(Math.max(0, left))}</b>{left !== b.qty && left >= 0 ? <Typography component="span" fontSize={10} color="text.secondary"> /{num(b.qty)}</Typography> : null}{b.reservedQty ? <Typography component="span" fontSize={10} color="warning.dark" display="block">{num(b.reservedQty)} reserved</Typography> : null}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {fefo?._id === b._id && <Chip label="FEFO" color="primary" sx={{ height: 16, fontSize: 10, mr: 0.5 }} />}
                    {b.isExpired && <Chip label="Expired" color="error" sx={{ height: 16, fontSize: 10 }} />}
                    {!b.isExpired && b.isNearExpiry && <Chip label="Short expiry" color="warning" sx={{ height: 16, fontSize: 10 }} />}
                    {b.isBlocked && <Chip label="Blocked" sx={{ height: 16, fontSize: 10 }} />}
                    {!b.isExpired && !b.isBlocked && left <= 0 && <Chip label={b.reservedQty && b.reservedQty >= b.qty ? 'Reserved' : 'On bill'} color={b.reservedQty && b.reservedQty >= b.qty ? 'warning' : 'default'} sx={{ height: 16, fontSize: 10 }} />}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
}
