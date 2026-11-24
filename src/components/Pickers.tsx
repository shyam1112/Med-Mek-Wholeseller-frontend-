import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Autocomplete, Box, Chip, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useSnackbar } from 'notistack';
import { api, errMsg } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useDebounced } from '../lib/hooks';
import { drcr, fexp } from '../lib/format';

interface AsyncProps<T> {
  value: T | null;
  onChange: (v: T | null) => void;
  label?: string;
  url: string;
  params?: Record<string, unknown>;
  // How the search text is sent (default "q").
  queryKey?: string;
  getLabel: (o: T) => string;
  renderOption?: (o: T) => React.ReactNode;
  autoFocus?: boolean;
  disabled?: boolean;
  required?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  onKeyDown?: React.KeyboardEventHandler;
  placeholder?: string;
  sx?: object;
  error?: boolean;
  helperText?: string;
  // Adds a "+ Create …" row; called with the typed text when it is picked.
  onCreate?: (text: string) => void;
  createLabel?: string;
}

const CREATE_ID = '__create__';

// Server-searched autocomplete. Enter selects the highlighted option, which
// is what makes keyboard-only billing fast.
export function AsyncPicker<T extends { _id: string }>(p: AsyncProps<T>) {
  const [input, setInput] = useState('');
  const [options, setOptions] = useState<T[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const q = useDebounced(input, 200);
  const paramKey = JSON.stringify(p.params || {});

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get(p.url, { params: { ...(p.params || {}), [p.queryKey || 'q']: q, limit: 25 } })
      .then((r) => { if (alive) { setOptions(r.data.data || []); setLoadedFor(q); } })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, p.url, paramKey]);

  // Until results for the current text arrive, only offer options that match
  // what's typed — otherwise a fast Enter would pick a stale row (wrong party
  // on the bill).
  const selectedLabel = p.value ? p.getLabel(p.value) : null;
  const stale = loadedFor !== input && input !== selectedLabel;
  const shown = stale ? options.filter((o) => p.getLabel(o).toLowerCase().includes(input.trim().toLowerCase())) : options;
  // The create row goes last so Enter still picks a real match first, but it
  // is the only row (so Enter opens it) when nothing matches the typed name.
  // Hidden while results are loading so a fast Enter never creates a duplicate.
  const typed = input.trim();
  const exact = shown.some((o) => p.getLabel(o).toLowerCase() === typed.toLowerCase());
  const withCreate = p.onCreate && !stale && input !== selectedLabel && !exact
    ? [...shown, { _id: CREATE_ID } as T]
    : shown;
  const createText = `${p.createLabel || 'Create'}${typed ? ` "${typed}"` : ''}`;

  return (
    <Autocomplete
      value={p.value}
      onChange={(_, v) => { if (v && v._id === CREATE_ID) p.onCreate?.(typed); else p.onChange(v); }}
      inputValue={input}
      onInputChange={(_, v) => setInput(v)}
      options={withCreate}
      loading={loading || stale}
      disabled={p.disabled}
      filterOptions={(x) => x}
      autoHighlight
      openOnFocus
      isOptionEqualToValue={(a, b) => a._id === b._id}
      getOptionLabel={(o) => (o._id === CREATE_ID ? input : p.getLabel(o))}
      renderOption={(props, o) => (o._id === CREATE_ID
        ? <li {...props} key={CREATE_ID}><Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'primary.main', fontWeight: 600, fontSize: 13 }}><AddIcon fontSize="small" />{createText}</Box></li>
        : <li {...props} key={o._id}>{p.renderOption ? p.renderOption(o) : p.getLabel(o)}</li>)}
      sx={p.sx}
      renderInput={(params) => (
        <TextField {...params} label={p.label} placeholder={p.placeholder} autoFocus={p.autoFocus} required={p.required}
          inputRef={p.inputRef} onKeyDown={p.onKeyDown} error={p.error} helperText={p.helperText} />
      )}
    />
  );
}

const QuickPartyDialog = lazy(() => import('./QuickCreate').then((m) => ({ default: m.QuickPartyDialog })));
const QuickProductDialog = lazy(() => import('./QuickCreate').then((m) => ({ default: m.QuickProductDialog })));

// State for a picker's "+ Create" row: the typed text opens a quick dialog
// whose result is selected straight into the picker.
function useQuickCreate(enabled: boolean | undefined, perm: string) {
  const { can } = useAuth();
  const [name, setName] = useState<string | null>(null);
  const allowed = !!enabled && can(perm);
  return { allowed, open: name !== null, name: name || '', start: allowed ? (t: string) => setName(t) : undefined, close: () => setName(null) };
}

export interface PartyOption {
  _id: string; name: string; city?: string; area?: string; gstin?: string; stateCode?: string; mobile?: string; balance?: number;
  creditLimit?: number; creditDays?: number; dlExpiry?: string; isHold?: boolean; cashDiscountPct?: number; group?: string;
}

// quickCreateName prefills the dialog when nothing has been typed.
type QuickFlag = { quickCreate?: boolean; quickCreateName?: string };

export const PartyPicker: React.FC<Omit<AsyncProps<PartyOption>, 'url' | 'getLabel'> & { type?: 'customer' | 'supplier' } & QuickFlag> = ({ type, quickCreate, quickCreateName, ...p }) => {
  const qc = useQuickCreate(quickCreate && !!type, 'parties:create');
  return (<>
  <AsyncPicker<PartyOption>
    {...p}
    onCreate={qc.start}
    createLabel={`New ${type}`}
    url="/parties/lookup"
    params={{ ...(p.params || {}), type }}
    label={p.label ?? (type === 'supplier' ? 'Supplier' : type === 'customer' ? 'Customer' : 'Party')}
    getLabel={(o) => o.name}
    renderOption={(o) => (
      <Box sx={{ width: '100%', display: 'flex', justifyContent: 'space-between', gap: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography component="div" fontSize={13} fontWeight={600} noWrap>{o.name} {o.isHold && <Chip label="HOLD" color="error" sx={{ height: 16, fontSize: 10 }} />}</Typography>
          <Typography fontSize={11} color="text.secondary" noWrap>{[o.city || o.area, o.gstin, o.mobile].filter(Boolean).join(' · ')}</Typography>
        </Box>
        <Typography fontSize={12} color={(o.balance || 0) > 0 ? 'error.main' : 'text.secondary'} sx={{ whiteSpace: 'nowrap' }}>{drcr(o.balance || 0)}</Typography>
      </Box>
    )}
  />
  {qc.open && type && (
    <Suspense fallback={null}>
      <QuickPartyDialog open type={type} initialName={qc.name || quickCreateName || ''} onClose={qc.close} onCreated={(v) => { qc.close(); p.onChange(v); }} />
    </Suspense>
  )}
  </>);
};

export interface ProductOption {
  _id: string; name: string; manufacturerName: string; packing: string; salt?: string; gstRate: number; mrp: number; ptr: number;
  schedule: string; rack?: string; isBanned?: boolean; stock: number; nearestExpiry?: string | null; schemeBuy?: number; schemeFree?: number; batches?: number; reserved?: number;
}

export const ProductPicker: React.FC<Omit<AsyncProps<ProductOption>, 'url' | 'getLabel'> & QuickFlag> = ({ quickCreate, quickCreateName, ...p }) => {
  const qc = useQuickCreate(quickCreate, 'products:create');
  return (<>
  <AsyncPicker<ProductOption>
    {...p}
    onCreate={qc.start}
    createLabel="New product"
    url="/products/lookup"
    label={p.label ?? 'Product'}
    getLabel={(o) => o.name}
    renderOption={(o) => (
      <Box sx={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 70px 90px', gap: 1, alignItems: 'center' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography fontSize={13} fontWeight={600} noWrap>
            {o.name} {o.schedule !== 'None' && <Chip label={o.schedule} color="warning" sx={{ height: 16, fontSize: 10 }} />}
            {o.isBanned && <Chip label="BANNED" color="error" sx={{ height: 16, fontSize: 10, ml: 0.5 }} />}
          </Typography>
          <Typography fontSize={11} color="text.secondary" noWrap>{[o.manufacturerName, o.packing, o.salt].filter(Boolean).join(' · ')}</Typography>
        </Box>
        <Typography fontSize={12} textAlign="right">MRP {o.mrp}</Typography>
        <Typography component="div" fontSize={12} textAlign="right" fontWeight={700} color={o.stock > 0 ? 'success.main' : 'error.main'}>
          {o.stock} {o.nearestExpiry ? <Typography component="span" fontSize={10} color="text.secondary">({fexp(o.nearestExpiry)})</Typography> : null}
          {(o.batches || 0) > 1 && <Typography component="div" fontSize={10} color="text.secondary" fontWeight={400}>{o.batches} batches</Typography>}
          {(o.reserved || 0) > 0 && <Typography component="div" fontSize={10} color="warning.dark" fontWeight={400}>{o.reserved} reserved</Typography>}
        </Typography>
      </Box>
    )}
  />
  {qc.open && (
    <Suspense fallback={null}>
      <QuickProductDialog open initialName={qc.name || quickCreateName || ''} onClose={qc.close} onCreated={(v) => { qc.close(); p.onChange(v); }} />
    </Suspense>
  )}
  </>);
};

export interface LedgerOption { _id: string; name: string; group: string; balance?: number }

export const LedgerPicker: React.FC<Omit<AsyncProps<LedgerOption>, 'url' | 'getLabel' | 'queryKey'> & { groups?: string; includeParties?: boolean }> = ({ groups, includeParties, ...p }) => (
  <AsyncPicker<LedgerOption>
    {...p}
    url="/ledgers"
    queryKey="search"
    params={{ group: groups, includeParties: includeParties ? 'true' : undefined }}
    label={p.label ?? 'Ledger'}
    getLabel={(o) => o.name}
    renderOption={(o) => (
      <Box sx={{ width: '100%', display: 'flex', justifyContent: 'space-between', gap: 2 }}>
        <span>{o.name} <Typography component="span" fontSize={11} color="text.secondary">{o.group.replace(/_/g, ' ')}</Typography></span>
        <Typography fontSize={12} color="text.secondary">{drcr(o.balance || 0)}</Typography>
      </Box>
    )}
  />
);

export const SimplePicker: React.FC<Omit<AsyncProps<{ _id: string; name: string }>, 'getLabel' | 'queryKey'>> = (p) => (
  <AsyncPicker<{ _id: string; name: string }> {...p} queryKey="search" getLabel={(o) => o.name} />
);

// A company needs only its name, so "+ Create" saves it straight away.
export const ManufacturerPicker: React.FC<Omit<AsyncProps<{ _id: string; name: string }>, 'getLabel' | 'url' | 'queryKey'> & QuickFlag> = ({ quickCreate, ...p }) => {
  const { can } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const create = async (name: string) => {
    if (!name) { enqueueSnackbar('Type the company name first.', { variant: 'info' }); return; }
    try {
      const r = await api.post('/manufacturers', { name });
      enqueueSnackbar(`Company ${r.data.data.name} created.`, { variant: 'success' });
      p.onChange({ _id: r.data.data._id, name: r.data.data.name });
    } catch (e) {
      enqueueSnackbar(errMsg(e), { variant: 'error' });
    }
  };
  return <SimplePicker {...p} url="/manufacturers" label={p.label ?? 'Company / Manufacturer'} onCreate={quickCreate && can('products:create') ? create : undefined} createLabel="New company" />;
};
export const RoutePicker: React.FC<Omit<AsyncProps<{ _id: string; name: string }>, 'getLabel' | 'url' | 'queryKey'>> = (p) => (
  <SimplePicker {...p} url="/routes" label={p.label ?? 'Route'} />
);
