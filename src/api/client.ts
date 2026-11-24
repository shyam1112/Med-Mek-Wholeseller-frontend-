import axios, { AxiosError } from 'axios';

export const TOKEN_KEY = 'mmw_token';

// Local dev: "/api" (Vite proxies it to the backend). Production build:
// VITE_API_URL from .env.production, e.g. https://api.thecartnova.com/medmek-api
export const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');

export const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err: AxiosError<{ message?: string }>) => {
    if (err.response?.status === 401 && !err.config?.url?.includes('/auth/login')) {
      localStorage.removeItem(TOKEN_KEY);
      if (!location.pathname.startsWith('/login')) location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export interface ApiErrorBody {
  message?: string;
  code?: string;
  details?: { warnings?: RuleWarning[] } & Record<string, unknown>;
}

export interface RuleWarning {
  code: string;
  message: string;
  action: 'block' | 'warn' | 'ignore';
}

export const errMsg = (e: unknown, fallback = 'Something went wrong.') =>
  (e as AxiosError<ApiErrorBody>)?.response?.data?.message || (e as Error)?.message || fallback;

export const errBody = (e: unknown): ApiErrorBody | undefined => (e as AxiosError<ApiErrorBody>)?.response?.data;

// Paged list responses from the backend.
export interface Paged<T> {
  success: boolean;
  data: T[];
  pagination: { total: number; page: number; limit: number; pages: number };
  totals?: Record<string, number>;
}
