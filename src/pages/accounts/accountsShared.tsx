import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Grid,
  IconButton, InputAdornment, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ReportGmailerrorredIcon from '@mui/icons-material/ReportGmailerrorred';
import dayjs from 'dayjs';
import { useSnackbar } from 'notistack';
import { api, errMsg } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useConfirm } from '../../components/Dialogs';
import { StatusChip } from '../../components/StatusChip';
import { amt, fdate, fdatetime, inr, today } from '../../lib/format';
import { openWhatsApp } from '../../lib/whatsapp';
import { printMoneyVoucher } from '../../print/print';
import type { Business, MoneyVoucher, User } from '../../lib/types';

// ---------------------------------------------------------------------------
// Small helpers shared by the accounts screens (receipts, payments, PDC,
// outstanding, journals, ledgers). Kept inside the accounts folder on purpose.
// ---------------------------------------------------------------------------

export type MoneyKind = 'receipt' | 'payment';

export interface MoneyDoc extends MoneyVoucher {
  collectedBy?: string;
  cancelReason?: string;
  clearedDate?: string;
  bouncedDate?: string;
  bounceCharges?: number;
  createdAt?: string;
}

export const MODES: { value: string; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'neft', label: 'NEFT' },
  { value: 'rtgs', label: 'RTGS' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
];
export const modeLabel = (m?: string) => MODES.find((x) => x.value === m)?.label || (m || '').toUpperCase();

export const moneyPath = (kind: MoneyKind) => (kind === 'receipt' ? 'receipts' : 'payments');
export const moneyTitle = (kind: MoneyKind) => (kind === 'receipt' ? 'Receipt' : 'Payment');

// Ledger groups (mirror of backend LEDGER_GROUPS) with readable labels.
export const GROUP_LABELS: Record<string, string> = {
  sundry_debtors: 'Sundry Debtors',
  sundry_creditors: 'Sundry Creditors',
  cash: 'Cash in Hand',
  bank: 'Bank Accounts',
  current_assets: 'Current Assets',
  fixed_assets: 'Fixed Assets',
  loans_advances: 'Loans & Advances (Asset)',
  duties_taxes: 'Duties & Taxes',
  current_liabilities: 'Current Liabilities',
  loans: 'Loans (Liability)',
  capital: 'Capital Account',
  sales: 'Sales Accounts',
  direct_income: 'Direct Income',
  indirect_income: 'Indirect Income',
  purchase: 'Purchase Accounts',
  direct_expenses: 'Direct Expenses',
  indirect_expenses: 'Indirect Expenses',
};
export const groupLabel = (g?: string) => GROUP_LABELS[g || ''] || (g || '').replace(/_/g, ' ');

export const VOUCHER_TYPE_LABELS: Record<string, string> = {
  sales: 'Sales',
  purchase: 'Purchase',
  sales_return: 'Credit Note',
  purchase_return: 'Debit Note',
  receipt: 'Receipt',
  payment: 'Payment',
  journal: 'Journal',
  contra: 'Contra',
  expense: 'Expense',
  pdc_clear: 'PDC Cleared',
  cheque_bounce: 'Cheque Bounce',
  stock_adjustment: 'Stock Adj.',
  opening: 'Opening',
};
export const voucherTypeLabel = (t?: string) => VOUCHER_TYPE_LABELS[t || ''] || (t || '').replace(/_/g, ' ');

// Start of the current financial year as YYYY-MM-DD (business can override
// the start month; default April).
export const fyStartDate = (business?: Business | null) => {
  const m = business?.fyStartMonth || 4;
  const now = dayjs();
  const y = now.month() + 1 >= m ? now.year() : now.year() - 1;
  return dayjs(new Date(y, m - 1, 1)).format('YYYY-MM-DD');
};

export const sum = (xs: number[]) => Math.round(xs.reduce((s, x) => s + (Number(x) || 0), 0) * 100) / 100;

// Party mobile is not stored on the voucher, so it's looked up on demand.
export const fetchPartyMobile = async (partyId: string): Promise<string> => {
  const r = await api.get(`/parties/${partyId}`);
  const p = r.data?.data || {};
  return p.mobile || p.phone || '';
};

// Users list (for "collected by" / salesman filters). Cached per page load.
let usersCache: Promise<User[]> | null = null;
export const loadUsers = () => {
  if (!usersCache) usersCache = api.get('/users').then((r) => (r.data?.data || []) as User[]).catch(() => { usersCache = null; return []; });
  return usersCache;
};
export const useUsers = () => {
  const [users, setUsers] = useState<User[]>([]);
  useEffect(() => { let alive = true; loadUsers().then((u) => alive && setUsers(u)); return () => { alive = false; }; }, []);
  return users;
};

export const chequeLine = (m: Pick<MoneyVoucher, 'chequeNo' | 'chequeDate' | 'bankName'>) =>
  m.chequeNo ? `Cheque No ${m.chequeNo}${m.chequeDate ? ` dt. ${fdate(m.chequeDate)}` : ''}${m.bankName ? ` (${m.bankName})` : ''}` : '';

// WhatsApp acknowledgement of a receipt / intimation of a payment.
export const moneyWhatsAppText = (m: MoneyDoc, b?: Business | null) => {
  const via = m.mode === 'cheque' ? chequeLine(m) : `${modeLabel(m.mode)}${m.reference ? ` (Ref ${m.reference})` : ''}`;
  const lines: string[] = [`Dear ${m.partyName},`, ''];
  if (m.kind === 'receipt') {
    lines.push(`Thank you! We acknowledge receipt of *${inr(m.amount)}* by ${via} on ${fdate(m.date)}.`);
    lines.push(`Receipt No: ${m.number}`);
    if (m.isPdc && m.chequeStatus === 'pending') lines.push('This is a post-dated cheque; it will be credited on realisation.');
  } else {
    lines.push(`We have paid *${inr(m.amount)}* to you by ${via} on ${fdate(m.date)}.`);
    lines.push(`Our voucher No: ${m.number}`);
  }
  if (m.discount) lines.push(`Settlement discount: ${inr(m.discount)}`);
  if (m.tds) lines.push(`TDS: ${inr(m.tds)}`);
  if (m.allocations?.length) {
    lines.push('', 'Adjusted against:');
    for (const a of m.allocations) lines.push(`• ${a.billNo} dt. ${fdate(a.billDate)} — ${inr(a.amount)}`);
  }
  if (m.onAccount > 0.009) lines.push(`On account: ${inr(m.onAccount)}`);
  lines.push('', `— ${b?.name || ''}`);
  return lines.join('\n');
};

export const bounceWhatsAppText = (m: MoneyDoc, b: Business | null | undefined, charges: number) => {
  const lines = [`Dear ${m.partyName},`, ''];
  if (m.kind === 'receipt') {
    lines.push(`Your ${chequeLine(m)} for *${inr(m.amount)}* (our receipt ${m.number}) has been returned unpaid by the bank.`);
    if (charges > 0) lines.push(`Bank charges of ${inr(charges)} have been debited to your account.`);
    lines.push('The bills adjusted against this cheque are outstanding again. Kindly arrange the payment at the earliest.');
  } else {
    lines.push(`Our ${chequeLine(m)} for ${inr(m.amount)} (voucher ${m.number}) has been returned by the bank.`);
    lines.push('We regret the inconvenience and will arrange a replacement payment shortly.');
  }
  lines.push('', `— ${b?.name || ''}`);
  return lines.join('\n');
};

export const shareMoneyOnWhatsApp = async (m: MoneyDoc, b: Business | null | undefined, onError: (msg: string) => void) => {
  try {
    const mobile = await fetchPartyMobile(m.party);
    if (!mobile) onError('No mobile number on the party — opening WhatsApp without a recipient.');
    openWhatsApp(mobile, moneyWhatsAppText(m, b));
  } catch (e) {
    onError(errMsg(e));
  }
};

// ---------------------------------------------------------------------------
// Clear / bounce dialog for cheques.
// ---------------------------------------------------------------------------
export const ChequeActionDialog: React.FC<{
  voucher: MoneyDoc | null;
  action: 'clear' | 'bounce' | null;
  onClose: () => void;
  onDone: (v: MoneyDoc) => void;
}> = ({ voucher, action, onClose, onDone }) => {
  const { business } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const [date, setDate] = useState(today());
  const [charges, setCharges] = useState('');
  const [busy, setBusy] = useState(false);
  const [bounced, setBounced] = useState<MoneyDoc | null>(null);

  useEffect(() => {
    if (voucher && action) {
      setDate(today());
      setCharges('');
      setBounced(null);
    }
  }, [voucher, action]);

  if (!voucher || !action) return null;
  const path = moneyPath(voucher.kind);
  const early = action === 'clear' && voucher.chequeDate && dayjs(date).isBefore(dayjs(voucher.chequeDate), 'day');

  const submit = async () => {
    setBusy(true);
    try {
      if (action === 'clear') {
        const r = await api.post(`/${path}/${voucher._id}/clear`, { date });
        enqueueSnackbar(`Cheque ${voucher.chequeNo} marked cleared.`, { variant: 'success' });
        onDone(r.data.data);
        onClose();
      } else {
        const r = await api.post(`/${path}/${voucher._id}/bounce`, { date, charges: Number(charges) || 0 });
        enqueueSnackbar(`Cheque ${voucher.chequeNo} marked bounced — entries reversed.`, { variant: 'warning' });
        setBounced(r.data.data);
        onDone(r.data.data);
      }
    } catch (e) {
      enqueueSnackbar(errMsg(e), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const sendWa = async () => {
    try {
      const mobile = await fetchPartyMobile(voucher.party);
      openWhatsApp(mobile, bounceWhatsAppText(bounced || voucher, business, Number(charges) || 0));
    } catch (e) {
      enqueueSnackbar(errMsg(e), { variant: 'error' });
    }
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{action === 'clear' ? 'Mark cheque cleared' : bounced ? 'Cheque bounced' : 'Mark cheque bounced'}</DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 2, p: 1.25, borderRadius: 1, bgcolor: 'action.hover' }}>
          <Typography fontWeight={600}>{voucher.partyName}</Typography>
          <Typography fontSize={13} color="text.secondary">{chequeLine(voucher)} · {voucher.number}</Typography>
          <Typography fontWeight={700} fontSize={16}>{inr(voucher.amount)}</Typography>
        </Box>
        {bounced ? (
          <Alert severity="warning">
            The {voucher.kind} has been reversed and the bills it settled are outstanding again.
            {voucher.kind === 'receipt' ? ' Let the party know on WhatsApp.' : ''}
          </Alert>
        ) : (
          <Stack spacing={2}>
            <TextField type="date" label={action === 'clear' ? 'Cleared on (bank date)' : 'Bounced on'} value={date}
              onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth autoFocus />
            {early && <Alert severity="info">Clearing before the cheque date ({fdate(voucher.chequeDate)}).</Alert>}
            {action === 'bounce' && voucher.kind === 'receipt' && (
              <TextField type="number" label="Bank charges to recover from party" value={charges} onChange={(e) => setCharges(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} inputProps={{ min: 0, step: '0.01' }}
                helperText="Debited to the party, credited to Cheque Bounce Charges Recovered" fullWidth />
            )}
            {action === 'bounce' && (
              <Alert severity="error" variant="outlined">
                This reverses the {voucher.kind} posting and re-opens {voucher.allocations?.length ? `${voucher.allocations.length} bill(s)` : 'the party balance'}. It cannot be undone.
              </Alert>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {bounced ? (
          <>
            <Button onClick={onClose}>Close</Button>
            <Button variant="contained" color="success" startIcon={<WhatsAppIcon />} onClick={sendWa}>WhatsApp party</Button>
          </>
        ) : (
          <>
            <Button onClick={onClose} disabled={busy}>Cancel</Button>
            <Button variant="contained" color={action === 'bounce' ? 'error' : 'success'} onClick={submit} disabled={busy || !date}
              startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>
              {action === 'clear' ? 'Mark cleared' : 'Mark bounced'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// Receipt / payment view dialog with Print / WhatsApp / Cancel / Clear / Bounce.
// ---------------------------------------------------------------------------
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <Box>
    <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
    <Typography fontSize={14} component="div">{children || '—'}</Typography>
  </Box>
);

export const moneyStatusChip = (m: MoneyDoc) =>
  m.status === 'cancelled' ? <StatusChip status="cancelled" /> : m.chequeStatus !== 'na' ? <StatusChip status={m.chequeStatus} label={m.chequeStatus === 'pending' ? 'PDC' : undefined} /> : <StatusChip status="active" />;

export const MoneyViewDialog: React.FC<{
  voucher: MoneyDoc | null;
  onClose: () => void;
  onChanged?: () => void;
  collectorName?: (m: MoneyDoc) => string;
}> = ({ voucher, onClose, onChanged, collectorName }) => {
  const { business, can } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const [doc, setDoc] = useState<MoneyDoc | null>(voucher);
  const [action, setAction] = useState<'clear' | 'bounce' | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setDoc(voucher); }, [voucher]);
  if (!voucher || !doc) return null;
  const path = moneyPath(doc.kind);
  const active = doc.status === 'active';
  const canEdit = can(`${path}:edit`);

  const refreshed = (v: MoneyDoc) => { setDoc(v); onChanged?.(); };

  const cancel = async () => {
    const { ok, text } = await confirm({
      title: `Cancel ${moneyTitle(doc.kind).toLowerCase()} ${doc.number}?`,
      message: `The ledger posting is removed${doc.allocations?.length ? ` and ${doc.allocations.length} bill(s) become outstanding again` : ''}. The number is kept as cancelled.`,
      prompt: 'Reason', promptRequired: true, danger: true, confirmText: 'Cancel entry',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api.post(`/${path}/${doc._id}/cancel`, { reason: text });
      enqueueSnackbar(`${doc.number} cancelled.`, { variant: 'success' });
      refreshed(r.data.data);
    } catch (e) {
      enqueueSnackbar(errMsg(e), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const collector = collectorName ? collectorName(doc) : doc.collectedByName;

  return (
    <>
      <Dialog open onClose={onClose} maxWidth="md" fullWidth fullScreen={phone}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" noWrap>{moneyTitle(doc.kind)} {doc.number}</Typography>
            <Typography variant="body2" color="text.secondary" noWrap>{fdate(doc.date)} · {doc.partyName}</Typography>
          </Box>
          {moneyStatusChip(doc)}
          <IconButton onClick={onClose} aria-label="Close"><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {doc.status === 'cancelled' && <Alert severity="info" sx={{ mb: 2 }}>Cancelled{doc.cancelReason ? `: ${doc.cancelReason}` : ''}</Alert>}
          {doc.chequeStatus === 'bounced' && (
            <Alert severity="error" sx={{ mb: 2 }}>
              Cheque bounced on {fdate(doc.bouncedDate)}{doc.bounceCharges ? ` · charges ${inr(doc.bounceCharges)} debited to party` : ''}. Posting reversed, bills re-opened.
            </Alert>
          )}
          {doc.chequeStatus === 'pending' && active && (
            <Alert severity="warning" sx={{ mb: 2 }}>Post-dated cheque — sitting in PDC until cleared (cheque date {fdate(doc.chequeDate)}).</Alert>
          )}
          <Grid container spacing={2}>
            <Grid item xs={6} sm={3}><Field label="Amount"><b style={{ fontSize: 18 }}>{inr(doc.amount)}</b></Field></Grid>
            <Grid item xs={6} sm={3}><Field label="Mode">{modeLabel(doc.mode)}</Field></Grid>
            <Grid item xs={6} sm={3}><Field label={doc.kind === 'receipt' ? 'Deposited to' : 'Paid from'}>{doc.accountName}</Field></Grid>
            <Grid item xs={6} sm={3}><Field label="Party">{doc.partyName}</Field></Grid>
            {doc.mode === 'cheque' && (
              <>
                <Grid item xs={6} sm={3}><Field label="Cheque no">{doc.chequeNo}</Field></Grid>
                <Grid item xs={6} sm={3}><Field label="Cheque date">{fdate(doc.chequeDate)}</Field></Grid>
                <Grid item xs={6} sm={3}><Field label="Bank">{doc.bankName}</Field></Grid>
                <Grid item xs={6} sm={3}><Field label="Cleared on">{doc.clearedDate ? fdate(doc.clearedDate) : doc.chequeStatus === 'cleared' ? fdate(doc.date) : ''}</Field></Grid>
              </>
            )}
            <Grid item xs={6} sm={3}><Field label="Discount">{doc.discount ? amt(doc.discount) : ''}</Field></Grid>
            <Grid item xs={6} sm={3}><Field label="TDS">{doc.tds ? amt(doc.tds) : ''}</Field></Grid>
            <Grid item xs={6} sm={3}><Field label="Reference / UTR">{doc.reference}</Field></Grid>
            {doc.kind === 'receipt' && <Grid item xs={6} sm={3}><Field label="Collected by">{collector}</Field></Grid>}
            <Grid item xs={12}><Field label="Narration">{doc.narration}</Field></Grid>
          </Grid>
          <Divider sx={{ my: 2 }} />
          <Typography fontWeight={600} mb={1}>Bill-wise adjustment</Typography>
          {doc.allocations?.length ? (
            <Table size="small">
              <TableHead>
                <TableRow><TableCell>Bill</TableCell><TableCell>Bill date</TableCell><TableCell align="right">Adjusted</TableCell></TableRow>
              </TableHead>
              <TableBody>
                {doc.allocations.map((a) => (
                  <TableRow key={String(a.bill)}><TableCell>{a.billNo}</TableCell><TableCell>{fdate(a.billDate)}</TableCell><TableCell align="right">{amt(a.amount)}</TableCell></TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={2}><b>Total adjusted</b></TableCell>
                  <TableCell align="right"><b>{amt(sum(doc.allocations.map((a) => a.amount)))}</b></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          ) : (
            <Typography color="text.secondary" fontSize={13}>Not adjusted against any bill.</Typography>
          )}
          {doc.onAccount > 0.009 && (
            <Typography mt={1} fontSize={13}>On account (unadjusted): <b>{inr(doc.onAccount)}</b></Typography>
          )}
          {doc.createdAt && <Typography mt={2} fontSize={11} color="text.secondary">Entered {fdatetime(doc.createdAt)}</Typography>}
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', gap: 1, px: 2, py: 1.5 }}>
          {active && can(`${path}:cancel`) && doc.chequeStatus !== 'bounced' && (
            <Button color="error" startIcon={<BlockIcon />} onClick={cancel} disabled={busy}>Cancel entry</Button>
          )}
          <Box sx={{ flex: 1 }} />
          {active && canEdit && doc.chequeStatus === 'pending' && (
            <Button color="success" variant="outlined" startIcon={<CheckCircleOutlineIcon />} onClick={() => setAction('clear')}>Clear PDC</Button>
          )}
          {active && canEdit && doc.mode === 'cheque' && doc.chequeStatus !== 'bounced' && (
            <Button color="error" variant="outlined" startIcon={<ReportGmailerrorredIcon />} onClick={() => setAction('bounce')}>Bounced</Button>
          )}
          <Button variant="outlined" color="success" startIcon={<WhatsAppIcon />}
            onClick={() => shareMoneyOnWhatsApp(doc, business, (m) => enqueueSnackbar(m, { variant: 'warning' }))}>WhatsApp</Button>
          <Button variant="contained" startIcon={<PrintOutlinedIcon />} onClick={() => business && printMoneyVoucher(doc, business)}>Print</Button>
        </DialogActions>
      </Dialog>
      <ChequeActionDialog voucher={action ? doc : null} action={action} onClose={() => setAction(null)} onDone={refreshed} />
    </>
  );
};

// Inline "Dr / Cr" chip-ish label for a signed balance.
export const BalanceText: React.FC<{ value: number; strong?: boolean }> = ({ value, strong }) => (
  <Typography component="span" fontSize="inherit" fontWeight={strong ? 700 : undefined} sx={{ whiteSpace: 'nowrap' }}>
    {amt(Math.abs(value))} <Typography component="span" fontSize={11} color={value >= 0 ? 'text.secondary' : 'success.main'}>{value >= 0 ? 'Dr' : 'Cr'}</Typography>
  </Typography>
);

export const KindChip: React.FC<{ label: string; color?: 'default' | 'primary' | 'secondary' | 'info' | 'warning' | 'success' | 'error' }> = ({ label, color = 'default' }) => (
  <Chip label={label} color={color} size="small" variant="outlined" sx={{ height: 20, fontSize: 11, fontWeight: 600 }} />
);
