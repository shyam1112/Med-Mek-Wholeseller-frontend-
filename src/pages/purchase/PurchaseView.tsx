import { Alert, Box, Button, Chip, Grid, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import { useNavigate, useParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/PageHeader';
import { StatusChip } from '../../components/StatusChip';
import { useConfirm } from '../../components/Dialogs';
import { useFetch } from '../../lib/hooks';
import { api, errMsg } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { amt, fdate, fexp, inr, round2 } from '../../lib/format';
import { printVoucher } from '../../print/print';
import type { Voucher } from '../../lib/types';

export default function PurchaseView() {
  const { id } = useParams();
  const nav = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const { business, can } = useAuth();
  const { data, loading, reload } = useFetch<{ data: Voucher }>(`/purchases/${id}`);
  const pu = data?.data;
  if (!pu) return loading ? null : <Alert severity="error">Purchase not found.</Alert>;
  const active = pu.status === 'active';

  const cancel = async () => {
    const { ok, text } = await confirm({ title: `Cancel ${pu.number}?`, message: 'Stock received on this bill is removed. Not possible if any of it was already sold.', prompt: 'Reason', promptRequired: true, danger: true, confirmText: 'Cancel purchase' });
    if (!ok) return;
    try { await api.post(`/purchases/${pu._id}/cancel`, { reason: text }); enqueueSnackbar('Purchase cancelled.', { variant: 'success' }); reload(); }
    catch (e) { enqueueSnackbar(errMsg(e), { variant: 'error' }); }
  };

  return (
    <>
      <PageHeader
        title={<>{pu.number} <StatusChip status={active ? pu.paymentStatus : 'cancelled'} /></>}
        subtitle={`${pu.partyName} · bill ${pu.supplierInvoiceNo} dt. ${fdate(pu.supplierInvoiceDate)} · received ${fdate(pu.date)}`}
        crumbs={[{ label: 'Purchase', to: '/purchases' }, { label: pu.number }]}
        actions={<>
          <Button variant="outlined" startIcon={<PrintOutlinedIcon />} onClick={() => business && printVoucher(pu, business, 'purchase')}>Print</Button>
          {active && can('purchases:edit') && <Button variant="outlined" onClick={() => nav(`/purchases/${pu._id}/edit`)}>Edit</Button>}
          {active && can('purchase_returns:create') && <Button variant="outlined" onClick={() => nav(`/purchase-returns/new?purchase=${pu._id}&party=${pu.party}`)}>Return</Button>}
          {active && (pu.balance || 0) > 0 && can('payments:create') && <Button variant="contained" onClick={() => nav(`/payments/new?party=${pu.party}`)}>Pay</Button>}
          {active && can('purchases:cancel') && <Button color="error" onClick={cancel}>Cancel</Button>}
        </>}
      />
      {!active && <Alert severity="error" sx={{ mb: 1.5 }}>Cancelled — {pu.cancelReason}</Alert>}
      <Grid container spacing={1.5}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 1.5 }}>
            <Typography fontWeight={700} sx={{ cursor: 'pointer' }} onClick={() => nav(`/parties/${pu.party}`)}>{pu.partyName}</Typography>
            <Typography fontSize={13}>{pu.partyAddress}</Typography>
            <Typography fontSize={13}>{pu.partyGstin || 'Unregistered'} {pu.partyDl && `· DL ${pu.partyDl}`}</Typography>
            <Chip sx={{ mt: 1 }} label={pu.isInterState ? 'IGST (inter-state)' : 'CGST + SGST'} variant="outlined" />
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 1.5 }}>
            <KV k="Bill total" v={inr(pu.grandTotal)} />
            <KV k="Paid" v={inr(pu.paidAmount)} />
            {(pu.debitNoteAdjustments || []).map((a: { docNo: string; amount: number }) => <KV key={a.docNo} k={`Debit note ${a.docNo}`} v={`− ${inr(a.amount)}`} />)}
            <KV k="Payable" v={<b>{inr(pu.balance)}</b>} />
            <KV k="Due" v={fdate(pu.dueDate)} />
          </Paper>
        </Grid>
      </Grid>
      <Paper sx={{ mt: 1.5, overflow: 'auto' }}>
        <Table sx={{ minWidth: 1000 }}>
          <TableHead><TableRow>
            <TableCell>#</TableCell><TableCell>Product</TableCell><TableCell>Batch</TableCell><TableCell>Exp</TableCell><TableCell align="right">MRP</TableCell><TableCell align="right">PTR</TableCell>
            <TableCell align="right">Qty</TableCell><TableCell align="right">Free</TableCell><TableCell align="right">Rate</TableCell><TableCell align="right">Disc</TableCell>
            <TableCell align="right">Taxable</TableCell><TableCell align="right">GST</TableCell><TableCell align="right">Amount</TableCell><TableCell align="right">Landing</TableCell><TableCell align="right">Margin</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {pu.items.map((l, i) => (
              <TableRow key={l._id || i} hover onClick={() => nav(`/products/${l.product}`)} sx={{ cursor: 'pointer' }}>
                <TableCell>{i + 1}</TableCell>
                <TableCell><Typography fontSize={13} fontWeight={600}>{l.productName}</Typography><Typography fontSize={11} color="text.secondary">{l.manufacturerName} · {l.packing}</Typography></TableCell>
                <TableCell>{l.batchNo}</TableCell><TableCell>{fexp(l.expiry)}</TableCell><TableCell align="right">{amt(l.mrp)}</TableCell><TableCell align="right">{amt(l.ptr)}</TableCell>
                <TableCell align="right">{l.qty}</TableCell><TableCell align="right">{l.freeQty || ''}</TableCell><TableCell align="right">{amt(l.rate)}</TableCell>
                <TableCell align="right">{l.discountPct ? `${l.discountPct}%` : ''}</TableCell><TableCell align="right">{amt(l.taxableValue)}</TableCell>
                <TableCell align="right">{l.gstRate}%</TableCell><TableCell align="right"><b>{amt(l.total)}</b></TableCell><TableCell align="right">{amt(l.costRate)}</TableCell>
                <TableCell align="right">{l.ptr ? `${round2(((l.ptr - l.costRate) / l.ptr) * 100)}%` : ''}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 1.5 }}>
          <Box sx={{ width: 280 }}>
            <KV k="Taxable" v={amt(pu.taxableAmount)} />
            {pu.isInterState ? <KV k="IGST" v={amt(pu.igst)} /> : <><KV k="CGST" v={amt(pu.cgst)} /><KV k="SGST" v={amt(pu.sgst)} /></>}
            {pu.freight > 0 && <KV k="Freight" v={amt(pu.freight)} />}
            {pu.roundOff !== 0 && <KV k="Round off" v={amt(pu.roundOff)} />}
            <KV k="Total" v={<b>{inr(pu.grandTotal)}</b>} />
          </Box>
        </Box>
      </Paper>
      {pu.narration && <Typography fontSize={13} mt={1}><b>Narration:</b> {pu.narration}</Typography>}
    </>
  );
}

const KV = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.25 }}><Typography fontSize={13} color="text.secondary">{k}</Typography><Typography fontSize={13}>{v}</Typography></Box>
);
