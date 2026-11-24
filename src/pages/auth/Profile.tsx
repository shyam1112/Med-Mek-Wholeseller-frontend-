import React, { useState } from 'react';
import {
  Avatar, Box, Button, Chip, CircularProgress, Divider, Grid, IconButton, InputAdornment, LinearProgress, Paper, TextField, Typography,
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import LockResetIcon from '@mui/icons-material/LockReset';
import LogoutIcon from '@mui/icons-material/Logout';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/PageHeader';
import { api, errMsg } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { fdatetime } from '../../lib/format';

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner', admin: 'Admin', accountant: 'Accountant', billing: 'Billing operator', salesman: 'Salesman', dispatch: 'Dispatch', viewer: 'Viewer',
};

const strength = (p: string) => {
  let s = 0;
  if (p.length >= 6) s++;
  if (p.length >= 10) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return s;
};

const Info: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => (
  <Box sx={{ py: 0.75 }}>
    <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
    <Typography fontSize={14}>{value || '—'}</Typography>
  </Box>
);

export default function Profile() {
  const { user, business, logout } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  if (!user) return null;

  const errs = {
    current: !current ? 'Enter your current password' : '',
    next: next.length < 6 ? 'At least 6 characters' : next === current ? 'Must differ from the current password' : '',
    confirm: confirmPw !== next ? "Passwords don't match" : '',
  };
  const valid = !errs.current && !errs.next && !errs.confirm;
  const st = strength(next);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid || saving) return;
    setSaving(true);
    try {
      const r = await api.put('/auth/password', { currentPassword: current, newPassword: next });
      enqueueSnackbar(r.data?.message || 'Password changed.', { variant: 'success' });
      setCurrent(''); setNext(''); setConfirmPw(''); setTouched(false);
    } catch (err) {
      enqueueSnackbar(errMsg(err), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const pwType = show ? 'text' : 'password';
  const eye = (
    <InputAdornment position="end">
      <IconButton size="small" onClick={() => setShow((x) => !x)} edge="end" aria-label={show ? 'Hide passwords' : 'Show passwords'}>
        {show ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
      </IconButton>
    </InputAdornment>
  );

  return (
    <>
      <PageHeader title="My Profile" subtitle="Your account and password" />
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2.5 }}>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2 }}>
              <Avatar sx={{ width: 56, height: 56, bgcolor: 'primary.main', fontSize: 22 }}>{user.name.slice(0, 1).toUpperCase()}</Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h6" noWrap>{user.name}</Typography>
                <Chip size="small" color="primary" variant="outlined" label={ROLE_LABEL[user.role] || user.role} />
              </Box>
            </Box>
            <Divider />
            <Grid container columnSpacing={2}>
              <Grid item xs={12} sm={6}><Info label="Username" value={user.username} /></Grid>
              <Grid item xs={12} sm={6}><Info label="Email" value={user.email} /></Grid>
              <Grid item xs={12} sm={6}><Info label="Phone" value={user.phone} /></Grid>
              <Grid item xs={12} sm={6}><Info label="Last login" value={user.lastLoginAt ? fdatetime(user.lastLoginAt) : ''} /></Grid>
              <Grid item xs={12}><Info label="Business" value={business ? `${business.name}${business.gstin ? ` · GSTIN ${business.gstin}` : ''}` : ''} /></Grid>
            </Grid>
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="caption" color="text.secondary">Access</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
              {(user.permissions || []).slice(0, 40).map((p) => <Chip key={p} size="small" label={p.replace(/_/g, ' ')} sx={{ height: 20, fontSize: 10.5 }} />)}
              {(user.permissions || []).length > 40 && <Chip size="small" label={`+${user.permissions.length - 40} more`} sx={{ height: 20, fontSize: 10.5 }} />}
            </Box>
            <Typography variant="caption" color="text.secondary" display="block" mt={1}>Ask the owner / admin to change your role or permissions.</Typography>
            <Button sx={{ mt: 2 }} color="inherit" startIcon={<LogoutIcon />} onClick={logout}>Sign out</Button>
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2.5 }} component="form" onSubmit={submit} noValidate>
            <Typography variant="h6" gutterBottom>Change password</Typography>
            <TextField label="Current password" type={pwType} value={current} onChange={(e) => setCurrent(e.target.value)} fullWidth margin="dense"
              autoComplete="current-password" error={touched && !!errs.current} helperText={touched ? errs.current : ' '} InputProps={{ endAdornment: eye }} />
            <TextField label="New password" type={pwType} value={next} onChange={(e) => setNext(e.target.value)} fullWidth margin="dense"
              autoComplete="new-password" error={(touched || next.length > 0) && !!errs.next} helperText={(touched || next.length > 0) ? errs.next || ' ' : 'At least 6 characters'} />
            {next && (
              <Box sx={{ mb: 1 }}>
                <LinearProgress variant="determinate" value={(st / 5) * 100} color={st <= 2 ? 'error' : st === 3 ? 'warning' : 'success'} sx={{ height: 4, borderRadius: 2 }} />
                <Typography variant="caption" color="text.secondary">{st <= 2 ? 'Weak' : st === 3 ? 'Fair' : 'Strong'} — use 10+ characters with numbers and symbols</Typography>
              </Box>
            )}
            <TextField label="Confirm new password" type={pwType} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} fullWidth margin="dense"
              autoComplete="new-password" error={(touched || confirmPw.length > 0) && !!errs.confirm} helperText={(touched || confirmPw.length > 0) ? errs.confirm || ' ' : ' '} />
            <Button type="submit" variant="contained" sx={{ mt: 1 }} disabled={saving}
              startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <LockResetIcon />}>Change password</Button>
          </Paper>
        </Grid>
      </Grid>
    </>
  );
}
