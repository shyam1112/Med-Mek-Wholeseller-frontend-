import { useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Grid, Menu, MenuItem, Paper, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { useNavigate, useParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/PageHeader';
import { StatusChip } from '../../components/StatusChip';
import { useConfirm } from '../../components/Dialogs';
import { useFetch } from '../../lib/hooks';
import { api, errMsg } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { amt, fdate, fdatetime, fexp, inr, isoDate, round2 } from '../../lib/format';
import { downloadJson } from '../../lib/excel';
import { printVoucher } from '../../print/print';
import { openWhatsApp } from '../../lib/whatsapp';
import { STATES, type Voucher } from '../../lib/types';

export default function SalesInvoiceView() {
  const { id } = useParams();
  const nav = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const { business, can, user } = useAuth();
  const { data, loading, reload } = useFetch<{ data: Voucher }>(`/sales/${id}`);
  const audit = useFetch<{ data: { _id: string; createdAt: string; userName: string; action: string; summary: string }[] }>(can('audit:view') ? '/audit' : null, { entityId: id, limit: 50 });
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [tOpen, setTOpen] = useState(false);
  const [t, setT] = useState<Record<string, string>>({});
  const inv = data?.data;

  if (!inv) return loading ? null : <Alert severity="error">Bill not found.</Alert>;

  const active = inv.status === 'active';
  const locked = ['dispatched', 'delivered'].includes(inv.deliveryStatus);
  const cost = round2(inv.items.reduce((s, l) => s + (l.qty + (l.freeQty || 0)) * (l.costRate || 0), 0));
  const margin = round2(inv.taxableAmount - cost);
  const showMargin = ['owner', 'admin', 'accountant'].includes(user?.role || '');

  const cancel = async () => {
    const { ok, text } = await confirm({ title: `Cancel ${inv.number}?`, message: 'Stock goes back to the batches and the party ledger is reversed. The number stays used (shown as cancelled in GSTR-1).', prompt: 'Reason', promptRequired: true, danger: true, confirmText: 'Cancel bill' });
    if (!ok) return;
    try { await api.post(`/sales/${inv._id}/cancel`, { reason: text }); enqueueSnackbar('Bill cancelled.', { variant: 'success' }); reload(); }
    catch (e) { enqueueSnackbar(errMsg(e), { variant: 'error' }); }
  };

  const share = async () => {
    const party = (await api.get(`/parties/${inv.party}`)).data.data;
    openWhatsApp(party.mobile || party.phone, [
      `*${business?.name}*`, `Bill ${inv.number} dt. ${fdate(inv.date)}`, `Amount: ${inr(inv.grandTotal)}`,
      inv.balance ? `Balance due: ${inr(inv.balance)} by ${fdate(inv.dueDate)}` : 'Fully paid — thank you!', business?.upiId ? `UPI: ${business.upiId}` : '',
    ].filter(Boolean).join('\n'));
  };

  const gstJson = async (kind: 'einvoice' | 'eway') => {
    setMenu(null);
    try {
      const r = await api.get(`/gst/${kind}`, { params: { ids: inv._id } });
      if (r.data.errors?.length) enqueueSnackbar(r.data.errors.join(' '), { variant: 'warning', autoHideDuration: 8000 });
      downloadJson(`${kind === 'einvoice' ? 'EINV' : 'EWB'}_${inv.number.replace(/\//g, '-')}.json`, r.data.data);
    } catch (e) { enqueueSnackbar(errMsg(e), { variant: 'error' }); }
  };

  const openTransport = () => {
    const tr = inv.transport || {};
    setT({
      boxes: String(inv.boxes || ''), transporterName: tr.transporterName || '', transporterId: tr.transporterId || '', vehicleNo: tr.vehicleNo || '',
      lrNo: tr.lrNo || '', lrDate: isoDate(tr.lrDate), distanceKm: String(tr.distanceKm || ''), ewayBillNo: inv.ewayBillNo || '', ewayBillDate: isoDate(inv.ewayBillDate),
      irn: inv.irn || '', ackNo: inv.ackNo || '', ackDate: isoDate(inv.ackDate),
    });
    setTOpen(true); setMenu(null);
  };
  const saveTransport = async () => {
    try {
      await api.patch(`/sales/${inv._id}/transport`, {
        boxes: Number(t.boxes) || 0, ewayBillNo: t.ewayBillNo, ewayBillDate: t.ewayBillDate || undefined, irn: t.irn, ackNo: t.ackNo, ackDate: t.ackDate || undefined,
        transport: { transporterName: t.transporterName, transporterId: t.transporterId, vehicleNo: t.vehicleNo, lrNo: t.lrNo, lrDate: t.lrDate || undefined, distanceKm: Number(t.distanceKm) || 0 },
      });
      setTOpen(false); reload(); enqueueSnackbar('Saved.', { variant: 'success' });
    } catch (e) { enqueueSnackbar(errMsg(e), { variant: 'error' }); }
  };

  return (
    <>
      <PageHeader
        title={<>{inv.number} <StatusChip status={active ? inv.paymentStatus : 'cancelled'} /> {active && <StatusChip status={inv.deliveryStatus} />}</>}
        subtitle={`${fdate(inv.date)} · ${inv.partyName}${inv.salesmanName ? ` · ${inv.salesmanName}` : ''}`}
        crumbs={[{ label: 'Sales', to: '/sales' }, { label: inv.number }]}
        actions={
          <>
            <Button variant="outlined" startIcon={<PrintOutlinedIcon />} onClick={() => business && printVoucher(inv, business, 'sale')}>Print</Button>
            <Button variant="outlined" startIcon={<WhatsAppIcon />} onClick={share}>WhatsApp</Button>
            {active && can('sales:edit') && !locked && <Button variant="outlined" onClick={() => nav(`/sales/${inv._id}/edit`)}>Edit</Button>}
            {active && can('receipts:create') && (inv.balance || 0) > 0 && <Button variant="contained" onClick={() => nav(`/receipts/new?party=${inv.party}`)}>Receive payment</Button>}
            <Button variant="outlined" onClick={(e) => setMenu(e.currentTarget)}><MoreVertIcon fontSize="small" /></Button>
            <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
              {active && can('sales_returns:create') && <MenuItem onClick={() => nav(`/sales-returns/new?invoice=${inv._id}`)}>Sales return / credit note</MenuItem>}
              {active && <MenuItem onClick={openTransport}>Transport, e-way bill & IRN…</MenuItem>}
              {active && <MenuItem onClick={() => gstJson('einvoice')}>Download e-invoice JSON</MenuItem>}
              {active && <MenuItem onClick={() => gstJson('eway')}>Download e-way bill JSON</MenuItem>}
              <MenuItem onClick={() => { setMenu(null); nav(`/ledger-statement?ledger=${inv.party}`); }}>Party ledger</MenuItem>
              {active && can('sales:cancel') && <MenuItem onClick={() => { setMenu(null); cancel(); }} sx={{ color: 'error.main' }}>Cancel bill…</MenuItem>}
            </Menu>
          </>
        }
      />

      {!active && <Alert severity="error" sx={{ mb: 1.5 }}>Cancelled on {fdatetime(inv.cancelledAt)} — {inv.cancelReason}</Alert>}
      {inv.warningsOverridden?.length > 0 && <Alert severity="warning" sx={{ mb: 1.5 }}>Saved with supervisor override: {inv.warningsOverridden.join(', ')}</Alert>}

      <Grid container spacing={1.5}>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 1.5, height: '100%' }}>
            <Typography fontSize={11} color="text.secondary">BILL TO</Typography>
            <Typography fontWeight={700} sx={{ cursor: 'pointer' }} onClick={() => nav(`/parties/${inv.party}`)}>{inv.partyName}</Typography>
            <Typography fontSize={13}>{inv.partyAddress}</Typography>
            <Typography fontSize={13}>{inv.partyGstin ? `GSTIN ${inv.partyGstin}` : 'Unregistered'} · {STATES[inv.partyStateCode] || ''}</Typography>
            {inv.partyDl && <Typography fontSize={13}>DL {inv.partyDl}</Typography>}
            <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              <Chip label={inv.isInterState ? 'IGST' : 'CGST + SGST'} variant="outlined" />
              <Chip label={inv.paymentMode === 'cash' ? 'Cash bill' : `Credit · due ${fdate(inv.dueDate)}`} variant="outlined" />
            </Box>
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 1.5, height: '100%' }}>
            <Typography fontSize={11} color="text.secondary">PAYMENT</Typography>
            <KV k="Bill total" v={inr(inv.grandTotal)} bold />
            <KV k="Received" v={inr(inv.paidAmount)} />
            {(inv.creditNoteAdjustments || []).map((a: { docNo: string; amount: number }) => <KV key={a.docNo} k={`Credit note ${a.docNo}`} v={`− ${inr(a.amount)}`} />)}
            <KV k="Balance" v={inr(inv.balance)} bold />
            {showMargin && <KV k="Margin (on landing cost)" v={`${inr(margin)} · ${inv.taxableAmount ? round2((margin / inv.taxableAmount) * 100) : 0}%`} />}
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 1.5, height: '100%' }}>
            <Typography fontSize={11} color="text.secondary">DISPATCH & GST</Typography>
            <KV k="Cases" v={inv.boxes || '—'} />
            <KV k="Vehicle / LR" v={[inv.transport?.vehicleNo, inv.transport?.lrNo].filter(Boolean).join(' · ') || '—'} />
            <KV k="E-way bill" v={inv.ewayBillNo || (inv.grandTotal >= (business?.settings?.ewayBillThreshold || 50000) ? <Typography component="span" color="warning.dark" fontSize={13}>Required</Typography> : '—')} />
            <KV k="IRN" v={inv.irn ? `${inv.irn.slice(0, 16)}…` : business?.settings?.einvoiceEnabled ? <Typography component="span" color="warning.dark" fontSize={13}>Pending</Typography> : '—'} />
            {active && <Button size="small" onClick={openTransport} sx={{ mt: 0.5, px: 0 }}>Edit dispatch details</Button>}
          </Paper>
        </Grid>
      </Grid>

      <Paper sx={{ mt: 1.5, overflow: 'auto' }}>
        <Table sx={{ minWidth: 900 }}>
          <TableHead>
            <TableRow>
              <TableCell>#</TableCell><TableCell>Product</TableCell><TableCell>HSN</TableCell><TableCell>Batch</TableCell><TableCell>Exp</TableCell>
              <TableCell align="right">MRP</TableCell><TableCell align="right">Qty</TableCell><TableCell align="right">Free</TableCell><TableCell align="right">Rate</TableCell>
              <TableCell align="right">Disc</TableCell><TableCell align="right">Taxable</TableCell><TableCell align="right">GST</TableCell><TableCell align="right">Amount</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {inv.items.map((l, i) => (
              <TableRow key={l._id || i} hover onClick={() => nav(`/products/${l.product}`)} sx={{ cursor: 'pointer' }}>
                <TableCell>{i + 1}</TableCell>
                <TableCell><Typography component="div" fontSize={13} fontWeight={600}>{l.productName} {l.schedule !== 'None' && <Chip label={l.schedule} color="warning" sx={{ height: 16, fontSize: 10 }} />}</Typography><Typography fontSize={11} color="text.secondary">{l.manufacturerName} · {l.packing}</Typography></TableCell>
                <TableCell>{l.hsn}</TableCell><TableCell>{l.batchNo}</TableCell><TableCell>{fexp(l.expiry)}</TableCell>
                <TableCell align="right">{amt(l.mrp)}</TableCell><TableCell align="right">{l.qty}</TableCell><TableCell align="right">{l.freeQty || ''}</TableCell>
                <TableCell align="right">{amt(l.rate)}</TableCell><TableCell align="right">{l.discountPct ? `${l.discountPct}%` : ''}</TableCell>
                <TableCell align="right">{amt(l.taxableValue)}</TableCell><TableCell align="right">{l.gstRate}%</TableCell><TableCell align="right"><b>{amt(l.total)}</b></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 1.5 }}>
          <Box sx={{ width: 300 }}>
            <KV k="Gross" v={amt(inv.grossAmount)} />
            {inv.discountAmount > 0 && <KV k="Trade discount" v={`− ${amt(inv.discountAmount)}`} />}
            {inv.cdAmount > 0 && <KV k={`Cash discount ${inv.cdPct}%`} v={`− ${amt(inv.cdAmount)}`} />}
            <KV k="Taxable" v={amt(inv.taxableAmount)} />
            {inv.isInterState ? <KV k="IGST" v={amt(inv.igst)} /> : <><KV k="CGST" v={amt(inv.cgst)} /><KV k="SGST" v={amt(inv.sgst)} /></>}
            {inv.freight > 0 && <KV k="Freight" v={amt(inv.freight)} />}
            {inv.roundOff !== 0 && <KV k="Round off" v={amt(inv.roundOff)} />}
            <KV k="Total" v={inr(inv.grandTotal)} bold />
          </Box>
        </Box>
      </Paper>
      {inv.narration && <Typography fontSize={13} mt={1}><b>Narration:</b> {inv.narration}</Typography>}

      {audit.data?.data?.length ? (
        <Paper sx={{ mt: 1.5, p: 1.5 }}>
          <Typography fontSize={12} fontWeight={600} mb={0.5}>History</Typography>
          {audit.data.data.map((a) => <Typography key={a._id} fontSize={12} color="text.secondary">{fdatetime(a.createdAt)} · {a.userName} · {a.action} {a.summary && `— ${a.summary}`}</Typography>)}
        </Paper>
      ) : null}

      <Dialog open={tOpen} onClose={() => setTOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Dispatch, e-way bill & e-invoice</DialogTitle>
        <DialogContent>
          <Grid container spacing={1.25} sx={{ mt: 0 }}>
            {([
              ['boxes', 'Cases / boxes', 4], ['transporterName', 'Transporter', 8], ['transporterId', 'Transporter GSTIN / ID', 6], ['vehicleNo', 'Vehicle no', 6],
              ['lrNo', 'LR / docket no', 4], ['lrDate', 'LR date', 4, 'date'], ['distanceKm', 'Distance (km)', 4],
              ['ewayBillNo', 'E-way bill no', 6], ['ewayBillDate', 'E-way bill date', 6, 'date'],
              ['irn', 'IRN', 12], ['ackNo', 'Ack no', 6], ['ackDate', 'Ack date', 6, 'date'],
            ] as [string, string, number, string?][]).map(([k, label, w, type]) => (
              <Grid item xs={12} sm={w} key={k}>
                <TextField fullWidth label={label} type={type || 'text'} InputLabelProps={type ? { shrink: true } : undefined} value={t[k] || ''} onChange={(e) => setT({ ...t, [k]: k === 'vehicleNo' ? e.target.value.toUpperCase() : e.target.value })} />
              </Grid>
            ))}
          </Grid>
          <Typography fontSize={12} color="text.secondary" mt={1.5}>Generate the e-way bill / IRN on the government portal using the JSON downloads, then paste the numbers here so they print on the bill.</Typography>
        </DialogContent>
        <DialogActions><Button onClick={() => setTOpen(false)}>Close</Button><Button variant="contained" onClick={saveTransport}>Save</Button></DialogActions>
      </Dialog>
    </>
  );
}

const KV = ({ k, v, bold }: { k: string; v: React.ReactNode; bold?: boolean }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.2 }}>
    <Typography fontSize={13} color="text.secondary">{k}</Typography>
    <Typography fontSize={13} fontWeight={bold ? 700 : 500} textAlign="right">{v}</Typography>
  </Box>
);
