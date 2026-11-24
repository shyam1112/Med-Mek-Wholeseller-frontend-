import { useState } from 'react';
import {
  Autocomplete, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Grid, IconButton, MenuItem,
  Switch, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import MedicationOutlinedIcon from '@mui/icons-material/MedicationOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/PageHeader';
import { DataTable, Col } from '../../components/DataTable';
import { FilterBar, SearchBox } from '../../components/Filters';
import { useDebounced, useFetch, useHotkey } from '../../lib/hooks';
import { exportExcel } from '../../lib/excel';
import { api, errMsg } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { NumField, SmallChip } from './masterUi';

export interface Manufacturer {
  _id: string; name: string; shortName: string; divisions: string[]; contactPerson: string; phone: string; email: string;
  expiryClaimPct: number; isActive: boolean;
}
const BLANK: Omit<Manufacturer, '_id'> = { name: '', shortName: '', divisions: [], contactPerson: '', phone: '', email: '', expiryClaimPct: 100, isActive: true };

export default function Manufacturers() {
  const nav = useNavigate();
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [active, setActive] = useState('');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
  const [edit, setEdit] = useState<Partial<Manufacturer> | null>(null);
  const q = useDebounced(search);
  const params = { search: q, active, page: page + 1, limit };
  const { data, loading, reload } = useFetch<{ data: Manufacturer[]; pagination: { total: number } }>('/manufacturers', params);
  let rows = data?.data || [];
  if (active === 'false') rows = rows.filter((r) => !r.isActive);

  useHotkey('alt+n', () => can('products:create') && setEdit({ ...BLANK }));

  const columns: Col<Manufacturer>[] = [
    { key: 'name', label: 'Company', render: (r) => <><Typography component="span" fontWeight={600} fontSize={13}>{r.name}</Typography>{!r.isActive && <SmallChip label="Inactive" variant="outlined" />}</> },
    { key: 'shortName', label: 'Short' },
    { key: 'divisions', label: 'Divisions', render: (r) => <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>{r.divisions?.map((d) => <Chip key={d} label={d} sx={{ height: 20, fontSize: 11 }} />)}</Box> },
    { key: 'contactPerson', label: 'Contact' },
    { key: 'phone', label: 'Phone', nowrap: true },
    { key: 'email', label: 'Email' },
    { key: 'expiryClaimPct', label: 'Expiry claim', align: 'right', render: (r) => `${r.expiryClaimPct ?? 100}%` },
    {
      key: 'act', label: '', align: 'right', nowrap: true,
      render: (r) => (
        <Box onClick={(e) => e.stopPropagation()}>
          <Tooltip title="Products of this company"><IconButton onClick={() => nav(`/products?manufacturer=${r._id}`)}><MedicationOutlinedIcon fontSize="small" /></IconButton></Tooltip>
          {can('products:edit') && <Tooltip title="Edit"><IconButton onClick={() => setEdit(r)}><EditOutlinedIcon fontSize="small" /></IconButton></Tooltip>}
        </Box>
      ),
    },
  ];

  const exportAll = async () => {
    const r = await api.get('/manufacturers', { params: { search: q, limit: 500 } });
    exportExcel('companies', [{
      name: 'Companies', rows: r.data.data as Manufacturer[],
      columns: [
        { key: 'name', label: 'Company' }, { key: 'shortName', label: 'Short Name' }, { key: 'divisions', label: 'Divisions', value: (m) => m.divisions.join(', ') },
        { key: 'contactPerson', label: 'Contact' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' },
        { key: 'expiryClaimPct', label: 'Expiry Claim %' }, { key: 'isActive', label: 'Active', value: (m) => (m.isActive ? 'Yes' : 'No') },
      ],
    }]);
  };

  return (
    <>
      <PageHeader
        title="Companies"
        crumbs={[{ label: 'Masters' }]}
        subtitle={data ? `${data.pagination?.total || 0} manufacturers · click a row to see its products` : 'Manufacturers and their divisions'}
        actions={
          <>
            <Button variant="outlined" startIcon={<FileDownloadOutlinedIcon />} onClick={exportAll}>Excel</Button>
            {can('products:create') && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEdit({ ...BLANK })}>New Company (Alt+N)</Button>}
          </>
        }
      />
      <FilterBar>
        <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(0); }} placeholder="Company / short name" />
        <TextField select label="Status" value={active} onChange={(e) => { setActive(e.target.value); setPage(0); }} sx={{ width: 120 }}>
          <MenuItem value="">All</MenuItem>
          <MenuItem value="true">Active</MenuItem>
          <MenuItem value="false">Inactive</MenuItem>
        </TextField>
      </FilterBar>
      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        total={data?.pagination?.total || 0}
        page={page}
        limit={limit}
        onPage={setPage}
        onLimit={(l) => { setLimit(l); setPage(0); }}
        onRowClick={(r) => nav(`/products?manufacturer=${r._id}`)}
        rowSx={(r) => (!r.isActive ? { opacity: 0.55 } : undefined)}
        empty={q ? 'No company matches.' : 'No companies yet. They are also created automatically when you import products.'}
      />
      {edit && <ManufacturerDialog value={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </>
  );
}

function ManufacturerDialog({ value, onClose, onSaved }: { value: Partial<Manufacturer>; onClose: () => void; onSaved: () => void }) {
  const { enqueueSnackbar } = useSnackbar();
  const [f, setF] = useState<Omit<Manufacturer, '_id'>>({ ...BLANK, ...value });
  const [divInput, setDivInput] = useState('');
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => {
    if (!f.name.trim()) { enqueueSnackbar('Company name is required.', { variant: 'warning' }); return; }
    setSaving(true);
    // Include a division still sitting in the input box.
    const divisions = [...new Set([...f.divisions, ...(divInput.trim() ? [divInput.trim()] : [])])];
    const body = { name: f.name.trim(), shortName: f.shortName, divisions, contactPerson: f.contactPerson, phone: f.phone, email: f.email, expiryClaimPct: f.expiryClaimPct, isActive: f.isActive };
    try {
      if (value._id) await api.put(`/manufacturers/${value._id}`, body); else await api.post('/manufacturers', body);
      enqueueSnackbar(`${body.name} saved.`, { variant: 'success' });
      onSaved();
    } catch (e) {
      const m = errMsg(e);
      enqueueSnackbar(/duplicate|E11000/i.test(m) ? 'A company with this name already exists.' : m, { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };
  useHotkey('ctrl+s', save, [f, divInput]);
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{value._id ? `Edit ${value.name}` : 'New company'}</DialogTitle>
      <DialogContent>
        <Grid container spacing={1.5} sx={{ pt: 1 }}>
          <Grid item xs={12} sm={8}><TextField label="Company name" required autoFocus fullWidth value={f.name} onChange={(e) => set('name', e.target.value)} /></Grid>
          <Grid item xs={12} sm={4}><TextField label="Short name" fullWidth value={f.shortName} onChange={(e) => set('shortName', e.target.value.toUpperCase())} /></Grid>
          <Grid item xs={12}>
            <Autocomplete multiple freeSolo options={[]} value={f.divisions} inputValue={divInput} onInputChange={(_, v) => setDivInput(v)}
              onChange={(_, v) => set('divisions', (v as string[]).map((s) => s.trim()).filter(Boolean))}
              renderTags={(v, getTagProps) => v.map((o, i) => <Chip {...getTagProps({ index: i })} key={o} label={o} size="small" />)}
              renderInput={(p) => <TextField {...p} label="Divisions" helperText="Type a division and press Enter (e.g. Cardiac, Derma, Critical Care)" />} />
          </Grid>
          <Grid item xs={12} sm={6}><TextField label="Contact person" fullWidth value={f.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} helperText="Area manager / C&F contact" /></Grid>
          <Grid item xs={12} sm={6}><TextField label="Phone" fullWidth value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Grid>
          <Grid item xs={12} sm={6}><TextField label="Email" type="email" fullWidth value={f.email} onChange={(e) => set('email', e.target.value)} /></Grid>
          <Grid item xs={12} sm={6}>
            <NumField label="Expiry claim" suffix="% of PTR" value={f.expiryClaimPct} onChange={(v) => set('expiryClaimPct', Math.min(100, v))} inputProps={{ max: 100 }}
              helperText="What the company reimburses on expiry returns" />
          </Grid>
          <Grid item xs={12}><FormControlLabel control={<Switch checked={f.isActive} onChange={(e) => set('isActive', e.target.checked)} />} label="Active" /></Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  );
}
