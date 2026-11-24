import React, { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Grid, IconButton, InputAdornment,
  LinearProgress, MenuItem, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, ToggleButton,
  ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/PageHeader';
import { FilterBar, SearchBox } from '../../components/Filters';
import { useFetch, useHotkey } from '../../lib/hooks';
import { amt, drcr } from '../../lib/format';
import { exportExcel } from '../../lib/excel';
import { api, errMsg } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { BalanceText, GROUP_LABELS, groupLabel, sum } from './accountsShared';

interface LedgerRow {
  _id: string; name: string; group: string; systemKey?: string; balance: number; openingBalance: number; openingType: 'dr' | 'cr';
  bankAccountNo?: string; ifsc?: string; notes?: string; isActive?: boolean;
}
interface Resp { data: LedgerRow[]; groups: Record<string, 'asset' | 'liability' | 'income' | 'expense'> }

const NATURE_LABEL: Record<string, string> = { asset: 'Assets', liability: 'Liabilities & Capital', income: 'Income', expense: 'Expenses' };
const NATURE_ORDER = ['asset', 'liability', 'income', 'expense'];
const PARTY_GROUPS = ['sundry_debtors', 'sundry_creditors'];

export default function Ledgers() {
  const nav = useNavigate();
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [nature, setNature] = useState('');
  const [hideZero, setHideZero] = useState(false);
  const [edit, setEdit] = useState<LedgerRow | 'new' | null>(null);
  const { data, loading, reload } = useFetch<Resp>('/ledgers');
  const groups = data?.groups || {};

  useHotkey('alt+n', () => { if (can('ledgers:create')) setEdit('new'); });

  const s = search.trim().toLowerCase();
  const list = useMemo(() => (data?.data || []).filter((l) =>
    (!s || l.name.toLowerCase().includes(s) || groupLabel(l.group).toLowerCase().includes(s))
    && (!nature || groups[l.group] === nature)
    && (!hideZero || Math.abs(l.balance) > 0.009)), [data, s, nature, hideZero, groups]);

  // nature → group → ledgers
  const tree = useMemo(() => {
    const m = new Map<string, Map<string, LedgerRow[]>>();
    for (const l of list) {
      const nat = groups[l.group] || 'asset';
      if (!m.has(nat)) m.set(nat, new Map());
      const g = m.get(nat)!;
      if (!g.has(l.group)) g.set(l.group, []);
      g.get(l.group)!.push(l);
    }
    return NATURE_ORDER.filter((n) => m.has(n)).map((n) => ({ nature: n, groups: [...m.get(n)!.entries()].sort((a, b) => groupLabel(a[0]).localeCompare(groupLabel(b[0]))) }));
  }, [list, groups]);

  const exportX = () => exportExcel('chart-of-accounts', [{
    name: 'Ledgers',
    rows: list,
    columns: [
      { key: 'name', label: 'Ledger' }, { key: 'group', label: 'Group', value: (l) => groupLabel(l.group) },
      { key: 'nature', label: 'Nature', value: (l) => NATURE_LABEL[groups[l.group]] || '' },
      { key: 'opening', label: 'Opening', value: (l) => (l.openingBalance ? `${l.openingBalance} ${l.openingType.toUpperCase()}` : '') },
      { key: 'balance', label: 'Balance', value: (l) => drcr(l.balance) },
      { key: 'bankAccountNo', label: 'Bank A/c' }, { key: 'ifsc', label: 'IFSC' },
      { key: 'system', label: 'System', value: (l) => (l.systemKey ? 'Yes' : '') },
    ],
  }]);

  return (
    <>
      <PageHeader
        title="Chart of Accounts"
        subtitle={data ? `${data.data.length} ledgers (customers & suppliers are under Masters)` : 'Cash, bank, expense, income, tax and capital ledgers'}
        crumbs={[{ label: 'Accounts' }]}
        actions={
          <>
            <Button variant="outlined" startIcon={<FileDownloadOutlinedIcon />} onClick={exportX} disabled={!list.length}>Excel</Button>
            {can('ledgers:create') && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEdit('new')}>New Ledger (Alt+N)</Button>}
          </>
        }
      />
      <FilterBar>
        <SearchBox value={search} onChange={setSearch} placeholder="Ledger or group" />
        <ToggleButtonGroup size="small" exclusive value={nature} onChange={(_, v) => setNature(v ?? '')}>
          <ToggleButton value="">All</ToggleButton>
          {NATURE_ORDER.map((n) => <ToggleButton key={n} value={n}>{NATURE_LABEL[n].split(' ')[0]}</ToggleButton>)}
        </ToggleButtonGroup>
        <ToggleButton size="small" value="hz" selected={hideZero} onChange={() => setHideZero((x) => !x)}>Hide zero balance</ToggleButton>
      </FilterBar>
      <Paper sx={{ overflow: 'hidden' }}>
        {loading && <LinearProgress sx={{ height: 2 }} />}
        <TableContainer sx={{ maxHeight: 'calc(100vh - 250px)' }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell>Ledger</TableCell>
                <TableCell>Details</TableCell>
                <TableCell align="right">Opening</TableCell>
                <TableCell align="right">Current balance</TableCell>
                <TableCell sx={{ width: 48 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {tree.map((n) => (
                <React.Fragment key={n.nature}>
                  <TableRow>
                    <TableCell colSpan={5} sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', fontWeight: 700, py: 0.75, fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                      {NATURE_LABEL[n.nature]}
                    </TableCell>
                  </TableRow>
                  {n.groups.map(([g, ls]) => (
                    <React.Fragment key={g}>
                      <TableRow sx={{ bgcolor: 'action.hover' }}>
                        <TableCell colSpan={3} sx={{ fontWeight: 700 }}>{groupLabel(g)} <Typography component="span" fontSize={11} color="text.secondary">({ls.length})</Typography></TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}><BalanceText value={sum(ls.map((l) => l.balance))} /></TableCell>
                        <TableCell />
                      </TableRow>
                      {ls.map((l) => (
                        <TableRow key={l._id} hover sx={{ cursor: 'pointer', opacity: l.isActive === false ? 0.5 : 1 }} onClick={() => nav(`/ledger-statement?ledger=${l._id}`)}>
                          <TableCell sx={{ pl: 4 }}>
                            {l.name}
                            {l.systemKey && <Tooltip title="System ledger — used by automatic postings; can't be renamed"><LockOutlinedIcon sx={{ fontSize: 13, ml: 0.5, verticalAlign: 'middle', color: 'text.disabled' }} /></Tooltip>}
                          </TableCell>
                          <TableCell>
                            <Typography fontSize={12} color="text.secondary">
                              {[l.bankAccountNo && `A/c ${l.bankAccountNo}`, l.ifsc && `IFSC ${l.ifsc}`, l.notes].filter(Boolean).join(' · ')}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">{l.openingBalance ? `${amt(l.openingBalance)} ${l.openingType === 'cr' ? 'Cr' : 'Dr'}` : ''}</TableCell>
                          <TableCell align="right"><BalanceText value={l.balance} /></TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {can('ledgers:edit') && <IconButton size="small" onClick={() => setEdit(l)} title="Edit"><EditOutlinedIcon fontSize="small" /></IconButton>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </React.Fragment>
                  ))}
                </React.Fragment>
              ))}
              {!tree.length && !loading && (
                <TableRow><TableCell colSpan={5}><Box sx={{ py: 5, textAlign: 'center' }}><Typography color="text.secondary">{data?.data.length ? 'No ledger matches.' : 'No ledgers yet.'}</Typography></Box></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      {edit && <LedgerDialog ledger={edit === 'new' ? null : edit} groups={groups} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </>
  );
}

function LedgerDialog({ ledger, groups, onClose, onSaved }: { ledger: LedgerRow | null; groups: Record<string, string>; onClose: () => void; onSaved: () => void }) {
  const { enqueueSnackbar } = useSnackbar();
  const isNew = !ledger;
  const [name, setName] = useState(ledger?.name || '');
  const [group, setGroup] = useState(ledger?.group || 'indirect_expenses');
  const [opening, setOpening] = useState(ledger?.openingBalance ? String(ledger.openingBalance) : '');
  const [openingType, setOpeningType] = useState<'dr' | 'cr'>(ledger?.openingType || 'dr');
  const [bankAccountNo, setBankAccountNo] = useState(ledger?.bankAccountNo || '');
  const [ifsc, setIfsc] = useState(ledger?.ifsc || '');
  const [notes, setNotes] = useState(ledger?.notes || '');
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  const groupKeys = (Object.keys(groups).length ? Object.keys(groups) : Object.keys(GROUP_LABELS)).filter((g) => !PARTY_GROUPS.includes(g));
  const isBank = group === 'bank';
  const nameErr = touched && !name.trim() ? 'Name is required' : '';

  // Sensible default side for the opening balance by group nature.
  const changeGroup = (g: string) => {
    setGroup(g);
    if (!opening) setOpeningType(['liability', 'income'].includes(groups[g]) ? 'cr' : 'dr');
  };

  const save = async () => {
    setTouched(true);
    if (!name.trim() || saving) return;
    const body: Record<string, unknown> = {
      name: name.trim(), openingBalance: Number(opening) || 0, openingType, notes,
      ...(isBank ? { bankAccountNo: bankAccountNo.trim(), ifsc: ifsc.trim().toUpperCase() } : {}),
    };
    if (isNew) body.group = group;
    if (ledger?.systemKey) delete body.name;
    setSaving(true);
    try {
      if (isNew) await api.post('/ledgers', body);
      else await api.put(`/ledgers/${ledger!._id}`, body);
      enqueueSnackbar(`Ledger ${isNew ? 'created' : 'updated'}.`, { variant: 'success' });
      onSaved();
    } catch (e) {
      enqueueSnackbar(errMsg(e), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };
  useHotkey('f2', () => save());
  useHotkey('ctrl+s', () => save());

  return (
    <Dialog open onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isNew ? 'New ledger' : `Edit ${ledger!.name}`}</DialogTitle>
      <DialogContent>
        {ledger?.systemKey && <Alert severity="info" sx={{ mb: 2 }} icon={<LockOutlinedIcon />}>System ledger — the name is fixed because automatic postings use it.</Alert>}
        <Grid container spacing={2} sx={{ pt: 1 }}>
          <Grid item xs={12} sm={7}>
            <TextField label="Ledger name" value={name} onChange={(e) => setName(e.target.value)} fullWidth required autoFocus={!ledger?.systemKey}
              disabled={!!ledger?.systemKey} error={!!nameErr} helperText={nameErr} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
          </Grid>
          <Grid item xs={12} sm={5}>
            <TextField select label="Group (under)" value={group} onChange={(e) => changeGroup(e.target.value)} fullWidth disabled={!isNew}
              helperText={isNew ? (groups[group] ? `Nature: ${groups[group]}` : '') : 'Group cannot be changed'}>
              {groupKeys.map((g) => <MenuItem key={g} value={g}>{groupLabel(g)}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={8} sm={7}>
            <TextField label="Opening balance" type="number" value={opening} onChange={(e) => setOpening(e.target.value)} fullWidth
              InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} inputProps={{ min: 0, step: '0.01' }}
              helperText="As on the start of books" />
          </Grid>
          <Grid item xs={4} sm={5}>
            <ToggleButtonGroup exclusive value={openingType} onChange={(_, v) => v && setOpeningType(v)} fullWidth sx={{ height: 40 }}>
              <ToggleButton value="dr">Dr</ToggleButton>
              <ToggleButton value="cr">Cr</ToggleButton>
            </ToggleButtonGroup>
          </Grid>
          {isBank && (
            <>
              <Grid item xs={12} sm={7}>
                <TextField label="Bank account no" value={bankAccountNo} onChange={(e) => setBankAccountNo(e.target.value)} fullWidth inputProps={{ inputMode: 'numeric' }} />
              </Grid>
              <Grid item xs={12} sm={5}>
                <TextField label="IFSC" value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} fullWidth
                  error={!!ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)} helperText={ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc) ? 'Format: ABCD0123456' : ' '} />
              </Grid>
            </>
          )}
          <Grid item xs={12}>
            <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} fullWidth multiline maxRows={3} />
          </Grid>
        </Grid>
        {!isNew && <Chip size="small" sx={{ mt: 2 }} label={`Current balance ${drcr(ledger!.balance)}`} />}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving} startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}>Save (F2)</Button>
      </DialogActions>
    </Dialog>
  );
}
