import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  Grid, InputAdornment, LinearProgress, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import AddIcon from '@mui/icons-material/Add';
import ListAltIcon from '@mui/icons-material/ListAlt';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import dayjs from 'dayjs';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/PageHeader';
import { LedgerOption, LedgerPicker, PartyOption, PartyPicker } from '../../components/Pickers';
import { api, errMsg } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useHotkey } from '../../lib/hooks';
import { useDraft } from '../../lib/useDraft';
import { DraftBanner, DraftStatus } from '../../components/DraftBanner';
import { amt, drcr, fdate, inr, round2, today } from '../../lib/format';
import { printMoneyVoucher } from '../../print/print';
import {
  MODES, MoneyDoc, MoneyKind, modeLabel, moneyPath, moneyTitle, shareMoneyOnWhatsApp, sum, useUsers,
} from './accountsShared';

interface OpenBill { _id: string; number: string; supplierInvoiceNo?: string; date: string; dueDate?: string; grandTotal: number; balance: number }
interface OpenNote { _id: string; number: string; date: string; grandTotal: number; balance: number }
interface PartySummary {
  balance: number; mobile: string; creditLimit: number; creditDays: number;
  overdue: number; outstanding: number; pdc: { number: string; chequeNo: string; chequeDate: string; amount: number }[];
  onAccount: { number: string; date: string; onAccount: number }[]; isHold: boolean;
}

const n = (s: string) => Number(s) || 0;

// The entry as typed so far — auto-saved (see useDraft) so leaving the
// screen, a refresh or a power cut doesn't lose it.
interface MoneyDraft {
  date: string; party: PartyOption | null; mode: string; account: LedgerOption | null; amount: string; discount: string; tds: string;
  chequeNo: string; chequeDate: string; bankName: string; reference: string; collectedBy: string; narration: string;
  alloc: Record<string, string>; autoAlloc: boolean;
}
const draftLabel = (d: unknown) => {
  const x = d as MoneyDraft;
  return `${x.party?.name || 'no party yet'}${n(x.amount) > 0 ? ` · ₹${amt(n(x.amount))}` : ''}`;
};

// Keyed by kind so /receipts/new ↔ /payments/new never share state.
export default function MoneyEntry({ kind }: { kind: MoneyKind }) {
  return <MoneyEntryInner key={kind} kind={kind} />;
}

function MoneyEntryInner({ kind }: { kind: MoneyKind }) {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const { business, user, can } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const path = moneyPath(kind);
  const isReceipt = kind === 'receipt';
  const title = moneyTitle(kind);

  const [date, setDate] = useState(today());
  const [party, setParty] = useState<PartyOption | null>(null);
  const [mode, setMode] = useState('cash');
  const [account, setAccount] = useState<LedgerOption | null>(null);
  const [amount, setAmount] = useState('');
  const [discount, setDiscount] = useState('');
  const [tds, setTds] = useState('');
  const [chequeNo, setChequeNo] = useState('');
  const [chequeDate, setChequeDate] = useState(today());
  const [bankName, setBankName] = useState('');
  const [reference, setReference] = useState('');
  const [collectedBy, setCollectedBy] = useState(user?.role === 'salesman' ? user._id : '');
  const [narration, setNarration] = useState('');
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [autoAlloc, setAutoAlloc] = useState(true);
  const [bills, setBills] = useState<OpenBill[]>([]);
  const [notes, setNotes] = useState<OpenNote[]>([]);
  const [summary, setSummary] = useState<PartySummary | null>(null);
  const [loadingParty, setLoadingParty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<MoneyDoc | null>(null);
  const [touched, setTouched] = useState(false);

  const [cashLedger, setCashLedger] = useState<LedgerOption | null>(null);
  const [banks, setBanks] = useState<LedgerOption[]>([]);
  const users = useUsers();
  const salesmen = users.filter((u) => u.role === 'salesman' && u.isActive);
  const amountRef = useRef<HTMLInputElement>(null);
  // Auto-save: ready once the cash ledger and any ?party= are in; restored
  // when opened empty, offered when opened for a party.
  const [ledgersReady, setLedgersReady] = useState(false);
  const [prefillReady, setPrefillReady] = useState(!sp.get('party'));
  // Bill-wise adjustment from a restored draft, put back once that party's bills load.
  const restoreAlloc = useRef<{ party: string; alloc: Record<string, string>; autoAlloc: boolean } | null>(null);

  // Default cash ledger and bank list.
  useEffect(() => {
    api.get('/ledgers', { params: { group: 'cash' } }).then((r) => {
      const list = (r.data.data || []) as (LedgerOption & { systemKey?: string })[];
      const cash = list.find((l) => l.systemKey === 'CASH') || list[0] || null;
      setCashLedger(cash);
      setAccount((a) => a || cash);
    }).catch(() => {}).finally(() => setLedgersReady(true));
    api.get('/ledgers', { params: { group: 'bank' } }).then((r) => setBanks(r.data.data || [])).catch(() => {});
  }, []);

  // Mode drives the account: cash → cash ledger; others → bank (sole bank preselected).
  const changeMode = (m: string) => {
    setMode(m);
    if (m === 'cash') setAccount(cashLedger);
    else if (!account || account.group !== 'bank') setAccount(banks.length === 1 ? banks[0] : null);
    if (m === 'cheque' && !chequeDate) setChequeDate(date);
  };

  // ?party=ID preselect.
  useEffect(() => {
    const id = sp.get('party');
    if (!id) return;
    api.get(`/parties/${id}`).then((r) => {
      const p = r.data.data;
      setParty({ _id: p._id, name: p.name, city: p.city, mobile: p.mobile, balance: p.balance, creditLimit: p.creditLimit, creditDays: p.creditDays, gstin: p.gstin, group: p.group });
    }).catch((e) => enqueueSnackbar(errMsg(e), { variant: 'error' })).finally(() => setPrefillReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load open bills + party summary on party change.
  useEffect(() => {
    const keep = restoreAlloc.current && restoreAlloc.current.party === party?._id ? restoreAlloc.current : null;
    restoreAlloc.current = null;
    setAlloc({});
    setAutoAlloc(keep ? keep.autoAlloc : true);
    setBills([]);
    setNotes([]);
    setSummary(null);
    if (!party) return;
    let alive = true;
    setLoadingParty(true);
    Promise.all([
      api.get('/open-bills', { params: { party: party._id, kind } }),
      api.get(`/parties/${party._id}`),
    ]).then(([ob, pr]) => {
      if (!alive) return;
      setBills(ob.data.bills || []);
      setNotes(ob.data.notes || []);
      // Restored draft: the user's own adjustments, for bills still open.
      if (keep && !keep.autoAlloc) {
        const open = new Set((ob.data.bills || []).map((b: OpenBill) => b._id));
        setAlloc(Object.fromEntries(Object.entries(keep.alloc).filter(([k]) => open.has(k))));
      }
      const p = pr.data.data || {};
      const s = pr.data.summary || {};
      setSummary({
        balance: p.balance || 0, mobile: p.mobile || p.phone || '', creditLimit: p.creditLimit || 0, creditDays: p.creditDays || 0,
        overdue: s.overdue || 0, outstanding: s.outstanding || 0, pdc: s.pdc || [], onAccount: s.onAccount || [], isHold: !!p.isHold,
      });
    }).catch((e) => enqueueSnackbar(errMsg(e), { variant: 'error' }))
      .finally(() => alive && setLoadingParty(false));
    setTimeout(() => amountRef.current?.focus(), 50);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [party?._id, kind]);

  const totalCredit = round2(n(amount) + n(discount) + n(tds));
  const fifo = (total: number) => {
    const out: Record<string, string> = {};
    let left = total;
    for (const b of bills) {
      if (left <= 0.009) break;
      const take = round2(Math.min(left, b.balance));
      out[b._id] = String(take);
      left = round2(left - take);
    }
    return out;
  };

  // While the user hasn't edited the grid, keep it auto-filled oldest-first.
  useEffect(() => {
    if (autoAlloc) setAlloc(fifo(totalCredit));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalCredit, bills, autoAlloc]);

  const allocated = round2(sum(Object.values(alloc).map(n)));
  const onAccount = round2(totalCredit - allocated);
  const overAllocated = allocated > totalCredit + 0.009;
  const rowErr = (b: OpenBill) => n(alloc[b._id] || '') > b.balance + 0.009;
  const anyRowErr = bills.some(rowErr);
  const isPdc = mode === 'cheque' && !!chequeDate && dayjs(chequeDate).isAfter(dayjs(date), 'day');
  const todayD = dayjs().startOf('day');
  const notesTotal = sum(notes.map((x) => x.balance));

  const setRow = (id: string, v: string) => { setAutoAlloc(false); setAlloc((a) => ({ ...a, [id]: v })); };
  const fillRow = (b: OpenBill) => {
    const others = round2(allocated - n(alloc[b._id] || ''));
    const room = Math.max(0, round2(totalCredit - others));
    setRow(b._id, String(round2(Math.min(b.balance, room || b.balance))));
  };

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!party) e.party = 'Choose the party';
    if (!(n(amount) > 0)) e.amount = 'Enter the amount';
    if (n(discount) < 0) e.discount = 'Cannot be negative';
    if (n(tds) < 0) e.tds = 'Cannot be negative';
    if (mode !== 'cash' && !account) e.account = 'Choose the bank account';
    if (mode === 'cheque' && !chequeNo.trim()) e.chequeNo = 'Cheque number is required';
    if (mode === 'cheque' && !chequeDate) e.chequeDate = 'Cheque date is required';
    if (overAllocated) e.alloc = `Adjusted ₹${amt(allocated)} is more than the entry total ₹${amt(totalCredit)}.`;
    if (anyRowErr) e.alloc = 'An adjustment is more than the bill balance.';
    return e;
  }, [party, amount, discount, tds, mode, account, chequeNo, chequeDate, overAllocated, allocated, totalCredit, anyRowErr]);
  const valid = Object.keys(errors).length === 0;

  const submit = async () => {
    setTouched(true);
    if (saving || saved) return;
    if (!valid) { enqueueSnackbar(Object.values(errors)[0], { variant: 'warning' }); return; }
    setSaving(true);
    try {
      const body = {
        date, party: party!._id, mode, account: account?._id || cashLedger?._id,
        amount: n(amount), discount: n(discount), tds: n(tds),
        chequeNo: mode === 'cheque' ? chequeNo.trim() : '',
        chequeDate: mode === 'cheque' ? chequeDate : undefined,
        bankName: mode === 'cheque' ? bankName.trim() : '',
        reference: reference.trim(),
        collectedBy: isReceipt && collectedBy ? collectedBy : undefined,
        narration: narration.trim(),
        allocations: bills.filter((b) => n(alloc[b._id] || '') > 0).map((b) => ({ bill: b._id, amount: round2(n(alloc[b._id])) })),
      };
      const r = await api.post(`/${path}`, body);
      const doc = r.data.data as MoneyDoc;
      setSaved(doc);
      draft.clear();
      enqueueSnackbar(`${title} ${doc.number} saved — ${inr(doc.amount)}`, { variant: 'success' });
    } catch (e) {
      enqueueSnackbar(errMsg(e), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  useHotkey('f2', () => submit());
  useHotkey('ctrl+s', () => submit());

  const resetForm = () => {
    setSaved(null);
    setParty(null);
    setAmount(''); setDiscount(''); setTds('');
    setChequeNo(''); setBankName(''); setReference(''); setNarration('');
    setChequeDate(date);
    setTouched(false);
    if (sp.get('party')) nav(`/${path}/new`, { replace: true });
  };

  // ---- auto-save ----
  const applyDraft = (d: MoneyDraft) => {
    setDate(d.date); setMode(d.mode); setAccount(d.account); setAmount(d.amount); setDiscount(d.discount); setTds(d.tds);
    setChequeNo(d.chequeNo); setChequeDate(d.chequeDate); setBankName(d.bankName); setReference(d.reference);
    setCollectedBy(d.collectedBy); setNarration(d.narration);
    if (d.party?._id && d.party._id === party?._id) {
      // Same party already on screen — its bills are loaded, no reset coming.
      setAutoAlloc(d.autoAlloc);
      if (!d.autoAlloc) setAlloc(Object.fromEntries(Object.entries(d.alloc).filter(([k]) => bills.some((b) => b._id === k))));
    } else {
      // Party change reloads bills and resets the grid — keep the user's allocations through it.
      restoreAlloc.current = d.party ? { party: d.party._id, alloc: d.alloc, autoAlloc: d.autoAlloc } : null;
      setParty(d.party);
    }
  };
  const draft = useDraft<MoneyDraft>({
    key: isReceipt ? 'receipt:new' : 'payment:new',
    ready: ledgersReady && prefillReady,
    autoRestore: !sp.get('party'),
    value: party || amount || discount || tds || chequeNo || reference || narration
      ? { date, party, mode, account, amount, discount, tds, chequeNo, chequeDate, bankName, reference, collectedBy, narration, alloc, autoAlloc }
      : null,
    apply: applyDraft,
    paused: !!saved,
  });
  const discardDraft = () => { draft.clear(); resetForm(); };

  if (!can(`${path}:create`)) {
    return <><PageHeader title={`New ${title}`} /><Alert severity="warning">You don't have permission to create {path}.</Alert></>;
  }

  const err = (k: string) => (touched ? errors[k] : undefined);

  // ---------- allocation grid ----------
  const billLabel = (b: OpenBill) => (
    <>
      <Typography fontWeight={600} fontSize={13}>{b.number}</Typography>
      {b.supplierInvoiceNo && <Typography fontSize={11} color="text.secondary">Inv {b.supplierInvoiceNo}</Typography>}
    </>
  );
  const overdueDays = (b: OpenBill) => (b.dueDate ? todayD.diff(dayjs(b.dueDate).startOf('day'), 'day') : 0);
  const adjustInput = (b: OpenBill) => (
    <TextField
      size="small" type="number" value={alloc[b._id] || ''} placeholder="0.00"
      onChange={(e) => setRow(b._id, e.target.value)}
      onDoubleClick={() => fillRow(b)}
      error={rowErr(b)}
      inputProps={{ min: 0, step: '0.01', style: { textAlign: 'right' } }}
      sx={{ width: { xs: '100%', sm: 130 } }}
    />
  );

  const grid = phone ? (
    <Stack spacing={1}>
      {bills.map((b) => {
        const od = overdueDays(b);
        return (
          <Card key={b._id} variant="outlined" sx={{ borderColor: n(alloc[b._id] || '') > 0 ? 'primary.main' : undefined }}>
            <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                <Box>{billLabel(b)}<Typography fontSize={12} color="text.secondary">{fdate(b.date)}{b.dueDate ? ` · due ${fdate(b.dueDate)}` : ''}</Typography></Box>
                <Box textAlign="right">
                  <Typography fontWeight={700}>{amt(b.balance)}</Typography>
                  <Typography fontSize={11} color="text.secondary">of {amt(b.grandTotal)}</Typography>
                  {od > 0 && <Chip label={`${od}d overdue`} color="error" size="small" sx={{ height: 18, fontSize: 10 }} />}
                </Box>
              </Box>
              <Box sx={{ display: 'flex', gap: 1, mt: 1, alignItems: 'center' }}>
                {adjustInput(b)}
                <Button size="small" onClick={() => fillRow(b)}>Full</Button>
              </Box>
            </CardContent>
          </Card>
        );
      })}
    </Stack>
  ) : (
    <TableContainer sx={{ maxHeight: 420 }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell>Bill</TableCell>
            <TableCell>Date</TableCell>
            <TableCell>Due</TableCell>
            <TableCell align="right">Overdue</TableCell>
            <TableCell align="right">Bill amount</TableCell>
            <TableCell align="right">Balance</TableCell>
            <TableCell align="right" sx={{ width: 150 }}>Adjust</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {bills.map((b) => {
            const od = overdueDays(b);
            return (
              <TableRow key={b._id} hover selected={n(alloc[b._id] || '') > 0}>
                <TableCell>{billLabel(b)}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{fdate(b.date)}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{fdate(b.dueDate)}</TableCell>
                <TableCell align="right">{od > 0 ? <Typography component="span" color="error.main" fontSize={13} fontWeight={600}>{od} d</Typography> : ''}</TableCell>
                <TableCell align="right">{amt(b.grandTotal)}</TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => fillRow(b)} sx={{ minWidth: 0, fontWeight: 700 }} title="Adjust in full">{amt(b.balance)}</Button>
                </TableCell>
                <TableCell align="right">{adjustInput(b)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );

  const fieldGrid = (
    <Grid container spacing={2}>
      <Grid item xs={12} sm={4} md={3}>
        <TextField type="date" label="Date" value={date} onChange={(e) => setDate(e.target.value)} fullWidth InputLabelProps={{ shrink: true }} />
      </Grid>
      <Grid item xs={12} sm={8} md={9}>
        <PartyPicker type={isReceipt ? 'customer' : 'supplier'} value={party} onChange={setParty} autoFocus={!sp.get('party')} required
          error={!!err('party')} helperText={err('party')} />
      </Grid>
      <Grid item xs={12} sm={4} md={3}>
        <TextField select label="Mode" value={mode} onChange={(e) => changeMode(e.target.value)} fullWidth>
          {MODES.map((m) => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
        </TextField>
      </Grid>
      <Grid item xs={12} sm={8} md={5}>
        <LedgerPicker key={mode === 'cash' ? 'cash' : 'bank'} groups={mode === 'cash' ? 'cash' : 'bank'} value={account} onChange={setAccount}
          label={mode === 'cash' ? 'Cash account' : isReceipt ? 'Deposit to bank' : 'Paid from bank'}
          error={!!err('account')} helperText={err('account')} />
      </Grid>
      <Grid item xs={12} sm={4} md={4}>
        <TextField label="Amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} fullWidth required
          inputRef={amountRef} error={!!err('amount')} helperText={err('amount')}
          InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment>, sx: { fontWeight: 700, fontSize: 18 } }}
          inputProps={{ min: 0, step: '0.01', inputMode: 'decimal' }} />
      </Grid>
      <Grid item xs={6} sm={4} md={3}>
        <TextField label="Settlement discount" type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} fullWidth
          error={!!err('discount')} helperText={err('discount') || (isReceipt ? 'Discount allowed (CD)' : 'Discount received')}
          InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} inputProps={{ min: 0, step: '0.01', inputMode: 'decimal' }} />
      </Grid>
      <Grid item xs={6} sm={4} md={3}>
        <TextField label="TDS" type="number" value={tds} onChange={(e) => setTds(e.target.value)} fullWidth
          error={!!err('tds')} helperText={err('tds') || (isReceipt ? 'TDS deducted by buyer u/s 194Q' : 'TDS deducted by us u/s 194Q')}
          InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} inputProps={{ min: 0, step: '0.01', inputMode: 'decimal' }} />
      </Grid>
      {mode === 'cheque' && (
        <>
          <Grid item xs={12} sm={4} md={2}>
            <TextField label="Cheque no" value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} fullWidth required
              error={!!err('chequeNo')} helperText={err('chequeNo')} inputProps={{ inputMode: 'numeric' }} />
          </Grid>
          <Grid item xs={12} sm={4} md={2}>
            <TextField type="date" label="Cheque date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} fullWidth required
              InputLabelProps={{ shrink: true }} error={!!err('chequeDate')} helperText={err('chequeDate')} />
          </Grid>
          <Grid item xs={12} sm={4} md={2}>
            <TextField label={isReceipt ? "Party's bank" : 'Drawn on'} value={bankName} onChange={(e) => setBankName(e.target.value)} fullWidth />
          </Grid>
          {isPdc && (
            <Grid item xs={12}>
              <Alert severity="warning" sx={{ py: 0 }}>Post-dated cheque — will sit in PDC until cleared (due {fdate(chequeDate)}, {dayjs(chequeDate).diff(dayjs(date), 'day')} days).</Alert>
            </Grid>
          )}
        </>
      )}
      <Grid item xs={12} sm={6} md={mode === 'cheque' ? 3 : 6}>
        <TextField label={mode === 'cheque' ? 'Reference' : 'Reference / UTR'} value={reference} onChange={(e) => setReference(e.target.value)} fullWidth />
      </Grid>
      {isReceipt && (
        <Grid item xs={12} sm={6} md={3}>
          <TextField select label="Collected by" value={collectedBy} onChange={(e) => setCollectedBy(e.target.value)} fullWidth
            disabled={user?.role === 'salesman'}>
            <MenuItem value="">— Office —</MenuItem>
            {salesmen.map((u) => <MenuItem key={u._id} value={u._id}>{u.name}</MenuItem>)}
            {user?.role === 'salesman' && !salesmen.some((u) => u._id === user._id) && <MenuItem value={user._id}>{user.name}</MenuItem>}
          </TextField>
        </Grid>
      )}
      <Grid item xs={12}>
        <TextField label="Narration" value={narration} onChange={(e) => setNarration(e.target.value)} fullWidth multiline maxRows={3} />
      </Grid>
    </Grid>
  );

  return (
    <Box sx={{ pb: { xs: 10, sm: 0 } }}>
      <PageHeader
        help={['receipt', 'payment', 'onaccount', 'pdc']}
        title={`New ${title}`}
        subtitle={isReceipt ? 'Money received from a customer, adjusted bill-wise' : 'Money paid to a supplier, adjusted bill-wise'}
        crumbs={[{ label: 'Accounts' }, { label: isReceipt ? 'Receipts' : 'Payments', to: `/${path}` }, { label: 'New' }]}
        actions={
          <>
            <DraftStatus draft={draft} />
            {!phone && (
              <Button variant="contained" startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />} onClick={submit} disabled={saving || !!saved}>
                Save (F2)
              </Button>
            )}
          </>
        }
      />

      <DraftBanner draft={draft} label={draftLabel} onDiscard={discardDraft} onOpen={() => { if (sp.toString()) nav(`/${path}/new`, { replace: true }); }} />

      <Grid container spacing={2}>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 2 }}>{fieldGrid}</Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <PartyPanel party={party} summary={summary} loading={loadingParty} notes={notes} notesTotal={notesTotal} isReceipt={isReceipt} />
          <Paper sx={{ p: 2, mt: 2 }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>Entry total</Typography>
            <Row label="Amount" value={amt(n(amount))} />
            {n(discount) > 0 && <Row label="+ Discount" value={amt(n(discount))} />}
            {n(tds) > 0 && <Row label="+ TDS" value={amt(n(tds))} />}
            <Divider sx={{ my: 0.75 }} />
            <Row label={`Party ${isReceipt ? 'credited' : 'debited'}`} value={inr(totalCredit)} strong />
            <Row label="Adjusted against bills" value={amt(allocated)} color={overAllocated ? 'error.main' : undefined} />
            <Row label="On account (unadjusted)" value={amt(Math.max(0, onAccount))} color={onAccount > 0.009 ? 'warning.main' : undefined} />
            {summary && n(amount) > 0 && (
              <>
                <Divider sx={{ my: 0.75 }} />
                <Row label="Balance after this entry" value={drcr(round2(summary.balance + (isReceipt ? -totalCredit : totalCredit)))} />
              </>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12}>
          <Paper sx={{ p: { xs: 1.5, sm: 2 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
              <Box sx={{ flex: 1, minWidth: 200 }}>
                <Typography fontWeight={700}>Bill-wise adjustment</Typography>
                <Typography variant="caption" color="text.secondary">
                  {party
                    ? bills.length
                      ? `${bills.length} open bill(s) · ₹${amt(sum(bills.map((b) => b.balance)))} outstanding${autoAlloc ? ' · auto-filled oldest first, edit to change' : ''}`
                      : 'No open bills — the full amount goes on account.'
                    : 'Choose a party to see open bills.'}
                </Typography>
              </Box>
              <Button size="small" variant="outlined" startIcon={<AutoFixHighIcon />} disabled={!bills.length || !(totalCredit > 0)}
                onClick={() => { setAutoAlloc(false); setAlloc(fifo(totalCredit)); }}>Auto (oldest first)</Button>
              <Button size="small" startIcon={<ClearAllIcon />} disabled={!allocated} onClick={() => { setAutoAlloc(false); setAlloc({}); }}>Clear</Button>
            </Box>
            {loadingParty && <LinearProgress sx={{ mb: 1 }} />}
            {touched && errors.alloc && <Alert severity="error" sx={{ mb: 1 }}>{errors.alloc}</Alert>}
            {bills.length > 0 && grid}
            {bills.length > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 3, mt: 1.5, flexWrap: 'wrap' }}>
                <Typography fontSize={13}>Allocated: <b>{amt(allocated)}</b></Typography>
                <Typography fontSize={13} color={onAccount < -0.009 ? 'error.main' : onAccount > 0.009 ? 'warning.main' : 'success.main'}>
                  {onAccount < -0.009 ? `Over by ${amt(-onAccount)}` : `Unallocated (on account): ${amt(onAccount)}`}
                </Typography>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>

      {phone && (
        <Paper elevation={6} sx={{ position: 'fixed', left: 0, right: 0, bottom: 0, p: 1.5, zIndex: 10, display: 'flex', gap: 1, alignItems: 'center', borderRadius: 0 }}>
          <Box sx={{ flex: 1 }}>
            <Typography fontSize={11} color="text.secondary">{party?.name || 'No party'}</Typography>
            <Typography fontWeight={700}>{inr(n(amount))}</Typography>
          </Box>
          <Button variant="contained" size="large" startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />} onClick={submit} disabled={saving || !!saved}>Save</Button>
        </Paper>
      )}

      <Dialog open={!!saved} maxWidth="xs" fullWidth onClose={() => undefined}>
        {saved && (
          <>
            <DialogTitle sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <CheckCircleIcon color="success" /> {title} saved
            </DialogTitle>
            <DialogContent>
              <Typography fontWeight={700} fontSize={22}>{inr(saved.amount)}</Typography>
              <Typography>{saved.number} · {fdate(saved.date)}</Typography>
              <Typography color="text.secondary" fontSize={14}>{isReceipt ? 'From' : 'To'} {saved.partyName} · {modeLabel(saved.mode)}</Typography>
              {saved.allocations?.length > 0 && <Typography fontSize={13} mt={1}>Adjusted: {saved.allocations.map((a) => a.billNo).join(', ')}</Typography>}
              {saved.onAccount > 0.009 && <Typography fontSize={13}>On account: {inr(saved.onAccount)}</Typography>}
              {saved.isPdc && <Alert severity="info" sx={{ mt: 1 }}>Post-dated cheque added to the PDC register.</Alert>}
            </DialogContent>
            <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
              <Button startIcon={<ListAltIcon />} onClick={() => nav(`/${path}`)}>List</Button>
              <Button startIcon={<PrintOutlinedIcon />} onClick={() => business && printMoneyVoucher(saved, business)}>Print</Button>
              <Button color="success" startIcon={<WhatsAppIcon />} onClick={() => shareMoneyOnWhatsApp(saved, business, (m) => enqueueSnackbar(m, { variant: 'warning' }))}>WhatsApp</Button>
              <Button variant="contained" startIcon={<AddIcon />} onClick={resetForm} autoFocus>New entry</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}

const Row: React.FC<{ label: string; value: React.ReactNode; strong?: boolean; color?: string }> = ({ label, value, strong, color }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.25 }}>
    <Typography fontSize={13} color="text.secondary">{label}</Typography>
    <Typography fontSize={strong ? 16 : 13} fontWeight={strong ? 700 : 500} color={color}>{value}</Typography>
  </Box>
);

const PartyPanel: React.FC<{
  party: PartyOption | null; summary: PartySummary | null; loading: boolean; notes: OpenNote[]; notesTotal: number; isReceipt: boolean;
}> = ({ party, summary, loading, notes, notesTotal, isReceipt }) => {
  if (!party) {
    return (
      <Paper sx={{ p: 2 }}>
        <Typography color="text.secondary" fontSize={13}>Party balance, overdue and unadjusted {isReceipt ? 'credit notes' : 'debit notes'} appear here.</Typography>
      </Paper>
    );
  }
  const onAcc = summary ? sum(summary.onAccount.map((x) => x.onAccount)) : 0;
  return (
    <Paper sx={{ p: 2 }}>
      <Typography fontWeight={700} noWrap>{party.name}</Typography>
      <Typography fontSize={12} color="text.secondary" noWrap>{[party.city, summary?.mobile].filter(Boolean).join(' · ')}</Typography>
      {loading && !summary && <LinearProgress sx={{ my: 1 }} />}
      {summary && (
        <Box mt={1}>
          {summary.isHold && <Alert severity="error" sx={{ mb: 1, py: 0 }}>Party is on HOLD</Alert>}
          <Row label="Ledger balance" value={drcr(summary.balance)} strong />
          <Row label="Bills outstanding" value={amt(summary.outstanding)} />
          <Row label="Overdue" value={amt(summary.overdue)} color={summary.overdue > 0 ? 'error.main' : undefined} />
          {summary.creditLimit > 0 && <Row label="Credit limit" value={`${amt(summary.creditLimit)} · ${summary.creditDays}d`} />}
          {onAcc > 0.009 && <Row label="Earlier on-account" value={amt(onAcc)} color="warning.main" />}
          {summary.pdc.length > 0 && (
            <Box mt={1}>
              <Typography fontSize={12} color="text.secondary">PDC pending</Typography>
              {summary.pdc.map((p) => (
                <Typography key={p.number} fontSize={12}>Chq {p.chequeNo} · {fdate(p.chequeDate)} · <b>{amt(p.amount)}</b></Typography>
              ))}
            </Box>
          )}
          {notes.length > 0 && (
            <Box mt={1}>
              <Typography fontSize={12} color="text.secondary">Unadjusted {isReceipt ? 'credit notes' : 'debit notes'} ({amt(notesTotal)})</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                {notes.map((x) => <Chip key={x._id} size="small" variant="outlined" label={`${x.number} · ${amt(x.balance)}`} sx={{ height: 20, fontSize: 11 }} />)}
              </Box>
              <Typography fontSize={11} color="text.secondary" mt={0.5}>Adjust these against bills from the {isReceipt ? 'sales' : 'purchase'} bill screen.</Typography>
            </Box>
          )}
        </Box>
      )}
    </Paper>
  );
};
