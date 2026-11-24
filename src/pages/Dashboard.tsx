import React from 'react';
import { Alert, Box, Button, Grid, Paper, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import PaymentsOutlined from '@mui/icons-material/PaymentsOutlined';
import AccountBalanceOutlined from '@mui/icons-material/AccountBalanceOutlined';
import ErrorOutlineOutlined from '@mui/icons-material/ErrorOutlineOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import EventBusyOutlined from '@mui/icons-material/EventBusyOutlined';
import AssignmentOutlined from '@mui/icons-material/AssignmentOutlined';
import TrendingDownOutlined from '@mui/icons-material/TrendingDownOutlined';
import AddShoppingCartOutlined from '@mui/icons-material/AddShoppingCartOutlined';
import CurrencyRupeeOutlined from '@mui/icons-material/CurrencyRupeeOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import PlaylistAddOutlined from '@mui/icons-material/PlaylistAddOutlined';
import AssignmentReturnOutlined from '@mui/icons-material/AssignmentReturnOutlined';
import PersonSearchOutlined from '@mui/icons-material/PersonSearchOutlined';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { useFetch } from '../lib/hooks';
import { useAuth } from '../auth/AuthContext';
import { amt, fdate, inr, inrShort } from '../lib/format';

interface Dash {
  todaySales: { total: number; count: number }; monthSales: { total: number; count: number };
  todayCollection: number; monthCollection: number; receivable: { total: number; count: number }; payable: number;
  overdue: { total: number; parties: number }; pendingOrders: number; stockValue: number; stockMrpValue: number;
  nearExpiry: { value: number; count: number }; expired: { value: number; count: number }; damaged: { value: number; count: number };
  lowStockCount: number; trend: { _id: string; sales: number; bills: number }[];
  topParties: { _id: string; name: string; total: number }[]; topProducts: { _id: string; name: string; qty: number; total: number }[];
  pdcDue: { _id: string; number: string; kind: string; partyName: string; chequeNo: string; chequeDate: string; amount: number }[];
}

// The everyday jobs, in plain words, one click each.
const TASKS: { label: string; hint: string; path: string; perm: string; icon: React.ReactNode; color: string; key?: string }[] = [
  { label: 'Make a bill', hint: 'Sell to a customer', path: '/sales/new', perm: 'sales:create', icon: <ReceiptLongOutlined />, color: '#0f5c8c', key: 'Alt+N' },
  { label: 'Take an order', hint: 'Customer called with an order', path: '/sales-orders/new', perm: 'sales_orders:create', icon: <PlaylistAddOutlined />, color: '#6a4bc4' },
  { label: 'Money received', hint: 'Customer paid you', path: '/receipts/new', perm: 'receipts:create', icon: <CurrencyRupeeOutlined />, color: '#1e8e3e', key: 'Alt+R' },
  { label: 'Enter purchase', hint: 'Goods came from supplier', path: '/purchases/new', perm: 'purchases:create', icon: <AddShoppingCartOutlined />, color: '#c77700', key: 'Alt+P' },
  { label: 'Check stock', hint: 'Find a product, batches, expiry', path: '/products', perm: 'products:view', icon: <SearchOutlined />, color: '#0277bd' },
  { label: 'Who owes me?', hint: 'Pending payments', path: '/outstanding', perm: 'reports:view', icon: <PersonSearchOutlined />, color: '#d32f2f' },
  { label: 'Goods returned', hint: 'Customer sent goods back', path: '/sales-returns/new', perm: 'sales_returns:create', icon: <AssignmentReturnOutlined />, color: '#5b6b7c' },
];

export default function Dashboard() {
  const nav = useNavigate();
  const { user, business, can } = useAuth();
  const { data } = useFetch<{ data: Dash }>('/dashboard');
  const d = data?.data;

  // Fill missing days so the chart shows a continuous 30-day line.
  const trend = Array.from({ length: 30 }, (_, i) => {
    const day = dayjs().subtract(29 - i, 'day').format('YYYY-MM-DD');
    const hit = d?.trend.find((t) => t._id === day);
    return { day: dayjs(day).format('DD MMM'), sales: hit?.sales || 0 };
  });

  const setupMissing = business && (!business.gstin || !business.dl20b || !business.address);

  return (
    <>
      <PageHeader
        title={`Good ${dayjs().hour() < 12 ? 'morning' : dayjs().hour() < 17 ? 'afternoon' : 'evening'}, ${user?.name?.split(' ')[0] || ''}`}
        subtitle={`${business?.name} · ${dayjs().format('dddd, D MMMM YYYY')}`}
      />
      <Typography fontSize={13} fontWeight={700} color="text.secondary" mb={1}>What do you want to do?</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)', lg: 'repeat(7, 1fr)' }, gap: 1.25, mb: 2.5 }}>
        {TASKS.filter((t) => can(t.perm)).map((t) => (
          <Paper key={t.path} component="button" onClick={() => nav(t.path)}
            sx={{
              p: 1.5, textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit', display: 'flex', flexDirection: 'column', gap: 1,
              transition: 'all .15s', '&:hover': { borderColor: t.color, boxShadow: `0 6px 18px ${t.color}22`, transform: 'translateY(-1px)' },
              '&:focus-visible': { outline: `2px solid ${t.color}`, outlineOffset: 2 },
            }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box sx={{ width: 38, height: 38, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: `${t.color}14`, color: t.color }}>{t.icon}</Box>
              {t.key && <Typography fontSize={10.5} color="text.disabled" sx={{ ml: 'auto', display: { xs: 'none', md: 'block' } }}>{t.key}</Typography>}
            </Box>
            <Box>
              <Typography fontSize={14} fontWeight={700} lineHeight={1.25}>{t.label}</Typography>
              <Typography fontSize={12} color="text.secondary" lineHeight={1.3}>{t.hint}</Typography>
            </Box>
          </Paper>
        ))}
      </Box>
      <Typography fontSize={13} fontWeight={700} color="text.secondary" mb={1}>Your business today</Typography>
      {setupMissing && can('settings:edit') && (
        <Alert severity="info" sx={{ mb: 2 }} action={<Button onClick={() => nav('/settings')}>Complete setup</Button>}>
          Add your GSTIN, drug licence numbers and address — they print on every bill and are needed for GST returns.
        </Alert>
      )}

      <Grid container spacing={1.5}>
        <Grid item xs={6} md={3}><StatCard label="Today's sales" value={inrShort(d?.todaySales.total || 0)} hint={`${d?.todaySales.count || 0} bills`} icon={<ReceiptLongOutlined />} onClick={() => nav('/sales')} /></Grid>
        <Grid item xs={6} md={3}><StatCard label="This month" value={inrShort(d?.monthSales.total || 0)} hint={`${d?.monthSales.count || 0} bills`} icon={<ReceiptLongOutlined />} onClick={() => nav('/reports/sales')} /></Grid>
        <Grid item xs={6} md={3}><StatCard label="Collected today" value={inrShort(d?.todayCollection || 0)} hint={`Month ${inrShort(d?.monthCollection || 0)}`} icon={<PaymentsOutlined />} tone="good" onClick={() => nav('/receipts')} /></Grid>
        <Grid item xs={6} md={3}><StatCard label="Customers owe you" value={inrShort(d?.receivable.total || 0)} hint={`${d?.receivable.count || 0} open bills`} icon={<AccountBalanceOutlined />} onClick={() => nav('/outstanding')} /></Grid>
        <Grid item xs={6} md={3}><StatCard label="Overdue (past due date)" value={inrShort(d?.overdue.total || 0)} hint={`${d?.overdue.parties || 0} parties`} icon={<ErrorOutlineOutlined />} tone={d?.overdue.total ? 'bad' : 'default'} onClick={() => nav('/outstanding')} /></Grid>
        <Grid item xs={6} md={3}><StatCard label="You owe suppliers" value={inrShort(d?.payable || 0)} icon={<AccountBalanceOutlined />} onClick={() => nav('/outstanding?type=payable')} /></Grid>
        <Grid item xs={6} md={3}><StatCard label="Stock value (at cost)" value={inrShort(d?.stockValue || 0)} hint={`MRP ${inrShort(d?.stockMrpValue || 0)}`} icon={<Inventory2Outlined />} onClick={() => nav('/reports/stock')} /></Grid>
        <Grid item xs={6} md={3}><StatCard label="Pending orders" value={d?.pendingOrders ?? 0} icon={<AssignmentOutlined />} tone={d?.pendingOrders ? 'warn' : 'default'} onClick={() => nav('/sales-orders')} /></Grid>
      </Grid>

      <Grid container spacing={1.5} sx={{ mt: 0 }}>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 1.5, height: 300 }}>
            <Typography fontWeight={600} mb={1}>Sales — last 30 days</Typography>
            <ResponsiveContainer width="100%" height="88%">
              <AreaChart data={trend} margin={{ left: 0, right: 8 }}>
                <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0f5c8c" stopOpacity={0.25} /><stop offset="100%" stopColor="#0f5c8c" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} interval={4} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => inrShort(v)} width={64} />
                <Tooltip formatter={(v: number) => inr(v)} />
                <Area type="monotone" dataKey="sales" stroke="#0f5c8c" strokeWidth={2} fill="url(#g)" />
              </AreaChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 1.5, height: 300, overflow: 'auto' }}>
            <Typography fontWeight={600} mb={1}>Needs attention</Typography>
            <Attention icon={<EventBusyOutlined color="error" />} label="Expired stock on shelf" value={`${d?.expired.count || 0} batches · ${inr(d?.expired.value)}`} onClick={() => nav('/batches')} show={!!d?.expired.count} />
            <Attention icon={<EventBusyOutlined color="warning" />} label={`Expiring in ${business?.settings?.nearExpiryDays || 90} days`} value={`${d?.nearExpiry.count || 0} batches · ${inr(d?.nearExpiry.value)}`} onClick={() => nav('/batches')} show={!!d?.nearExpiry.count} />
            <Attention icon={<TrendingDownOutlined color="warning" />} label="Below reorder level" value={`${d?.lowStockCount || 0} products`} onClick={() => nav('/reports/reorder')} show={!!d?.lowStockCount} />
            <Attention icon={<Inventory2Outlined color="error" />} label="Expiry/breakage to claim" value={`${d?.damaged.count || 0} batches · ${inr(d?.damaged.value)}`} onClick={() => nav('/purchase-returns/new')} show={!!d?.damaged.count} />
            {d?.pdcDue.map((p) => (
              <Attention key={p._id} icon={<PaymentsOutlined color="info" />} label={`PDC ${p.chequeNo} · ${p.partyName}`} value={`${fdate(p.chequeDate)} · ${inr(p.amount)}`} onClick={() => nav('/pdc')} show />
            ))}
            {d && !d.expired.count && !d.nearExpiry.count && !d.lowStockCount && !d.damaged.count && !d.pdcDue.length && <Typography fontSize={13} color="text.secondary">All clear.</Typography>}
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 1.5 }}>
            <Typography fontWeight={600} mb={0.5}>Top customers this month</Typography>
            <Table><TableBody>
              {d?.topParties.map((p) => <TableRow key={p._id} hover sx={{ cursor: 'pointer' }} onClick={() => nav(`/parties/${p._id}`)}><TableCell>{p.name}</TableCell><TableCell align="right">{amt(p.total)}</TableCell></TableRow>)}
              {!d?.topParties.length && <TableRow><TableCell><Typography fontSize={13} color="text.secondary">No sales yet this month.</Typography></TableCell></TableRow>}
            </TableBody></Table>
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 1.5 }}>
            <Typography fontWeight={600} mb={0.5}>Top products this month</Typography>
            <Table><TableBody>
              {d?.topProducts.map((p) => <TableRow key={p._id} hover sx={{ cursor: 'pointer' }} onClick={() => nav(`/products/${p._id}`)}><TableCell>{p.name}</TableCell><TableCell align="right">{p.qty}</TableCell><TableCell align="right">{amt(p.total)}</TableCell></TableRow>)}
              {!d?.topProducts.length && <TableRow><TableCell><Typography fontSize={13} color="text.secondary">No sales yet this month.</Typography></TableCell></TableRow>}
            </TableBody></Table>
          </Paper>
        </Grid>
      </Grid>
    </>
  );
}

const Attention = ({ icon, label, value, onClick, show }: { icon: React.ReactNode; label: string; value: string; onClick: () => void; show: boolean }) =>
  show ? (
    <Box onClick={onClick} sx={{ display: 'flex', gap: 1.25, alignItems: 'center', py: 0.9, borderBottom: 1, borderColor: 'divider', cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}>
      {icon}
      <Box sx={{ minWidth: 0 }}><Typography fontSize={13} fontWeight={600} noWrap>{label}</Typography><Typography fontSize={12} color="text.secondary">{value}</Typography></Box>
    </Box>
  ) : null;
