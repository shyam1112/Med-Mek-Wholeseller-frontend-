import { useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Grid,
  IconButton, MenuItem, Paper, Switch, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/PageHeader';
import { DataTable, Col } from '../../components/DataTable';
import { FilterBar, SearchBox } from '../../components/Filters';
import { useFetch } from '../../lib/hooks';
import { fdatetime } from '../../lib/format';
import { api, errMsg } from '../../api/client';
import { hasPerm, useAuth } from '../../auth/AuthContext';
import type { User } from '../../lib/types';

type Role = User['role'];
interface UsersResp { data: User[]; roles: Role[]; rolePermissions: Record<Role, string[]>; modules: string[]; actions: string[] }

const ROLE_INFO: Record<Role, string> = {
  owner: 'Full access, including other owner accounts.',
  admin: 'Full access to everything except owner accounts.',
  accountant: 'Views everything; posts receipts, payments, journals, purchases, returns, GST.',
  billing: 'Billing desk: sales bills & orders, purchases, receipts, dispatch.',
  salesman: 'Field staff: books orders, collects payments, sees own parties & stock.',
  dispatch: 'Godown / delivery: delivery runs, views bills and stock.',
  viewer: 'Read-only access to every screen.',
};
const ROLE_COLOR: Record<Role, 'primary' | 'secondary' | 'default' | 'info' | 'warning' | 'success'> = {
  owner: 'primary', admin: 'primary', accountant: 'secondary', billing: 'info', salesman: 'success', dispatch: 'warning', viewer: 'default',
};
const label = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

interface Form { _id?: string; name: string; username: string; email: string; phone: string; role: Role; password: string; isActive: boolean; extraPermissions: string[] }
const blank: Form = { name: '', username: '', email: '', phone: '', role: 'billing', password: '', isActive: true, extraPermissions: [] };

export default function Users() {
  const { can, user: me } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const { data, loading, reload } = useFetch<UsersResp>('/users');
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);

  const roles = data?.roles || [];
  const modules = data?.modules || [];
  const actions = data?.actions || [];
  const rp = data?.rolePermissions;
  const users = (data?.data || []).filter((u) => !search || `${u.name} ${u.username} ${u.phone} ${u.role}`.toLowerCase().includes(search.toLowerCase()));
  const permOptions = useMemo(() => modules.flatMap((m) => [`${m}:*`, ...actions.map((a) => `${m}:${a}`)]), [modules, actions]);

  const columns: Col<User>[] = [
    { key: 'name', label: 'Name', render: (u) => <><Typography component="div" fontWeight={600} fontSize={13}>{u.name}{u._id === me?._id && <Chip label="you" sx={{ ml: 1, height: 16, fontSize: 10 }} />}</Typography>{u.email && <Typography fontSize={11} color="text.secondary">{u.email}</Typography>}</> },
    { key: 'username', label: 'Username', render: (u) => <Typography fontFamily="monospace" fontSize={13}>{u.username}</Typography> },
    { key: 'role', label: 'Role', render: (u) => <Chip label={label(u.role)} color={ROLE_COLOR[u.role]} sx={{ height: 20, fontSize: 11, fontWeight: 600 }} /> },
    { key: 'extra', label: 'Extra permissions', render: (u) => (u.extraPermissions?.length ? <Tooltip title={u.extraPermissions.join(', ')}><Chip label={`+${u.extraPermissions.length}`} variant="outlined" sx={{ height: 20, fontSize: 11 }} /></Tooltip> : '') },
    { key: 'phone', label: 'Phone' },
    { key: 'isActive', label: 'Status', render: (u) => <Chip label={u.isActive ? 'Active' : 'Disabled'} color={u.isActive ? 'success' : 'default'} variant={u.isActive ? 'filled' : 'outlined'} sx={{ height: 20, fontSize: 11 }} /> },
    { key: 'lastLoginAt', label: 'Last login', nowrap: true, render: (u) => (u.lastLoginAt ? fdatetime(u.lastLoginAt) : <Typography component="span" fontSize={12} color="text.secondary">Never</Typography>) },
    { key: 'edit', label: '', align: 'right', render: (u) => (can('users:edit') ? <IconButton onClick={(e) => { e.stopPropagation(); openEdit(u); }}><EditOutlinedIcon fontSize="small" /></IconButton> : null) },
  ];

  const openEdit = (u: User) => setForm({ _id: u._id, name: u.name, username: u.username, email: u.email || '', phone: u.phone || '', role: u.role, password: '', isActive: u.isActive, extraPermissions: u.extraPermissions || [] });

  const save = async () => {
    if (!form) return;
    if (form.name.trim().length < 2) { enqueueSnackbar('Enter the full name', { variant: 'warning' }); return; }
    if (!/^[a-z0-9_.]{3,30}$/.test(form.username)) { enqueueSnackbar('Username: 3–30 lowercase letters, numbers, _ or .', { variant: 'warning' }); return; }
    if (!form._id && form.password.length < 6) { enqueueSnackbar('Password must be at least 6 characters', { variant: 'warning' }); return; }
    if (form._id && form.password && form.password.length < 6) { enqueueSnackbar('New password must be at least 6 characters', { variant: 'warning' }); return; }
    const { _id, password, ...rest } = form;
    const body = { ...rest, ...(password ? { password } : {}) };
    setSaving(true);
    try {
      if (_id) await api.put(`/users/${_id}`, body); else await api.post('/users', body);
      enqueueSnackbar(_id ? 'User updated' : 'User created', { variant: 'success' });
      setForm(null);
      reload();
    } catch (e) { enqueueSnackbar(errMsg(e), { variant: 'error' }); } finally { setSaving(false); }
  };

  const isSelf = form?._id === me?._id;
  const rolePerms = form && rp ? rp[form.role] || [] : [];

  return (
    <>
      <PageHeader
        title="Users & Permissions"
        subtitle="Staff logins, roles and what each role can do"
        actions={can('users:create') && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setForm({ ...blank })}>New user</Button>}
      />
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1.5 }}>
        <Tab label={`Users${data ? ` (${data.data.length})` : ''}`} />
        <Tab label="Permission matrix" />
      </Tabs>

      {tab === 0 && (
        <>
          <FilterBar><SearchBox value={search} onChange={setSearch} placeholder="Name / username / phone" /></FilterBar>
          <DataTable columns={columns} rows={users} loading={loading} onRowClick={can('users:edit') ? openEdit : undefined}
            rowSx={(u) => (u.isActive ? undefined : { opacity: 0.55 })} empty="No users." />
        </>
      )}

      {tab === 1 && rp && (
        <>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 1.5 }}>
            {actions.map((a) => <Typography key={a} fontSize={12} color="text.secondary"><b>{a[0].toUpperCase()}</b> = {a}</Typography>)}
            <Typography fontSize={12} color="text.secondary">· Extra permissions per user add on top of the role.</Typography>
          </Box>
          <Paper sx={{ overflow: 'auto' }}>
            <Table stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Module</TableCell>
                  {roles.map((r) => <TableCell key={r} align="center"><Tooltip title={ROLE_INFO[r]}><span>{label(r)}</span></Tooltip></TableCell>)}
                </TableRow>
              </TableHead>
              <TableBody>
                {modules.map((m) => (
                  <TableRow key={m} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{label(m)}</TableCell>
                    {roles.map((r) => {
                      const granted = actions.filter((a) => hasPerm(rp[r], `${m}:${a}`));
                      return (
                        <TableCell key={r} align="center">
                          {granted.length === actions.length ? <Chip label="All" color="success" sx={{ height: 18, fontSize: 10 }} />
                            : granted.length ? (
                              <Box sx={{ display: 'inline-flex', gap: 0.25 }}>
                                {actions.map((a) => (
                                  <Tooltip key={a} title={a}>
                                    <Box component="span" sx={{ width: 16, height: 16, fontSize: 10, fontWeight: 700, borderRadius: 0.5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                      bgcolor: granted.includes(a) ? 'primary.main' : 'transparent', color: granted.includes(a) ? '#fff' : 'text.disabled', border: 1, borderColor: granted.includes(a) ? 'primary.main' : 'divider' }}>
                                      {a[0].toUpperCase()}
                                    </Box>
                                  </Tooltip>
                                ))}
                              </Box>
                            ) : <Typography component="span" color="text.disabled">—</Typography>}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        </>
      )}

      <Dialog open={!!form} onClose={() => setForm(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{form?._id ? `Edit ${form.name}` : 'New user'}</DialogTitle>
        {form && (
          <DialogContent>
            <Grid container spacing={1.5} sx={{ mt: 0 }}>
              <Grid item xs={12} sm={6}><TextField label="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} fullWidth required autoFocus /></Grid>
              <Grid item xs={12} sm={6}>
                <TextField label="Username (login)" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s/g, '') })} fullWidth required
                  helperText="lowercase, numbers, _ or ." />
              </Grid>
              <Grid item xs={12} sm={6}><TextField label="Mobile" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} fullWidth inputProps={{ inputMode: 'tel' }} /></Grid>
              <Grid item xs={12} sm={6}><TextField label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} fullWidth /></Grid>
              <Grid item xs={12}>
                <TextField select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} fullWidth disabled={isSelf}
                  helperText={isSelf ? "You can't change your own role" : ROLE_INFO[form.role]}>
                  {roles.map((r) => (
                    <MenuItem key={r} value={r} disabled={r === 'owner' && me?.role !== 'owner'} sx={{ display: 'block' }}>
                      <Typography fontWeight={600} fontSize={13}>{label(r)}</Typography>
                      <Typography fontSize={11} color="text.secondary">{ROLE_INFO[r]}</Typography>
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={7}>
                <TextField label={form._id ? 'New password' : 'Password'} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} fullWidth
                  required={!form._id} helperText={form._id ? 'Leave blank to keep the current password' : 'At least 6 characters'} autoComplete="new-password" />
              </Grid>
              <Grid item xs={12} sm={5} sx={{ display: 'flex', alignItems: 'center' }}>
                <FormControlLabel control={<Switch checked={form.isActive} disabled={isSelf} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />} label={form.isActive ? 'Active (can log in)' : 'Disabled'} />
              </Grid>
              <Grid item xs={12}>
                <Autocomplete multiple options={permOptions} value={form.extraPermissions} onChange={(_, v) => setForm({ ...form, extraPermissions: v })}
                  getOptionDisabled={(o) => (o.endsWith(':*') ? actions.every((a) => hasPerm(rolePerms, `${o.split(':')[0]}:${a}`)) : hasPerm(rolePerms, o))}
                  groupBy={(o) => label(o.split(':')[0])}
                  getOptionLabel={(o) => { const [m, a] = o.split(':'); return `${label(m)}: ${a === '*' ? 'all actions' : a}`; }}
                  renderOption={(props, o) => { const [, a] = o.split(':'); const has = !o.endsWith(':*') && hasPerm(rolePerms, o); return <li {...props} key={o}>{a === '*' ? 'All actions' : a}{has && <Typography component="span" fontSize={11} color="text.secondary" sx={{ ml: 1 }}>(already in role)</Typography>}</li>; }}
                  renderInput={(p) => <TextField {...p} label="Extra permissions" helperText="Granted on top of the role — e.g. a billing user who may also cancel bills (Sales: cancel) or override credit blocks (Sales: override)." />}
                  disableCloseOnSelect
                />
              </Grid>
            </Grid>
            {form.role === 'owner' && <Alert severity="warning" sx={{ mt: 2 }}>Owners have unrestricted access, including managing other owners.</Alert>}
          </DialogContent>
        )}
        <DialogActions>
          <Button onClick={() => setForm(null)}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={saving} startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}>{form?._id ? 'Save changes' : 'Create user'}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
