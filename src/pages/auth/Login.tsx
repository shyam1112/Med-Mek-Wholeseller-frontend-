import { useState } from 'react';
import { Alert, Button, Link, Stack, TextField, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { errMsg } from '../../api/client';
import { AuthShell } from './AuthShell';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await login(username, password); } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  };

  return (
    <AuthShell title="Sign in" subtitle="Welcome back — sign in to continue.">
      <form onSubmit={submit}>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Username or email" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required size="medium" />
          <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required size="medium" />
          <Button type="submit" variant="contained" size="large" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
          <Typography fontSize={13} textAlign="center">New distributor? <Link component={RouterLink} to="/register">Create your business account</Link></Typography>
        </Stack>
      </form>
    </AuthShell>
  );
}
