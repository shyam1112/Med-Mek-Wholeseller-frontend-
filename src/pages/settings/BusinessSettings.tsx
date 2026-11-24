import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, FormControlLabel, Grid, InputAdornment, LinearProgress, MenuItem, Paper, Switch, Tab, Tabs,
  TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import dayjs from 'dayjs';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/PageHeader';
import { useHotkey } from '../../lib/hooks';
import { isoDate } from '../../lib/format';
import { api, errMsg } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import type { Business, BusinessSettings as Settings } from '../../lib/types';
import { COLUMNS, LAYOUTS, layoutInfo, printFormatOf } from '../../print/format';
import type { PrintFormat } from '../../print/format';

type Rule = 'block' | 'warn' | 'ignore';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SERIES: [string, string][] = [
  ['SI', 'Sales Invoice'], ['SR', 'Credit Note (Sales Return)'], ['SO', 'Sales Order'], ['PU', 'Purchase'], ['PR', 'Debit Note (Purchase Return)'],
  ['PO', 'Purchase Order'], ['RC', 'Receipt'], ['PY', 'Payment'], ['JV', 'Journal'], ['SA', 'Stock Adjustment'], ['DR', 'Delivery Run'],
];
const GSTIN_RX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const fyLabel = (startMonth: number) => {
  const d = dayjs();
  const y = d.month() + 1 >= startMonth ? d.year() : d.year() - 1;
  return `${String(y).slice(-2)}-${String(y + 1).slice(-2)}`;
};

const RULES: { key: 'creditLimitAction' | 'overdueAction' | 'dlExpiryAction'; title: string; what: string; effect: Record<Rule, string> }[] = [
  {
    key: 'creditLimitAction', title: 'Credit limit exceeded', what: "When a new bill would take the party's outstanding above its credit limit.",
    effect: { block: 'The bill cannot be saved. A user with override permission must approve it.', warn: 'Billing staff see a warning and can save anyway.', ignore: 'No check — credit limits are informational only.' },
  },
  {
    key: 'overdueAction', title: 'Overdue bills', what: 'When the party has any bill older than its credit days (plus grace days).',
    effect: { block: 'No new bill for the party until overdue bills are collected (or overridden).', warn: 'Billing staff see the overdue amount and can save anyway.', ignore: 'Overdue bills are not checked at billing.' },
  },
  {
    key: 'dlExpiryAction', title: 'Drug licence expired', what: "When the party's drug licence (20B/21B) expiry date has passed.",
    effect: { block: 'Selling is blocked — required by law for scheduled drugs. Recommended.', warn: 'A warning is shown; the bill can still be saved.', ignore: 'DL expiry is not checked.' },
  },
];

export default function BusinessSettings() {
  const { can, refresh } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const [tab, setTab] = useState(0);
  const [biz, setBiz] = useState<Business | null>(null);
  const [states, setStates] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const editable = can('settings:edit');

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/business');
      const b = r.data.data as Business;
      setBiz({ ...b, dlExpiry: isoDate(b.dlExpiry), settings: { ...b.settings, prefixes: b.settings?.prefixes || {} } });
      setStates(r.data.states || {});
      setDirty(false);
    } catch (e) { enqueueSnackbar(errMsg(e), { variant: 'error' }); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const f = <K extends keyof Business>(k: K, v: Business[K]) => { setBiz((b) => (b ? { ...b, [k]: v } : b)); setDirty(true); };
  const s = <K extends keyof Settings>(k: K, v: Settings[K]) => { setBiz((b) => (b ? { ...b, settings: { ...b.settings, [k]: v } } : b)); setDirty(true); };

  const gstinErr = !!biz?.gstin && !GSTIN_RX.test(biz.gstin);

  const save = async () => {
    if (!biz || !editable || saving) return;
    if (!biz.name.trim()) { enqueueSnackbar('Business name is required', { variant: 'warning' }); setTab(0); return; }
    if (gstinErr) { enqueueSnackbar('GSTIN format looks wrong', { variant: 'warning' }); setTab(0); return; }
    setSaving(true);
    try {
      const { settings, _id, ...top } = biz;
      void _id;
      const prefixes = Object.fromEntries(Object.entries(settings.prefixes || {}).map(([k, v]) => [k, String(v || '').trim()]).filter(([, v]) => v));
      await api.put('/business', { ...top, dlExpiry: biz.dlExpiry || null, settings: { ...settings, prefixes } });
      enqueueSnackbar('Settings saved', { variant: 'success' });
      await Promise.all([refresh(), load()]);
    } catch (e) { enqueueSnackbar(errMsg(e), { variant: 'error' }); } finally { setSaving(false); }
  };
  useHotkey('ctrl+s', () => { save(); }, [save]);

  if (loading && !biz) return <><PageHeader title="Business Settings" /><LinearProgress /></>;
  if (!biz) return <><PageHeader title="Business Settings" /><Alert severity="error">Could not load settings.</Alert></>;
  const st = biz.settings;
  const pf = printFormatOf(biz);
  const setPf = (p: Partial<PrintFormat>) => s('printFormat', { ...pf, ...p } as unknown as Settings['printFormat']);
  const fy = fyLabel(biz.fyStartMonth || 4);
  const T = (props: { label: string; k: keyof Business; xs?: number; sm?: number; md?: number; upper?: boolean; helper?: string; type?: string; multiline?: boolean }) => (
    <Grid item xs={props.xs ?? 12} sm={props.sm ?? 6} md={props.md ?? 4}>
      <TextField label={props.label} fullWidth disabled={!editable} type={props.type} multiline={props.multiline} minRows={props.multiline ? 2 : undefined}
        value={(biz[props.k] as string) ?? ''} helperText={props.helper} InputLabelProps={props.type === 'date' ? { shrink: true } : undefined}
        onChange={(e) => f(props.k, (props.upper ? e.target.value.toUpperCase() : e.target.value) as never)} />
    </Grid>
  );

  return (
    <>
      <PageHeader
        title="Business Settings"
        subtitle="Company profile printed on bills, billing rules and voucher numbering"
        actions={editable && <Button variant="contained" startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveOutlinedIcon />} onClick={save} disabled={saving || !dirty}>Save (Ctrl+S)</Button>}
      />
      {!editable && <Alert severity="info" sx={{ mb: 2 }}>You can view settings but not change them.</Alert>}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }} variant="scrollable">
        <Tab label="Business profile" /><Tab label="Billing rules" /><Tab label="Numbering" />
      </Tabs>

      {tab === 0 && (
        <Paper sx={{ p: 2.5 }}>
          <Section title="Identity" />
          <Grid container spacing={1.5} sx={{ mb: 3 }}>
            {T({ label: 'Business name (printed on bills)', k: 'name', md: 6 })}
            {T({ label: 'Legal name', k: 'legalName', md: 6 })}
            <Grid item xs={12} sm={6} md={4}>
              <TextField label="GSTIN" fullWidth disabled={!editable} value={biz.gstin} error={gstinErr} inputProps={{ maxLength: 15 }}
                helperText={gstinErr ? 'Format: 24ABCDE1234F1Z5' : 'State is set from the first two digits on save'}
                onChange={(e) => f('gstin', e.target.value.toUpperCase().trim())} />
            </Grid>
            {T({ label: 'PAN', k: 'pan', upper: true })}
            <Grid item xs={12} sm={6} md={4}>
              <TextField select label="State" fullWidth disabled={!editable || !!biz.gstin} value={biz.stateCode} onChange={(e) => f('stateCode', e.target.value)}
                helperText={biz.gstin ? 'Derived from GSTIN' : 'Decides CGST+SGST vs IGST'}>
                {Object.entries(states).map(([c, n]) => <MenuItem key={c} value={c}>{c} — {n}</MenuItem>)}
              </TextField>
            </Grid>
          </Grid>
          <Section title="Address & contact" />
          <Grid container spacing={1.5} sx={{ mb: 3 }}>
            {T({ label: 'Address', k: 'address', md: 12, sm: 12, multiline: true })}
            {T({ label: 'City', k: 'city' })}
            {T({ label: 'Pincode', k: 'pincode' })}
            {T({ label: 'Phone', k: 'phone' })}
            {T({ label: 'Email', k: 'email', md: 6 })}
          </Grid>
          <Section title="Licences" />
          <Grid container spacing={1.5} sx={{ mb: 3 }}>
            {T({ label: 'Drug licence 20B', k: 'dl20b', upper: true, md: 3 })}
            {T({ label: 'Drug licence 21B', k: 'dl21b', upper: true, md: 3 })}
            {T({ label: 'DL valid till', k: 'dlExpiry', type: 'date', md: 3 })}
            {T({ label: 'FSSAI no', k: 'fssai', md: 3 })}
          </Grid>
          <Section title="Bank & payments (printed on bills)" />
          <Grid container spacing={1.5} sx={{ mb: 3 }}>
            {T({ label: 'Bank name', k: 'bankName', md: 3 })}
            {T({ label: 'Account no', k: 'bankAccount', md: 3 })}
            {T({ label: 'IFSC', k: 'bankIfsc', upper: true, md: 3 })}
            {T({ label: 'UPI ID', k: 'upiId', md: 3 })}
          </Grid>
          <Section title="Financial year" />
          <Grid container spacing={1.5}>
            <Grid item xs={12} sm={6} md={4}>
              <TextField select label="FY starts in" fullWidth disabled={!editable} value={biz.fyStartMonth || 4} onChange={(e) => f('fyStartMonth', Number(e.target.value))}
                helperText={`Current FY: ${fy}. Indian FY starts in April.`}>
                {MONTHS.map((m, i) => <MenuItem key={m} value={i + 1}>{m}</MenuItem>)}
              </TextField>
            </Grid>
          </Grid>
        </Paper>
      )}

      {tab === 1 && (
        <Grid container spacing={2}>
          <Grid item xs={12} lg={7}>
            <Paper sx={{ p: 2.5 }}>
              <Section title="Checks at billing" subtitle="What happens when a sales bill breaks a rule. Users with override permission can still save blocked bills." />
              {RULES.map((r) => (
                <Box key={r.key} sx={{ py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                    <Box sx={{ flex: 1, minWidth: 220 }}>
                      <Typography fontWeight={600}>{r.title}</Typography>
                      <Typography fontSize={12} color="text.secondary">{r.what}</Typography>
                    </Box>
                    <ToggleButtonGroup exclusive size="small" value={st[r.key]} disabled={!editable} onChange={(_, v) => v && s(r.key, v)}>
                      <ToggleButton value="block" color="error">Block</ToggleButton>
                      <ToggleButton value="warn" color="warning">Warn</ToggleButton>
                      <ToggleButton value="ignore">Ignore</ToggleButton>
                    </ToggleButtonGroup>
                  </Box>
                  <Typography fontSize={12} sx={{ mt: 0.75 }} color={st[r.key] === 'block' ? 'error.main' : st[r.key] === 'warn' ? 'warning.dark' : 'text.secondary'}>→ {r.effect[st[r.key]]}</Typography>
                  {r.key === 'overdueAction' && st.overdueAction !== 'ignore' && (
                    <TextField label="Grace days" type="number" sx={{ mt: 1, width: 160 }} disabled={!editable} value={st.overdueGraceDays ?? 0}
                      onChange={(e) => s('overdueGraceDays', Number(e.target.value) || 0)} helperText="Extra days past due before the rule applies"
                      InputProps={{ endAdornment: <InputAdornment position="end">days</InputAdornment> }} />
                  )}
                </Box>
              ))}
              <Grid container spacing={1.5} sx={{ mt: 1 }}>
                <Grid item xs={12} sm={6}>
                  <NumField label="Minimum expiry for sale" unit="days" value={st.minExpiryDaysForSale} disabled={!editable} onChange={(v) => s('minExpiryDaysForSale', v)}
                    helper="Batches expiring sooner are skipped by FEFO and blocked at billing. A customer can ask for more (party master)." />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField select label="Batch selection on bills" fullWidth disabled={!editable} value={st.batchSelection || 'auto'} onChange={(e) => s('batchSelection', e.target.value as Settings['batchSelection'])}
                    helperText={(st.batchSelection || 'auto') === 'auto' ? 'Earliest-expiry batch is taken; all batches are listed under the entry row to switch (F6)' : 'Batch window opens for every product (skipped when only one batch can be sold)'}>
                    <MenuItem value="auto">Auto FEFO + batch list</MenuItem><MenuItem value="ask">Ask every time (batch window)</MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControlLabel disabled={!editable} control={<Switch checked={st.reserveOnOrder ?? true} onChange={(e) => s('reserveOnOrder', e.target.checked)} />}
                    label="Hold stock when a sales order is booked" />
                  <Typography variant="caption" color="text.secondary" display="block">Earliest-expiry stock is set aside for that party; other bills can't take it. Can be switched off per order.</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <NumField label="Hold stock for" unit="days" value={st.reserveDays ?? 7} disabled={!editable || st.reserveOnOrder === false} onChange={(v) => s('reserveDays', Math.max(1, Math.round(v)))}
                    helper="Unbilled holds are released automatically after this (extendable per order)" />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <NumField label="Near-expiry window" unit="days" value={st.nearExpiryDays} disabled={!editable} onChange={(v) => s('nearExpiryDays', v)} helper="For the near-expiry report & alerts" />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <NumField label="Default credit days" unit="days" value={st.defaultCreditDays} disabled={!editable} onChange={(v) => s('defaultCreditDays', v)} helper="Used for new parties and bill due dates" />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField select label="Default rate for new parties" fullWidth disabled={!editable} value={st.defaultRateType} onChange={(e) => s('defaultRateType', e.target.value as Settings['defaultRateType'])}>
                    <MenuItem value="ptr">PTR (retailer price)</MenuItem><MenuItem value="pts">PTS (stockist price)</MenuItem><MenuItem value="mrp">MRP</MenuItem>
                  </TextField>
                </Grid>
              </Grid>
            </Paper>
          </Grid>
          <Grid item xs={12} lg={5}>
            <Paper sx={{ p: 2.5, mb: 2 }}>
              <Section title="GST & e-documents" />
              <NumField label="E-way bill threshold" unit="₹" prefix value={st.ewayBillThreshold} disabled={!editable} onChange={(v) => s('ewayBillThreshold', v)} helper="Bills above this value need an e-way bill (₹50,000 by law)" />
              <FormControlLabel sx={{ mt: 1, display: 'flex' }} disabled={!editable} control={<Switch checked={!!st.einvoiceEnabled} onChange={(e) => s('einvoiceEnabled', e.target.checked)} />}
                label={<Box><Typography>E-invoicing (IRN) applicable</Typography><Typography fontSize={12} color="text.secondary">Turn on if turnover is above ₹5 Cr — enables e-invoice JSON export</Typography></Box>} />
            </Paper>
            <Paper sx={{ p: 2.5 }}>
              <Section title="Invoice printing" />
              <FormControlLabel sx={{ display: 'flex' }} disabled={!editable} control={<Switch checked={!!st.roundOff} onChange={(e) => s('roundOff', e.target.checked)} />}
                label={<Box><Typography>Round off bill total</Typography><Typography fontSize={12} color="text.secondary">To the nearest rupee, posted to Round-off ledger</Typography></Box>} />
              <TextField select label="Bill paper / printer" fullWidth sx={{ mt: 2 }} disabled={!editable} value={pf.layout}
                onChange={(e) => setPf({ layout: e.target.value as PrintFormat['layout'] })} helperText={layoutInfo(pf.layout).hint}>
                {LAYOUTS.map((l) => <MenuItem key={l.id} value={l.id}>{l.dotMatrix ? '🖨 ' : ''}{l.label}</MenuItem>)}
              </TextField>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1.5 }}>
                <Typography fontSize={14}>Copies</Typography>
                <ToggleButtonGroup exclusive size="small" disabled={!editable} value={pf.copies} onChange={(_e, v) => v && setPf({ copies: v })}>
                  <ToggleButton value={1}>1</ToggleButton><ToggleButton value={2}>2</ToggleButton><ToggleButton value={3}>3</ToggleButton>
                </ToggleButtonGroup>
              </Box>
              <FormControlLabel sx={{ display: 'flex', mt: 1 }} disabled={!editable} control={<Switch checked={pf.askBeforePrint} onChange={(e) => setPf({ askBeforePrint: e.target.checked })} />}
                label={<Box><Typography>Show print window before printing</Typography><Typography fontSize={12} color="text.secondary">Preview, choose paper and columns each time. Off = prints straight away.</Typography></Box>} />
              <Typography fontSize={12} color="text.secondary" sx={{ mt: 1 }}>
                Columns ({COLUMNS.filter((c) => pf.columns[c.key]).map((c) => c.label.replace(/ \(.*\)/, '')).join(', ')}) are chosen in the print window — open any bill → Print → tick the columns → “Save as default”.
              </Typography>
              <TextField label="Terms & conditions (printed at bill foot)" fullWidth multiline minRows={4} sx={{ mt: 2 }} disabled={!editable}
                value={st.invoiceTerms || ''} onChange={(e) => s('invoiceTerms', e.target.value)} />
            </Paper>
          </Grid>
        </Grid>
      )}

      {tab === 2 && (
        <Paper sx={{ p: 2.5 }}>
          <Section title="Voucher number series" subtitle={`Format PREFIX/FY/00001 — numbering restarts every financial year and never skips. Changing a prefix only affects new vouchers.`} />
          <Grid container spacing={1.5}>
            {SERIES.map(([k, label]) => {
              const v = (st.prefixes || {})[k] ?? '';
              return (
                <Grid item xs={12} sm={6} md={4} key={k}>
                  <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', p: 1.25, border: 1, borderColor: 'divider', borderRadius: 2 }}>
                    <TextField label={label} value={v} placeholder={k} disabled={!editable} sx={{ width: 150 }} inputProps={{ maxLength: 10 }}
                      onChange={(e) => s('prefixes', { ...(st.prefixes || {}), [k]: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') })} />
                    <Box>
                      <Typography fontSize={11} color="text.secondary">Next looks like</Typography>
                      <Typography fontFamily="monospace" fontWeight={600} fontSize={13}>{(v || k)}/{fy}/00001</Typography>
                    </Box>
                  </Box>
                </Grid>
              );
            })}
          </Grid>
        </Paper>
      )}
    </>
  );
}

const Section: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => (
  <Box sx={{ mb: 1.5 }}>
    <Typography variant="h6">{title}</Typography>
    {subtitle && <Typography fontSize={12.5} color="text.secondary">{subtitle}</Typography>}
  </Box>
);

const NumField: React.FC<{ label: string; unit: string; value: number; onChange: (v: number) => void; disabled?: boolean; helper?: string; prefix?: boolean }> = ({ label, unit, value, onChange, disabled, helper, prefix }) => (
  <TextField label={label} type="number" fullWidth disabled={disabled} value={value ?? 0} onChange={(e) => onChange(Number(e.target.value) || 0)} helperText={helper}
    inputProps={{ min: 0 }} InputProps={prefix ? { startAdornment: <InputAdornment position="start">{unit}</InputAdornment> } : { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> }} />
);
