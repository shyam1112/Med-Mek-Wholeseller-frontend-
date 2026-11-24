import React, { useMemo, useState } from 'react';
import {
  Box, Button, Card, CardContent, Chip, Collapse, FormControlLabel, Grid, IconButton, LinearProgress, Menu, MenuItem, Paper,
  Stack, Switch, Tab, Table, TableBody, TableCell, TableContainer, TableFooter, TableHead, TableRow, Tabs, TextField, Tooltip,
  Typography, useMediaQuery, useTheme,
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import CurrencyRupeeIcon from '@mui/icons-material/CurrencyRupee';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { FilterBar, SearchBox } from '../../components/Filters';
import { RoutePicker } from '../../components/Pickers';
import { StatCard } from '../../components/StatCard';
import { useFetch } from '../../lib/hooks';
import { amt, fdate, inr, inrShort, today } from '../../lib/format';
import { exportExcel } from '../../lib/excel';
import { printTable } from '../../print/print';
import { openWhatsApp } from '../../lib/whatsapp';
import { useAuth } from '../../auth/AuthContext';
import type { Business } from '../../lib/types';
import { useUsers } from './accountsShared';

type OType = 'receivable' | 'payable';
const BUCKETS = ['0-30', '31-60', '61-90', '91-180', '180+'] as const;
type Bucket = typeof BUCKETS[number];

interface OBill { _id: string; number: string; supplierInvoiceNo?: string; date: string; dueDate?: string; amount: number; balance: number; days: number; overdueDays: number }
type ORow = {
  party: string; name: string; city: string; mobile: string; creditLimit: number; bills: OBill[];
  total: number; overdue: number; unadjusted: number; net: number;
} & Record<Bucket, number>;
interface OResp { data: ORow[]; totals: Record<string, number>; buckets: string[] }

const reminderText = (r: ORow, type: OType, asOf: string, b?: Business | null) => {
  const lines: string[] = [`Dear ${r.name},`, ''];
  if (type === 'receivable') {
    lines.push(`Greetings from ${b?.name || ''}. Your outstanding as on ${fdate(asOf)}:`, '');
    for (const x of r.bills) lines.push(`• ${x.number} dt. ${fdate(x.date)} — ${inr(x.balance)}${x.overdueDays > 0 ? ` (${x.overdueDays} days overdue)` : ''}`);
    lines.push('', `*Total: ${inr(r.total)}*`);
    if (r.overdue > 0) lines.push(`Overdue: ${inr(r.overdue)}`);
    if (r.unadjusted > 0) lines.push(`Less unadjusted credit / on-account: ${inr(r.unadjusted)} → Net ${inr(r.net)}`);
    lines.push('', 'Kindly arrange the payment at the earliest.');
    if (b?.bankAccount) lines.push(`Bank: ${b.bankName} · A/c ${b.bankAccount} · IFSC ${b.bankIfsc}`);
    if (b?.upiId) lines.push(`UPI: ${b.upiId}`);
    lines.push('Please ignore if already paid. Thank you!');
  } else {
    lines.push(`As per our books, the following of your bills are pending as on ${fdate(asOf)}:`, '');
    for (const x of r.bills) lines.push(`• ${x.supplierInvoiceNo || x.number} dt. ${fdate(x.date)} — ${inr(x.balance)}`);
    lines.push('', `Total: ${inr(r.total)}`);
    if (r.unadjusted > 0) lines.push(`Less debit notes / advances: ${inr(r.unadjusted)} → Net ${inr(r.net)}`);
    lines.push('', 'Please confirm the balance.');
  }
  lines.push('', `— ${b?.name || ''}`);
  return lines.join('\n');
};

export default function Outstanding() {
  const nav = useNavigate();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('md'));
  const { business, can, user } = useAuth();
  const [type, setType] = useState<OType>('receivable');
  const [asOf, setAsOf] = useState(today());
  const [basis, setBasis] = useState<'bill' | 'due'>('bill');
  const [route, setRoute] = useState<{ _id: string; name: string } | null>(null);
  const [salesman, setSalesman] = useState('');
  const [search, setSearch] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [printAnchor, setPrintAnchor] = useState<HTMLElement | null>(null);
  const users = useUsers();
  const salesmen = users.filter((u) => u.role === 'salesman');
  const isRec = type === 'receivable';

  const params = { type, basis, asOf, route: isRec ? route?._id : '', salesman: isRec ? salesman : '' };
  const { data, loading } = useFetch<OResp>('/reports/outstanding', params);

  const s = search.trim().toLowerCase();
  const rows = useMemo(() => (data?.data || []).filter((r) =>
    (!s || [r.name, r.city, r.mobile].some((x) => (x || '').toLowerCase().includes(s)))
    && (!overdueOnly || r.overdue > 0)), [data, s, overdueOnly]);

  const totals = useMemo(() => {
    const t: Record<string, number> = { total: 0, overdue: 0, unadjusted: 0, net: 0 };
    for (const r of rows) {
      for (const k of ['total', 'overdue', 'unadjusted', 'net', ...BUCKETS]) t[k] = Math.round(((t[k] || 0) + (r as unknown as Record<string, number>)[k]) * 100) / 100;
    }
    return t;
  }, [rows]);

  const toggle = (id: string) => setOpen((o) => { const x = new Set(o); if (x.has(id)) x.delete(id); else x.add(id); return x; });
  const allOpen = rows.length > 0 && rows.every((r) => open.has(r.party));
  const billNo = (b: OBill) => (isRec ? b.number : b.supplierInvoiceNo || b.number);
  const moneyPath = isRec ? '/receipts/new' : '/payments/new';
  const canMoney = can(isRec ? 'receipts:create' : 'payments:create');
  const basisLabel = basis === 'due' ? 'due date' : 'bill date';
  const subtitle = `${isRec ? 'Receivable' : 'Payable'} as on ${fdate(asOf)} · ageing by ${basisLabel}${route && isRec ? ` · route ${route.name}` : ''}${salesman && isRec ? ` · ${salesmen.find((u) => u._id === salesman)?.name || ''}` : ''}`;

  const exportX = () => {
    const billRows = rows.flatMap((r) => r.bills.map((b) => ({ ...b, partyName: r.name, city: r.city })));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- two sheets with different row shapes
    exportExcel<any>(`outstanding-${type}-${asOf}`, [
      {
        name: 'Party summary',
        rows,
        columns: [
          { key: 'name', label: 'Party' }, { key: 'city', label: 'City' }, { key: 'mobile', label: 'Mobile' },
          { key: 'creditLimit', label: 'Credit Limit' },
          ...BUCKETS.map((k) => ({ key: k, label: `${k} days` })),
          { key: 'total', label: 'Total' }, { key: 'overdue', label: 'Overdue' }, { key: 'unadjusted', label: 'Unadjusted Cr' }, { key: 'net', label: 'Net' },
          { key: 'bills', label: 'Bills', value: (r) => r.bills.length },
        ],
      },
      {
        name: 'Bill-wise',
        rows: billRows,
        columns: [
          { key: 'partyName', label: 'Party' }, { key: 'city', label: 'City' },
          { key: 'number', label: 'Bill No' },
          ...(isRec ? [] : [{ key: 'supplierInvoiceNo', label: 'Supplier Inv No' }]),
          { key: 'date', label: 'Bill Date', value: (b) => fdate(b.date) },
          { key: 'dueDate', label: 'Due Date', value: (b) => fdate(b.dueDate) },
          { key: 'days', label: 'Age (days)' }, { key: 'overdueDays', label: 'Overdue (days)' },
          { key: 'amount', label: 'Bill Amount' }, { key: 'balance', label: 'Balance' },
        ],
      },
    ]);
  };

  const printSummary = () => {
    if (!business) return;
    printTable(
      `Outstanding ${isRec ? 'Receivable' : 'Payable'}`, business, subtitle,
      ['Party', 'City', ...BUCKETS, 'Total', 'Overdue', 'Unadj.', 'Net'],
      rows.map((r) => [r.name, r.city, ...BUCKETS.map((k) => (r[k] ? amt(r[k]) : '')), amt(r.total), amt(r.overdue), r.unadjusted ? amt(r.unadjusted) : '', amt(r.net)]),
      ['Total', '', ...BUCKETS.map((k) => amt(totals[k])), amt(totals.total), amt(totals.overdue), amt(totals.unadjusted), amt(totals.net)],
      [2, 3, 4, 5, 6, 7, 8, 9, 10],
    );
  };
  const printBillwise = () => {
    if (!business) return;
    const out: (string | number)[][] = [];
    for (const r of rows) {
      out.push([`${r.name}${r.city ? ` (${r.city})` : ''}`, '', '', '', '', '', '']);
      for (const b of r.bills) out.push([`   ${billNo(b)}`, fdate(b.date), fdate(b.dueDate), b.days, b.overdueDays || '', amt(b.amount), amt(b.balance)]);
      out.push(['', '', '', '', '', 'Party total', amt(r.total)]);
    }
    printTable(`Outstanding ${isRec ? 'Receivable' : 'Payable'} — Bill-wise`, business, subtitle,
      ['Party / Bill', 'Date', 'Due', 'Age', 'Overdue', 'Amount', 'Balance'], out, ['Grand total', '', '', '', '', '', amt(totals.total)], [3, 4, 5, 6]);
  };

  const actions = (r: ORow) => (
    <Stack direction="row" spacing={0.25} onClick={(e) => e.stopPropagation()} justifyContent="flex-end">
      <Tooltip title={r.mobile ? `WhatsApp ${isRec ? 'reminder' : 'confirmation'} to ${r.mobile}` : 'No mobile on party'}>
        <span><IconButton size="small" color="success" onClick={() => openWhatsApp(r.mobile, reminderText(r, type, asOf, business))}><WhatsAppIcon fontSize="small" /></IconButton></span>
      </Tooltip>
      {canMoney && (
        <Tooltip title={isRec ? 'New receipt' : 'New payment'}>
          <IconButton size="small" color="primary" onClick={() => nav(`${moneyPath}?party=${r.party}`)}><CurrencyRupeeIcon fontSize="small" /></IconButton>
        </Tooltip>
      )}
      <Tooltip title="Ledger statement">
        <IconButton size="small" onClick={() => nav(`/ledger-statement?ledger=${r.party}`)}><ReceiptLongOutlinedIcon fontSize="small" /></IconButton>
      </Tooltip>
    </Stack>
  );

  const billTable = (r: ORow) => (
    <Table size="small" sx={{ '& td, & th': { fontSize: 12 } }}>
      <TableHead>
        <TableRow>
          <TableCell>Bill no</TableCell><TableCell>Date</TableCell><TableCell>Due</TableCell>
          <TableCell align="right">Age</TableCell><TableCell align="right">Overdue</TableCell>
          <TableCell align="right">Amount</TableCell><TableCell align="right">Balance</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {r.bills.map((b) => (
          <TableRow key={b._id} hover sx={{ cursor: 'pointer' }} onClick={() => nav(isRec ? `/sales/${b._id}` : `/purchases/${b._id}`)}>
            <TableCell sx={{ fontWeight: 600 }}>{billNo(b)}{!isRec && b.supplierInvoiceNo && <Typography component="span" fontSize={10} color="text.secondary"> · {b.number}</Typography>}</TableCell>
            <TableCell>{fdate(b.date)}</TableCell>
            <TableCell>{fdate(b.dueDate)}</TableCell>
            <TableCell align="right">{b.days}d</TableCell>
            <TableCell align="right" sx={{ color: b.overdueDays > 0 ? 'error.main' : undefined, fontWeight: b.overdueDays > 0 ? 600 : undefined }}>{b.overdueDays > 0 ? `${b.overdueDays}d` : ''}</TableCell>
            <TableCell align="right">{amt(b.amount)}</TableCell>
            <TableCell align="right"><b>{amt(b.balance)}</b></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  const emptyMsg = loading ? 'Loading…' : (data?.data?.length ? 'No party matches the filter.' : `Nothing ${isRec ? 'receivable' : 'payable'} — all bills are settled.`);

  const desktopTable = (
    <Paper sx={{ overflow: 'hidden' }}>
      {loading && <LinearProgress sx={{ height: 2 }} />}
      <TableContainer sx={{ maxHeight: 'calc(100vh - 330px)' }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 36, px: 0.5 }}>
                <IconButton size="small" onClick={() => setOpen(allOpen ? new Set() : new Set(rows.map((r) => r.party)))} title={allOpen ? 'Collapse all' : 'Expand all'}>
                  {allOpen ? <UnfoldLessIcon fontSize="small" /> : <UnfoldMoreIcon fontSize="small" />}
                </IconButton>
              </TableCell>
              <TableCell>Party</TableCell>
              {BUCKETS.map((k) => <TableCell key={k} align="right">{k}</TableCell>)}
              <TableCell align="right">Total</TableCell>
              <TableCell align="right">Overdue</TableCell>
              <TableCell align="right">Unadj. Cr</TableCell>
              <TableCell align="right">Net</TableCell>
              <TableCell align="right" sx={{ width: 120 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => {
              const isOpen = open.has(r.party);
              const overLimit = r.creditLimit > 0 && r.total > r.creditLimit;
              return (
                <React.Fragment key={r.party}>
                  <TableRow hover sx={{ cursor: 'pointer', '& > td': { borderBottom: isOpen ? 'none' : undefined } }} onClick={() => toggle(r.party)}>
                    <TableCell sx={{ px: 0.5 }}>{isOpen ? <KeyboardArrowDownIcon fontSize="small" /> : <KeyboardArrowRightIcon fontSize="small" />}</TableCell>
                    <TableCell>
                      <Typography fontWeight={600} fontSize={13}>{r.name}</Typography>
                      <Typography fontSize={11} color="text.secondary">
                        {[r.city, r.mobile, `${r.bills.length} bill${r.bills.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
                        {overLimit && <Chip label={`over limit ${inrShort(r.creditLimit)}`} color="error" size="small" sx={{ height: 16, fontSize: 10, ml: 0.5 }} />}
                      </Typography>
                    </TableCell>
                    {BUCKETS.map((k, i) => (
                      <TableCell key={k} align="right" sx={{ color: r[k] && i >= 2 ? 'error.main' : r[k] ? undefined : 'text.disabled' }}>{r[k] ? amt(r[k]) : '–'}</TableCell>
                    ))}
                    <TableCell align="right"><b>{amt(r.total)}</b></TableCell>
                    <TableCell align="right" sx={{ color: r.overdue ? 'error.main' : 'text.disabled', fontWeight: r.overdue ? 600 : undefined }}>{r.overdue ? amt(r.overdue) : '–'}</TableCell>
                    <TableCell align="right" sx={{ color: r.unadjusted ? 'success.main' : 'text.disabled' }}>{r.unadjusted ? amt(r.unadjusted) : '–'}</TableCell>
                    <TableCell align="right"><b>{amt(r.net)}</b></TableCell>
                    <TableCell align="right">{actions(r)}</TableCell>
                  </TableRow>
                  {isOpen && (
                    <TableRow>
                      <TableCell colSpan={BUCKETS.length + 7} sx={{ py: 0, pl: 6, bgcolor: 'action.hover' }}>
                        <Collapse in timeout="auto" unmountOnExit><Box sx={{ py: 1 }}>{billTable(r)}</Box></Collapse>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
            {!rows.length && (
              <TableRow><TableCell colSpan={BUCKETS.length + 7}><Box sx={{ py: 5, textAlign: 'center' }}><Typography color="text.secondary">{emptyMsg}</Typography></Box></TableCell></TableRow>
            )}
          </TableBody>
          {rows.length > 0 && (
            <TableFooter>
              <TableRow sx={{ '& td': { fontWeight: 700, color: 'text.primary', background: '#f7f9fb', fontSize: 13, position: 'sticky', bottom: 0 } }}>
                <TableCell />
                <TableCell>Total · {rows.length} parties</TableCell>
                {BUCKETS.map((k) => <TableCell key={k} align="right">{amt(totals[k])}</TableCell>)}
                <TableCell align="right">{amt(totals.total)}</TableCell>
                <TableCell align="right">{amt(totals.overdue)}</TableCell>
                <TableCell align="right">{amt(totals.unadjusted)}</TableCell>
                <TableCell align="right">{amt(totals.net)}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </TableContainer>
    </Paper>
  );

  // Phone: one card per party (salesman checking a chemist's dues in the field).
  const cards = (
    <Stack spacing={1}>
      {loading && <LinearProgress />}
      {rows.map((r) => {
        const isOpen = open.has(r.party);
        return (
          <Card key={r.party} variant="outlined">
            <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }} onClick={() => toggle(r.party)}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography fontWeight={700} noWrap>{r.name}</Typography>
                  <Typography fontSize={12} color="text.secondary" noWrap>{[r.city, `${r.bills.length} bills`].filter(Boolean).join(' · ')}</Typography>
                </Box>
                <Box textAlign="right">
                  <Typography fontWeight={700}>{amt(r.total)}</Typography>
                  {r.overdue > 0 && <Typography fontSize={12} color="error.main">Overdue {amt(r.overdue)}</Typography>}
                  {r.unadjusted > 0 && <Typography fontSize={11} color="success.main">Cr {amt(r.unadjusted)}</Typography>}
                </Box>
              </Box>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
                {BUCKETS.filter((k) => r[k]).map((k) => <Chip key={k} size="small" label={`${k}: ${amt(r[k])}`} sx={{ height: 20, fontSize: 10 }} variant="outlined" />)}
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}>
                <Button size="small" onClick={() => toggle(r.party)} endIcon={isOpen ? <KeyboardArrowDownIcon /> : <KeyboardArrowRightIcon />}>Bills</Button>
                <Box sx={{ flex: 1 }} />
                {actions(r)}
              </Box>
              <Collapse in={isOpen} unmountOnExit>
                <Stack spacing={0.5} sx={{ mt: 1 }}>
                  {r.bills.map((b) => (
                    <Box key={b._id} sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderTop: 1, borderColor: 'divider', pt: 0.5 }}>
                      <Box>
                        <Typography fontSize={13} fontWeight={600}>{billNo(b)}</Typography>
                        <Typography fontSize={11} color="text.secondary">{fdate(b.date)} · {b.days}d{b.overdueDays > 0 ? ` · ${b.overdueDays}d overdue` : ''}</Typography>
                      </Box>
                      <Box textAlign="right">
                        <Typography fontSize={13} fontWeight={700}>{amt(b.balance)}</Typography>
                        <Typography fontSize={11} color="text.secondary">of {amt(b.amount)}</Typography>
                      </Box>
                    </Box>
                  ))}
                </Stack>
              </Collapse>
            </CardContent>
          </Card>
        );
      })}
      {!rows.length && <Paper sx={{ p: 4, textAlign: 'center' }}><Typography color="text.secondary">{emptyMsg}</Typography></Paper>}
      {rows.length > 0 && (
        <Paper sx={{ p: 1.5, display: 'flex', justifyContent: 'space-between' }}>
          <Typography fontWeight={700}>Total ({rows.length})</Typography>
          <Typography fontWeight={700}>{inr(totals.total)}</Typography>
        </Paper>
      )}
    </Stack>
  );

  return (
    <>
      <PageHeader
        help={['outstanding', 'overdue', 'creditdays', 'onaccount']}
        title="Outstanding"
        subtitle={subtitle}
        crumbs={[{ label: 'Accounts' }]}
        actions={
          <>
            <Button variant="outlined" startIcon={<FileDownloadOutlinedIcon />} onClick={exportX} disabled={!rows.length}>Excel</Button>
            <Button variant="outlined" startIcon={<PrintOutlinedIcon />} onClick={(e) => setPrintAnchor(e.currentTarget)} disabled={!rows.length}>Print</Button>
            <Menu anchorEl={printAnchor} open={!!printAnchor} onClose={() => setPrintAnchor(null)}>
              <MenuItem onClick={() => { setPrintAnchor(null); printSummary(); }}>Party summary (ageing)</MenuItem>
              <MenuItem onClick={() => { setPrintAnchor(null); printBillwise(); }}>Bill-wise detail</MenuItem>
            </Menu>
          </>
        }
      />
      <Paper sx={{ mb: 1.5 }}>
        <Tabs value={type} onChange={(_, v) => { setType(v); setOpen(new Set()); }}>
          <Tab value="receivable" label="Receivable (customers)" />
          {user?.role !== 'salesman' && <Tab value="payable" label="Payable (suppliers)" />}
        </Tabs>
      </Paper>
      <FilterBar>
        <SearchBox value={search} onChange={setSearch} placeholder="Party / city / mobile" width={220} />
        <TextField type="date" label="As on" value={asOf} onChange={(e) => setAsOf(e.target.value || today())} InputLabelProps={{ shrink: true }} sx={{ width: 150 }} />
        <TextField select label="Ageing by" value={basis} onChange={(e) => setBasis(e.target.value as 'bill' | 'due')} sx={{ width: 140 }}>
          <MenuItem value="bill">Bill date</MenuItem>
          <MenuItem value="due">Due date</MenuItem>
        </TextField>
        {isRec && <RoutePicker value={route} onChange={setRoute} sx={{ width: { xs: '100%', sm: 190 } }} />}
        {isRec && user?.role !== 'salesman' && (
          <TextField select label="Salesman" value={salesman} onChange={(e) => setSalesman(e.target.value)} sx={{ width: 160 }}>
            <MenuItem value="">All</MenuItem>
            {salesmen.map((u) => <MenuItem key={u._id} value={u._id}>{u.name}</MenuItem>)}
          </TextField>
        )}
        <FormControlLabel control={<Switch checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} size="small" />} label="Overdue only" />
      </FilterBar>
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid item xs={6} md={3}><StatCard label={`Total ${isRec ? 'receivable' : 'payable'}`} value={inrShort(totals.total)} hint={`${rows.length} parties · ${rows.reduce((n, r) => n + r.bills.length, 0)} bills`} /></Grid>
        <Grid item xs={6} md={3}><StatCard label="Overdue (past due date)" value={inrShort(totals.overdue)} hint={totals.total ? `${Math.round((totals.overdue / totals.total) * 100)}% of total` : undefined} tone={totals.overdue ? 'bad' : 'good'} /></Grid>
        <Grid item xs={6} md={3}><StatCard label="Older than 90 days" value={inrShort((totals['91-180'] || 0) + (totals['180+'] || 0))} hint={`ageing by ${basisLabel}`} tone="warn" /></Grid>
        <Grid item xs={6} md={3}><StatCard label="Net after unadjusted credit" value={inrShort(totals.net)} hint={totals.unadjusted ? `${inrShort(totals.unadjusted)} credit notes / on-account` : 'no unadjusted credit'} /></Grid>
      </Grid>
      {phone ? cards : desktopTable}
    </>
  );
}
