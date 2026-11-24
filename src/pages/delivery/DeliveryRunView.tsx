import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, CircularProgress, Grid, InputAdornment, LinearProgress, MenuItem, Paper, Stack, Table, TableBody, TableCell,
  TableFooter, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import UndoIcon from '@mui/icons-material/Undo';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/PageHeader';
import { StatusChip } from '../../components/StatusChip';
import { StatCard } from '../../components/StatCard';
import { useConfirm } from '../../components/Dialogs';
import { amt, fdate, fdatetime, num } from '../../lib/format';
import { printTable } from '../../print/print';
import { api, errMsg } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { DeliveryRun, Stop, runTotals } from './deliveryUtils';

export default function DeliveryRunView() {
  const { id } = useParams();
  const theme = useTheme();
  const isXs = useMediaQuery(theme.breakpoints.down('sm'));
  const { can, business } = useAuth();
  const confirm = useConfirm();
  const { enqueueSnackbar } = useSnackbar();
  const [run, setRun] = useState<DeliveryRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get(`/delivery-runs/${id}`).then((r) => setRun(r.data.data)).catch((e) => enqueueSnackbar(errMsg(e), { variant: 'error' })).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const canEdit = can('delivery:edit') && !!run && run.status !== 'closed';

  const patchStop = async (s: Stop, body: Partial<Pick<Stop, 'status' | 'collectedAmount' | 'remark'>>) => {
    setBusy(s.invoice);
    try {
      const r = await api.patch(`/delivery-runs/${id}/stops/${s.invoice}`, body);
      setRun(r.data.data);
    } catch (e) { enqueueSnackbar(errMsg(e), { variant: 'error' }); } finally { setBusy(''); }
  };

  const dispatch = async () => {
    const { ok } = await confirm({ title: `Dispatch ${run!.number}?`, message: 'All bills on this run will be marked as dispatched.', confirmText: 'Dispatch' });
    if (!ok) return;
    setBusy('_run');
    try { const r = await api.post(`/delivery-runs/${id}/dispatch`); setRun(r.data.data); enqueueSnackbar('Run dispatched', { variant: 'success' }); }
    catch (e) { enqueueSnackbar(errMsg(e), { variant: 'error' }); } finally { setBusy(''); }
  };

  const close = async () => {
    const t = runTotals(run!);
    const { ok } = await confirm({
      title: `Close ${run!.number}?`,
      message: <>Cash collected will be booked as receipts against each bill (₹{amt(t.collected)} across {run!.stops.filter((s) => s.collectedAmount > 0).length} bills). Returned bills go back to "Ready to dispatch". This can't be undone from here.</>,
      confirmText: 'Close run',
    });
    if (!ok) return;
    setBusy('_run');
    try { const r = await api.post(`/delivery-runs/${id}/close`); setRun(r.data.data); enqueueSnackbar('Run closed — receipts booked', { variant: 'success' }); }
    catch (e) { enqueueSnackbar(errMsg(e), { variant: 'error' }); } finally { setBusy(''); }
  };

  const printSheet = async () => {
    if (!run || !business) return;
    setPrinting(true);
    // Addresses aren't on the run — pull them from each bill.
    const addr = await Promise.allSettled(run.stops.map((s) => api.get(`/sales/${s.invoice}`).then((r) => (r.data.data.partyAddress as string) || '')));
    setPrinting(false);
    const t = runTotals(run);
    printTable(
      `Delivery Run ${run.number}`,
      business,
      `Date ${fdate(run.date)}${run.routeName ? ` · Route ${run.routeName}` : ''}${run.deliveryPersonName ? ` · Delivery by ${run.deliveryPersonName}` : ''}${run.vehicleNo ? ` · Vehicle ${run.vehicleNo}` : ''}`,
      ['#', 'Bill', 'Party', 'Address', 'Boxes', 'Amount due', 'Collected', 'Remark', 'Receiver signature'],
      run.stops.map((s, i) => [i + 1, s.invoiceNo, s.partyName, addr[i].status === 'fulfilled' ? addr[i].value : '', s.boxes || '', amt(s.amount), '', '', '']),
      ['', `${t.bills} bills`, '', '', t.boxes, amt(t.amount), '', '', ''],
      [4, 5, 6],
    );
  };

  if (loading) return <><PageHeader title="Delivery run" crumbs={[{ label: 'Delivery', to: '/delivery?tab=runs' }, { label: '…' }]} /><LinearProgress /></>;
  if (!run) return <><PageHeader title="Delivery run" crumbs={[{ label: 'Delivery', to: '/delivery?tab=runs' }]} /><Alert severity="error">Delivery run not found.</Alert></>;

  const t = runTotals(run);
  return (
    <Box sx={{ pb: 3 }}>
      <PageHeader
        title={<>{run.number} <StatusChip status={run.status} /></>}
        subtitle={[fdate(run.date), run.routeName && `Route ${run.routeName}`, run.deliveryPersonName, run.vehicleNo].filter(Boolean).join(' · ')}
        crumbs={[{ label: 'Delivery runs', to: '/delivery?tab=runs' }, { label: run.number }]}
        actions={
          <>
            {business && <Button startIcon={printing ? <CircularProgress size={14} /> : <PrintOutlinedIcon />} onClick={printSheet} disabled={printing}>Run sheet</Button>}
            {canEdit && run.status === 'open' && <Button variant="outlined" startIcon={<LocalShippingOutlinedIcon />} onClick={dispatch} disabled={!!busy}>Dispatch</Button>}
            {canEdit && (
              <Tooltip title={t.pending ? `${t.pending} bill(s) still pending — mark delivered or returned first` : ''}>
                <span><Button variant="contained" startIcon={<LockOutlinedIcon />} onClick={close} disabled={!!busy || t.pending > 0}>Close run</Button></span>
              </Tooltip>
            )}
          </>
        }
      />
      {run.status === 'closed' && <Alert severity="success" sx={{ mb: 2 }}>Run closed. Collected cash has been booked as receipts against the bills.</Alert>}
      {run.status === 'open' && <Alert severity="info" sx={{ mb: 2 }}>Load the boxes, then press <b>Dispatch</b> when the vehicle leaves.</Alert>}

      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid item xs={6} md={3}><StatCard label="Bills" value={`${t.delivered + t.returned}/${t.bills}`} hint={`${t.delivered} delivered · ${t.returned} returned`} tone={t.pending ? 'warn' : 'good'} /></Grid>
        <Grid item xs={6} md={3}><StatCard label="Boxes" value={num(t.boxes)} /></Grid>
        <Grid item xs={6} md={3}><StatCard label="Amount due" value={`₹${amt(t.amount)}`} /></Grid>
        <Grid item xs={6} md={3}><StatCard label="Collected" value={`₹${amt(t.collected)}`} tone="good" /></Grid>
      </Grid>
      {busy && busy !== '_run' && <LinearProgress sx={{ mb: 1 }} />}

      {isXs ? (
        <Stack spacing={1.25}>
          {run.stops.map((s, i) => <StopCard key={s.invoice} s={s} i={i} editable={canEdit} busy={busy === s.invoice} onPatch={(b) => patchStop(s, b)} />)}
        </Stack>
      ) : (
        <Paper sx={{ overflow: 'auto' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell><TableCell>Bill</TableCell><TableCell>Party</TableCell><TableCell align="right">Boxes</TableCell>
                <TableCell align="right">Amount due</TableCell><TableCell width={150}>Status</TableCell><TableCell width={150} align="right">Collected</TableCell>
                <TableCell width={220}>Remark</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {run.stops.map((s, i) => (
                <TableRow key={s.invoice} hover sx={{ opacity: busy === s.invoice ? 0.6 : 1 }}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell><Typography component={RouterLink} to={`/sales/${s.invoice}`} fontSize={13} fontWeight={600} color="primary" sx={{ textDecoration: 'none' }}>{s.invoiceNo}</Typography></TableCell>
                  <TableCell>{s.partyName}{s.deliveredAt && <Typography fontSize={11} color="text.secondary">Delivered {fdatetime(s.deliveredAt)}</Typography>}</TableCell>
                  <TableCell align="right">{s.boxes || ''}</TableCell>
                  <TableCell align="right">{amt(s.amount)}</TableCell>
                  <TableCell>
                    {canEdit ? (
                      <TextField select variant="standard" value={s.status} onChange={(e) => patchStop(s, { status: e.target.value as Stop['status'] })} fullWidth
                        SelectProps={{ sx: { fontSize: 13, fontWeight: 600, color: s.status === 'delivered' ? 'success.main' : s.status === 'returned' ? 'error.main' : 'warning.main' } }}>
                        <MenuItem value="pending">Pending</MenuItem><MenuItem value="delivered">Delivered</MenuItem><MenuItem value="returned">Returned</MenuItem>
                      </TextField>
                    ) : <StatusChip status={s.status} />}
                  </TableCell>
                  <TableCell align="right">
                    {canEdit ? <MoneyField value={s.collectedAmount} max={s.amount} onSave={(v) => patchStop(s, { collectedAmount: v })} /> : amt(s.collectedAmount)}
                  </TableCell>
                  <TableCell>{canEdit ? <TextSave value={s.remark} onSave={(v) => patchStop(s, { remark: v })} /> : s.remark}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow sx={{ '& td': { fontWeight: 700, color: 'text.primary', fontSize: 13 } }}>
                <TableCell /><TableCell>{t.bills} bills</TableCell><TableCell /><TableCell align="right">{t.boxes}</TableCell>
                <TableCell align="right">{amt(t.amount)}</TableCell><TableCell /><TableCell align="right">{amt(t.collected)}</TableCell><TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </Paper>
      )}
      {run.narration && <Typography fontSize={13} color="text.secondary" sx={{ mt: 1.5 }}>Note: {run.narration}</Typography>}
    </Box>
  );
}

// Saves on blur / Enter, only when changed.
function MoneyField({ value, max, onSave, big }: { value: number; max?: number; onSave: (v: number) => void; big?: boolean }) {
  const [v, setV] = useState(value ? String(value) : '');
  useEffect(() => { setV(value ? String(value) : ''); }, [value]);
  const commit = () => { const x = Number(v) || 0; if (x !== (value || 0)) onSave(x); };
  return (
    <TextField variant={big ? 'outlined' : 'standard'} type="number" value={v} placeholder="0" onChange={(e) => setV(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} fullWidth={big} label={big ? 'Cash collected' : undefined}
      error={max !== undefined && (Number(v) || 0) > max + 0.01}
      helperText={big && max !== undefined && (Number(v) || 0) > max + 0.01 ? 'More than the bill balance — excess goes on account' : undefined}
      InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
      inputProps={{ min: 0, step: 'any', inputMode: 'decimal', style: { textAlign: big ? 'left' : 'right' } }} />
  );
}

function TextSave({ value, onSave, big }: { value: string; onSave: (v: string) => void; big?: boolean }) {
  const [v, setV] = useState(value || '');
  useEffect(() => { setV(value || ''); }, [value]);
  return (
    <TextField variant={big ? 'outlined' : 'standard'} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== (value || '') && onSave(v)}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} fullWidth label={big ? 'Remark' : undefined} placeholder={big ? '' : 'Remark'} />
  );
}

// Phone layout for the delivery person: big Delivered / Returned buttons.
function StopCard({ s, i, editable, busy, onPatch }: { s: Stop; i: number; editable: boolean; busy: boolean; onPatch: (b: Partial<Pick<Stop, 'status' | 'collectedAmount' | 'remark'>>) => void }) {
  return (
    <Card variant="outlined" sx={{ p: 1.5, opacity: busy ? 0.6 : 1, borderLeft: 4, borderLeftColor: s.status === 'delivered' ? 'success.main' : s.status === 'returned' ? 'error.main' : 'warning.main' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography fontWeight={700} fontSize={15}>{i + 1}. {s.partyName}</Typography>
          <Typography fontSize={12} color="text.secondary">{s.invoiceNo}{s.boxes ? ` · ${s.boxes} boxes` : ''}</Typography>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Typography fontWeight={700}>₹{amt(s.amount)}</Typography>
          {!editable && <StatusChip status={s.status} />}
        </Box>
      </Box>
      {editable ? (
        <>
          <ToggleButtonGroup exclusive fullWidth value={s.status} onChange={(_, v) => v && onPatch({ status: v })} sx={{ mt: 1.25 }}>
            <ToggleButton value="delivered" color="success" sx={{ py: 1.25 }}><CheckCircleOutlineIcon sx={{ mr: 0.75 }} />Delivered</ToggleButton>
            <ToggleButton value="returned" color="error" sx={{ py: 1.25 }}><UndoIcon sx={{ mr: 0.75 }} />Returned</ToggleButton>
          </ToggleButtonGroup>
          {s.status !== 'pending' && <Button size="small" onClick={() => onPatch({ status: 'pending' })} sx={{ mt: 0.5 }}>Reset to pending</Button>}
          <Grid container spacing={1} sx={{ mt: 0.5 }} alignItems="flex-start">
            <Grid item xs={8}><MoneyField big value={s.collectedAmount} max={s.amount} onSave={(v) => onPatch({ collectedAmount: v })} /></Grid>
            <Grid item xs={4}><Button fullWidth variant="outlined" sx={{ height: 40 }} onClick={() => onPatch({ collectedAmount: s.amount })}>Full</Button></Grid>
            <Grid item xs={12}><TextSave big value={s.remark} onSave={(v) => onPatch({ remark: v })} /></Grid>
          </Grid>
        </>
      ) : (
        (s.collectedAmount > 0 || s.remark) && <Typography fontSize={13} sx={{ mt: 0.75 }}>{s.collectedAmount > 0 ? `Collected ₹${amt(s.collectedAmount)}` : ''}{s.remark ? ` · ${s.remark}` : ''}</Typography>
      )}
    </Card>
  );
}
