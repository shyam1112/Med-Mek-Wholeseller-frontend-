import React, { useMemo, useState } from 'react';
import { Alert, Box, Paper, Skeleton, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { ReportShell } from '../../components/ReportShell';
import { useFetch } from '../../lib/hooks';
import { amt, round2 } from '../../lib/format';
import { exportExcel } from '../../lib/excel';
import { useAuth } from '../../auth/AuthContext';
import { ErrorBox, PrintSupport } from '../reports/reportKit';
import { MonthInput, monthLabel, prevMonth } from './gstKit';

interface Heads { txval: number; igst: number; cgst: number; sgst: number }
interface Resp {
  fp: string;
  data: {
    '3.1a_outward_taxable': Heads; '3.1c_nil_exempt': Heads; '3.2_inter_state_unregistered': { pos: string; state: string; txval: number; igst: number }[];
    '4A5_itc_all_other': Heads; net_payable_indicative: { igst: number; cgst: number; sgst: number };
  };
}

// Rule 88A set-off: IGST credit first (IGST, then CGST/SGST shortfall),
// CGST/SGST credit against own head then IGST; CGST↔SGST never cross.
const setOff = (l: Heads, c: Heads) => {
  let li = l.igst, lc = l.cgst, ls = l.sgst, ci = Math.max(0, c.igst), cc = Math.max(0, c.cgst), cs = Math.max(0, c.sgst);
  const use = (need: number, have: number) => { const u = Math.min(need, have); return [need - u, have - u]; };
  [li, ci] = use(li, ci);
  [lc, cc] = use(lc, cc); [ls, cs] = use(ls, cs);
  [lc, ci] = use(lc, ci); [ls, ci] = use(ls, ci);
  [li, cc] = use(li, cc); [li, cs] = use(li, cs);
  return { cash: { igst: round2(li), cgst: round2(lc), sgst: round2(ls) }, carry: { igst: round2(ci), cgst: round2(cc), sgst: round2(cs) } };
};

const H = ({ children }: { children: React.ReactNode }) => <TableCell sx={{ fontWeight: 700 }}>{children}</TableCell>;
const N = ({ v, bold }: { v?: number | string; bold?: boolean }) => <TableCell align="right" sx={{ fontWeight: bold ? 700 : 400 }}>{typeof v === 'number' ? amt(v) : v ?? ''}</TableCell>;

const Section: React.FC<{ title: string; head: string[]; children: React.ReactNode; note?: string }> = ({ title, head, children, note }) => (
  <Paper sx={{ mb: 2, overflow: 'hidden', breakInside: 'avoid' }}>
    <Box sx={{ px: 1.5, py: 1, bgcolor: 'action.hover' }}>
      <Typography fontWeight={700} fontSize={14}>{title}</Typography>
      {note && <Typography fontSize={12} color="text.secondary">{note}</Typography>}
    </Box>
    <TableContainer>
      <Table size="small">
        <TableHead><TableRow>{head.map((h, i) => <TableCell key={h} align={i ? 'right' : 'left'}>{h}</TableCell>)}</TableRow></TableHead>
        <TableBody>{children}</TableBody>
      </Table>
    </TableContainer>
  </Paper>
);

export default function Gstr3b() {
  const { business } = useAuth();
  const [period, setPeriod] = useState(prevMonth());
  const { data, loading, error, reload } = useFetch<Resp>('/gst/gstr3b', { period });
  const d = data?.data;
  const o = d?.['3.1a_outward_taxable'];
  const nil = d?.['3.1c_nil_exempt'];
  const itc = d?.['4A5_itc_all_other'];
  const inter = d?.['3.2_inter_state_unregistered'] || [];
  const so = useMemo(() => (o && itc ? setOff(o, itc) : null), [o, itc]);
  const sumTax = (x?: { igst: number; cgst: number; sgst: number }) => (x ? round2(x.igst + x.cgst + x.sgst) : 0);

  const doExport = () => {
    if (!d || !o || !nil || !itc || !so) return;
    type R = { sec: string; desc: string; txval?: number | string; igst?: number | string; cgst?: number | string; sgst?: number | string; cess?: number | string };
    const rows: R[] = [
      { sec: '3.1(a)', desc: 'Outward taxable supplies (other than zero rated, nil rated and exempted)', ...o, cess: 0 },
      { sec: '3.1(b)', desc: 'Outward taxable supplies (zero rated)', txval: 0, igst: 0, cess: 0 },
      { sec: '3.1(c)', desc: 'Other outward supplies (nil rated, exempted)', txval: nil.txval },
      { sec: '3.1(d)', desc: 'Inward supplies (liable to reverse charge)', txval: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 },
      { sec: '3.1(e)', desc: 'Non-GST outward supplies', txval: 0 },
      ...inter.map((r) => ({ sec: '3.2', desc: `Unregistered persons — POS ${r.pos}-${r.state}`, txval: r.txval, igst: r.igst })),
      { sec: '4(A)(5)', desc: 'ITC available — all other ITC', igst: itc.igst, cgst: itc.cgst, sgst: itc.sgst, cess: 0 },
      { sec: '4(C)', desc: 'Net ITC available', igst: itc.igst, cgst: itc.cgst, sgst: itc.sgst, cess: 0 },
      { sec: '5', desc: 'Exempt, nil rated, non-GST inward supplies', txval: '' },
      { sec: '6.1', desc: 'Tax payable in cash (indicative, after set-off)', ...so.cash },
      { sec: '', desc: 'ITC carried forward (indicative)', ...so.carry },
    ];
    exportExcel(`GSTR3B_${business?.gstin || ''}_${data?.fp || period}`, [{
      name: 'GSTR-3B',
      rows,
      columns: [{ key: 'sec', label: 'Table' }, { key: 'desc', label: 'Description' }, { key: 'txval', label: 'Taxable value' },
        { key: 'igst', label: 'IGST' }, { key: 'cgst', label: 'CGST' }, { key: 'sgst', label: 'SGST/UTGST' }, { key: 'cess', label: 'Cess' }],
    }]);
  };

  return (
    <ReportShell
      help={['gstr3b', 'itc', 'igst']}
      title="GSTR-3B"
      subtitle={`${monthLabel(period)} · summary return${business?.gstin ? ` · ${business.gstin}` : ''}`}
      onExport={d ? doExport : undefined}
      filters={<MonthInput value={period} onChange={setPeriod} />}
    >
      <PrintSupport title={`GSTR-3B — ${monthLabel(period)}`} subtitle={`GSTIN ${business?.gstin || ''}`} />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !d && <Skeleton variant="rounded" height={360} />}
      {d && o && nil && itc && so && (
        <>
          <Section title="3.1 Details of outward supplies and inward supplies liable to reverse charge" head={['Nature of supplies', 'Taxable value', 'IGST', 'CGST', 'SGST/UTGST', 'Cess']}
            note="Net of credit notes issued in the month.">
            <TableRow><TableCell>(a) Outward taxable supplies (other than zero rated, nil rated and exempted)</TableCell><N v={o.txval} bold /><N v={o.igst} /><N v={o.cgst} /><N v={o.sgst} /><N v={0} /></TableRow>
            <TableRow><TableCell>(b) Outward taxable supplies (zero rated)</TableCell><N v={0} /><N v={0} /><N v="" /><N v="" /><N v={0} /></TableRow>
            <TableRow><TableCell>(c) Other outward supplies (nil rated, exempted)</TableCell><N v={nil.txval} /><N v="" /><N v="" /><N v="" /><N v="" /></TableRow>
            <TableRow><TableCell>(d) Inward supplies (liable to reverse charge)</TableCell><N v={0} /><N v={0} /><N v={0} /><N v={0} /><N v={0} /></TableRow>
            <TableRow><TableCell>(e) Non-GST outward supplies</TableCell><N v={0} /><N v="" /><N v="" /><N v="" /><N v="" /></TableRow>
          </Section>

          <Section title="3.2 Inter-state supplies made to unregistered persons" head={['Place of supply (State/UT)', 'Taxable value', 'IGST']}>
            {inter.length ? inter.map((r) => <TableRow key={r.pos}><TableCell>{r.pos}-{r.state}</TableCell><N v={r.txval} /><N v={r.igst} /></TableRow>)
              : <TableRow><TableCell colSpan={3}><Typography fontSize={13} color="text.secondary">None this month.</Typography></TableCell></TableRow>}
          </Section>

          <Section title="4. Eligible ITC" head={['Details', 'IGST', 'CGST', 'SGST/UTGST', 'Cess']} note="From purchase bills dated in the month, net of debit notes. Reconcile with GSTR-2B before claiming.">
            <TableRow><TableCell>(A)(5) All other ITC</TableCell><N v={itc.igst} /><N v={itc.cgst} /><N v={itc.sgst} /><N v={0} /></TableRow>
            <TableRow><TableCell>(B) ITC reversed</TableCell><N v={0} /><N v={0} /><N v={0} /><N v={0} /></TableRow>
            <TableRow><TableCell sx={{ fontWeight: 700 }}>(C) Net ITC available (A) − (B)</TableCell><N v={itc.igst} bold /><N v={itc.cgst} bold /><N v={itc.sgst} bold /><N v={0} /></TableRow>
          </Section>

          <Section title="Tax payable (indicative)" head={['', 'IGST', 'CGST', 'SGST/UTGST', 'Total']}>
            <TableRow><TableCell>Output tax liability</TableCell><N v={o.igst} /><N v={o.cgst} /><N v={o.sgst} /><N v={sumTax(o)} /></TableRow>
            <TableRow><TableCell>Less: ITC</TableCell><N v={itc.igst} /><N v={itc.cgst} /><N v={itc.sgst} /><N v={sumTax(itc)} /></TableRow>
            <TableRow><TableCell>Head-wise difference (before set-off)</TableCell><N v={d.net_payable_indicative.igst} /><N v={d.net_payable_indicative.cgst} /><N v={d.net_payable_indicative.sgst} /><N v={sumTax(d.net_payable_indicative)} /></TableRow>
            <TableRow sx={{ bgcolor: 'action.hover' }}><H>Payable in cash after set-off</H><N v={so.cash.igst} bold /><N v={so.cash.cgst} bold /><N v={so.cash.sgst} bold /><N v={sumTax(so.cash)} bold /></TableRow>
            <TableRow><TableCell>ITC carried forward</TableCell><N v={so.carry.igst} /><N v={so.carry.cgst} /><N v={so.carry.sgst} /><N v={sumTax(so.carry)} /></TableRow>
          </Section>
          <Alert severity="info">
            Indicative only. Set-off follows Section 49 / Rule 88A — IGST credit is used first (against IGST, then CGST/SGST), CGST and SGST credit can't be used against each other.
            Interest, late fee, reverse-charge, ineligible ITC and ITC as per GSTR-2B are not included — verify on the portal before filing.
          </Alert>
        </>
      )}
    </ReportShell>
  );
}
