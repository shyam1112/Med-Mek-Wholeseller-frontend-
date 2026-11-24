import { useMemo, useState } from 'react';
import { Button, Grid, IconButton, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { ReportShell } from '../../components/ReportShell';
import { DataTable, Col } from '../../components/DataTable';
import { SearchBox } from '../../components/Filters';
import { StatusChip } from '../../components/StatusChip';
import { StatCard } from '../../components/StatCard';
import { useFetch } from '../../lib/hooks';
import { fdate } from '../../lib/format';
import { exportExcel } from '../../lib/excel';
import { openWhatsApp } from '../../lib/whatsapp';
import { useAuth } from '../../auth/AuthContext';
import { ErrorBox, PrintSupport } from './reportKit';

interface Row { _id: string; name: string; city: string; mobile: string; dl20b: string; dl21b: string; dlExpiry?: string; status: 'missing' | 'expired' | 'expiring' }
type Status = '' | Row['status'];

export default function DlExpiry() {
  const nav = useNavigate();
  const { business, can } = useAuth();
  const [days, setDays] = useState(30);
  const [status, setStatus] = useState<Status>('');
  const [search, setSearch] = useState('');
  const { data, loading, error, reload } = useFetch<{ data: Row[] }>('/reports/dl-expiry', { days });
  const all = data?.data || [];
  const count = (s: Row['status']) => all.filter((r) => r.status === s).length;
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((r) => (!status || r.status === status) && (!q || `${r.name} ${r.city} ${r.dl20b} ${r.dl21b}`.toLowerCase().includes(q)));
  }, [all, status, search]);

  const message = (r: Row) => {
    const biz = business?.name || 'us';
    if (r.status === 'missing') return `Dear ${r.name}, we don't have your Drug Licence (20B/21B) on record. As per the Drugs & Cosmetics Rules we can bill medicines only against a valid licence. Kindly WhatsApp a copy of your Drug Licence to continue supplies. — ${biz}`;
    if (r.status === 'expired') return `Dear ${r.name}, your Drug Licence (${[r.dl20b, r.dl21b].filter(Boolean).join(', ')}) expired on ${fdate(r.dlExpiry)}. We are unable to bill medicines until we receive the renewed licence. Kindly send a copy of the renewed DL at the earliest. — ${biz}`;
    return `Dear ${r.name}, your Drug Licence (${[r.dl20b, r.dl21b].filter(Boolean).join(', ')}) expires on ${fdate(r.dlExpiry)}. Please send us a copy of the renewed licence before then so supplies continue without interruption. — ${biz}`;
  };

  const columns: Col<Row>[] = [
    { key: 'name', label: 'Party', render: (r) => <><Typography fontSize={13} fontWeight={600}>{r.name}</Typography><Typography fontSize={11} color="text.secondary">{r.city}</Typography></> },
    { key: 'dl20b', label: 'DL 20B', render: (r) => r.dl20b || '—' },
    { key: 'dl21b', label: 'DL 21B', render: (r) => r.dl21b || '—' },
    { key: 'dlExpiry', label: 'Valid upto', nowrap: true, render: (r) => (r.dlExpiry ? fdate(r.dlExpiry) : '—') },
    { key: 'days', label: 'Days', align: 'right', render: (r) => { if (!r.dlExpiry) return ''; const d = dayjs(r.dlExpiry).startOf('day').diff(dayjs().startOf('day'), 'day'); return <Typography component="span" fontSize={13} color={d < 0 ? 'error.main' : 'warning.main'}>{d < 0 ? `${-d} ago` : `in ${d}`}</Typography>; } },
    { key: 'status', label: 'Status', render: (r) => <StatusChip status={r.status} /> },
    { key: 'mobile', label: 'Mobile', nowrap: true },
    { key: 'act', label: '', align: 'right', nowrap: true, render: (r) => (
      <span className="no-print">
        <Tooltip title={r.mobile ? 'WhatsApp reminder' : 'No mobile number'}>
          <span><IconButton size="small" color="success" disabled={!r.mobile} onClick={(e) => { e.stopPropagation(); openWhatsApp(r.mobile, message(r)); }}><WhatsAppIcon fontSize="small" /></IconButton></span>
        </Tooltip>
        {can('parties:edit') && <Tooltip title="Update DL"><IconButton size="small" onClick={(e) => { e.stopPropagation(); nav(`/parties/${r._id}/edit`); }}><EditOutlinedIcon fontSize="small" /></IconButton></Tooltip>}
      </span>
    ) },
  ];

  const doExport = () => exportExcel(`dl-expiry-${dayjs().format('YYYY-MM-DD')}`, [{
    name: 'DL Expiry',
    rows,
    columns: [
      { key: 'name', label: 'Party' }, { key: 'city', label: 'City' }, { key: 'mobile', label: 'Mobile' }, { key: 'dl20b', label: 'DL 20B' }, { key: 'dl21b', label: 'DL 21B' },
      { key: 'dlExpiry', label: 'Valid upto', value: (r: Row) => fdate(r.dlExpiry) }, { key: 'status', label: 'Status' },
    ],
  }]);

  return (
    <ReportShell
      title="Drug Licence Expiry"
      subtitle={`Customers whose DL is missing, expired or expiring within ${days} days`}
      onExport={rows.length ? doExport : undefined}
      filters={
        <>
          <ToggleButtonGroup size="small" exclusive value={days} onChange={(_, v) => v && setDays(v)}>
            {[15, 30, 60, 90].map((d) => <ToggleButton key={d} value={d} sx={{ px: 1.5 }}>{d} days</ToggleButton>)}
          </ToggleButtonGroup>
          <SearchBox value={search} onChange={setSearch} placeholder="Party / city / DL no" />
          {status && <Button size="small" onClick={() => setStatus('')}>Show all</Button>}
        </>
      }
    >
      <PrintSupport title="Drug Licence Expiry" subtitle={`As on ${dayjs().format('DD-MM-YYYY')} · within ${days} days`} />
      <ErrorBox error={error} onRetry={reload} />
      <Grid container spacing={1.5} sx={{ mb: 1.5 }} className="print-hide">
        <Grid item xs={4} md={3}><StatCard label="Expired" value={count('expired')} tone={count('expired') ? 'bad' : 'default'} onClick={() => setStatus(status === 'expired' ? '' : 'expired')} hint={business?.settings?.dlExpiryAction === 'block' ? 'billing blocked' : 'billing allowed (warn)'} /></Grid>
        <Grid item xs={4} md={3}><StatCard label={`Expiring in ${days} days`} value={count('expiring')} tone={count('expiring') ? 'warn' : 'default'} onClick={() => setStatus(status === 'expiring' ? '' : 'expiring')} /></Grid>
        <Grid item xs={4} md={3}><StatCard label="DL not on record" value={count('missing')} tone={count('missing') ? 'warn' : 'default'} onClick={() => setStatus(status === 'missing' ? '' : 'missing')} /></Grid>
      </Grid>
      <DataTable columns={columns} rows={rows} loading={loading} onRowClick={(r) => nav(`/parties/${r._id}`)}
        empty="All customer licences are valid." maxHeight="calc(100vh - 300px)" />
    </ReportShell>
  );
}
