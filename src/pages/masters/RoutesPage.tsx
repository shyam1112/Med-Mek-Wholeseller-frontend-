import { useState } from 'react';
import {
  Autocomplete, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Grid, IconButton, MenuItem,
  Switch, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/PageHeader';
import { DataTable, Col } from '../../components/DataTable';
import { FilterBar, SearchBox } from '../../components/Filters';
import { useDebounced, useFetch, useHotkey } from '../../lib/hooks';
import { exportExcel } from '../../lib/excel';
import { api, errMsg } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { DAYS, SmallChip, refId, refName, useUsers } from './masterUi';

interface RouteDoc { _id: string; name: string; areas: string[]; deliveryDays: string[]; salesman?: { _id: string; name: string } | string | null; isActive: boolean }

const todayDay = DAYS[(new Date().getDay() + 6) % 7];

export default function RoutesPage() {
  const nav = useNavigate();
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [day, setDay] = useState('');
  const [edit, setEdit] = useState<Partial<RouteDoc> | null>(null);
  const q = useDebounced(search);
  const { data, loading, reload } = useFetch<{ data: RouteDoc[]; pagination: { total: number } }>('/routes', { search: q, limit: 500 });
  let rows = data?.data || [];
  if (day) rows = rows.filter((r) => r.deliveryDays?.includes(day));

  useHotkey('alt+n', () => can('parties:create') && setEdit({ name: '', areas: [], deliveryDays: [], isActive: true }));

  const columns: Col<RouteDoc>[] = [
    { key: 'name', label: 'Route', render: (r) => <><Typography component="span" fontWeight={600} fontSize={13}>{r.name}</Typography>{!r.isActive && <SmallChip label="Inactive" variant="outlined" />}</> },
    { key: 'areas', label: 'Areas', render: (r) => <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', maxWidth: 420 }}>{r.areas?.map((a) => <Chip key={a} label={a} sx={{ height: 20, fontSize: 11 }} />)}</Box> },
    {
      key: 'deliveryDays', label: 'Delivery days',
      render: (r) => (
        <Box sx={{ display: 'flex', gap: 0.25 }}>
          {DAYS.map((d) => {
            const on = r.deliveryDays?.includes(d);
            return <Box key={d} sx={{ fontSize: 10.5, fontWeight: 700, px: 0.5, py: 0.1, borderRadius: 0.75, bgcolor: on ? (d === todayDay ? 'secondary.main' : 'primary.main') : 'action.hover', color: on ? '#fff' : 'text.disabled' }}>{d.slice(0, 2)}</Box>;
          })}
        </Box>
      ),
    },
    { key: 'salesman', label: 'Salesman', render: (r) => refName(r.salesman) || '—' },
    {
      key: 'act', label: '', align: 'right', nowrap: true,
      render: (r) => (
        <Box onClick={(e) => e.stopPropagation()}>
          <Tooltip title="Customers on this route"><IconButton onClick={() => nav(`/customers?route=${r._id}`)}><StorefrontOutlinedIcon fontSize="small" /></IconButton></Tooltip>
          {can('parties:edit') && <Tooltip title="Edit"><IconButton onClick={() => setEdit(r)}><EditOutlinedIcon fontSize="small" /></IconButton></Tooltip>}
        </Box>
      ),
    },
  ];

  const exportAll = () => exportExcel('routes', [{
    name: 'Routes', rows,
    columns: [
      { key: 'name', label: 'Route' }, { key: 'areas', label: 'Areas', value: (r) => r.areas.join(', ') },
      { key: 'deliveryDays', label: 'Delivery Days', value: (r) => r.deliveryDays.join(', ') },
      { key: 'salesman', label: 'Salesman', value: (r) => refName(r.salesman) }, { key: 'isActive', label: 'Active', value: (r) => (r.isActive ? 'Yes' : 'No') },
    ],
  }]);

  return (
    <>
      <PageHeader
        title="Routes"
        crumbs={[{ label: 'Masters' }]}
        subtitle={`Delivery beats and the areas they cover · today is ${todayDay}`}
        actions={
          <>
            <Button variant="outlined" onClick={exportAll} disabled={!rows.length}>Excel</Button>
            {can('parties:create') && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEdit({ name: '', areas: [], deliveryDays: [], isActive: true })}>New Route (Alt+N)</Button>}
          </>
        }
      />
      <FilterBar>
        <SearchBox value={search} onChange={setSearch} placeholder="Route / area" />
        <TextField select label="Delivers on" value={day} onChange={(e) => setDay(e.target.value)} sx={{ width: 130 }}>
          <MenuItem value="">Any day</MenuItem>
          {DAYS.map((d) => <MenuItem key={d} value={d}>{d}{d === todayDay ? ' (today)' : ''}</MenuItem>)}
        </TextField>
      </FilterBar>
      <DataTable columns={columns} rows={rows} loading={loading} onRowClick={(r) => nav(`/customers?route=${r._id}`)}
        rowSx={(r) => (!r.isActive ? { opacity: 0.55 } : undefined)} empty={q || day ? 'No route matches.' : 'No routes yet. Routes group customers for salesmen and delivery runs.'} />
      {edit && <RouteDialog value={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </>
  );
}

function RouteDialog({ value, onClose, onSaved }: { value: Partial<RouteDoc>; onClose: () => void; onSaved: () => void }) {
  const { enqueueSnackbar } = useSnackbar();
  const salesmen = useUsers('salesman');
  const [name, setName] = useState(value.name || '');
  const [areas, setAreas] = useState<string[]>(value.areas || []);
  const [areaInput, setAreaInput] = useState('');
  const [days, setDays] = useState<string[]>(value.deliveryDays || []);
  const [salesman, setSalesman] = useState(refId(value.salesman));
  const [isActive, setIsActive] = useState(value.isActive ?? true);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) { enqueueSnackbar('Route name is required.', { variant: 'warning' }); return; }
    setSaving(true);
    const allAreas = [...new Set([...areas, ...(areaInput.trim() ? [areaInput.trim()] : [])])];
    const body = { name: name.trim(), areas: allAreas, deliveryDays: DAYS.filter((d) => days.includes(d)), salesman: salesman || null, isActive };
    try {
      if (value._id) await api.put(`/routes/${value._id}`, body); else await api.post('/routes', body);
      enqueueSnackbar(`Route ${body.name} saved.`, { variant: 'success' });
      onSaved();
    } catch (e) {
      const m = errMsg(e);
      enqueueSnackbar(/E11000|duplicate/i.test(m) ? 'A route with this name already exists.' : m, { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };
  useHotkey('ctrl+s', save, [name, areas, areaInput, days, salesman, isActive]);

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{value._id ? `Edit route ${value.name}` : 'New route'}</DialogTitle>
      <DialogContent>
        <Grid container spacing={1.5} sx={{ pt: 1 }}>
          <Grid item xs={12}><TextField label="Route name" required autoFocus fullWidth value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. City East / Highway-NH48" /></Grid>
          <Grid item xs={12}>
            <Autocomplete multiple freeSolo options={[]} value={areas} inputValue={areaInput} onInputChange={(_, v) => setAreaInput(v)}
              onChange={(_, v) => setAreas((v as string[]).map((s) => s.trim()).filter(Boolean))}
              renderTags={(v, getTagProps) => v.map((o, i) => <Chip {...getTagProps({ index: i })} key={o} label={o} size="small" />)}
              renderInput={(p) => <TextField {...p} label="Areas" helperText="Type an area and press Enter — offered as suggestions on the customer form" />} />
          </Grid>
          <Grid item xs={12}>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>Delivery days</Typography>
            <ToggleButtonGroup size="small" value={days} onChange={(_, v) => setDays(v)}>
              {DAYS.map((d) => <ToggleButton key={d} value={d} sx={{ px: 1.5 }}>{d}</ToggleButton>)}
            </ToggleButtonGroup>
            <Box sx={{ mt: 0.5 }}>
              <Button size="small" onClick={() => setDays(DAYS.slice(0, 6))}>Mon–Sat</Button>
              <Button size="small" onClick={() => setDays(['Mon', 'Wed', 'Fri'])}>Mon/Wed/Fri</Button>
              <Button size="small" onClick={() => setDays(['Tue', 'Thu', 'Sat'])}>Tue/Thu/Sat</Button>
              <Button size="small" onClick={() => setDays([])}>Clear</Button>
            </Box>
          </Grid>
          <Grid item xs={12} sm={7}>
            <TextField select label="Salesman" fullWidth value={salesmen.some((u) => u._id === salesman) ? salesman : ''} onChange={(e) => setSalesman(e.target.value)}
              helperText={salesmen.length ? 'Default salesman for new customers on this route' : 'No users with the salesman role yet'}>
              <MenuItem value="">— None —</MenuItem>
              {salesmen.map((u) => <MenuItem key={u._id} value={u._id}>{u.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={5}><FormControlLabel control={<Switch checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />} label="Active" /></Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  );
}
