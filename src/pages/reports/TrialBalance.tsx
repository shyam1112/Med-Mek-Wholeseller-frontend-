import { useMemo, useState } from 'react';
import { Alert, FormControlLabel, Switch, TextField, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { ReportShell } from '../../components/ReportShell';
import { DataTable, Col } from '../../components/DataTable';
import { SearchBox } from '../../components/Filters';
import { useFetch } from '../../lib/hooks';
import { amt, fdate, round2, today } from '../../lib/format';
import { ErrorBox, PrintSupport, groupIndex, groupLabel } from './reportKit';
import { exportTitledExcel } from './titledExcel';
import { useAuth } from '../../auth/AuthContext';

interface Row { _id: string; name: string; group: string; nature: string; debit: number; credit: number; net: number }
interface Flat { kind: 'group' | 'ledger'; id: string; name: string; group: string; debit: number; credit: number }

export default function TrialBalance() {
  const nav = useNavigate();
  const { business } = useAuth();
  const [asOf, setAsOf] = useState(today());
  const [summary, setSummary] = useState(false);
  const [search, setSearch] = useState('');
  const { data, loading, error, reload } = useFetch<{ data: Row[]; debit: number; credit: number; difference: number }>('/reports/trial-balance', { asOf });
  const raw = data?.data || [];

  const flat = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? raw.filter((r) => r.name.toLowerCase().includes(q)) : raw;
    const groups = new Map<string, Row[]>();
    for (const r of list) { if (!groups.has(r.group)) groups.set(r.group, []); groups.get(r.group)!.push(r); }
    const out: Flat[] = [];
    for (const g of [...groups.keys()].sort((a, b) => groupIndex(a) - groupIndex(b))) {
      const rs = groups.get(g)!;
      // Net the group like Tally: a group shows on one side only.
      const net = round2(rs.reduce((s, r) => s + r.debit - r.credit, 0));
      out.push({ kind: 'group', id: g, name: groupLabel(g), group: g, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 });
      if (!summary) for (const r of rs) out.push({ kind: 'ledger', id: String(r._id), name: r.name, group: g, debit: r.debit, credit: r.credit });
    }
    return out;
  }, [raw, summary, search]);

  const diff = data?.difference || 0;
  // Footer = sum of netted group lines (equals ledger-wise totals less intra-group offsets).
  const gDr = round2(flat.filter((r) => r.kind === 'group').reduce((s, r) => s + r.debit, 0));
  const gCr = round2(flat.filter((r) => r.kind === 'group').reduce((s, r) => s + r.credit, 0));
  const columns: Col<Flat>[] = [
    { key: 'name', label: 'Particulars', render: (r) => r.kind === 'group'
      ? <Typography fontSize={13} fontWeight={700}>{r.name}</Typography>
      : <Typography fontSize={13} sx={{ pl: 3 }}>{r.name}</Typography>, footer: 'Grand Total' },
    { key: 'debit', label: 'Debit', align: 'right', render: (r) => (r.debit ? <Typography component="span" fontSize={13} fontWeight={r.kind === 'group' ? 700 : 400}>{amt(r.debit)}</Typography> : ''), footer: amt(gDr) },
    { key: 'credit', label: 'Credit', align: 'right', render: (r) => (r.credit ? <Typography component="span" fontSize={13} fontWeight={r.kind === 'group' ? 700 : 400}>{amt(r.credit)}</Typography> : ''), footer: amt(gCr) },
  ];

  const doExport = () => exportTitledExcel(
    `trial-balance-${asOf}`, 'Trial Balance',
    [business?.name || '', `Trial Balance as on ${fdate(asOf)}`, ...(business?.gstin ? [`GSTIN: ${business.gstin}`] : [])],
    ['Particulars', 'Group', 'Debit', 'Credit'],
    flat.map((r) => [r.kind === 'group' ? r.name.toUpperCase() : `    ${r.name}`, r.kind === 'group' ? '' : groupLabel(r.group), r.debit || '', r.credit || '']),
    ['Grand Total', '', gDr, gCr],
  );

  return (
    <ReportShell
      help={['trialbalance', 'drcr']}
      title="Trial Balance"
      subtitle={`As on ${fdate(asOf)} (opening balances + all postings to date)`}
      onExport={flat.length ? doExport : undefined}
      filters={
        <>
          <TextField type="date" label="As on" value={asOf} onChange={(e) => setAsOf(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: 160 }} />
          <SearchBox value={search} onChange={setSearch} placeholder="Ledger" width={220} />
          <FormControlLabel control={<Switch checked={summary} onChange={(e) => setSummary(e.target.checked)} />} label="Groups only" />
        </>
      }
    >
      <PrintSupport title="Trial Balance" subtitle={`As on ${fdate(asOf)}`} />
      <ErrorBox error={error} onRetry={reload} />
      {data && (Math.abs(diff) > 0.009
        ? <Alert severity="error" sx={{ mb: 1.5 }}>Trial balance does not tally — difference ₹{amt(Math.abs(diff))} ({diff > 0 ? 'debit' : 'credit'} side higher). Usually caused by ledger opening balances that don't balance (opening stock / capital not entered).</Alert>
        : <Alert severity="success" sx={{ mb: 1.5 }}>Trial balance tallies — debit equals credit.</Alert>)}
      <DataTable
        columns={columns}
        rows={flat}
        loading={loading}
        rowKey={(r) => `${r.kind}-${r.id}`}
        rowSx={(r) => (r.kind === 'group' ? { bgcolor: 'action.hover' } : undefined)}
        onRowClick={(r) => r.kind === 'ledger' && nav(`/ledger-statement?ledger=${r.id}`)}
        empty="No balances."
        maxHeight="calc(100vh - 260px)"
      />
    </ReportShell>
  );
}
