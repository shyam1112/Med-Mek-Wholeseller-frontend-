import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Grid, IconButton, InputAdornment,
  MenuItem, Stack, Table, TableBody, TableCell, TableFooter, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup,
  Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import BlockIcon from '@mui/icons-material/Block';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import BalanceIcon from '@mui/icons-material/Balance';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/PageHeader';
import { DataTable, Col } from '../../components/DataTable';
import { DateRange, FilterBar, SearchBox } from '../../components/Filters';
import { LedgerOption, LedgerPicker } from '../../components/Pickers';
import { StatusChip } from '../../components/StatusChip';
import { useConfirm } from '../../components/Dialogs';
import { useDebounced, useFetch, useHotkey } from '../../lib/hooks';
import { amt, fdate, fdatetime, inr, monthStart, round2, today } from '../../lib/format';
import { exportExcel } from '../../lib/excel';
import { printTable } from '../../print/print';
import { api, errMsg } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { KindChip, sum } from './accountsShared';

type JKind = 'journal' | 'contra' | 'expense';
interface JLine { ledger: string; ledgerName: string; debit: number; credit: number }
interface JournalDoc {
  _id: string; kind: JKind; number: string; date: string; lines: JLine[]; total: number; status: 'active' | 'cancelled';
  narration: string; createdAt?: string;
}
interface ListResp { data: JournalDoc[]; pagination: { total: number }; totals: { total: number; count: number } }

const KIND_LABEL: Record<JKind, string> = { journal: 'Journal', contra: 'Contra', expense: 'Expense' };
const KIND_COLOR: Record<JKind, 'primary' | 'info' | 'warning'> = { journal: 'primary', contra: 'info', expense: 'warning' };
const KIND_HELP: Record<JKind, string> = {
  expense: 'Rent, salary, electricity, freight, staff welfare… paid from cash or bank.',
  contra: 'Cash deposited to bank, cash withdrawn, or bank-to-bank transfer.',
  journal: 'Adjustments: provisions, depreciation, party-to-party transfer, write-offs, opening entries.',
};

const particulars = (j: JournalDoc) => {
  const dr = j.lines.filter((l) => l.debit > 0).map((l) => l.ledgerName);
  const cr = j.lines.filter((l) => l.credit > 0).map((l) => l.ledgerName);
  return { dr: dr.join(', '), cr: cr.join(', ') };
};

export default function Journals() {
  const { can, business } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
  const [view, setView] = useState<JournalDoc | null>(null);
  const [newKind, setNewKind] = useState<JKind | null>(null);
  const q = useDebounced(search);
  const params = { from, to, kind, status, search: q, page: page + 1, limit };
  const { data, loading, reload } = useFetch<ListResp>('/journals', params);
  const rows = data?.data || [];
  const canCreate = can('journals:create');

  useHotkey('alt+n', () => { if (canCreate) setNewKind('expense'); });

  const columns: Col<JournalDoc>[] = [
    { key: 'number', label: 'No.', nowrap: true, render: (r) => <Typography fontWeight={600} fontSize={13}>{r.number}</Typography> },
    { key: 'date', label: 'Date', nowrap: true, render: (r) => fdate(r.date) },
    { key: 'kind', label: 'Type', render: (r) => <KindChip label={KIND_LABEL[r.kind]} color={KIND_COLOR[r.kind]} /> },
    {
      key: 'particulars', label: 'Particulars',
      render: (r) => {
        const p = particulars(r);
        return (
          <Box sx={{ maxWidth: 380 }}>
            <Typography fontSize={13} noWrap><Typography component="span" fontSize={11} color="text.secondary">Dr </Typography>{p.dr}</Typography>
            <Typography fontSize={13} noWrap><Typography component="span" fontSize={11} color="text.secondary">Cr </Typography>{p.cr}</Typography>
          </Box>
        );
      },
    },
    { key: 'narration', label: 'Narration', render: (r) => <Typography fontSize={12} color="text.secondary" noWrap sx={{ maxWidth: 260 }}>{r.narration}</Typography> },
    { key: 'total', label: 'Amount', align: 'right', nowrap: true, render: (r) => <b>{amt(r.total)}</b>, footer: amt(data?.totals?.total) },
    { key: 'status', label: 'Status', render: (r) => <StatusChip status={r.status} /> },
  ];

  const exportAll = async () => {
    try {
      const r = await api.get('/journals', { params: Object.fromEntries(Object.entries({ ...params, page: 1, limit: 500 }).filter(([, v]) => v !== '')) });
      const list = r.data.data as JournalDoc[];
      const flat = list.flatMap((j) => j.lines.map((l) => ({ ...l, number: j.number, date: j.date, kind: j.kind, narration: j.narration, status: j.status })));
      exportExcel(`journals-${from}-to-${to}`, [{
        name: 'Journals',
        rows: flat,
        columns: [
          { key: 'number', label: 'No.' }, { key: 'date', label: 'Date', value: (x) => fdate(x.date) },
          { key: 'kind', label: 'Type', value: (x) => KIND_LABEL[x.kind as JKind] }, { key: 'ledgerName', label: 'Ledger' },
          { key: 'debit', label: 'Debit' }, { key: 'credit', label: 'Credit' }, { key: 'narration', label: 'Narration' }, { key: 'status', label: 'Status' },
        ],
      }]);
    } catch (e) {
      enqueueSnackbar(errMsg(e), { variant: 'error' });
    }
  };

  return (
    <>
      <PageHeader
        title="Journal / Expenses"
        subtitle={data ? `${data.totals?.count || 0} vouchers · ₹${amt(data.totals?.total)}` : 'Expenses, contra and journal vouchers'}
        crumbs={[{ label: 'Accounts' }]}
        actions={
          <>
            <Button variant="outlined" startIcon={<FileDownloadOutlinedIcon />} onClick={exportAll}>Excel</Button>
            {canCreate && (
              <>
                <Button variant="outlined" onClick={() => setNewKind('contra')}>Contra</Button>
                <Button variant="outlined" onClick={() => setNewKind('journal')}>Journal</Button>
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNewKind('expense')}>New Expense (Alt+N)</Button>
              </>
            )}
          </>
        }
      />
      <FilterBar>
        <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(0); }} placeholder="Voucher no" />
        <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); setPage(0); }} />
        <TextField select label="Type" value={kind} onChange={(e) => { setKind(e.target.value); setPage(0); }} sx={{ width: 130 }}>
          <MenuItem value="">All</MenuItem>
          <MenuItem value="expense">Expense</MenuItem>
          <MenuItem value="contra">Contra</MenuItem>
          <MenuItem value="journal">Journal</MenuItem>
        </TextField>
        <TextField select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} sx={{ width: 120 }}>
          <MenuItem value="">All</MenuItem>
          <MenuItem value="active">Active</MenuItem>
          <MenuItem value="cancelled">Cancelled</MenuItem>
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
        onRowClick={setView}
        rowSx={(r) => (r.status === 'cancelled' ? { opacity: 0.5 } : undefined)}
        empty="No journal vouchers in this period."
      />
      <JournalView doc={view} onClose={() => setView(null)} onChanged={reload} business={business} />
      {newKind && (
        <JournalEntryDialog
          initialKind={newKind}
          onClose={() => setNewKind(null)}
          onSaved={(d) => { reload(); setNewKind(null); setView(d); }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
function JournalView({ doc, onClose, onChanged, business }: { doc: JournalDoc | null; onClose: () => void; onChanged: () => void; business: ReturnType<typeof useAuth>['business'] }) {
  const { can } = useAuth();
  const confirm = useConfirm();
  const { enqueueSnackbar } = useSnackbar();
  const nav = useNavigate();
  const [d, setD] = useState<JournalDoc | null>(doc);
  useEffect(() => setD(doc), [doc]);
  if (!doc || !d) return null;

  const cancel = async () => {
    const { ok } = await confirm({
      title: `Cancel ${d.number}?`, message: 'The ledger postings for this voucher are removed. The number is kept as cancelled.',
      prompt: 'Reason', promptRequired: true, danger: true, confirmText: 'Cancel voucher',
    });
    if (!ok) return;
    try {
      const r = await api.post(`/journals/${d._id}/cancel`, {});
      setD(r.data.data);
      onChanged();
      enqueueSnackbar(`${d.number} cancelled.`, { variant: 'success' });
    } catch (e) {
      enqueueSnackbar(errMsg(e), { variant: 'error' });
    }
  };

  const print = () => {
    if (!business) return;
    printTable(
      `${KIND_LABEL[d.kind]} Voucher ${d.number}${d.status === 'cancelled' ? ' (CANCELLED)' : ''}`, business,
      `Date ${fdate(d.date)}${d.narration ? ` · ${d.narration}` : ''}`,
      ['Ledger', 'Debit', 'Credit'],
      d.lines.map((l) => [l.ledgerName, l.debit ? amt(l.debit) : '', l.credit ? amt(l.credit) : '']),
      ['Total', amt(sum(d.lines.map((l) => l.debit))), amt(sum(d.lines.map((l) => l.credit)))], [1, 2],
    );
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6">{KIND_LABEL[d.kind]} {d.number}</Typography>
          <Typography variant="body2" color="text.secondary">{fdate(d.date)}</Typography>
        </Box>
        <StatusChip status={d.status} />
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Table size="small">
          <TableHead><TableRow><TableCell>Ledger</TableCell><TableCell align="right">Debit</TableCell><TableCell align="right">Credit</TableCell></TableRow></TableHead>
          <TableBody>
            {d.lines.map((l, i) => (
              <TableRow key={i} hover sx={{ cursor: 'pointer' }} onClick={() => nav(`/ledger-statement?ledger=${l.ledger}`)}>
                <TableCell>{l.ledgerName}</TableCell>
                <TableCell align="right">{l.debit ? amt(l.debit) : ''}</TableCell>
                <TableCell align="right">{l.credit ? amt(l.credit) : ''}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow sx={{ '& td': { fontWeight: 700, color: 'text.primary' } }}>
              <TableCell>Total</TableCell>
              <TableCell align="right">{amt(sum(d.lines.map((l) => l.debit)))}</TableCell>
              <TableCell align="right">{amt(sum(d.lines.map((l) => l.credit)))}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
        {d.narration && <Typography mt={2} fontSize={14}><b>Narration:</b> {d.narration}</Typography>}
        {d.createdAt && <Typography mt={1} fontSize={11} color="text.secondary">Entered {fdatetime(d.createdAt)}</Typography>}
      </DialogContent>
      <DialogActions>
        {d.status === 'active' && can('journals:cancel') && <Button color="error" startIcon={<BlockIcon />} onClick={cancel}>Cancel voucher</Button>}
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<PrintOutlinedIcon />} onClick={print}>Print</Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
interface GridLine { key: number; ledger: LedgerOption | null; debit: string; credit: string }
let lineKey = 1;
const blank = (): GridLine => ({ key: lineKey++, ledger: null, debit: '', credit: '' });
const num = (s: string) => Number(s) || 0;

function JournalEntryDialog({ initialKind, onClose, onSaved }: { initialKind: JKind; onClose: () => void; onSaved: (d: JournalDoc) => void }) {
  const { enqueueSnackbar } = useSnackbar();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const [kind, setKind] = useState<JKind>(initialKind);
  const [date, setDate] = useState(today());
  const [narration, setNarration] = useState('');
  const [saving, setSaving] = useState(false);
  // expense quick form
  const [expLedger, setExpLedger] = useState<LedgerOption | null>(null);
  const [paidFrom, setPaidFrom] = useState<LedgerOption | null>(null);
  const [expAmount, setExpAmount] = useState('');
  // grid
  const [lines, setLines] = useState<GridLine[]>([blank(), blank()]);

  // Default "paid from" = cash in hand.
  useEffect(() => {
    api.get('/ledgers', { params: { group: 'cash' } }).then((r) => {
      const list = (r.data.data || []) as (LedgerOption & { systemKey?: string })[];
      setPaidFrom((p) => p || list.find((l) => l.systemKey === 'CASH') || list[0] || null);
    }).catch(() => {});
  }, []);

  const dr = round2(sum(lines.map((l) => num(l.debit))));
  const cr = round2(sum(lines.map((l) => num(l.credit))));
  const diff = round2(dr - cr);
  const filled = lines.filter((l) => l.ledger && (num(l.debit) > 0 || num(l.credit) > 0));

  const setLine = (key: number, patch: Partial<GridLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = () => {
    const nl = blank();
    // Pre-fill the balancing amount on the opposite side.
    if (diff > 0) nl.credit = String(diff);
    else if (diff < 0) nl.debit = String(-diff);
    setLines((ls) => [...ls, nl]);
  };
  const removeLine = (key: number) => setLines((ls) => (ls.length > 2 ? ls.filter((l) => l.key !== key) : ls.map((l) => (l.key === key ? { ...blank(), key } : l))));

  const gridError = (() => {
    if (filled.length < 2) return 'Enter at least one debit and one credit line.';
    if (lines.some((l) => num(l.debit) > 0 && num(l.credit) > 0)) return 'A line can be either debit or credit, not both.';
    if (lines.some((l) => !l.ledger && (num(l.debit) > 0 || num(l.credit) > 0))) return 'Choose a ledger on every line with an amount.';
    if (Math.abs(diff) > 0.009) return `Difference of ₹${amt(Math.abs(diff))} — debit and credit must be equal.`;
    return '';
  })();
  const expError = !expLedger ? 'Choose the expense ledger.' : !paidFrom ? 'Choose cash / bank.' : !(num(expAmount) > 0) ? 'Enter the amount.' : '';
  const error = kind === 'expense' ? expError : gridError;

  const submit = async () => {
    if (saving) return;
    if (error) { enqueueSnackbar(error, { variant: 'warning' }); return; }
    const body = kind === 'expense'
      ? { kind, date, narration, lines: [{ ledger: expLedger!._id, debit: num(expAmount), credit: 0 }, { ledger: paidFrom!._id, debit: 0, credit: num(expAmount) }] }
      : { kind, date, narration, lines: filled.map((l) => ({ ledger: l.ledger!._id, debit: num(l.debit), credit: num(l.credit) })) };
    setSaving(true);
    try {
      const r = await api.post('/journals', body);
      enqueueSnackbar(`${KIND_LABEL[kind]} ${r.data.data.number} saved.`, { variant: 'success' });
      onSaved(r.data.data);
    } catch (e) {
      enqueueSnackbar(errMsg(e), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };
  useHotkey('f2', () => submit());
  useHotkey('ctrl+s', () => submit());

  const pickerGroups = kind === 'contra' ? 'cash,bank' : undefined;

  return (
    <Dialog open onClose={saving ? undefined : onClose} maxWidth={kind === 'expense' ? 'sm' : 'md'} fullWidth fullScreen={phone}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <Typography variant="h6" sx={{ flex: 1 }}>New {KIND_LABEL[kind]}</Typography>
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} mb={2}>
          <ToggleButtonGroup exclusive size="small" value={kind} onChange={(_, v) => v && setKind(v)}>
            <ToggleButton value="expense">Expense</ToggleButton>
            <ToggleButton value="contra">Contra</ToggleButton>
            <ToggleButton value="journal">Journal</ToggleButton>
          </ToggleButtonGroup>
          <TextField type="date" label="Date" value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: { xs: '100%', sm: 170 } }} />
        </Stack>
        <Typography variant="body2" color="text.secondary" mb={2}>{KIND_HELP[kind]}</Typography>

        {kind === 'expense' ? (
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <LedgerPicker groups="direct_expenses,indirect_expenses" value={expLedger} onChange={setExpLedger} label="Expense ledger" autoFocus />
            </Grid>
            <Grid item xs={12} sm={7}>
              <LedgerPicker groups="cash,bank" value={paidFrom} onChange={setPaidFrom} label="Paid from (cash / bank)" />
            </Grid>
            <Grid item xs={12} sm={5}>
              <TextField label="Amount" type="number" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} fullWidth
                InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment>, sx: { fontWeight: 700 } }} inputProps={{ min: 0, step: '0.01', inputMode: 'decimal' }} />
            </Grid>
            {expLedger && paidFrom && num(expAmount) > 0 && (
              <Grid item xs={12}>
                <Alert severity="info" icon={false} sx={{ py: 0 }}>
                  Dr <b>{expLedger.name}</b> {inr(num(expAmount))} · Cr <b>{paidFrom.name}</b> {inr(num(expAmount))}
                </Alert>
              </Grid>
            )}
          </Grid>
        ) : (
          <>
            {kind === 'contra' && <Alert severity="info" sx={{ mb: 1.5, py: 0 }}>Debit the account money goes <b>into</b>, credit the account it comes <b>out of</b>.</Alert>}
            <Table size="small" sx={{ '& td': { borderBottom: 'none', py: 0.75, px: 0.75 } }}>
              <TableHead>
                <TableRow>
                  <TableCell>Ledger</TableCell>
                  <TableCell align="right" sx={{ width: { xs: 100, sm: 150 } }}>Debit</TableCell>
                  <TableCell align="right" sx={{ width: { xs: 100, sm: 150 } }}>Credit</TableCell>
                  <TableCell sx={{ width: 40 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {lines.map((l, i) => (
                  <TableRow key={l.key}>
                    <TableCell>
                      <LedgerPicker key={`${kind}-${l.key}`} groups={pickerGroups} includeParties={kind === 'journal'} value={l.ledger}
                        onChange={(v) => setLine(l.key, { ledger: v })} label={kind === 'contra' ? 'Cash / bank' : 'Ledger or party'} autoFocus={i === 0} />
                    </TableCell>
                    <TableCell>
                      <TextField type="number" value={l.debit} onChange={(e) => setLine(l.key, { debit: e.target.value, credit: e.target.value ? '' : l.credit })}
                        inputProps={{ min: 0, step: '0.01', style: { textAlign: 'right' } }} fullWidth placeholder="Dr" />
                    </TableCell>
                    <TableCell>
                      <TextField type="number" value={l.credit} onChange={(e) => setLine(l.key, { credit: e.target.value, debit: e.target.value ? '' : l.debit })}
                        inputProps={{ min: 0, step: '0.01', style: { textAlign: 'right' } }} fullWidth placeholder="Cr"
                        onKeyDown={(e) => { if (e.key === 'Enter' && i === lines.length - 1) { e.preventDefault(); addLine(); } }} />
                    </TableCell>
                    <TableCell>
                      <Tooltip title="Remove line"><IconButton size="small" onClick={() => removeLine(l.key)}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow sx={{ '& td': { fontWeight: 700, color: 'text.primary', fontSize: 14, borderTop: 1, borderColor: 'divider' } }}>
                  <TableCell>
                    <Button size="small" startIcon={<AddIcon />} onClick={addLine}>Add line</Button>
                  </TableCell>
                  <TableCell align="right">{amt(dr)}</TableCell>
                  <TableCell align="right">{amt(cr)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, justifyContent: 'flex-end' }}>
              <BalanceIcon fontSize="small" color={Math.abs(diff) > 0.009 ? 'error' : 'success'} />
              <Typography fontSize={13} color={Math.abs(diff) > 0.009 ? 'error.main' : 'success.main'} fontWeight={600}>
                {Math.abs(diff) > 0.009 ? `Difference ${amt(Math.abs(diff))} ${diff > 0 ? 'Dr' : 'Cr'}` : dr > 0 ? 'Balanced' : 'Enter amounts'}
              </Typography>
            </Box>
          </>
        )}
        <TextField label="Narration" value={narration} onChange={(e) => setNarration(e.target.value)} fullWidth multiline maxRows={3} sx={{ mt: 2 }}
          placeholder={kind === 'expense' ? 'e.g. Shop rent for October' : ''} />
      </DialogContent>
      <DialogActions>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1, pl: 1 }}>F2 / Ctrl+S to save</Typography>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={saving || !!error} startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}
