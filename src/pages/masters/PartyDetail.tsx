import { useState } from 'react';
import {
  Alert, Box, Button, Grid, IconButton, Paper, Tab, Tabs, Typography,
} from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import AddIcon from '@mui/icons-material/Add';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import CreditScoreOutlinedIcon from '@mui/icons-material/CreditScoreOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import { useNavigate, useParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import dayjs from 'dayjs';
import { PageHeader } from '../../components/PageHeader';
import { DataTable, Col } from '../../components/DataTable';
import { StatCard } from '../../components/StatCard';
import { StatusChip } from '../../components/StatusChip';
import { useConfirm } from '../../components/Dialogs';
import { useFetch } from '../../lib/hooks';
import { amt, drcr, fdate, inr, inrShort, today } from '../../lib/format';
import { openWhatsApp } from '../../lib/whatsapp';
import { printTable } from '../../print/print';
import { api, errMsg } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { STATES } from '../../lib/types';
import type { Party, Voucher } from '../../lib/types';
import { DlChip, KV, SmallChip, refName, scheme } from './masterUi';
import { SpecialRate, SpecialRateDialog } from './SpecialRateDialog';

interface OpenBill { _id: string; number: string; date: string; dueDate?: string; grandTotal: number; balance: number }
interface Summary {
  openBills: OpenBill[];
  openNotes: { _id: string; number: string; date: string; grandTotal: number; balance: number }[];
  onAccount: { _id: string; number: string; date: string; onAccount: number }[];
  pdc: { _id: string; number: string; chequeNo: string; chequeDate?: string; amount: number }[];
  lastBill?: { number: string; date: string; grandTotal: number } | null;
  lastPayment?: { number: string; date: string; amount: number; mode: string } | null;
  overdue: number; outstanding: number; creditAvailable: number | null; dlExpired: boolean;
}

const RATE_LABEL: Record<string, string> = { ptr: 'PTR', pts: 'PTS', mrp: 'MRP', mrp_less: 'MRP less', ptr_plus: 'PTR plus' };
const age = (d: string) => dayjs().startOf('day').diff(dayjs(d).startOf('day'), 'day');

export default function PartyDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { can, business } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const [tab, setTab] = useState(0);
  const [srEdit, setSrEdit] = useState<Partial<SpecialRate> | null>(null);

  const { data, loading } = useFetch<{ data: Party; summary: Summary }>(`/parties/${id}`);
  const p = data?.data;
  const sm = data?.summary;
  const isCust = p ? p.group !== 'sundry_creditors' : true;
  const { data: recent, loading: rLoading } = useFetch<{ data: Voucher[] }>(p && tab === 2 ? (isCust ? '/sales' : '/purchases') : null, { party: id, limit: 50 });
  const { data: srData, loading: srLoading, reload: reloadSr } = useFetch<{ data: SpecialRate[] }>(p && isCust && tab === 3 ? '/special-rates' : null, { party: id });

  if (!p || !sm) {
    return (
      <>
        <PageHeader title={loading ? 'Loading…' : 'Party not found'} crumbs={[{ label: 'Masters' }]} />
        {!loading && <Alert severity="warning" action={<Button onClick={() => nav(-1)}>Back</Button>}>This party does not exist.</Alert>}
      </>
    );
  }

  const bal = p.balance || 0;
  const credits = sm.openNotes.reduce((s, n) => s + n.balance, 0) + sm.onAccount.reduce((s, n) => s + n.onAccount, 0);
  const pdcTotal = sm.pdc.reduce((s, n) => s + n.amount, 0);
  const overdueBills = sm.openBills.filter((b) => b.dueDate && dayjs(b.dueDate).isBefore(dayjs(), 'day'));
  const listUrl = isCust ? '/customers' : '/suppliers';

  // ---- WhatsApp outstanding reminder (bill-wise) ----
  const sendReminder = () => {
    if (!sm.openBills.length) { enqueueSnackbar('No open bills to remind about.', { variant: 'info' }); return; }
    const lines = sm.openBills.map((b, i) => {
      const od = b.dueDate ? age(b.dueDate) : 0;
      return `${i + 1}. ${b.number} dt ${fdate(b.date)} — ${inr(b.balance)}${od > 0 ? ` (${od} days overdue)` : ''}`;
    });
    const net = sm.outstanding - credits;
    const text = [
      `Dear ${p.contactPerson || p.name},`,
      '',
      `Your outstanding with *${business?.name || 'us'}* as on ${fdate(today())}:`,
      '',
      ...lines,
      '',
      `*Total due: ${inr(sm.outstanding)}*`,
      ...(sm.overdue > 0 ? [`Overdue: ${inr(sm.overdue)}`] : []),
      ...(credits > 0 ? [`Less credit notes / advance: ${inr(credits)}`, `*Net payable: ${inr(net)}*`] : []),
      ...(business?.upiId ? ['', `Pay by UPI: ${business.upiId}`] : []),
      ...(business?.bankAccount ? [`Bank: ${business.bankName} A/c ${business.bankAccount} IFSC ${business.bankIfsc}`] : []),
      '',
      'Kindly arrange payment. Please ignore if already paid.',
      `— ${business?.name || ''}${business?.phone ? ` (${business.phone})` : ''}`,
    ].join('\n');
    openWhatsApp(p.mobile, text);
  };

  const printOutstanding = () => {
    if (!business) return;
    const rows = sm.openBills.map((b) => {
      const od = b.dueDate ? Math.max(0, age(b.dueDate)) : 0;
      return [b.number, fdate(b.date), fdate(b.dueDate), od ? String(od) : '', amt(b.grandTotal), amt(b.balance)];
    });
    for (const n of sm.openNotes) rows.push([n.number, fdate(n.date), '', isCust ? 'Credit note' : 'Debit note', amt(n.grandTotal), `-${amt(n.balance)}`]);
    for (const n of sm.onAccount) rows.push([n.number, fdate(n.date), '', 'On account', '', `-${amt(n.onAccount)}`]);
    printTable(
      'Outstanding Statement', business,
      `${p.name}${p.city ? ', ' + p.city : ''}${p.gstin ? ' · GSTIN ' + p.gstin : ''} · as on ${fdate(today())}`,
      ['Bill / Doc', 'Date', 'Due', 'Days overdue', 'Bill amount', 'Balance'],
      rows,
      ['', '', '', 'Net', '', amt(sm.outstanding - credits)],
      [3, 4, 5],
    );
  };

  const deleteSr = async (r: SpecialRate) => {
    const { ok } = await confirm({ title: 'Remove special rate?', message: `${r.product?.name} will be billed at ${p.name}'s normal rate type again.`, danger: true, confirmText: 'Remove' });
    if (!ok) return;
    try {
      await api.delete(`/special-rates/${r._id}`);
      enqueueSnackbar('Special rate removed.', { variant: 'success' });
      reloadSr();
    } catch (e) {
      enqueueSnackbar(errMsg(e), { variant: 'error' });
    }
  };

  const billPath = (vid: string) => (isCust ? `/sales/${vid}` : `/purchases/${vid}`);

  const openCols: Col<OpenBill>[] = [
    { key: 'number', label: 'Bill No', nowrap: true, render: (b) => <Typography fontWeight={600} fontSize={13}>{b.number}</Typography> },
    { key: 'date', label: 'Date', nowrap: true, render: (b) => fdate(b.date) },
    { key: 'dueDate', label: 'Due', nowrap: true, render: (b) => fdate(b.dueDate) },
    { key: 'age', label: 'Age', align: 'right', render: (b) => `${age(b.date)}d` },
    {
      key: 'od', label: 'Overdue', align: 'right',
      render: (b) => { const od = b.dueDate ? age(b.dueDate) : 0; return od > 0 ? <Typography fontSize={13} fontWeight={700} color={od > 60 ? 'error.main' : 'warning.dark'}>{od} days</Typography> : <Typography fontSize={12} color="text.secondary">not due</Typography>; },
    },
    { key: 'grandTotal', label: 'Bill amount', align: 'right', render: (b) => amt(b.grandTotal), footer: amt(sm.openBills.reduce((s, b) => s + b.grandTotal, 0)) },
    { key: 'balance', label: 'Balance', align: 'right', render: (b) => <b>{amt(b.balance)}</b>, footer: amt(sm.outstanding) },
  ];

  type Credit = { _id: string; kind: string; number: string; date?: string; detail: string; amount: number };
  const creditRows: Credit[] = [
    ...sm.openNotes.map((n) => ({ _id: n._id, kind: isCust ? 'Credit note' : 'Debit note', number: n.number, date: n.date, detail: `of ${amt(n.grandTotal)}`, amount: n.balance })),
    ...sm.onAccount.map((n) => ({ _id: n._id, kind: isCust ? 'Receipt on account' : 'Payment on account', number: n.number, date: n.date, detail: 'Not allocated to a bill', amount: n.onAccount })),
    ...sm.pdc.map((n) => ({ _id: n._id, kind: 'PDC (pending)', number: n.number, date: n.chequeDate, detail: `Cheque ${n.chequeNo}`, amount: n.amount })),
  ];
  const creditCols: Col<Credit>[] = [
    { key: 'kind', label: 'Type', render: (c) => <StatusChip status={c.kind.startsWith('PDC') ? 'pending' : 'open'} label={c.kind} /> },
    { key: 'number', label: 'No', nowrap: true },
    { key: 'date', label: 'Date', nowrap: true, render: (c) => fdate(c.date) },
    { key: 'detail', label: 'Detail' },
    { key: 'amount', label: 'Unadjusted', align: 'right', render: (c) => <b>{amt(c.amount)}</b>, footer: amt(credits + pdcTotal) },
  ];

  const recentCols: Col<Voucher>[] = [
    { key: 'number', label: 'Bill No', nowrap: true, render: (r) => <Typography fontWeight={600} fontSize={13}>{r.number}</Typography> },
    ...(!isCust ? [{ key: 'supplierInvoiceNo', label: 'Supplier bill', render: (r: Voucher) => r.supplierInvoiceNo }] : []),
    { key: 'date', label: 'Date', nowrap: true, render: (r) => fdate(r.date) },
    { key: 'items', label: 'Items', align: 'right', render: (r) => r.items?.length },
    { key: 'grandTotal', label: 'Total', align: 'right', render: (r) => <b>{amt(r.grandTotal)}</b> },
    { key: 'balance', label: 'Balance', align: 'right', render: (r) => (r.status === 'cancelled' ? '—' : amt(r.balance)) },
    { key: 'dueDate', label: 'Due', nowrap: true, render: (r) => fdate(r.dueDate) },
    { key: 'status', label: 'Status', render: (r) => <StatusChip status={r.status === 'cancelled' ? 'cancelled' : r.paymentStatus} /> },
  ];

  const srCols: Col<SpecialRate>[] = [
    { key: 'product', label: 'Product', render: (r) => <>{r.product?.name}<Typography fontSize={11} color="text.secondary">{[r.product?.manufacturerName, r.product?.packing].filter(Boolean).join(' · ')}</Typography></> },
    { key: 'ptr', label: 'Master PTR', align: 'right', render: (r) => amt(r.product?.ptr) },
    { key: 'rate', label: 'Special rate', align: 'right', render: (r) => (r.rate ? <b>{amt(r.rate)}</b> : '—') },
    { key: 'discountPct', label: 'Disc %', align: 'right', render: (r) => (r.discountPct ? `${r.discountPct}%` : '—') },
    { key: 'scheme', label: 'Scheme', align: 'center', render: (r) => scheme(r.schemeBuy, r.schemeFree) || '—' },
    { key: 'validTill', label: 'Valid till', nowrap: true, render: (r) => (r.validTill ? <Typography fontSize={13} color={dayjs(r.validTill).isBefore(dayjs(), 'day') ? 'error.main' : undefined}>{fdate(r.validTill)}{dayjs(r.validTill).isBefore(dayjs(), 'day') ? ' (lapsed)' : ''}</Typography> : 'Open') },
    { key: 'note', label: 'Note' },
    {
      key: 'act', label: '', align: 'right', nowrap: true,
      render: (r) => can('parties:edit') ? (
        <Box onClick={(e) => e.stopPropagation()}>
          <IconButton onClick={() => setSrEdit(r)}><EditOutlinedIcon fontSize="small" /></IconButton>
          <IconButton color="error" onClick={() => deleteSr(r)}><DeleteOutlineIcon fontSize="small" /></IconButton>
        </Box>
      ) : null,
    },
  ];

  const owesUs = isCust ? bal > 0.009 : bal < -0.009;

  return (
    <>
      <PageHeader
        help={['outstanding', 'overdue', 'drcr', 'ledger', 'creditlimit']}
        title={<>{p.name}{p.isHold && <SmallChip label="ON HOLD" color="error" />}{!p.isActive && <SmallChip label="Inactive" variant="outlined" />}</>}
        subtitle={[isCust ? 'Customer' : 'Supplier', p.code, p.city, p.area].filter(Boolean).join(' · ')}
        crumbs={[{ label: 'Masters' }, { label: isCust ? 'Customers' : 'Suppliers', to: listUrl }, { label: p.name }]}
        actions={
          <>
            {can('parties:edit') && <Button variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => nav(`/parties/${id}/edit`)}>Edit</Button>}
            <Button variant="outlined" startIcon={<HistoryOutlinedIcon />} onClick={() => nav(`/ledger-statement?ledger=${id}`)}>Ledger</Button>
            <Button variant="outlined" startIcon={<PrintOutlinedIcon />} onClick={printOutstanding}>Print O/S</Button>
            {isCust && <Button variant="outlined" color="success" startIcon={<WhatsAppIcon />} onClick={sendReminder} disabled={!p.mobile || !sm.openBills.length}>Reminder</Button>}
            {isCust
              ? can('receipts:create') && <Button variant="outlined" startIcon={<PaymentsOutlinedIcon />} onClick={() => nav(`/receipts/new?party=${id}`)}>Receipt</Button>
              : can('payments:create') && <Button variant="outlined" startIcon={<PaymentsOutlinedIcon />} onClick={() => nav(`/payments/new?party=${id}`)}>Payment</Button>}
            {isCust
              ? can('sales:create') && <Button variant="contained" startIcon={<ReceiptLongOutlinedIcon />} onClick={() => nav(`/sales/new?party=${id}`)} disabled={p.isHold}>New Bill</Button>
              : can('purchases:create') && <Button variant="contained" startIcon={<ReceiptLongOutlinedIcon />} onClick={() => nav(`/purchases/new?party=${id}`)}>New Purchase</Button>}
          </>
        }
      />

      {p.isHold && <Alert severity="error" sx={{ mb: 1.5 }}>On hold{p.holdReason ? `: ${p.holdReason}` : ''}. Billing is stopped until the hold is removed (Edit).</Alert>}
      {isCust && sm.dlExpired && <Alert severity="error" sx={{ mb: 1.5 }}>Drug licence expired on {fdate(p.dlExpiry)}. Collect the renewed licence before billing.</Alert>}
      {isCust && !p.dl20b && !p.dl21b && <Alert severity="warning" sx={{ mb: 1.5 }}>No drug licence number on file — required on every pharma invoice.</Alert>}

      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid item xs={6} md={2.4}><StatCard label="Ledger balance" value={drcr(bal)} hint={owesUs ? (isCust ? 'Receivable' : 'Payable') : Math.abs(bal) < 0.01 ? 'Settled' : 'Advance'} icon={<AccountBalanceWalletOutlinedIcon />} tone={isCust && owesUs ? 'bad' : 'default'} /></Grid>
        <Grid item xs={6} md={2.4}><StatCard label="Open bills" value={inrShort(sm.outstanding)} hint={`${sm.openBills.length} bill(s)${credits ? ` · ${inrShort(credits)} credits` : ''}`} icon={<ReceiptLongOutlinedIcon />} /></Grid>
        <Grid item xs={6} md={2.4}><StatCard label="Overdue" value={inrShort(sm.overdue)} hint={overdueBills.length ? `${overdueBills.length} bill(s), oldest ${Math.max(...overdueBills.map((b) => age(b.dueDate!)))}d` : 'Nothing overdue'} icon={<EventBusyOutlinedIcon />} tone={sm.overdue > 0 ? 'bad' : 'good'} /></Grid>
        <Grid item xs={6} md={2.4}>
          <StatCard label="Credit available" value={sm.creditAvailable === null ? 'No limit' : inrShort(sm.creditAvailable)} hint={p.creditLimit ? `Limit ${inrShort(p.creditLimit)} · ${p.creditDays} days` : `${p.creditDays} days credit`} icon={<CreditScoreOutlinedIcon />}
            tone={sm.creditAvailable !== null && sm.creditAvailable < 0 ? 'bad' : sm.creditAvailable !== null && p.creditLimit && sm.creditAvailable < p.creditLimit * 0.1 ? 'warn' : 'default'} />
        </Grid>
        <Grid item xs={12} md={2.4}>
          <StatCard label={isCust ? 'Last receipt' : 'Last payment'} value={sm.lastPayment ? inrShort(sm.lastPayment.amount) : '—'} hint={sm.lastPayment ? `${fdate(sm.lastPayment.date)} · ${sm.lastPayment.mode}` : 'None yet'} icon={<PaymentsOutlinedIcon />} />
        </Grid>
      </Grid>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}><KV label="GSTIN">{p.gstin ? <span style={{ fontFamily: 'monospace' }}>{p.gstin}</span> : p.gstType}</KV></Grid>
          <Grid item xs={12} sm={6} md={3}><KV label="State">{p.stateCode ? `${STATES[p.stateCode] || ''} (${p.stateCode})${business?.stateCode && p.stateCode !== business.stateCode ? ' · IGST' : ''}` : ''}</KV></Grid>
          <Grid item xs={12} sm={6} md={3}><KV label="Mobile / Phone">{[p.mobile, p.phone].filter(Boolean).join(' / ')}</KV></Grid>
          <Grid item xs={12} sm={6} md={3}><KV label="Contact · Email">{[p.contactPerson, p.email].filter(Boolean).join(' · ')}</KV></Grid>
          <Grid item xs={12} md={6}><KV label="Address">{[p.address, p.city, p.pincode].filter(Boolean).join(', ')}</KV></Grid>
          {isCust && <Grid item xs={12} sm={6} md={3}><KV label="Drug licence">{[p.dl20b, p.dl21b].filter(Boolean).join(', ') || '—'}{p.dlExpiry && <Box sx={{ mt: 0.5 }}><DlChip expiry={p.dlExpiry} showOk /></Box>}</KV></Grid>}
          {isCust && <Grid item xs={12} sm={6} md={3}><KV label="Pricing">{`${RATE_LABEL[p.rateType] || p.rateType}${p.rateAdjustPct ? ` ${p.rateAdjustPct}%` : ''}${p.extraDiscountPct ? ` · TD ${p.extraDiscountPct}%` : ''}${p.cashDiscountPct ? ` · CD ${p.cashDiscountPct}%` : ''}`}</KV></Grid>}
          {isCust && <Grid item xs={12} sm={6} md={3}><KV label="Route · Area">{[refName(p.route), p.area].filter(Boolean).join(' · ')}</KV></Grid>}
          {isCust && <Grid item xs={12} sm={6} md={3}><KV label="Salesman">{refName(p.salesman)}</KV></Grid>}
          {!isCust && (p.bankAccountNo || p.ifsc) && <Grid item xs={12} sm={6} md={3}><KV label="Bank">{[p.bankAccountNo, p.ifsc].filter(Boolean).join(' · ')}</KV></Grid>}
          <Grid item xs={12} sm={6} md={3}><KV label={isCust ? 'Last bill' : 'Last purchase'}>{sm.lastBill ? `${sm.lastBill.number} · ${fdate(sm.lastBill.date)} · ${amt(sm.lastBill.grandTotal)}` : ''}</KV></Grid>
          {p.notes && <Grid item xs={12}><KV label="Notes">{p.notes}</KV></Grid>}
        </Grid>
      </Paper>

      <Paper sx={{ mb: 1.5 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" sx={{ px: 1 }}>
          <Tab label={`Open bills (${sm.openBills.length})`} />
          <Tab label={`Unadjusted credits (${creditRows.length})`} />
          <Tab label={isCust ? 'Recent bills' : 'Recent purchases'} />
          {isCust && <Tab label="Special rates" />}
        </Tabs>
      </Paper>

      {tab === 0 && (
        <DataTable columns={openCols} rows={sm.openBills} onRowClick={(b) => nav(billPath(b._id))} maxHeight="55vh"
          rowSx={(b) => (b.dueDate && age(b.dueDate) > 0 ? { bgcolor: '#fff8f0' } : undefined)} empty="No open bills — fully settled." />
      )}
      {tab === 1 && (
        <>
          {creditRows.length > 0 && isCust && can('receipts:create') && (
            <Alert severity="info" sx={{ mb: 1.5 }}>Adjust credit notes and on-account amounts against bills in the next Receipt or Sales bill.</Alert>
          )}
          <DataTable columns={creditCols} rows={creditRows} rowKey={(c) => `${c.kind}-${c._id}`} maxHeight="55vh" empty="No unadjusted credit notes, advances or pending cheques." />
        </>
      )}
      {tab === 2 && (
        <DataTable columns={recentCols} rows={recent?.data || []} loading={rLoading} onRowClick={(r) => nav(billPath(r._id))} maxHeight="55vh"
          rowSx={(r) => (r.status === 'cancelled' ? { opacity: 0.5 } : undefined)} empty={isCust ? 'No bills yet.' : 'No purchases yet.'} />
      )}
      {tab === 3 && isCust && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5, gap: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>Negotiated rates for {p.name} override the {RATE_LABEL[p.rateType]} rate type for these products.</Typography>
            {can('parties:edit') && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setSrEdit({})}>Add special rate</Button>}
          </Box>
          <DataTable columns={srCols} rows={srData?.data || []} loading={srLoading} maxHeight="55vh" empty="No special rates for this party." />
        </>
      )}

      {srEdit && (
        <SpecialRateDialog value={srEdit} fixedParty={{ _id: p._id, name: p.name }} onClose={() => setSrEdit(null)} onSaved={() => { setSrEdit(null); reloadSr(); }} />
      )}
    </>
  );
}
