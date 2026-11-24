import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem, Switch,
  TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import { useSnackbar } from 'notistack';
import { api, errMsg } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { Business, Voucher } from '../lib/types';
import { COLUMNS, DOC_TITLE, LAYOUTS, layoutInfo, printFormatOf } from '../print/format';
import type { ColumnKey, DocKind, PrintFormat } from '../print/format';
import { printHtml, textColumns, voucherDocument, voucherText } from '../print/voucher';
import type { Racks } from '../print/voucher';

interface Job { v: Voucher; b: Business; kind: DocKind }

const loadRacks = async (v: Voucher): Promise<Racks> => {
  const ids = [...new Set(v.items.map((l) => String(l.product)))];
  if (!ids.length) return {};
  try {
    const r = await api.get('/products', { params: { ids: ids.join(','), limit: 500 } });
    return Object.fromEntries((r.data.data as { _id: string; rack?: string }[]).map((p) => [p._id, p.rack || '']));
  } catch { return {}; }
};

const COL_NAME = Object.fromEntries(COLUMNS.map((c) => [c.key, c.label])) as Record<ColumnKey, string>;

// The print window: every bill, credit note and purchase voucher print goes
// through here (print/print.ts → printVoucher fires "mmw:print").
export const PrintHost: React.FC = () => {
  const { business, can, refresh } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('md'));
  const [job, setJob] = useState<Job | null>(null);
  const [fmt, setFmt] = useState<PrintFormat | null>(null);
  const [racks, setRacks] = useState<Racks>({});
  const [saving, setSaving] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const [width, setWidth] = useState(800);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const ro = useRef<ResizeObserver>();
  const measure = useCallback((el: HTMLDivElement | null) => {
    ro.current?.disconnect();
    boxRef.current = el;
    if (!el) return;
    ro.current = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.current.observe(el);
    setWidth(el.clientWidth);
  }, []);

  useEffect(() => {
    const on = async (e: Event) => {
      const j = (e as CustomEvent<Job>).detail;
      const b = business || j.b;
      const f = printFormatOf(b);
      if (!f.askBeforePrint) {
        const r = f.columns.rack ? await loadRacks(j.v) : {};
        printHtml(voucherDocument(j.v, b, j.kind, f, r));
        return;
      }
      setRacks({}); setFmt(f); setJob({ ...j, b });
    };
    window.addEventListener('mmw:print', on);
    return () => window.removeEventListener('mmw:print', on);
  }, [business]);

  useEffect(() => {
    if (job && fmt?.columns.rack) loadRacks(job.v).then(setRacks);
  }, [job, fmt?.columns.rack]);

  const html = useMemo(() => (job && fmt ? voucherDocument(job.v, job.b, job.kind, fmt, racks, { preview: true, previewWidth: width }) : ''), [job, fmt, racks, width]);
  const saved = useMemo(() => JSON.stringify(printFormatOf(business)), [business]);

  if (!job || !fmt) return null;
  const L = layoutInfo(fmt.layout);
  const set = <K extends keyof PrintFormat>(k: K, val: PrintFormat[K]) => setFmt({ ...fmt, [k]: val });
  const setCol = (k: ColumnKey, on: boolean) => setFmt({ ...fmt, columns: { ...fmt.columns, [k]: on } });
  const dropped = L.dotMatrix ? textColumns(fmt, L.cols || 80, racks).dropped : [];
  const changed = JSON.stringify(fmt) !== saved;
  const close = () => { setJob(null); setFmt(null); };

  const print = () => {
    const w = frame.current?.contentWindow;
    if (w) { w.focus(); w.print(); } else printHtml(voucherDocument(job.v, job.b, job.kind, fmt, racks));
  };
  const downloadText = () => {
    const blob = new Blob([voucherText(job.v, job.b, job.kind, fmt, racks).replace(/\n/g, '\r\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${job.v.number.replace(/\//g, '-')}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  const saveDefault = async () => {
    setSaving(true);
    try {
      await api.put('/business', { settings: { printFormat: fmt, printShowPts: fmt.columns.pts } });
      await refresh();
      enqueueSnackbar('Saved. Every bill will print like this from now on.', { variant: 'success' });
    } catch (e) { enqueueSnackbar(errMsg(e), { variant: 'error' }); } finally { setSaving(false); }
  };

  return (
    <Dialog open onClose={close} fullScreen={phone} maxWidth="xl" fullWidth
      PaperProps={{ sx: { height: phone ? undefined : '92vh' } }}
      onKeyDown={(e) => { if (e.key === 'Enter' && !(e.target as HTMLElement).closest('input, textarea, button, [role="combobox"], [role="option"], [role="listbox"]')) { e.preventDefault(); print(); } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1.5 }}>
        <PrintOutlinedIcon color="primary" />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography fontWeight={700} noWrap>Print {DOC_TITLE[job.kind].toLowerCase()} {job.v.number}</Typography>
          <Typography variant="caption" color="text.secondary">Pick the paper and columns. The preview shows exactly what will print.</Typography>
        </Box>
        <IconButton onClick={close} aria-label="Close"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0, display: 'flex', flexDirection: phone ? 'column' : 'row', overflow: phone ? 'auto' : 'hidden' }}>
        <Box sx={{ width: phone ? '100%' : 330, flexShrink: 0, p: 2, overflowY: 'auto', borderRight: phone ? 0 : 1, borderColor: 'divider' }}>
          <TextField select fullWidth label="Paper / printer" value={fmt.layout} onChange={(e) => set('layout', e.target.value as PrintFormat['layout'])}
            helperText={L.hint} SelectProps={{ MenuProps: { PaperProps: { sx: { maxWidth: 360 } } } }}>
            <MenuItem disabled sx={{ fontSize: 12, opacity: '1 !important', fontWeight: 700 }}>Laser / inkjet</MenuItem>
            {LAYOUTS.filter((l) => !l.dotMatrix).map((l) => <MenuItem key={l.id} value={l.id}>{l.label}</MenuItem>)}
            <MenuItem disabled sx={{ fontSize: 12, opacity: '1 !important', fontWeight: 700 }}>Dot-matrix</MenuItem>
            {LAYOUTS.filter((l) => l.dotMatrix).map((l) => <MenuItem key={l.id} value={l.id}>{l.label}</MenuItem>)}
          </TextField>

          <Typography variant="subtitle2" sx={{ mt: 2, mb: 0.5 }}>Copies</Typography>
          <ToggleButtonGroup exclusive size="small" fullWidth value={fmt.copies} onChange={(_e, v) => v && set('copies', v)}>
            <ToggleButton value={1}>1</ToggleButton><ToggleButton value={2}>2</ToggleButton><ToggleButton value={3}>3</ToggleButton>
          </ToggleButtonGroup>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
            {job.kind === 'sale' ? 'Each copy is marked Original (recipient), Duplicate (transporter), Triplicate (supplier) as GST rules ask.' : 'Each copy is marked Original / Duplicate / Triplicate.'}
          </Typography>

          {!L.dotMatrix && (
            <>
              <Typography variant="subtitle2" sx={{ mt: 2, mb: 0.5 }}>Text size</Typography>
              <ToggleButtonGroup exclusive size="small" fullWidth value={fmt.fontSize} onChange={(_e, v) => v && set('fontSize', v)}>
                <ToggleButton value="small">Small</ToggleButton><ToggleButton value="normal">Normal</ToggleButton><ToggleButton value="large">Large</ToggleButton>
              </ToggleButtonGroup>
            </>
          )}

          <Typography variant="subtitle2" sx={{ mt: 2 }}>Columns on the bill</Typography>
          <Typography variant="caption" color="text.secondary" display="block">Product, batch, expiry, qty, rate and amount always print.</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 1 }}>
            {COLUMNS.map((c) => (
              <Tooltip key={c.key} title={c.hint || ''} placement="right">
                <FormControlLabel sx={{ mr: 0 }} control={<Checkbox size="small" checked={!!fmt.columns[c.key]} onChange={(e) => setCol(c.key, e.target.checked)} />}
                  label={<Typography fontSize={13} sx={{ textDecoration: dropped.includes(c.key) ? 'line-through' : 'none', color: dropped.includes(c.key) ? 'text.disabled' : 'inherit' }}>{c.label}</Typography>} />
              </Tooltip>
            ))}
          </Box>
          {dropped.length > 0 && (
            <Alert severity="info" sx={{ mt: 1, py: 0 }}>
              Won't fit in {L.cols} characters: {dropped.map((k) => COL_NAME[k]).join(', ')}. Untick a few, or use 132 column.
            </Alert>
          )}

          <Typography variant="subtitle2" sx={{ mt: 2 }}>Bill foot</Typography>
          <FormControlLabel sx={{ display: 'flex' }} control={<Switch size="small" checked={fmt.showBank} onChange={(e) => set('showBank', e.target.checked)} />} label={<Typography fontSize={13}>Bank & UPI details</Typography>} />
          <FormControlLabel sx={{ display: 'flex' }} control={<Switch size="small" checked={fmt.showTerms} onChange={(e) => set('showTerms', e.target.checked)} />} label={<Typography fontSize={13}>Terms & conditions</Typography>} />

          <Box sx={{ mt: 2, p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
            <FormControlLabel sx={{ display: 'flex', alignItems: 'flex-start' }}
              control={<Checkbox size="small" checked={fmt.askBeforePrint} onChange={(e) => set('askBeforePrint', e.target.checked)} sx={{ pt: 0.25 }} />}
              label={<Box><Typography fontSize={13}>Show this window before printing</Typography><Typography variant="caption" color="text.secondary">Untick (and save as default) to print straight away with these settings. You can change it later in Settings → Invoice printing.</Typography></Box>} />
            {can('settings:edit') ? (
              <Button fullWidth size="small" variant="outlined" sx={{ mt: 1 }} disabled={!changed || saving} onClick={saveDefault}>
                {changed ? 'Save as default for all bills' : 'These are your default settings'}
              </Button>
            ) : changed ? <Typography variant="caption" color="text.secondary">Changes apply to this print only. Ask the owner to change the default.</Typography> : null}
          </Box>

          {L.dotMatrix && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Fastest on dot-matrix: install the printer as <b>Generic / Text Only</b> and set the paper to {L.page.replace(' ', ' × ')}. Or download the text file and send it to the printer directly.
            </Alert>
          )}
        </Box>
        <Box ref={measure} sx={{ flex: 1, minWidth: 0, minHeight: phone ? 480 : 0, bgcolor: '#d7dce2' }}>
          <iframe ref={frame} title="Print preview" srcDoc={html} style={{ width: '100%', height: '100%', minHeight: phone ? 480 : 0, border: 0, display: 'block' }} />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.25 }}>
        {L.dotMatrix && <Button startIcon={<DownloadOutlinedIcon />} onClick={downloadText} sx={{ mr: 'auto' }}>Download text file</Button>}
        <Button onClick={close}>Cancel</Button>
        <Button variant="contained" startIcon={<PrintOutlinedIcon />} onClick={print} autoFocus>Print (Enter)</Button>
      </DialogActions>
    </Dialog>
  );
};
