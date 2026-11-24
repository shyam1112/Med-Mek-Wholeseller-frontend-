import { useState } from 'react';
import { Box, Button, IconButton, Link, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { Link as RouterLink } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import dayjs from 'dayjs';
import { PageHeader } from '../../components/PageHeader';
import { DataTable, Col } from '../../components/DataTable';
import { FilterBar, SearchBox } from '../../components/Filters';
import { PartyPicker, PartyOption, ProductPicker, ProductOption } from '../../components/Pickers';
import { useConfirm } from '../../components/Dialogs';
import { useFetch, useHotkey } from '../../lib/hooks';
import { amt, fdate } from '../../lib/format';
import { exportExcel } from '../../lib/excel';
import { api, errMsg } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { scheme } from './masterUi';
import { SpecialRate, SpecialRateDialog } from './SpecialRateDialog';

const lapsed = (r: SpecialRate) => !!r.validTill && dayjs(r.validTill).isBefore(dayjs(), 'day');

export default function SpecialRates() {
  const { can } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const [party, setParty] = useState<PartyOption | null>(null);
  const [product, setProduct] = useState<ProductOption | null>(null);
  const [search, setSearch] = useState('');
  const [validity, setValidity] = useState('');
  const [edit, setEdit] = useState<Partial<SpecialRate> | null>(null);
  const { data, loading, reload } = useFetch<{ data: SpecialRate[] }>('/special-rates', { party: party?._id, product: product?._id });

  const s = search.trim().toLowerCase();
  const rows = (data?.data || []).filter((r) => {
    if (s && !`${r.party?.name} ${r.product?.name} ${r.product?.manufacturerName} ${r.note}`.toLowerCase().includes(s)) return false;
    if (validity === 'active' && lapsed(r)) return false;
    if (validity === 'lapsed' && !lapsed(r)) return false;
    return true;
  });

  useHotkey('alt+n', () => can('parties:edit') && setEdit({}));

  const remove = async (r: SpecialRate) => {
    const { ok } = await confirm({ title: 'Remove special rate?', message: `${r.product?.name} for ${r.party?.name} will go back to the party's normal rate.`, danger: true, confirmText: 'Remove' });
    if (!ok) return;
    try {
      await api.delete(`/special-rates/${r._id}`);
      enqueueSnackbar('Special rate removed.', { variant: 'success' });
      reload();
    } catch (e) {
      enqueueSnackbar(errMsg(e), { variant: 'error' });
    }
  };

  const columns: Col<SpecialRate>[] = [
    { key: 'party', label: 'Customer', render: (r) => (r.party ? <Link component={RouterLink} to={`/parties/${r.party._id}`} underline="hover" onClick={(e) => e.stopPropagation()} fontWeight={600} fontSize={13}>{r.party.name}</Link> : <i>deleted</i>) },
    { key: 'product', label: 'Product', render: (r) => <>{r.product?.name || <i>deleted</i>}<Typography fontSize={11} color="text.secondary">{[r.product?.manufacturerName, r.product?.packing].filter(Boolean).join(' · ')}</Typography></> },
    { key: 'mrp', label: 'MRP', align: 'right', render: (r) => amt(r.product?.mrp) },
    { key: 'ptr', label: 'Master PTR', align: 'right', render: (r) => amt(r.product?.ptr) },
    {
      key: 'rate', label: 'Special rate', align: 'right',
      render: (r) => {
        if (!r.rate) return '—';
        const ptr = r.product?.ptr || 0;
        const diff = ptr ? ((r.rate - ptr) / ptr) * 100 : 0;
        return <Tooltip title={ptr ? `${diff.toFixed(1)}% vs PTR` : ''}><Typography fontSize={13} fontWeight={700} color={diff < 0 ? 'success.dark' : diff > 0 ? 'warning.dark' : undefined}>{amt(r.rate)}</Typography></Tooltip>;
      },
    },
    { key: 'discountPct', label: 'Disc %', align: 'right', render: (r) => (r.discountPct ? `${r.discountPct}%` : '—') },
    { key: 'scheme', label: 'Scheme', align: 'center', render: (r) => scheme(r.schemeBuy, r.schemeFree) || '—' },
    { key: 'validTill', label: 'Valid till', nowrap: true, render: (r) => (r.validTill ? <Typography fontSize={13} color={lapsed(r) ? 'error.main' : undefined}>{fdate(r.validTill)}{lapsed(r) ? ' (lapsed)' : ''}</Typography> : 'Open') },
    { key: 'note', label: 'Note' },
    { key: 'updatedAt', label: 'Updated', nowrap: true, render: (r) => fdate(r.updatedAt) },
    {
      key: 'act', label: '', align: 'right', nowrap: true,
      render: (r) => can('parties:edit') ? (
        <Box onClick={(e) => e.stopPropagation()}>
          <IconButton onClick={() => setEdit(r)}><EditOutlinedIcon fontSize="small" /></IconButton>
          <IconButton color="error" onClick={() => remove(r)}><DeleteOutlineIcon fontSize="small" /></IconButton>
        </Box>
      ) : null,
    },
  ];

  const exportAll = () => exportExcel('special-rates', [{
    name: 'Special Rates', rows,
    columns: [
      { key: 'party', label: 'Customer', value: (r) => r.party?.name }, { key: 'product', label: 'Product', value: (r) => r.product?.name },
      { key: 'company', label: 'Company', value: (r) => r.product?.manufacturerName }, { key: 'packing', label: 'Packing', value: (r) => r.product?.packing },
      { key: 'mrp', label: 'MRP', value: (r) => r.product?.mrp }, { key: 'ptr', label: 'Master PTR', value: (r) => r.product?.ptr },
      { key: 'rate', label: 'Special Rate' }, { key: 'discountPct', label: 'Disc %' }, { key: 'scheme', label: 'Scheme', value: (r) => scheme(r.schemeBuy, r.schemeFree) },
      { key: 'validTill', label: 'Valid Till', value: (r) => fdate(r.validTill) }, { key: 'note', label: 'Note' },
    ],
  }]);

  return (
    <>
      <PageHeader
        help={['specialrate', 'ptr', 'disc']}
        title="Special Rates"
        crumbs={[{ label: 'Masters' }]}
        subtitle={data ? `${rows.length} negotiated party × product rates — they override the party's rate type at billing` : 'Party-wise negotiated rates'}
        actions={
          <>
            <Button variant="outlined" startIcon={<FileDownloadOutlinedIcon />} onClick={exportAll} disabled={!rows.length}>Excel</Button>
            {can('parties:edit') && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEdit({})}>New Special Rate (Alt+N)</Button>}
          </>
        }
      />
      <FilterBar>
        <SearchBox value={search} onChange={setSearch} placeholder="Filter shown rows" width={220} />
        <PartyPicker type="customer" value={party} onChange={setParty} sx={{ width: 240 }} />
        <ProductPicker value={product} onChange={setProduct} sx={{ width: 260 }} />
        <TextField select label="Validity" value={validity} onChange={(e) => setValidity(e.target.value)} sx={{ width: 120 }}>
          <MenuItem value="">All</MenuItem>
          <MenuItem value="active">Current</MenuItem>
          <MenuItem value="lapsed">Lapsed</MenuItem>
        </TextField>
      </FilterBar>
      <DataTable columns={columns} rows={rows} loading={loading} onRowClick={can('parties:edit') ? (r) => setEdit(r) : undefined}
        rowSx={(r) => (lapsed(r) ? { opacity: 0.6 } : undefined)}
        empty={party || product || s ? 'No special rate matches.' : 'No special rates yet. Add hospital contract rates or chain-pharmacy deals here.'} />
      {(data?.data?.length || 0) >= 1000 && <Typography variant="caption" color="text.secondary">Showing the latest 1000 — filter by party or product to narrow.</Typography>}
      {edit && <SpecialRateDialog value={edit} fixedParty={!edit._id && party ? { _id: party._id, name: party.name } : undefined} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </>
  );
}
