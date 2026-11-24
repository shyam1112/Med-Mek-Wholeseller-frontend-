import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, TOKEN_KEY } from '../api/client';
import type { Business, User } from '../lib/types';

interface AuthState {
  user: User | null;
  business: Business | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (body: Record<string, unknown>) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  can: (perm: string) => boolean;
}

const Ctx = createContext<AuthState>(null as unknown as AuthState);

// Mirrors backend config/permissions.ts `can`.
export const hasPerm = (perms: string[] = [], needed: string) => {
  const [m, a] = needed.split(':');
  return perms.some((p) => {
    const [pm, pa] = p.split(':');
    return (pm === '*' || pm === m) && (pa === '*' || pa === a);
  });
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);

  const apply = (d: { token?: string; user: User; business: Business }) => {
    if (d.token) localStorage.setItem(TOKEN_KEY, d.token);
    setUser(d.user);
    setBusiness(d.business);
  };

  const refresh = useCallback(async () => {
    if (!localStorage.getItem(TOKEN_KEY)) { setLoading(false); return; }
    try {
      const r = await api.get('/auth/me');
      apply(r.data);
    } catch {
      localStorage.removeItem(TOKEN_KEY);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const value: AuthState = {
    user, business, loading, refresh,
    login: async (username, password) => apply((await api.post('/auth/login', { username, password })).data),
    register: async (body) => apply((await api.post('/auth/register', body)).data),
    logout: () => { localStorage.removeItem(TOKEN_KEY); setUser(null); setBusiness(null); location.href = '/login'; },
    can: (perm) => hasPerm(user?.permissions, perm),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useAuth = () => useContext(Ctx);
