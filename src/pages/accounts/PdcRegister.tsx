import { useMemo, useState } from 'react';
import { Box, Button, Chip, Grid, Paper, Stack, Tab, Tabs, Typography } from '@mui/material';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ReportGmailerrorredIcon from '@mui/icons-material/ReportGmailerrorred';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import EventIcon from '@mui/icons-material/Event';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import dayjs from 'dayjs';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/PageHeader';
import { DataTable, Col } from '../../components/DataTable';
import { DateRange, FilterBar, SearchBox } from '../../components/Filters';
import { StatCard } from '../../components/StatCard';
import { useFetch } from '../../lib/hooks';
import { amt, fdate, inrShort, today } from '../../lib/format';
import { exportExcel } from '../../lib/excel';
import { errMsg } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { openWhatsApp } from '../../lib/whatsapp';
import {
  ChequeActionDialog, MoneyDoc, MoneyViewDialog, bounceWhatsAppText, fetchPartyMobile, fyStartDate, moneyPath, sum,
} from './accountsShared';

type TabKey = 'receipt' | 'payment' | 'bounced';
interface ListResp { data: MoneyDoc[]; pagination: { total: number } }

const daysTo = (d?: string) => (d ? dayjs(d).startOf('day').diff(dayjs().startOf('day'), 'day') : 0);

export default function PdcRegister() {
  const { can, business } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const [tab, setTab] = useState<TabKey>(() => (can('receipts:view') ? 'receipt' : can('payments:view') ? 'payment' : 'bounced'));
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState(fyStartDate(business));
  const [to, setTo] = useState(today());
  const [view, setView] = useState<MoneyDoc | null>(null);
  const [act, setAct] = useState<{ v: MoneyDoc; action: 'clear' | 'bounce' } | null>(null);

  const pendingParams = { chequeStatus: 'pending', status: 'active', limit: 500 };
  const canRc = can('receipts:view');
  const canPy = can('payments:view');
  const rc = useFetch<ListResp>(canRc ? '/receipts' : null, pendingParams);
  const py = useFetch<ListResp>(canPy ? '/payments' : null, pendingParams);
  const bParams = { chequeStatus: 'bounced', from, to, limit: 500 };
  const brc = useFetch<ListResp>(tab === 'bounced' && canRc ? '/receipts' : null, bParams);
  const bpy = useFetch<ListResp>(tab === 'bounced' && canPy ? '/payments' : null, bParams);

  const reloadAll = () => { rc.reload(); py.reload(); if (tab === 'bounced') { brc.reload(); bpy.reload(); } };

  const byChequeDate = (a: MoneyDoc, b: MoneyDoc) => dayjs(a.chequeDate).valueOf() - dayjs(b.chequeDate).valueOf();
  const rcRows = useMemo(() => [...(rc.data?.data || [])].sort(byChequeDate), [rc.data]);
  const pyRows = useMemo(() => [...(py.data?.data || [])].sort(byChequeDate), [py.data]);
  const bouncedRows = useMemo(
    () => [...(brc.data?.data || []), ...(bpy.data?.data || [])].sort((a, b) => dayjs(b.bouncedDate || b.date).valueOf() - dayjs(a.bouncedDate || a.date).valueOf()),
    [brc.data, bpy.data],
  );

  const stats = (rows: MoneyDoc[]) => {
    const due = rows.filter((r) => daysTo(r.chequeDate) <= 0);
    const week = rows.filter((r) => daysTo(r.chequeDate) <= 7);
    return { total: sum(rows.map((r) => r.amount)), count: rows.length, due: sum(due.map((r) => r.amount)), dueCount: due.length, week: sum(week.map((r) => r.amount)), weekCount: week.length };
  };
  const sRc = stats(rcRows);
  const sPy = stats(pyRows);

  const baseRows = tab === 'receipt' ? rcRows : tab === 'payment' ? pyRows : bouncedRows;
  const s = search.trim().toLowerCase();
  const rows = s ? baseRows.filter((r) => [r.partyName, r.chequeNo, r.number, r.bankName].some((x) => (x || '').toLowerCase().includes(s))) : baseRows;
  const loading = tab === 'receipt' ? rc.loading : tab === 'payment' ? py.loading : brc.loading || bpy.loading;

  const canEditKind = (r: MoneyDoc) => can(`${moneyPath(r.kind)}:edit`);

  const sendBounceWa = async (r: MoneyDoc) => {
    try {
      openWhatsApp(await fetchPartyMobile(r.party), bounceWhatsAppText(r, business, r.bounceCharges || 0));
    } catch (e) {
      enqueueSnackbar(errMsg(e), { variant: 'error' });
    }
  };

  const dueChip = (r: MoneyDoc) => {
    const d = daysTo(r.chequeDate);
    if (d < 0) return <Chip size="small" color="error" label={`${-d}d overdue`} sx={{ height: 20, fontSize: 11, fontWeight: 600 }} />;
    if (d === 0) return <Chip size="small" color="warning" label="Due today" sx={{ height: 20, fontSize: 11, fontWeight: 600 }} />;
    if (d <= 7) return <Chip size="small" color="info" variant="outlined" label={`in ${d}d`} sx={{ height: 20, fontSize: 11 }} />;
    return <Typography component="span" fontSize={12} color="text.secondary">in {d}d</Typography>;
  };

  const pendingCols: Col<MoneyDoc>[] = [
    { key: 'chequeDate', label: 'Cheque date', nowrap: true, render: (r) => <b>{fdate(r.chequeDate)}</b> },
    { key: 'due', label: 'Deposit', nowrap: true, render: dueChip },
    { key: 'chequeNo', label: 'Cheque no', nowrap: true },
    { key: 'partyName', label: tab === 'receipt' ? 'Received from' : 'Issued to' },
    { key: 'bankName', label: tab === 'receipt' ? 'Drawee bank' : 'Drawn on', render: (r) => r.bankName || '' },
    { key: 'accountName', label: tab === 'receipt' ? 'Deposit to' : 'Our bank' },
    { key: 'number', label: 'Voucher', nowrap: true, render: (r) => <>{r.number}<Typography component="span" fontSize={11} color="text.secondary"> · {fdate(r.date)}</Typography></> },
    { key: 'allocations', label: 'Against bills', render: (r) => <Typography fontSize={12} noWrap sx={{ maxWidth: 160 }}>{r.allocations.map((a) => a.billNo).join(', ') || '—'}</Typography> },
    { key: 'amount', label: 'Amount', align: 'right', nowrap: true, render: (r) => <b>{amt(r.amount)}</b>, footer: amt(sum(rows.map((r) => r.amount))) },
    {
      key: 'actions', label: '', align: 'right', nowrap: true,
      render: (r) => canEditKind(r) ? (
        <Stack direction="row" spacing={0.5} justifyContent="flex-end" onClick={(e) => e.stopPropagation()}>
          <Button size="small" color="success" variant="outlined" startIcon={<CheckCircleOutlineIcon />} onClick={() => setAct({ v: r, action: 'clear' })}>Cleared</Button>
          <Button size="small" color="error" startIcon={<ReportGmailerrorredIcon />} onClick={() => setAct({ v: r, action: 'bounce' })}>Bounced</Button>
        </Stack>
      ) : null,
    },
  ];

  const bouncedCols: Col<MoneyDoc>[] = [
    { key: 'bouncedDate', label: 'Bounced on', nowrap: true, render: (r) => fdate(r.bouncedDate) },
    { key: 'kind', label: 'Type', render: (r) => <Chip size="small" variant="outlined" color={r.kind === 'receipt' ? 'primary' : 'secondary'} label={r.kind === 'receipt' ? 'Received' : 'Issued'} sx={{ height: 20, fontSize: 11 }} /> },
    { key: 'chequeNo', label: 'Cheque no', nowrap: true, render: (r) => <>{r.chequeNo}<Typography component="span" fontSize={11} color="text.secondary"> · {fdate(r.chequeDate)}</Typography></> },
    { key: 'partyName', label: 'Party' },
    { key: 'bankName', label: 'Bank', render: (r) => r.bankName || r.accountName },
    { key: 'number', label: 'Voucher', nowrap: true },
    { key: 'bounceCharges', label: 'Charges', align: 'right', render: (r) => (r.bounceCharges ? amt(r.bounceCharges) : '') },
    { key: 'amount', label: 'Amount', align: 'right', nowrap: true, render: (r) => <b>{amt(r.amount)}</b>, footer: amt(sum(rows.map((r) => r.amount))) },
    {
      key: 'wa', label: '', align: 'right',
      render: (r) => (
        <Button size="small" color="success" startIcon={<WhatsAppIcon />} onClick={(e) => { e.stopPropagation(); sendBounceWa(r); }}>Inform</Button>
      ),
    },
  ];

  const exportTab = () => {
    const name = tab === 'receipt' ? 'PDC Received' : tab === 'payment' ? 'PDC Issued' : 'Bounced Cheques';
    exportExcel(`${name.toLowerCase().replace(/ /g, '-')}-${today()}`, [{
      name,
      rows,
      columns: [
        { key: 'kind', label: 'Type', value: (r) => (r.kind === 'receipt' ? 'Received' : 'Issued') },
        { key: 'chequeNo', label: 'Cheque No' },
        { key: 'chequeDate', label: 'Cheque Date', value: (r) => fdate(r.chequeDate) },
        { key: 'partyName', label: 'Party' },
        { key: 'bankName', label: 'Drawee Bank' },
        { key: 'accountName', label: 'Our Account' },
        { key: 'number', label: 'Voucher No' },
        { key: 'date', label: 'Voucher Date', value: (r) => fdate(r.date) },
        { key: 'amount', label: 'Amount' },
        { key: 'allocations', label: 'Against Bills', value: (r) => r.allocations.map((a) => a.billNo).join(', ') },
        ...(tab === 'bounced'
          ? [{ key: 'bouncedDate', label: 'Bounced On', value: (r: MoneyDoc) => fdate(r.bouncedDate) }, { key: 'bounceCharges', label: 'Charges' }]
          : [{ key: 'days', label: 'Days to deposit', value: (r: MoneyDoc) => daysTo(r.chequeDate) }]),
      ],
    }]);
  };

  return (
    <>
      <PageHeader
        help={['pdc']}
        title="PDC Register"
        subtitle="Post-dated cheques received from customers and issued to suppliers"
        crumbs={[{ label: 'Accounts' }]}
        actions={<Button variant="outlined" startIcon={<FileDownloadOutlinedIcon />} onClick={exportTab} disabled={!rows.length}>Excel</Button>}
      />
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid item xs={6} md={3}>
          <StatCard label="PDC in hand (received)" value={inrShort(sRc.total)} hint={`${sRc.count} cheque(s)`} icon={<AccountBalanceWalletOutlinedIcon />} onClick={() => setTab('receipt')} />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard label="Due / overdue for deposit" value={inrShort(sRc.due)} hint={`${sRc.dueCount} cheque(s) — deposit today`} icon={<WarningAmberIcon />} tone={sRc.dueCount ? 'bad' : 'good'} onClick={() => setTab('receipt')} />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard label="Receipts due this week" value={inrShort(sRc.week)} hint={`${sRc.weekCount} cheque(s) in next 7 days`} icon={<EventIcon />} tone="warn" onClick={() => setTab('receipt')} />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard label="Issued PDC due this week" value={inrShort(sPy.week)} hint={`${sPy.count} issued · ${inrShort(sPy.total)} total`} icon={<EventIcon />} tone={sPy.dueCount ? 'bad' : 'default'} onClick={() => setTab('payment')} />
        </Grid>
      </Grid>
      <Paper sx={{ mb: 1.5 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" allowScrollButtonsMobile>
          {canRc && <Tab value="receipt" label={`Receipts PDC (${sRc.count})`} />}
          {canPy && <Tab value="payment" label={`Issued PDC (${sPy.count})`} />}
          <Tab value="bounced" label="Bounced" />
        </Tabs>
      </Paper>
      <FilterBar>
        <SearchBox value={search} onChange={setSearch} placeholder="Party / cheque no / voucher" />
        {tab === 'bounced' && <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />}
        {tab !== 'bounced' && (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: 'rgba(211,47,47,0.12)' }} /><Typography variant="caption">Due / overdue</Typography>
            <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: 'rgba(237,108,2,0.10)', ml: 1 }} /><Typography variant="caption">This week</Typography>
          </Box>
        )}
      </FilterBar>
      <DataTable
        columns={tab === 'bounced' ? bouncedCols : pendingCols}
        rows={rows}
        loading={loading}
        onRowClick={(r) => setView(r)}
        rowKey={(r) => `${r.kind}-${r._id}`}
        rowSx={(r) => {
          if (tab === 'bounced') return undefined;
          const d = daysTo(r.chequeDate);
          return d <= 0 ? { bgcolor: 'rgba(211,47,47,0.07)' } : d <= 7 ? { bgcolor: 'rgba(237,108,2,0.06)' } : undefined;
        }}
        empty={tab === 'bounced' ? 'No bounced cheques in this period.' : 'No pending post-dated cheques.'}
      />
      <MoneyViewDialog voucher={view} onClose={() => setView(null)} onChanged={reloadAll} />
      <ChequeActionDialog voucher={act?.v || null} action={act?.action || null} onClose={() => setAct(null)} onDone={reloadAll} />
    </>
  );
}
