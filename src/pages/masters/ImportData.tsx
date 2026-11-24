import { useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, Grid, LinearProgress, MenuItem, Paper, Step, StepLabel, Stepper, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import dayjs from 'dayjs';
import { PageHeader } from '../../components/PageHeader';
import { DataTable, Col } from '../../components/DataTable';
import { exportExcel, readSheet } from '../../lib/excel';
import { isoDate, num, parseExpiry } from '../../lib/format';
import { api, errMsg } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { STATES } from '../../lib/types';
import type { Product } from '../../lib/types';

type Kind = 'products' | 'customers' | 'suppliers' | 'opening';
type FieldType = 'text' | 'number' | 'date' | 'expiry';
interface Field { key: string; label: string; required?: boolean; type?: FieldType; example: string | number; aliases?: string[]; help?: string }

const PRODUCT_FIELDS: Field[] = [
  { key: 'name', label: 'Product Name', required: true, example: 'DOLO 650 TAB', aliases: ['product', 'item', 'itemname', 'description', 'medicine', 'productname'] },
  { key: 'manufacturer', label: 'Company', example: 'Micro Labs', aliases: ['manufacturer', 'mfr', 'mfg', 'companyname', 'manufacturername', 'make'] },
  { key: 'packing', label: 'Packing', example: '15 TAB', aliases: ['pack', 'packsize', 'pack size'] },
  { key: 'salt', label: 'Salt', example: 'Paracetamol 650mg', aliases: ['composition', 'generic', 'molecule', 'content'] },
  { key: 'hsn', label: 'HSN', example: '3004', aliases: ['hsncode', 'hsnsac'] },
  { key: 'gstRate', label: 'GST %', type: 'number', example: 12, aliases: ['gst', 'gstrate', 'tax', 'taxrate', 'gstpercent', 'igst'] },
  { key: 'mrp', label: 'MRP', type: 'number', example: 33.6 },
  { key: 'ptr', label: 'PTR', type: 'number', example: 24 },
  { key: 'pts', label: 'PTS', type: 'number', example: 21.6 },
  { key: 'purchaseRate', label: 'Purchase Rate', type: 'number', example: 21, aliases: ['purrate', 'cost', 'costrate', 'purchaseprice', 'prate'] },
  { key: 'schedule', label: 'Schedule', example: 'H', help: 'None / H / H1 / X / G / Narcotic', aliases: ['sch', 'drugschedule'] },
  { key: 'rack', label: 'Rack', example: 'A-12', aliases: ['location', 'shelf', 'rackno'] },
  { key: 'barcode', label: 'Barcode', example: '8901234567890', aliases: ['ean', 'upc'] },
  { key: 'reorderLevel', label: 'Reorder Level', type: 'number', example: 20, aliases: ['rol', 'minqty', 'reorder'] },
  { key: 'reorderQty', label: 'Reorder Qty', type: 'number', example: 50, aliases: ['roq', 'orderqty'] },
  { key: 'scheme', label: 'Scheme', example: '10+1', help: 'e.g. 10+1 — or use Scheme Buy / Scheme Free', aliases: ['deal', 'offer'] },
  { key: 'schemeBuy', label: 'Scheme Buy', type: 'number', example: '', aliases: ['dealbuy'] },
  { key: 'schemeFree', label: 'Scheme Free', type: 'number', example: '', aliases: ['dealfree', 'free'] },
  { key: 'unit', label: 'Unit', example: 'Strip', aliases: ['uom'] },
  { key: 'form', label: 'Form', example: 'Tablet', aliases: ['dosageform', 'type'] },
  { key: 'category', label: 'Category', example: 'Ethical', aliases: ['group', 'class'] },
  { key: 'code', label: 'Code', example: 'DOL650', aliases: ['itemcode', 'productcode', 'sku', 'shortcode'] },
];

const PARTY_FIELDS: Field[] = [
  { key: 'name', label: 'Party Name', required: true, example: 'Shree Medical Stores', aliases: ['name', 'party', 'customer', 'supplier', 'firm', 'firmname', 'accountname', 'ledger', 'ledgername'] },
  { key: 'gstin', label: 'GSTIN', example: '24AAACS1234F1Z5', aliases: ['gst', 'gstno', 'gstnumber', 'gstinno'] },
  { key: 'mobile', label: 'Mobile', example: '9876543210', aliases: ['mobileno', 'cell', 'whatsapp', 'mob'] },
  { key: 'phone', label: 'Phone', example: '0261-2345678', aliases: ['phoneno', 'telephone', 'landline', 'tel'] },
  { key: 'email', label: 'Email', example: 'shree@example.com', aliases: ['emailid', 'mail'] },
  { key: 'address', label: 'Address', example: 'Shop 4, Station Road', aliases: ['address1', 'addr'] },
  { key: 'city', label: 'City', example: 'Surat', aliases: ['town', 'place'] },
  { key: 'pincode', label: 'Pincode', example: '395003', aliases: ['pin', 'zip', 'postalcode'] },
  { key: 'stateCode', label: 'State', example: '24', help: 'State code (24) or name (Gujarat)', aliases: ['statecode', 'statename'] },
  { key: 'dl20b', label: 'DL 20B', example: 'GJ-SRT-123456', aliases: ['dl1', 'dlno', 'druglicence', 'druglicense', 'dl', '20b'] },
  { key: 'dl21b', label: 'DL 21B', example: 'GJ-SRT-123457', aliases: ['dl2', '21b'] },
  { key: 'dlExpiry', label: 'DL Expiry', type: 'date', example: '31-12-2027', aliases: ['dlexpirydate', 'dlvalidtill', 'dlvalidity', 'licenceexpiry'] },
  { key: 'creditLimit', label: 'Credit Limit', type: 'number', example: 100000, aliases: ['limit', 'creditlimitamount'] },
  { key: 'creditDays', label: 'Credit Days', type: 'number', example: 30, aliases: ['days', 'creditperiod', 'duedays'] },
  { key: 'openingBalance', label: 'Opening Balance', type: 'number', example: 15000, help: 'Negative = Cr', aliases: ['opening', 'openingbal', 'balance', 'ob'] },
  { key: 'openingType', label: 'Dr/Cr', example: 'Dr', aliases: ['drcr', 'openingtype', 'baltype', 'type'] },
  { key: 'routeName', label: 'Route', example: 'City East', aliases: ['route', 'beat'] },
  { key: 'area', label: 'Area', example: 'Station Road', aliases: ['locality', 'zone'] },
  { key: 'contactPerson', label: 'Contact Person', example: 'Ramesh Shah', aliases: ['contact', 'owner', 'proprietor'] },
];

const OPENING_FIELDS: Field[] = [
  { key: 'product', label: 'Product Name', required: true, example: 'DOLO 650 TAB', aliases: ['product', 'name', 'item', 'itemname', 'productname', 'description'] },
  { key: 'manufacturer', label: 'Company', example: 'Micro Labs', help: 'Only used when two products share a name', aliases: ['manufacturer', 'mfr', 'companyname'] },
  { key: 'batchNo', label: 'Batch', required: true, example: 'DL2405', aliases: ['batchno', 'batchnumber', 'lot', 'batch no'] },
  { key: 'expiry', label: 'Expiry', required: true, type: 'expiry', example: '08/27', help: 'MM/YY, MM/YYYY or a date', aliases: ['exp', 'expdate', 'expirydate'] },
  { key: 'mrp', label: 'MRP', required: true, type: 'number', example: 33.6 },
  { key: 'ptr', label: 'PTR', type: 'number', example: 24 },
  { key: 'pts', label: 'PTS', type: 'number', example: 21.6 },
  { key: 'purchaseRate', label: 'Purchase Rate', type: 'number', example: 21, aliases: ['purrate', 'cost', 'rate', 'costrate'] },
  { key: 'qty', label: 'Qty', required: true, type: 'number', example: 120, aliases: ['quantity', 'stock', 'closing', 'closingstock', 'balance', 'qtyinhand'] },
];

const FIELDS: Record<Kind, Field[]> = { products: PRODUCT_FIELDS, customers: PARTY_FIELDS, suppliers: PARTY_FIELDS, opening: OPENING_FIELDS };
const TITLES: Record<Kind, string> = { products: 'Products', customers: 'Customers', suppliers: 'Suppliers', opening: 'Opening stock' };
const HELP: Record<Kind, string> = {
  products: 'Matched by name + company: existing products are updated, new ones created. Missing companies are created automatically.',
  customers: 'Matched by name: existing customers are updated. GSTIN is validated (checksum) and fills state + PAN. Route is matched by route name.',
  suppliers: 'Matched by name: existing suppliers are updated. GSTIN is validated (checksum) and fills state + PAN.',
  opening: 'Each row adds stock to a batch (created if new; same batch no + MRP adds to it). Products must already exist — import Products first. Posted as “Opening stock” adjustments of up to 200 lines each.',
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const STATE_BY_NAME = Object.fromEntries(Object.entries(STATES).map(([c, n]) => [norm(n), c]));

const autoMap = (fields: Field[], headers: string[]) => {
  const map: Record<string, string> = {};
  const used = new Set<string>();
  for (const f of fields) {
    const cands = [f.key, f.label, ...(f.aliases || [])].map(norm);
    const h = headers.find((x) => !used.has(x) && cands.includes(norm(x)));
    if (h) { map[f.key] = h; used.add(h); }
  }
  return map;
};

const toNum = (v: unknown): number | undefined => {
  if (v === '' || v === null || v === undefined) return undefined;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/[₹,\s%]/g, '');
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};
const toStr = (v: unknown) => (v instanceof Date ? isoDate(v) : String(v ?? '').trim());
const toDate = (v: unknown): string | undefined => {
  if (!v) return undefined;
  if (v instanceof Date) return isoDate(v);
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/); // DD-MM-YYYY (Indian)
  if (m) { const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]); return dayjs(new Date(y, Number(m[2]) - 1, Number(m[1]))).format('YYYY-MM-DD'); }
  return dayjs(s).isValid() ? dayjs(s).format('YYYY-MM-DD') : undefined;
};
const toExpiry = (v: unknown): string | null => {
  if (!v) return null;
  if (v instanceof Date) return dayjs(v).endOf('month').format('YYYY-MM-DD');
  return parseExpiry(String(v));
};
const SCHED: Record<string, string> = { '': 'None', none: 'None', no: 'None', otc: 'None', h: 'H', schh: 'H', h1: 'H1', schh1: 'H1', x: 'X', g: 'G', narcotic: 'Narcotic', ndps: 'Narcotic', n: 'Narcotic' };

// Turn one sheet row into the API shape for the kind.
const mapRow = (kind: Kind, raw: Record<string, unknown>, map: Record<string, string>) => {
  const out: Record<string, unknown> = {};
  for (const f of FIELDS[kind]) {
    const h = map[f.key];
    if (!h) continue;
    const v = raw[h];
    if (f.type === 'number') { const n = toNum(v); if (n !== undefined) out[f.key] = n; }
    else if (f.type === 'date') { const d = toDate(v); if (d) out[f.key] = d; }
    else if (f.type === 'expiry') out[f.key] = v instanceof Date ? v : toStr(v);
    else { const s = toStr(v); if (s) out[f.key] = s; }
  }
  if (kind === 'products') {
    if (typeof out.scheme === 'string') {
      const m = out.scheme.match(/(\d+)\s*\+\s*(\d+)/);
      if (m && out.schemeBuy === undefined) { out.schemeBuy = Number(m[1]); out.schemeFree = Number(m[2]); }
      delete out.scheme;
    }
    if (out.schedule !== undefined) out.schedule = SCHED[norm(String(out.schedule))] || String(out.schedule);
    if (out.hsn) out.hsn = String(out.hsn).replace(/\D/g, '');
  }
  if (kind === 'customers' || kind === 'suppliers') {
    if (out.stateCode) {
      const s = String(out.stateCode);
      out.stateCode = /^\d{1,2}$/.test(s) ? s.padStart(2, '0') : STATE_BY_NAME[norm(s)] || s;
    }
    if (out.gstin) out.gstin = String(out.gstin).toUpperCase().replace(/\s/g, '');
    if (typeof out.openingBalance === 'number' && out.openingBalance < 0) { out.openingBalance = -out.openingBalance; out.openingType = 'cr'; }
    if (out.openingType) out.openingType = /^c/i.test(String(out.openingType)) ? 'cr' : 'dr';
    if (out.mobile) out.mobile = String(out.mobile).replace(/[^\d+]/g, '');
  }
  return out;
};

export default function ImportData() {
  const [kind, setKind] = useState<Kind>('products');
  return (
    <>
      <PageHeader title="Import Data" crumbs={[{ label: 'Masters' }]} subtitle="Bring your item master, parties and opening stock from Excel / CSV (Marg, Busy, Tally exports work after mapping the columns)" />
      <Paper sx={{ mb: 2 }}>
        <Tabs value={kind} onChange={(_, v) => setKind(v)} variant="scrollable" sx={{ px: 1 }}>
          {(Object.keys(TITLES) as Kind[]).map((k) => <Tab key={k} value={k} label={TITLES[k]} />)}
        </Tabs>
      </Paper>
      <ImportPanel key={kind} kind={kind} />
    </>
  );
}

interface Result { created?: number; updated?: number; imported?: number; errors: { row: number | string; message: string }[] }

function ImportPanel({ kind }: { kind: Kind }) {
  const nav = useNavigate();
  const { can } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const fields = FIELDS[kind];
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [raw, setRaw] = useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [map, setMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  // Opening stock: product resolution
  const [resolved, setResolved] = useState<{ rows: { idx: number; item: Record<string, unknown> }[]; problems: { row: number; name: string; message: string }[] } | null>(null);

  const perm = kind === 'opening' ? 'inventory:create' : kind === 'products' ? 'products:create' : 'parties:create';
  const missingRequired = fields.filter((f) => f.required && !map[f.key]);
  const mapped = useMemo(() => raw.map((r) => mapRow(kind, r, map)), [raw, map, kind]);

  const downloadTemplate = () => {
    const example = Object.fromEntries(fields.map((f) => [f.key, f.example]));
    exportExcel(`${kind}-import-template`, [{ name: TITLES[kind], columns: fields.map((f) => ({ key: f.key, label: f.label })), rows: [example] }]);
  };

  const onFile = async (file?: File | null) => {
    if (!file) return;
    setResult(null); setResolved(null);
    try {
      const rows = (await readSheet(file)).filter((r) => Object.values(r).some((v) => String(v ?? '').trim() !== ''));
      if (!rows.length) { enqueueSnackbar('The first sheet has no data rows.', { variant: 'warning' }); return; }
      const hs = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((h) => !h.startsWith('__EMPTY'));
      setRaw(rows); setHeaders(hs); setMap(autoMap(fields, hs)); setFileName(file.name);
    } catch (e) {
      enqueueSnackbar(`Could not read the file: ${errMsg(e)}`, { variant: 'error' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const reset = () => { setRaw([]); setHeaders([]); setMap({}); setFileName(''); setResult(null); setResolved(null); setProgress(0); };

  // ---- masters import (products / parties) ----
  const importMasters = async () => {
    const rows = mapped.map((r, i) => ({ r, i })).filter(({ r }) => r.name);
    const skipped = mapped.length - rows.length;
    const CH = 1000;
    const res: Result = { created: 0, updated: 0, errors: skipped ? [{ row: '—', message: `${skipped} row(s) without a name skipped` }] : [] };
    setBusy(true); setProgress(0);
    try {
      for (let s = 0; s < rows.length; s += CH) {
        const chunk = rows.slice(s, s + CH);
        try {
          const body = kind === 'products' ? { rows: chunk.map((c) => c.r) } : { type: kind === 'customers' ? 'customer' : 'supplier', rows: chunk.map((c) => c.r) };
          const r = await api.post(kind === 'products' ? '/products/import' : '/parties/import', body);
          res.created! += r.data.created || 0;
          res.updated! += r.data.updated || 0;
          // backend row = chunk index + 2 → map back to the sheet row.
          for (const e of r.data.errors || []) res.errors.push({ row: chunk[e.row - 2] ? chunk[e.row - 2].i + 2 : e.row, message: e.message });
        } catch (e) {
          res.errors.push({ row: `${chunk[0].i + 2}–${chunk[chunk.length - 1].i + 2}`, message: errMsg(e) });
        }
        setProgress(Math.round(((s + chunk.length) / rows.length) * 100));
      }
      setResult(res);
      enqueueSnackbar(`Import done: ${res.created} created, ${res.updated} updated${res.errors.length ? `, ${res.errors.length} error(s)` : ''}.`, { variant: res.errors.length ? 'warning' : 'success' });
    } finally {
      setBusy(false);
    }
  };

  // ---- opening stock: resolve product names first ----
  const resolveProducts = async () => {
    setBusy(true); setProgress(0); setResult(null);
    const problems: { row: number; name: string; message: string }[] = [];
    const good: { idx: number; item: Record<string, unknown> }[] = [];
    try {
      const names = [...new Set(mapped.map((r) => String(r.product || '').trim()).filter(Boolean).map((n) => n.toLowerCase()))];
      const found = new Map<string, Product[]>();
      let done = 0;
      const worker = async (queue: string[]) => {
        for (const n of queue) {
          try {
            const r = await api.get('/products', { params: { search: n, active: 'all', limit: 50 } });
            found.set(n, (r.data.data as Product[]).filter((p) => p.name.trim().toLowerCase() === n));
          } catch {
            found.set(n, []);
          }
          done++;
          setProgress(Math.round((done / names.length) * 100));
        }
      };
      const lanes = 6;
      await Promise.all(Array.from({ length: lanes }, (_, k) => worker(names.filter((_, i) => i % lanes === k))));

      mapped.forEach((r, i) => {
        const row = i + 2;
        const name = String(r.product || '').trim();
        if (!name) { problems.push({ row, name: '', message: 'Product name is empty' }); return; }
        let hits = found.get(name.toLowerCase()) || [];
        if (hits.length > 1 && r.manufacturer) hits = hits.filter((p) => p.manufacturerName.toLowerCase() === String(r.manufacturer).toLowerCase());
        if (!hits.length) { problems.push({ row, name, message: 'No product with this exact name' }); return; }
        if (hits.length > 1) { problems.push({ row, name, message: `${hits.length} products share this name — add a Company column` }); return; }
        const expiry = toExpiry(r.expiry);
        const qty = Number(r.qty);
        if (!r.batchNo) { problems.push({ row, name, message: 'Batch is empty' }); return; }
        if (!expiry) { problems.push({ row, name, message: `Expiry "${toStr(r.expiry)}" not understood` }); return; }
        if (!(Number(r.mrp) > 0)) { problems.push({ row, name, message: 'MRP missing' }); return; }
        if (!(qty > 0)) { problems.push({ row, name, message: 'Qty must be more than 0' }); return; }
        good.push({ idx: i, item: { product: hits[0]._id, batchNo: String(r.batchNo).toUpperCase(), expiry, mrp: r.mrp, ptr: r.ptr, pts: r.pts, purchaseRate: r.purchaseRate, qty } });
      });
      setResolved({ rows: good, problems });
    } finally {
      setBusy(false);
    }
  };

  const importOpening = async () => {
    if (!resolved) return;
    const CH = 200;
    const rows = resolved.rows;
    const res: Result = { imported: 0, errors: [] };
    setBusy(true); setProgress(0);
    try {
      for (let s = 0; s < rows.length; s += CH) {
        const chunk = rows.slice(s, s + CH);
        try {
          const r = await api.post('/stock-adjustments', { reason: 'opening', narration: `Opening stock import (${fileName})`, items: chunk.map((c) => c.item) });
          res.imported! += r.data.data?.items?.length ?? chunk.length;
        } catch (e) {
          // The backend reports "Row N: …" within the chunk; translate to the sheet row.
          const m = errMsg(e);
          const rm = m.match(/^Row (\d+):\s*(.*)$/);
          const sheetRow = rm && chunk[Number(rm[1]) - 1] ? chunk[Number(rm[1]) - 1].idx + 2 : null;
          res.errors.push({ row: `${chunk[0].idx + 2}–${chunk[chunk.length - 1].idx + 2}`, message: `Batch not saved${sheetRow ? ` — row ${sheetRow}: ${rm![2]}` : `: ${m}`}` });
        }
        setProgress(Math.round(((s + chunk.length) / rows.length) * 100));
      }
      setResult(res);
      enqueueSnackbar(`${res.imported} opening-stock lines posted${res.errors.length ? `, ${res.errors.length} chunk(s) failed` : ''}.`, { variant: res.errors.length ? 'warning' : 'success' });
    } finally {
      setBusy(false);
    }
  };

  const step = result ? 3 : raw.length ? 2 : 0;
  const shownFields = fields.filter((f) => map[f.key]);
  const previewCols: Col<Record<string, unknown>>[] = [
    { key: '#', label: 'Row', render: (_, i) => <Typography fontSize={11} color="text.secondary">{i + 2}</Typography> },
    ...shownFields.map((f) => ({
      key: f.key, label: f.label, align: f.type === 'number' ? ('right' as const) : undefined,
      render: (r: Record<string, unknown>) => {
        let v = r[f.key];
        if (f.key === 'scheme' && kind === 'products') v = r.schemeBuy ? `${r.schemeBuy}+${r.schemeFree}` : '';
        if (f.type === 'expiry') { const e = toExpiry(v); return e ? dayjs(e).format('MM/YY') : <Typography component="span" fontSize={12} color="error.main">{toStr(v) || '—'}</Typography>; }
        if (f.required && (v === undefined || v === '')) return <Typography component="span" fontSize={12} color="error.main">missing</Typography>;
        return v instanceof Date ? isoDate(v) : String(v ?? '');
      },
    })),
  ];

  if (!can(perm)) return <Alert severity="warning">You don't have permission to import {TITLES[kind].toLowerCase()}.</Alert>;

  return (
    <>
      <Stepper activeStep={step} sx={{ mb: 2 }} alternativeLabel>
        <Step><StepLabel>Template / upload</StepLabel></Step>
        <Step><StepLabel>Map columns</StepLabel></Step>
        <Step><StepLabel>{kind === 'opening' ? 'Check & import' : 'Preview & import'}</StepLabel></Step>
        <Step><StepLabel>Result</StepLabel></Step>
      </Stepper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{HELP[kind]}</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button variant="outlined" startIcon={<FileDownloadOutlinedIcon />} onClick={downloadTemplate}>Download template</Button>
          <Button variant="contained" startIcon={<UploadFileOutlinedIcon />} onClick={() => fileRef.current?.click()} disabled={busy}>{raw.length ? 'Choose another file' : 'Upload .xlsx / .csv'}</Button>
          <input ref={fileRef} type="file" hidden accept=".xlsx,.xls,.csv" onChange={(e) => onFile(e.target.files?.[0])} />
          {fileName && <Chip label={`${fileName} · ${num(raw.length)} rows`} onDelete={busy ? undefined : reset} />}
        </Box>
        <Box sx={{ mt: 1.5, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {fields.map((f) => <Chip key={f.key} label={`${f.label}${f.required ? ' *' : ''}`} size="small" variant={f.required ? 'filled' : 'outlined'} color={f.required ? 'primary' : 'default'} title={f.help} />)}
        </Box>
      </Paper>

      {raw.length > 0 && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Map your columns <Typography component="span" variant="caption" color="text.secondary">— matched automatically by name; change any that are wrong</Typography></Typography>
          <Grid container spacing={1.5}>
            {fields.map((f) => (
              <Grid item xs={6} sm={4} md={3} lg={2} key={f.key}>
                <TextField select fullWidth label={`${f.label}${f.required ? ' *' : ''}`} value={map[f.key] || ''} error={!!f.required && !map[f.key]} helperText={f.help}
                  onChange={(e) => { setMap((m) => ({ ...m, [f.key]: e.target.value })); setResolved(null); setResult(null); }}>
                  <MenuItem value=""><i>— not in file —</i></MenuItem>
                  {headers.map((h) => <MenuItem key={h} value={h}>{h}</MenuItem>)}
                </TextField>
              </Grid>
            ))}
          </Grid>
          {missingRequired.length > 0 && <Alert severity="error" sx={{ mt: 1.5 }}>Map the required column(s): {missingRequired.map((f) => f.label).join(', ')}</Alert>}
        </Paper>
      )}

      {raw.length > 0 && missingRequired.length === 0 && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <Typography variant="subtitle2" sx={{ flex: 1 }}>Preview {raw.length > 50 ? `(first 50 of ${num(raw.length)} rows)` : `(${raw.length} rows)`}</Typography>
            {kind !== 'opening' && (
              <Button variant="contained" startIcon={<PlaylistAddCheckIcon />} onClick={importMasters} disabled={busy}>
                {busy ? 'Importing…' : `Import ${num(mapped.filter((r) => r.name).length)} ${TITLES[kind].toLowerCase()}`}
              </Button>
            )}
            {kind === 'opening' && !resolved && <Button variant="contained" onClick={resolveProducts} disabled={busy}>{busy ? 'Matching products…' : 'Check products'}</Button>}
          </Box>
          {busy && <LinearProgress variant="determinate" value={progress} sx={{ mb: 1 }} />}
          <DataTable columns={previewCols} rows={mapped.slice(0, 50)} rowKey={(_, i) => String(i)} maxHeight={420} />
        </>
      )}

      {kind === 'opening' && resolved && !result && (
        <Paper sx={{ p: 2, mt: 2 }}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', mb: resolved.problems.length ? 1.5 : 0 }}>
            <Chip color="success" label={`${num(resolved.rows.length)} rows ready`} />
            {resolved.problems.length > 0 && <Chip color="error" label={`${num(resolved.problems.length)} rows will be skipped`} />}
            <Typography variant="body2" color="text.secondary">Total qty {num(resolved.rows.reduce((s, r) => s + Number(r.item.qty), 0))}</Typography>
            <Box sx={{ flex: 1 }} />
            {resolved.problems.length > 0 && (
              <Button variant="outlined" onClick={() => exportExcel('opening-stock-unmatched', [{ name: 'Unmatched', rows: resolved.problems, columns: [{ key: 'row', label: 'Row' }, { key: 'name', label: 'Product' }, { key: 'message', label: 'Problem' }] }])}>
                Download skipped rows
              </Button>
            )}
            <Button variant="contained" onClick={importOpening} disabled={busy || !resolved.rows.length}>{busy ? 'Posting…' : `Post opening stock (${num(resolved.rows.length)})`}</Button>
          </Box>
          {resolved.problems.length > 0 && (
            <>
              <Alert severity="warning" sx={{ mb: 1 }}>
                Unmatched products must be created first (Products tab or New Product), then upload again. Already-posted rows would be added twice, so fix and re-import only the skipped rows.
              </Alert>
              <DataTable maxHeight={300} rowKey={(r) => String(r.row)} rows={resolved.problems}
                columns={[{ key: 'row', label: 'Row' }, { key: 'name', label: 'Product' }, { key: 'message', label: 'Problem', render: (r) => <Typography fontSize={13} color="error.main">{r.message}</Typography> }]} />
            </>
          )}
        </Paper>
      )}

      {result && (
        <Paper sx={{ p: 2, mt: 2 }}>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', mb: result.errors.length ? 1.5 : 0 }}>
            <CheckCircleOutlineIcon color={result.errors.length ? 'warning' : 'success'} />
            {result.imported !== undefined
              ? <Typography fontWeight={600}>{num(result.imported)} opening-stock lines posted</Typography>
              : <Typography fontWeight={600}>{num(result.created)} created · {num(result.updated)} updated</Typography>}
            {result.errors.length > 0 && <Chip color="error" label={`${result.errors.length} error(s)`} />}
            <Box sx={{ flex: 1 }} />
            <Button onClick={reset}>Import another file</Button>
            {kind === 'products' && <Button variant="outlined" onClick={() => nav('/products')}>Open products</Button>}
            {kind === 'customers' && <Button variant="outlined" onClick={() => nav('/customers')}>Open customers</Button>}
            {kind === 'suppliers' && <Button variant="outlined" onClick={() => nav('/suppliers')}>Open suppliers</Button>}
            {kind === 'opening' && <Button variant="outlined" onClick={() => nav('/stock-adjustments')}>Open adjustments</Button>}
          </Box>
          {result.errors.length > 0 && (
            <DataTable maxHeight={360} rowKey={(_, i) => String(i)} rows={result.errors}
              columns={[{ key: 'row', label: 'Sheet row', width: 110 }, { key: 'message', label: 'Error', render: (r) => <Typography fontSize={13} color="error.main">{r.message}</Typography> }]} />
          )}
        </Paper>
      )}
    </>
  );
}
