import { useMemo, useState } from 'react';
import { Alert, AlertTitle, Box, Button, Collapse, Grid, Paper, Skeleton, Tab, Tabs, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import DataObjectIcon from '@mui/icons-material/DataObject';
import { ReportShell } from '../../components/ReportShell';
import { StatCard } from '../../components/StatCard';
import { useFetch } from '../../lib/hooks';
import { amt, fdate, inrShort } from '../../lib/format';
import { exportExcel, downloadJson } from '../../lib/excel';
import { useAuth } from '../../auth/AuthContext';
import { ErrorBox, PrintSupport } from '../reports/reportKit';
import { GCol, GTable, MonthInput, monthLabel, posLabel, prevMonth, sheetOf } from './gstKit';

interface Itm { num: number; itm_det: { rt: number; txval: number; iamt: number; camt: number; samt: number; csamt: number } }
interface Gstr1Json {
  gstin: string; fp: string;
  b2b: { ctin: string; inv: { inum: string; idt: string; val: number; pos: string; itms: Itm[] }[] }[];
  b2cl: { pos: string; inv: { inum: string; idt: string; val: number; itms: Itm[] }[] }[];
  b2cs: { sply_ty: string; pos: string; typ: string; rt: number; txval: number; iamt: number; camt: number; samt: number }[];
  cdnr: { ctin: string; nt: { ntty: string; nt_num: string; nt_dt: string; val: number; pos: string; itms: Itm[] }[] }[];
  hsn: { hsn_b2b: Hsn[]; hsn_b2c: Hsn[] };
  doc_issue: { doc_det: { doc_num: number; docs: { num: number; from: string; to: string; totnum: number; cancel: number; net_issue: number }[] }[] };
}
interface Hsn { num: number; hsn_sc: string; uqc: string; qty: number; rt: number; txval: number; iamt: number; camt: number; samt: number; val: number }
interface Sum { count: number; taxable: number; igst: number; cgst: number; sgst: number; total: number }
interface Reg { number: string; date: string; partyName: string; gstin: string; pos: string; taxable: number; igst: number; cgst: number; sgst: number; total: number }
interface Resp { fp: string; json: Gstr1Json; issues: string[]; summary: { b2b: Sum; b2c: Sum; creditNotes: Sum; cancelled: number }; registers: { invoices: Reg[]; notes: Reg[] } }

type Flat = Record<string, string | number>;
const taxCols: GCol<Flat>[] = [
  { key: 'rt', label: 'Rate %', kind: 'pct' }, { key: 'txval', label: 'Taxable', kind: 'money' },
  { key: 'iamt', label: 'IGST', kind: 'money' }, { key: 'camt', label: 'CGST', kind: 'money' }, { key: 'samt', label: 'SGST', kind: 'money' },
];
const DOC_NAME: Record<number, string> = { 1: 'Invoices for outward supply', 5: 'Credit Note' };

export default function Gstr1() {
  const { business } = useAuth();
  const [period, setPeriod] = useState(prevMonth());
  const [tab, setTab] = useState('b2b');
  const [hsnKind, setHsnKind] = useState<'b2b' | 'b2c'>('b2b');
  const [regKind, setRegKind] = useState<'invoices' | 'notes'>('invoices');
  const [showIssues, setShowIssues] = useState(false);
  const { data, loading, error, reload } = useFetch<Resp>('/gst/gstr1', { period });
  const j = data?.json;

  const sections = useMemo(() => {
    if (!data || !j) return null;
    const nameOf = new Map(data.registers.invoices.map((r) => [r.number, r.partyName]));
    const noteName = new Map(data.registers.notes.map((r) => [r.number, r.partyName]));
    const b2b: Flat[] = j.b2b.flatMap((p) => p.inv.flatMap((inv) => inv.itms.map((it, i) => ({
      ctin: p.ctin, party: nameOf.get(inv.inum) || '', inum: inv.inum, idt: inv.idt, val: i ? '' : inv.val, pos: posLabel(inv.pos), ...it.itm_det,
    }))));
    const b2cl: Flat[] = j.b2cl.flatMap((p) => p.inv.flatMap((inv) => inv.itms.map((it, i) => ({ pos: posLabel(p.pos), inum: inv.inum, idt: inv.idt, val: i ? '' : inv.val, ...it.itm_det }))));
    const b2cs: Flat[] = j.b2cs.map((r) => ({ ...r, pos: posLabel(r.pos) }));
    const cdnr: Flat[] = j.cdnr.flatMap((p) => p.nt.flatMap((n) => n.itms.map((it, i) => ({
      ctin: p.ctin, party: noteName.get(n.nt_num) || '', nt_num: n.nt_num, nt_dt: n.nt_dt, ntty: n.ntty, val: i ? '' : n.val, pos: posLabel(n.pos), ...it.itm_det,
    }))));
    const docs: Flat[] = j.doc_issue.doc_det.flatMap((d) => d.docs.map((x) => ({ nature: DOC_NAME[d.doc_num] || `Doc ${d.doc_num}`, ...x })));
    return { b2b, b2cl, b2cs, cdnr, docs, hsnB2b: j.hsn.hsn_b2b as unknown as Flat[], hsnB2c: j.hsn.hsn_b2c as unknown as Flat[] };
  }, [data, j]);

  const cols = {
    b2b: [{ key: 'ctin', label: 'GSTIN of recipient' }, { key: 'party', label: 'Receiver name' }, { key: 'inum', label: 'Invoice no' }, { key: 'idt', label: 'Date' },
      { key: 'val', label: 'Invoice value', kind: 'money' }, { key: 'pos', label: 'Place of supply' }, ...taxCols] as GCol<Flat>[],
    b2cl: [{ key: 'inum', label: 'Invoice no' }, { key: 'idt', label: 'Date' }, { key: 'val', label: 'Invoice value', kind: 'money' }, { key: 'pos', label: 'Place of supply' }, ...taxCols] as GCol<Flat>[],
    b2cs: [{ key: 'sply_ty', label: 'Type' }, { key: 'pos', label: 'Place of supply' }, ...taxCols] as GCol<Flat>[],
    cdnr: [{ key: 'ctin', label: 'GSTIN of recipient' }, { key: 'party', label: 'Receiver name' }, { key: 'nt_num', label: 'Note no' }, { key: 'nt_dt', label: 'Date' },
      { key: 'ntty', label: 'Type' }, { key: 'val', label: 'Note value', kind: 'money' }, { key: 'pos', label: 'Place of supply' }, ...taxCols] as GCol<Flat>[],
    hsn: [{ key: 'hsn_sc', label: 'HSN' }, { key: 'uqc', label: 'UQC' }, { key: 'qty', label: 'Total qty', kind: 'qty' }, { key: 'rt', label: 'Rate %', kind: 'pct' },
      { key: 'val', label: 'Total value', kind: 'money' }, { key: 'txval', label: 'Taxable', kind: 'money' }, { key: 'iamt', label: 'IGST', kind: 'money' },
      { key: 'camt', label: 'CGST', kind: 'money' }, { key: 'samt', label: 'SGST', kind: 'money' }] as GCol<Flat>[],
    docs: [{ key: 'nature', label: 'Nature of document' }, { key: 'from', label: 'Sr. no from' }, { key: 'to', label: 'Sr. no to' },
      { key: 'totnum', label: 'Total', kind: 'qty' }, { key: 'cancel', label: 'Cancelled', kind: 'qty' }, { key: 'net_issue', label: 'Net issued', kind: 'qty' }] as GCol<Flat>[],
  };
  const regCols: GCol<Reg>[] = [
    { key: 'number', label: 'No' }, { key: 'date', label: 'Date', get: (r) => fdate(r.date) }, { key: 'partyName', label: 'Party' }, { key: 'gstin', label: 'GSTIN' },
    { key: 'pos', label: 'POS', get: (r) => posLabel(r.pos) }, { key: 'taxable', label: 'Taxable', kind: 'money' }, { key: 'igst', label: 'IGST', kind: 'money' },
    { key: 'cgst', label: 'CGST', kind: 'money' }, { key: 'sgst', label: 'SGST', kind: 'money' }, { key: 'total', label: 'Total', kind: 'money' },
  ];

  const gstin = j?.gstin || business?.gstin || 'GSTIN';
  const fp = data?.fp || '';
  const doExport = () => {
    if (!sections || !data) return;
    exportExcel(`GSTR1_${gstin}_${fp}`, [
      sheetOf('b2b', cols.b2b, sections.b2b), sheetOf('b2cl', cols.b2cl, sections.b2cl), sheetOf('b2cs', cols.b2cs, sections.b2cs),
      sheetOf('cdnr', cols.cdnr, sections.cdnr), sheetOf('hsn(b2b)', cols.hsn, sections.hsnB2b), sheetOf('hsn(b2c)', cols.hsn, sections.hsnB2c),
      sheetOf('docs', cols.docs, sections.docs), sheetOf('Sales register', regCols, data.registers.invoices), sheetOf('Credit notes', regCols, data.registers.notes),
    ] as { name: string; rows: Record<string, unknown>[]; columns: { key: string; label: string }[] }[]);
  };

  const s = data?.summary;
  const tax = (x?: Sum) => (x ? x.igst + x.cgst + x.sgst : 0);
  const issues = data?.issues || [];
  const counts: Record<string, number> = sections ? {
    b2b: j!.b2b.reduce((n, p) => n + p.inv.length, 0), b2cl: j!.b2cl.reduce((n, p) => n + p.inv.length, 0), b2cs: sections.b2cs.length,
    cdnr: j!.cdnr.reduce((n, p) => n + p.nt.length, 0), hsn: sections.hsnB2b.length + sections.hsnB2c.length, docs: sections.docs.length,
    reg: data!.registers.invoices.length + data!.registers.notes.length,
  } : {};
  const TABS: [string, string][] = [['b2b', 'B2B (4A)'], ['b2cl', 'B2CL (5)'], ['b2cs', 'B2CS (7)'], ['cdnr', 'CDNR (9B)'], ['hsn', 'HSN (12)'], ['docs', 'Documents (13)'], ['reg', 'Registers']];

  return (
    <ReportShell
      help={['gstr1', 'gstin', 'hsn', 'creditnote']}
      title="GSTR-1"
      subtitle={`${monthLabel(period)} · outward supplies${business?.gstin ? ` · ${business.gstin}` : ''}`}
      onExport={sections ? doExport : undefined}
      actions={j && (
        <Button variant="contained" startIcon={<DataObjectIcon />} onClick={() => downloadJson(`GSTR1_${gstin}_${fp}.json`, j)} className="no-print">
          Download GSTR-1 JSON
        </Button>
      )}
      filters={<MonthInput value={period} onChange={setPeriod} />}
    >
      <PrintSupport title={`GSTR-1 — ${monthLabel(period)}`} subtitle={`GSTIN ${gstin}`} landscape />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data && <Skeleton variant="rounded" height={260} />}
      {data && s && (
        <>
          <Grid container spacing={1.5} sx={{ mb: 1.5 }}>
            <Grid item xs={6} md={3}><StatCard label={`B2B invoices (${s.b2b.count})`} value={inrShort(s.b2b.taxable)} hint={`Tax ₹${amt(tax(s.b2b))}`} /></Grid>
            <Grid item xs={6} md={3}><StatCard label={`B2C invoices (${s.b2c.count})`} value={inrShort(s.b2c.taxable)} hint={`Tax ₹${amt(tax(s.b2c))}`} /></Grid>
            <Grid item xs={6} md={3}><StatCard label={`Credit notes (${s.creditNotes.count})`} value={inrShort(s.creditNotes.taxable)} hint={`Tax ₹${amt(tax(s.creditNotes))}`} tone={s.creditNotes.count ? 'warn' : 'default'} /></Grid>
            <Grid item xs={6} md={3}><StatCard label="Net taxable / tax" value={inrShort(s.b2b.taxable + s.b2c.taxable - s.creditNotes.taxable)} hint={`Tax ₹${amt(tax(s.b2b) + tax(s.b2c) - tax(s.creditNotes))} · ${s.cancelled} cancelled`} /></Grid>
          </Grid>
          {issues.length > 0 && (
            <Alert severity="warning" sx={{ mb: 1.5 }} action={<Button color="inherit" size="small" onClick={() => setShowIssues((x) => !x)}>{showIssues ? 'Hide' : 'Show'}</Button>}>
              <AlertTitle sx={{ mb: 0 }}>{issues.length}{issues.length >= 100 ? '+' : ''} issue{issues.length === 1 ? '' : 's'} the GST portal may reject — fix before filing</AlertTitle>
              <Collapse in={showIssues}><Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>{issues.map((x, i) => <li key={i}><Typography fontSize={13}>{x}</Typography></li>)}</Box></Collapse>
            </Alert>
          )}
          {!issues.length && data.registers.invoices.length > 0 && <Alert severity="success" sx={{ mb: 1.5 }}>No data issues found. Download the JSON and upload it on the GST portal (Returns → GSTR-1 → Prepare offline → Upload).</Alert>}
          <Paper sx={{ mb: 1 }} className="no-print">
            <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
              {TABS.map(([k, l]) => <Tab key={k} value={k} label={`${l}${counts[k] !== undefined ? ` · ${counts[k]}` : ''}`} />)}
            </Tabs>
          </Paper>
          {sections && (
            <>
              {tab === 'b2b' && <GTable cols={cols.b2b} rows={sections.b2b} empty="No B2B invoices." />}
              {tab === 'b2cl' && <GTable cols={cols.b2cl} rows={sections.b2cl} empty="No inter-state B2C invoices above ₹1,00,000." />}
              {tab === 'b2cs' && <GTable cols={cols.b2cs} rows={sections.b2cs} empty="No B2C (small) supplies." />}
              {tab === 'cdnr' && <GTable cols={cols.cdnr} rows={sections.cdnr} empty="No credit notes to registered parties." />}
              {tab === 'hsn' && (
                <>
                  <ToggleButtonGroup size="small" exclusive value={hsnKind} onChange={(_, v) => v && setHsnKind(v)} sx={{ mb: 1 }} className="no-print">
                    <ToggleButton value="b2b" sx={{ px: 2 }}>B2B</ToggleButton><ToggleButton value="b2c" sx={{ px: 2 }}>B2C</ToggleButton>
                  </ToggleButtonGroup>
                  <GTable cols={cols.hsn} rows={hsnKind === 'b2b' ? sections.hsnB2b : sections.hsnB2c} empty="No HSN rows." />
                </>
              )}
              {tab === 'docs' && <GTable cols={cols.docs} rows={sections.docs} empty="No documents issued." />}
              {tab === 'reg' && (
                <>
                  <ToggleButtonGroup size="small" exclusive value={regKind} onChange={(_, v) => v && setRegKind(v)} sx={{ mb: 1 }} className="no-print">
                    <ToggleButton value="invoices" sx={{ px: 2 }}>Sales invoices</ToggleButton><ToggleButton value="notes" sx={{ px: 2 }}>Credit notes</ToggleButton>
                  </ToggleButtonGroup>
                  <GTable cols={regCols} rows={data.registers[regKind]} empty="Nothing in this period." />
                </>
              )}
            </>
          )}
        </>
      )}
    </ReportShell>
  );
}
