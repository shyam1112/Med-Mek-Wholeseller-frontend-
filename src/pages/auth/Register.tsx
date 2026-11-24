import { useState } from 'react';
import { Alert, Button, Link, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { errMsg } from '../../api/client';
import { STATES } from '../../lib/types';
import { AuthShell } from './AuthShell';

export default function Register() {
  const { register } = useAuth();
  const [f, setF] = useState({ businessName: '', gstin: '', stateCode: '24', phone: '', name: '', username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: k === 'gstin' ? e.target.value.toUpperCase() : e.target.value });
  const gstState = f.gstin.length >= 2 && STATES[f.gstin.slice(0, 2)] ? f.gstin.slice(0, 2) : '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await register({ ...f, stateCode: gstState || f.stateCode }); } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  };

  return (
    <AuthShell title="Create business account">
      <form onSubmit={submit}>
        <Stack spacing={1.5}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Business / firm name" value={f.businessName} onChange={set('businessName')} required autoFocus />
          <TextField label="GSTIN (optional now)" value={f.gstin} onChange={set('gstin')} inputProps={{ maxLength: 15 }} helperText={gstState ? `State: ${STATES[gstState]}` : 'Your state decides CGST/SGST vs IGST'} />
          {!gstState && (
            <TextField select label="State" value={f.stateCode} onChange={set('stateCode')}>
              {Object.entries(STATES).map(([c, n]) => <MenuItem key={c} value={c}>{n}</MenuItem>)}
            </TextField>
          )}
          <TextField label="Phone" value={f.phone} onChange={set('phone')} />
          <TextField label="Your name" value={f.name} onChange={set('name')} required />
          <TextField label="Username" value={f.username} onChange={set('username')} required helperText="Letters, numbers, _ or ." />
          <TextField label="Email" type="email" value={f.email} onChange={set('email')} />
          <TextField label="Password" type="password" value={f.password} onChange={set('password')} required inputProps={{ minLength: 6 }} />
          <Button type="submit" variant="contained" size="large" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</Button>
          <Typography fontSize={13} textAlign="center">Already registered? <Link component={RouterLink} to="/login">Sign in</Link></Typography>
        </Stack>
      </form>
    </AuthShell>
  );
}
