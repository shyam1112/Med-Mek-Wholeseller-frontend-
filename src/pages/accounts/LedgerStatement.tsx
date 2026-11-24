import { useState } from 'react';
import {
  Alert, Box, Button, Grid, LinearProgress, Paper, Table, TableBody, TableCell, TableContainer, TableFooter, TableHead, TableRow, Typography,
} from '@mui/material';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import CurrencyRupeeIcon from '@mui/icons-material/CurrencyRupee';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { DateRange, FilterBar } from '../../components/Filters';
import { LedgerOption, LedgerPicker } from '../../components/Pickers';
import { StatCard } from '../../components/StatCard';
import { useFetch } from '../../lib/hooks';
import { amt, drcr, fdate, inr, today } from '../../lib/format';
import { exportExcel } from '../../lib/excel';
import { printTable } from '../../print/print';
import { openWhatsApp } from '../../lib/whatsapp';
import { useAuth } from '../../auth/AuthContext';
import { fyStartDate, groupLabel, voucherTypeLabel } from './accountsShared';

interface Entry {
  _id: string; date: string; voucherType: string; voucherId: string; voucherNo: string; counterLedgerName: string;
  narration: string; debit: number; credit: number; balance: number;
}
interface LedgerDoc { _id: string; name: string; group: string; mobile?: string; phone?: string; city?: string; gstin?: string; systemKey?: string }
interface StmtResp { ledger: LedgerDoc; opening: number; data: Entry[]; debit: number; credit: number; closing: number }

const LINKS: Partial<Record<string, (id: string) => string>> = {
  sales: (id) => `/sales/${id}`,
  purchase: (id) => `/purchases/${id}`,
};

export default function LedgerStatement() {
  const nav = useNavigate();
  const { business, can } = useAuth();
  const [sp, setSp] = useSearchParams();
  const ledgerId = sp.get('ledger') || '';
  const from = sp.get('from') || fyStartDate(business);
  const to = sp.get('to') || today();
  const [picked, setPicked] = useState<LedgerOption | null>(null);

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    setSp(next, { replace: true });
  };

  const { data, loading, error } = useFetch<StmtResp>(ledgerId ? '/reports/ledger' : null, { ledger: ledgerId, from, to });
  const stmt = ledgerId && data && data.ledger?._id === ledgerId ? data : null;
  const ledger = stmt?.ledger;
  const value: LedgerOption | null = picked && picked._id === ledgerId ? picked : ledger ? { _id: ledger._id, name: ledger.name, group: ledger.group } : null;
  const isParty = ledger && ['sundry_debtors', 'sundry_creditors'].includes(ledger.group);
  const isDebtor = ledger?.group === 'sundry_debtors';
  const rows = stmt?.data || [];
  const period = `${fdate(from)} to ${fdate(to)}`;

  const exportX = () => {
    if (!stmt) return;
    type R = { date: string; type: string; no: string; particulars: string; narration: string; debit: number | string; credit: number | string; balance: string };
    const out: R[] = [
      { date: fdate(from), type: '', no: '', particulars: 'Opening Balance', narration: '', debit: stmt.opening > 0 ? stmt.opening : '', credit: stmt.opening < 0 ? -stmt.opening : '', balance: drcr(stmt.opening) },
      ...rows.map((e) => ({ date: fdate(e.date), type: voucherTypeLabel(e.voucherType), no: e.voucherNo, particulars: e.counterLedgerName, narration: e.narration, debit: e.debit || '', credit: e.credit || '', balance: drcr(e.balance) })),
      { date: fdate(to), type: '', no: '', particulars: 'Closing Balance', narration: '', debit: stmt.debit, credit: stmt.credit, balance: drcr(stmt.closing) },
    ];
    exportExcel(`ledger-${ledger!.name.replace(/[^\w]+/g, '-')}-${from}-to-${to}`, [{
      name: 'Statement',
      rows: out,
      columns: [
        { key: 'date', label: 'Date' }, { key: 'type', label: 'Vch Type' }, { key: 'no', label: 'Vch No' },
        { key: 'particulars', label: 'Particulars' }, { key: 'narration', label: 'Narration' },
        { key: 'debit', label: 'Debit' }, { key: 'credit', label: 'Credit' }, { key: 'balance', label: 'Balance' },
      ],
    }]);
  };

  const print = () => {
    if (!stmt || !business) return;
    printTable(
      `Ledger Statement — ${ledger!.name}`, business, `${groupLabel(ledger!.group)} · ${period}`,
      ['Date', 'Particulars', 'Vch Type', 'Vch No', 'Debit', 'Credit', 'Balance'],
      [
        [fdate(from), 'Opening Balance', '', '', stmt.opening > 0 ? amt(stmt.opening) : '', stmt.opening < 0 ? amt(-stmt.opening) : '', drcr(stmt.opening)],
        ...rows.map((e) => [fdate(e.date), `${e.counterLedgerName}${e.narration ? ` — ${e.narration}` : ''}`, voucherTypeLabel(e.voucherType), e.voucherNo, e.debit ? amt(e.debit) : '', e.credit ? amt(e.credit) : '', drcr(e.balance)]),
      ],
      ['', 'Closing Balance', '', '', amt(stmt.debit), amt(stmt.credit), drcr(stmt.closing)],
      [4, 5, 6],
    );
  };

  const whatsapp = () => {
    if (!stmt || !ledger) return;
    const recent = rows.slice(-10);
    const lines = [
      `Dear ${ledger.name},`, '',
      `Statement of your account with ${business?.name || 'us'} for ${period}:`, '',
      `Opening balance: ${drcr(stmt.opening)}`,
      ...(rows.length > recent.length ? [`… ${rows.length - recent.length} earlier entries`] : []),
      ...recent.map((e) => `${fdate(e.date)} ${voucherTypeLabel(e.voucherType)} ${e.voucherNo}: ${e.debit ? `Dr ${amt(e.debit)}` : `Cr ${amt(e.credit)}`}`),
      '',
      `Total debit: ${inr(stmt.debit)} · Total credit: ${inr(stmt.credit)}`,
      `*Closing balance: ${drcr(stmt.closing)}*`,
      '',
      isDebtor && stmt.closing > 0 ? 'Kindly arrange the payment of the balance due. Please ignore if already paid.' : 'Please confirm the balance.',
      `— ${business?.name || ''}`,
    ];
    openWhatsApp(ledger.mobile || ledger.phone, lines.join('\n'));
  };

  return (
    <>
      <PageHeader
        help={['ledger', 'drcr', 'receipt', 'creditnote', 'debitnote']}
        title="Ledger Statement"
        subtitle={ledger ? `${ledger.name} · ${groupLabel(ledger.group)} · ${period}` : 'Account-wise statement with running balance'}
        crumbs={[{ label: 'Accounts' }]}
        actions={stmt && (
          <>
            {isDebtor && can('receipts:create') && <Button variant="outlined" startIcon={<CurrencyRupeeIcon />} onClick={() => nav(`/receipts/new?party=${ledger!._id}`)}>Receipt</Button>}
            {ledger?.group === 'sundry_creditors' && can('payments:create') && <Button variant="outlined" startIcon={<CurrencyRupeeIcon />} onClick={() => nav(`/payments/new?party=${ledger!._id}`)}>Payment</Button>}
            {isParty && <Button variant="outlined" color="success" startIcon={<WhatsAppIcon />} onClick={whatsapp}>WhatsApp</Button>}
            <Button variant="outlined" startIcon={<FileDownloadOutlinedIcon />} onClick={exportX}>Excel</Button>
            <Button variant="outlined" startIcon={<PrintOutlinedIcon />} onClick={print}>Print</Button>
          </>
        )}
      />
      <FilterBar>
        <LedgerPicker includeParties value={value} onChange={(v) => { setPicked(v); update({ ledger: v?._id || '' }); }} label="Ledger / party"
          autoFocus={!ledgerId} sx={{ width: { xs: '100%', sm: 340 } }} />
        <DateRange from={from} to={to} onChange={(f, t) => update({ from: f, to: t })} />
        {isParty && (
          <Button size="small" startIcon={<OpenInNewIcon />} onClick={() => nav(`/parties/${ledger!._id}`)}>Party details</Button>
        )}
      </FilterBar>

      {!ledgerId && (
        <Paper sx={{ p: 5, textAlign: 'center' }}>
          <Typography color="text.secondary">Choose a ledger or party to see its statement.</Typography>
        </Paper>
      )}
      {ledgerId && error && !stmt && <Alert severity="error">{error}</Alert>}
      {ledgerId && (stmt || loading) && (
        <>
          {stmt && (
            <Grid container spacing={1.5} sx={{ mb: 2 }}>
              <Grid item xs={6} md={3}><StatCard label="Opening balance" value={drcr(stmt.opening)} /></Grid>
              <Grid item xs={6} md={3}><StatCard label="Total debit" value={amt(stmt.debit)} hint={`${rows.filter((r) => r.debit).length} entries`} /></Grid>
              <Grid item xs={6} md={3}><StatCard label="Total credit" value={amt(stmt.credit)} hint={`${rows.filter((r) => r.credit).length} entries`} /></Grid>
              <Grid item xs={6} md={3}><StatCard label="Closing balance" value={drcr(stmt.closing)} tone={isDebtor && stmt.closing > 0 ? 'warn' : 'default'} /></Grid>
            </Grid>
          )}
          <Paper sx={{ overflow: 'hidden' }}>
            {loading && <LinearProgress sx={{ height: 2 }} />}
            <TableContainer sx={{ maxHeight: 'calc(100vh - 340px)' }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Particulars</TableCell>
                    <TableCell>Vch type</TableCell>
                    <TableCell>Vch no</TableCell>
                    <TableCell align="right">Debit</TableCell>
                    <TableCell align="right">Credit</TableCell>
                    <TableCell align="right">Balance</TableCell>
                  </TableRow>
                </TableHead>
                {stmt && (
                  <TableBody>
                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{fdate(from)}</TableCell>
                      <TableCell colSpan={3}><b>Opening Balance</b></TableCell>
                      <TableCell align="right">{stmt.opening > 0 ? amt(stmt.opening) : ''}</TableCell>
                      <TableCell align="right">{stmt.opening < 0 ? amt(-stmt.opening) : ''}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}><b>{drcr(stmt.opening)}</b></TableCell>
                    </TableRow>
                    {rows.map((e) => {
                      const link = LINKS[e.voucherType];
                      return (
                        <TableRow key={e._id} hover sx={{ cursor: link ? 'pointer' : undefined }} onClick={link ? () => nav(link(e.voucherId)) : undefined}>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>{fdate(e.date)}</TableCell>
                          <TableCell>
                            <Typography fontSize={13}>{e.counterLedgerName || '—'}</Typography>
                            {e.narration && <Typography fontSize={11} color="text.secondary" noWrap sx={{ maxWidth: 360 }}>{e.narration}</Typography>}
                          </TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>
                            <Typography fontSize={12} color={e.voucherType === 'cheque_bounce' ? 'error.main' : undefined}>{voucherTypeLabel(e.voucherType)}</Typography>
                          </TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap', color: link ? 'primary.main' : undefined, fontWeight: link ? 600 : undefined }}>{e.voucherNo}</TableCell>
                          <TableCell align="right">{e.debit ? amt(e.debit) : ''}</TableCell>
                          <TableCell align="right">{e.credit ? amt(e.credit) : ''}</TableCell>
                          <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{drcr(e.balance)}</TableCell>
                        </TableRow>
                      );
                    })}
                    {!rows.length && (
                      <TableRow><TableCell colSpan={7}><Box sx={{ py: 3, textAlign: 'center' }}><Typography color="text.secondary">No transactions in this period.</Typography></Box></TableCell></TableRow>
                    )}
                  </TableBody>
                )}
                {stmt && (
                  <TableFooter>
                    <TableRow sx={{ '& td': { fontWeight: 700, color: 'text.primary', background: '#f7f9fb', fontSize: 13, position: 'sticky', bottom: 0 } }}>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{fdate(to)}</TableCell>
                      <TableCell colSpan={3}>Closing Balance</TableCell>
                      <TableCell align="right">{amt(stmt.debit)}</TableCell>
                      <TableCell align="right">{amt(stmt.credit)}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{drcr(stmt.closing)}</TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </TableContainer>
          </Paper>
          <Typography variant="caption" color="text.secondary" display="block" mt={1}>Click a sales or purchase entry to open the bill.</Typography>
        </>
      )}
    </>
  );
}
