// Shared by the credit-note (sales return) and debit-note (purchase return)
// registers and entry screens.
import { useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Grid, LinearProgress, MenuItem, Paper,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/PageHeader';
import { DataTable, Col } from '../../components/DataTable';
import { FilterBar, SearchBox, DateRange } from '../../components/Filters';
import { PartyPicker, PartyOption } from '../../components/Pickers';
import { StatusChip } from '../../components/StatusChip';
import { useConfirm } from '../../components/Dialogs';
import { useFetch, useDebounced, useHotkey } from '../../lib/hooks';
import { amt, fdate, fexp, monthStart, today } from '../../lib/format';
import { exportExcel } from '../../lib/excel';
import { openWhatsApp } from '../../lib/whatsapp';
import { printVoucher } from '../../print/print';
import { api, errMsg } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import type { Business, Voucher } from '../../lib/types';

export type ReturnKind = 'sales' | 'purchase';

export const SALES_REASONS = [
  { value: 'saleable', label: 'Saleable (good stock back)' },
  { value: 'expiry', label: 'Expiry' },
  { value: 'breakage', label: 'Breakage / damage' },
  { value: 'rate_difference', label: 'Rate difference' },
  { value: 'other', label: 'Other' },
];
export const PURCHASE_REASONS = [
  { value: 'expiry', label: 'Expiry claim' },
  { value: 'breakage', label: 'Breakage / damage' },
  { value: 'saleable', label: 'Saleable (excess / wrong supply)' },
  { value: 'rate_difference', label: 'Rate difference' },
  { value: 'other', label: 'Other' },
];
export const reasonLabel = (r?: string) => [...SALES_REASONS, ...PURCHASE_REASONS].find((x) => x.value === r)?.label.split(' (')[0] || r || '';

const reasonColor = (r?: string): 'default' | 'warning' | 'error' | 'success' | 'info' =>
  r === 'expiry' ? 'warning' : r === 'breakage' ? 'error' : r === 'saleable' ? 'success' : r === 'rate_difference' ? 'info' : 'default';

export const ReasonChip: React.FC<{ reason?: string }> = ({ reason }) => (
  <Chip label={reasonLabel(reason)} color={reasonColor(reason)} variant="outlined" sx={{ height: 20, fontSize: 11, fontWeight: 600 }} />
);

const META = {
  sales: { url: '/sales-returns', perm: 'sales_returns', title: 'Credit Notes (Sales Returns)', doc: 'Credit Note', printKind: 'sales_return' as const, partyType: 'customer' as const, newUrl: '/sales-returns/new', againstKey: 'againstInvoiceNo', reasons: SALES_REASONS },
  purchase: { url: '/purchase-returns', perm: 'purchase_returns', title: 'Debit Notes (Purchase Returns)', doc: 'Debit Note', printKind: 'purchase_return' as const, partyType: 'supplier' as const, newUrl: '/purchase-returns/new', againstKey: 'againstPurchaseNo', reasons: PURCHASE_REASONS },
};

export const returnWhatsAppText = (v: Voucher, business: Business | null, kind: ReturnKind) => {
  const m = META[kind];
  const against = v[m.againstKey];
  return [
    `*${m.doc} ${v.number}* dt. ${fdate(v.date)}`,
    `${kind === 'sales' ? 'Party' : 'To'}: ${v.partyName}`,
    against ? `Against bill: ${against}` : '',
    `Reason: ${reasonLabel(v.reason)}`,
    '',
    ...v.items.map((l, i) => `${i + 1}. ${l.productName} B:${l.batchNo} Exp ${fexp(l.expiry)} — ${l.qty}${l.freeQty ? `+${l.freeQty}` : ''} = ₹${amt(l.total)}`),
    '',
    `${kind === 'sales' ? 'Credit' : 'Debit'} amount: *₹${amt(v.grandTotal)}*`,
    ...(v.adjustments?.length ? [`Adjusted: ${v.adjustments.map((a: { docNo: string; amount: number }) => `${a.docNo} ₹${amt(a.amount)}`).join(', ')}`] : []),
    business ? `— ${business.name}` : '',
  ].filter(Boolean).join('\n');
};

// ---------- Register ----------
export function ReturnRegister({ kind }: { kind: ReturnKind }) {
  const m = META[kind];
  const nav = useNavigate();
  const { can } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [search, setSearch] = useState('');
  const [party, setParty] = useState<PartyOption | null>(null);
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
  const [viewId, setViewId] = useState<string | null>(null);
  const q = useDebounced(search);
  const params = { from, to, search: q, party: party?._id, reason, status, page: page + 1, limit };
  const { data, loading, reload } = useFetch<{ data: Voucher[]; pagination: { total: number }; totals: { total: number; balance: number; count: number } }>(m.url, params);
  const rows = data?.data || [];

  useHotkey('alt+n', () => can(`${m.perm}:create`) && nav(m.newUrl));

  const columns: Col<Voucher>[] = [
    { key: 'number', label: 'Note No', nowrap: true, render: (r) => <Typography fontWeight={600} fontSize={13}>{r.number}</Typography> },
    { key: 'date', label: 'Date', nowrap: true, render: (r) => fdate(r.date) },
    { key: 'partyName', label: 'Party' },
    { key: 'against', label: 'Against Bill', nowrap: true, render: (r) => r[m.againstKey] || <Typography component="span" fontSize={12} color="text.secondary">—</Typography> },
    { key: 'reason', label: 'Reason', render: (r) => <ReasonChip reason={r.reason} /> },
    { key: 'items', label: 'Items', align: 'right', render: (r) => r.items?.length },
    { key: 'taxableAmount', label: 'Taxable', align: 'right', render: (r) => amt(r.taxableAmount) },
    { key: 'tax', label: 'GST', align: 'right', render: (r) => amt(r.cgst + r.sgst + r.igst) },
    { key: 'grandTotal', label: 'Amount', align: 'right', render: (r) => <b>{amt(r.grandTotal)}</b>, footer: amt(data?.totals?.total) },
    { key: 'balance', label: 'Unadjusted', align: 'right', render: (r) => (r.status === 'cancelled' ? '—' : amt(r.balance)), footer: amt(data?.totals?.balance) },
    { key: 'status', label: 'Status', render: (r) => <StatusChip status={r.status} /> },
  ];

  const exportAll = async () => {
    try {
      const r = await api.get(m.url, { params: { ...params, page: 1, limit: 500 } });
      const list = r.data.data as Voucher[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      exportExcel<any>(`${kind}-returns-${from}-to-${to}`, [
        {
          name: `${m.doc}s`, rows: list, columns: [
            { key: 'number', label: 'Note No' }, { key: 'date', label: 'Date', value: (v) => fdate(v.date) },
            { key: 'partyName', label: 'Party' }, { key: 'partyGstin', label: 'GSTIN' }, { key: 'against', label: 'Against Bill', value: (v) => v[m.againstKey] || '' },
            { key: 'reason', label: 'Reason', value: (v) => reasonLabel(v.reason) },
            { key: 'taxableAmount', label: 'Taxable' }, { key: 'cgst', label: 'CGST' }, { key: 'sgst', label: 'SGST' }, { key: 'igst', label: 'IGST' },
            { key: 'roundOff', label: 'Round Off' }, { key: 'grandTotal', label: 'Amount' }, { key: 'balance', label: 'Unadjusted' }, { key: 'status', label: 'Status' },
          ],
        },
        {
          name: 'Items', rows: list.filter((v) => v.status === 'active').flatMap((v) => v.items.map((l) => ({ ...l, number: v.number, date: v.date, partyName: v.partyName }))),
          columns: [
            { key: 'number', label: 'Note No' }, { key: 'date', label: 'Date', value: (l) => fdate(l.date) }, { key: 'partyName', label: 'Party' },
            { key: 'productName', label: 'Product' }, { key: 'manufacturerName', label: 'Company' }, { key: 'batchNo', label: 'Batch' },
            { key: 'expiry', label: 'Exp', value: (l) => fexp(l.expiry) }, { key: 'qty', label: 'Qty' }, { key: 'freeQty', label: 'Free' },
            { key: 'rate', label: 'Rate' }, { key: 'claimPct', label: 'Claim %' }, { key: 'taxableValue', label: 'Taxable' }, { key: 'gstRate', label: 'GST %' },
            { key: 'total', label: 'Amount' }, { key: 'type', label: kind === 'sales' ? 'Return type' : 'Stock from', value: (l) => (kind === 'sales' ? l.returnType : l.stockBucket) },
          ],
        },
      ]);
    } catch (e) { enqueueSnackbar(errMsg(e), { variant: 'error' }); }
  };

  return (
    <>
      <PageHeader
        title={m.title}
        subtitle={data ? `${data.totals?.count || 0} notes · ₹${amt(data.totals?.total)} · unadjusted ₹${amt(data.totals?.balance)}` : undefined}
        actions={
          <>
            <Button variant="outlined" startIcon={<FileDownloadOutlinedIcon />} onClick={exportAll}>Excel</Button>
            {can(`${m.perm}:create`) && <Button variant="contained" startIcon={<AddIcon />} onClick={() => nav(m.newUrl)}>New {m.doc} (Alt+N)</Button>}
          </>
        }
      />
      <FilterBar>
        <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(0); }} placeholder="Note no / party" />
        <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); setPage(0); }} />
        <PartyPicker type={m.partyType} value={party} onChange={(v) => { setParty(v); setPage(0); }} sx={{ width: { xs: '100%', sm: 240 } }} />
        <TextField select label="Reason" value={reason} onChange={(e) => { setReason(e.target.value); setPage(0); }} sx={{ width: 160 }}>
          <MenuItem value="">All</MenuItem>
          {m.reasons.map((r) => <MenuItem key={r.value} value={r.value}>{reasonLabel(r.value)}</MenuItem>)}
        </TextField>
        <TextField select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} sx={{ width: 130 }}>
          <MenuItem value="">All</MenuItem><MenuItem value="active">Active</MenuItem><MenuItem value="cancelled">Cancelled</MenuItem>
        </TextField>
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
        onRowClick={(r) => setViewId(r._id)}
        rowSx={(r) => (r.status === 'cancelled' ? { opacity: 0.5 } : undefined)}
        empty={`No ${m.doc.toLowerCase()}s in this period.`}
      />
      <ReturnViewDialog kind={kind} id={viewId} onClose={() => setViewId(null)} onChanged={reload} />
    </>
  );
}

// ---------- View dialog ----------
export function ReturnViewDialog({ kind, id, onClose, onChanged }: { kind: ReturnKind; id: string | null; onClose: () => void; onChanged?: () => void }) {
  const m = META[kind];
  const theme = useTheme();
  const isXs = useMediaQuery(theme.breakpoints.down('sm'));
  const { can, business } = useAuth();
  const confirm = useConfirm();
  const { enqueueSnackbar } = useSnackbar();
  const { data, loading, setData } = useFetch<{ data: Voucher }>(id ? `${m.url}/${id}` : null);
  const v = id && data?.data?._id === id ? data.data : null;

  const cancel = async () => {
    if (!v) return;
    const { ok, text } = await confirm({
      title: `Cancel ${m.doc} ${v.number}?`,
      message: `Stock movements and ledger postings are reversed${v.adjustments?.length ? ', and the amount adjusted against bills is given back to those bills' : ''}. The number stays used.`,
      prompt: 'Reason', promptRequired: true, danger: true, confirmText: 'Cancel note',
    });
    if (!ok) return;
    try {
      const r = await api.post(`${m.url}/${v._id}/cancel`, { reason: text });
      setData({ data: r.data.data });
      enqueueSnackbar(`${m.doc} ${v.number} cancelled`, { variant: 'success' });
      onChanged?.();
    } catch (e) { enqueueSnackbar(errMsg(e), { variant: 'error' }); }
  };

  return (
    <Dialog open={!!id} onClose={onClose} maxWidth="lg" fullWidth fullScreen={isXs}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1 }}>
          {m.doc} {v?.number} {v && <StatusChip status={v.status} />}
          {v && <Typography variant="body2" color="text.secondary">{fdate(v.date)} · {v.partyName}</Typography>}
        </Box>
        {v && <ReasonChip reason={v.reason} />}
      </DialogTitle>
      <DialogContent dividers>
        {loading && !v && <LinearProgress />}
        {v && (
          <>
            {v.status === 'cancelled' && <Alert severity="error" sx={{ mb: 2 }}>Cancelled{v.cancelReason ? ` — ${v.cancelReason}` : ''}</Alert>}
            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">{kind === 'sales' ? 'CUSTOMER' : 'SUPPLIER'}</Typography>
                <Typography fontWeight={700}>{v.partyName}</Typography>
                <Typography fontSize={12} color="text.secondary">{[v.partyAddress, v.partyGstin && `GSTIN ${v.partyGstin}`, v.partyPhone].filter(Boolean).join(' · ')}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                {v[m.againstKey] && <Typography fontSize={13}>Against bill: <b>{v[m.againstKey]}</b></Typography>}
                <Typography fontSize={13}>Supply: {v.isInterState ? 'Inter-state (IGST)' : 'Intra-state (CGST + SGST)'}</Typography>
                {v.narration && <Typography fontSize={13}>Note: {v.narration}</Typography>}
              </Grid>
            </Grid>
            <Paper variant="outlined" sx={{ overflow: 'auto', mb: 2 }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell><TableCell>Product</TableCell><TableCell>Batch</TableCell><TableCell>Exp</TableCell>
                    <TableCell align="right">Qty</TableCell><TableCell align="right">Free</TableCell><TableCell align="right">Rate</TableCell>
                    <TableCell align="right">Claim</TableCell><TableCell align="right">Disc</TableCell><TableCell align="right">Taxable</TableCell>
                    <TableCell align="right">GST</TableCell><TableCell align="right">Amount</TableCell><TableCell>{kind === 'sales' ? 'Goes to' : 'From'}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {v.items.map((l, i) => (
                    <TableRow key={l._id || i}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell><Typography fontSize={13} fontWeight={600}>{l.productName}</Typography><Typography fontSize={11} color="text.secondary">{[l.manufacturerName, l.packing].filter(Boolean).join(' · ')}</Typography></TableCell>
                      <TableCell>{l.batchNo}</TableCell>
                      <TableCell>{fexp(l.expiry)}</TableCell>
                      <TableCell align="right">{l.qty}</TableCell>
                      <TableCell align="right">{l.freeQty || ''}</TableCell>
                      <TableCell align="right">{amt(l.rate)}</TableCell>
                      <TableCell align="right">{l.claimPct !== undefined && l.claimPct !== 100 ? `${l.claimPct}%` : ''}</TableCell>
                      <TableCell align="right">{l.discountPct ? `${l.discountPct}%` : ''}</TableCell>
                      <TableCell align="right">{amt(l.taxableValue)}</TableCell>
                      <TableCell align="right">{l.gstRate}%</TableCell>
                      <TableCell align="right"><b>{amt(l.total)}</b></TableCell>
                      <TableCell>{kind === 'sales'
                        ? <StatusChip status={l.returnType === 'saleable' ? 'saleable' : 'damaged'} label={l.returnType === 'saleable' ? 'Saleable' : `Damaged (${l.returnType})`} />
                        : <StatusChip status={l.stockBucket === 'damaged' ? 'damaged' : 'saleable'} label={l.stockBucket === 'damaged' ? 'Damaged' : 'Saleable'} />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" gutterBottom>Adjustments</Typography>
                {v.adjustments?.length ? (
                  <Paper variant="outlined">
                    <Table>
                      <TableHead><TableRow><TableCell>Bill / voucher</TableCell><TableCell align="right">Amount</TableCell></TableRow></TableHead>
                      <TableBody>{v.adjustments.map((a: { docNo: string; amount: number }, i: number) => <TableRow key={i}><TableCell>{a.docNo}</TableCell><TableCell align="right">{amt(a.amount)}</TableCell></TableRow>)}</TableBody>
                    </Table>
                  </Paper>
                ) : <Typography fontSize={13} color="text.secondary">Not adjusted against any bill yet.</Typography>}
                {v.status === 'active' && (
                  <Alert severity={(v.balance || 0) > 0.009 ? 'info' : 'success'} sx={{ mt: 1 }}>
                    {(v.balance || 0) > 0.009
                      ? `₹${amt(v.balance)} still unadjusted — ${kind === 'sales' ? 'it can be adjusted in a receipt or a later bill' : 'it can be adjusted in a supplier payment'}.`
                      : 'Fully adjusted.'}
                  </Alert>
                )}
              </Grid>
              <Grid item xs={12} md={6}>
                <Box sx={{ maxWidth: 340, ml: 'auto' }}>
                  <TotRow label="Gross" value={amt(v.grossAmount)} />
                  {v.discountAmount > 0 && <TotRow label="Discount" value={`− ${amt(v.discountAmount)}`} />}
                  <TotRow label="Taxable" value={amt(v.taxableAmount)} />
                  {v.isInterState ? <TotRow label="IGST" value={amt(v.igst)} /> : <><TotRow label="CGST" value={amt(v.cgst)} /><TotRow label="SGST" value={amt(v.sgst)} /></>}
                  {v.roundOff ? <TotRow label="Round off" value={amt(v.roundOff)} /> : null}
                  <TotRow label={`${m.doc} amount`} value={`₹${amt(v.grandTotal)}`} big />
                </Box>
              </Grid>
            </Grid>
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {v && v.status === 'active' && can(`${m.perm}:cancel`) && <Button color="error" startIcon={<BlockOutlinedIcon />} onClick={cancel} sx={{ mr: 'auto' }}>Cancel note</Button>}
        {v && <Button startIcon={<WhatsAppIcon />} onClick={() => openWhatsApp(v.partyPhone, returnWhatsAppText(v, business, kind))}>WhatsApp</Button>}
        {v && business && <Button variant="outlined" startIcon={<PrintOutlinedIcon />} onClick={() => printVoucher(v, business, m.printKind)}>Print</Button>}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

export const TotRow: React.FC<{ label: string; value: string; big?: boolean }> = ({ label, value, big }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.25, borderTop: big ? 1 : 0, borderColor: 'divider', mt: big ? 0.5 : 0, pt: big ? 0.75 : 0.25 }}>
    <Typography fontSize={big ? 14 : 13} fontWeight={big ? 700 : 400} color={big ? 'text.primary' : 'text.secondary'}>{label}</Typography>
    <Typography fontSize={big ? 17 : 13} fontWeight={big ? 700 : 500}>{value}</Typography>
  </Box>
);

// Saved-note dialog shown after creating a return.
export function ReturnSavedDialog({ kind, doc, onNew, onList }: { kind: ReturnKind; doc: Voucher | null; onNew: () => void; onList: () => void }) {
  const m = META[kind];
  const { business } = useAuth();
  return (
    <Dialog open={!!doc} maxWidth="xs" fullWidth>
      <DialogTitle>{m.doc} {doc?.number} saved</DialogTitle>
      <DialogContent>
        <Typography>{doc?.partyName}</Typography>
        <Typography fontSize={20} fontWeight={700}>₹{amt(doc?.grandTotal)}</Typography>
        {doc?.adjustments?.length ? <Typography color="text.secondary" fontSize={13}>Adjusted against {doc.adjustments.map((a: { docNo: string; amount: number }) => `${a.docNo} (₹${amt(a.amount)})`).join(', ')}</Typography> : null}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {doc && business && <Button variant="outlined" startIcon={<PrintOutlinedIcon />} onClick={() => printVoucher(doc, business, m.printKind)}>Print</Button>}
        {doc && <Button startIcon={<WhatsAppIcon />} onClick={() => openWhatsApp(doc.partyPhone, returnWhatsAppText(doc, business, kind))}>WhatsApp</Button>}
        <Button onClick={onList}>Register</Button>
        <Button variant="contained" onClick={onNew}>New {m.doc}</Button>
      </DialogActions>
    </Dialog>
  );
}

// Batch dropdown for return entry — lists every batch (expired too) with stock.
export function BatchSelect({ batches, value, onChange, loading, showDamaged, inputRef, disabled }: {
  batches: import('../../lib/types').Batch[]; value: string; onChange: (id: string) => void; loading?: boolean; showDamaged?: boolean;
  inputRef?: React.Ref<HTMLInputElement>; disabled?: boolean;
}) {
  return (
    <TextField select fullWidth label="Batch" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled || loading} inputRef={inputRef}
      helperText={loading ? 'Loading batches…' : !batches.length ? 'Pick a product first' : undefined}
      SelectProps={{ renderValue: (id) => { const b = batches.find((x) => x._id === id); return b ? `${b.batchNo} · Exp ${fexp(b.expiry)}` : ''; } }}>
      {batches.map((b) => (
        <MenuItem key={b._id} value={b._id} sx={{ display: 'block' }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Typography fontWeight={600} fontSize={13}>{b.batchNo}</Typography>
            <Typography fontSize={12} color={b.isExpired ? 'error.main' : b.isNearExpiry ? 'warning.main' : 'text.secondary'}>Exp {fexp(b.expiry)}{b.isExpired ? ' (expired)' : ''}</Typography>
            {b.isBlocked && <Chip label="blocked" sx={{ height: 16, fontSize: 10 }} />}
          </Box>
          <Typography fontSize={11} color="text.secondary">
            MRP {amt(b.mrp)} · PTR {amt(b.ptr)} · Pur {amt(b.purchaseRate)} · Stock {b.qty}{showDamaged || b.damagedQty ? ` · Damaged ${b.damagedQty || 0}` : ''}
          </Typography>
        </MenuItem>
      ))}
    </TextField>
  );
}

export const returnLineAmount = (qty: number, rate: number, claimPct: number, discPct: number, gst: number) => {
  const taxable = qty * ((rate * claimPct) / 100) * (1 - discPct / 100);
  return { taxable, tax: (taxable * gst) / 100, total: taxable * (1 + gst / 100) };
};
