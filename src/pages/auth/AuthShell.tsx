import React from 'react';
import { Box, Paper, Typography } from '@mui/material';
import KeyboardOutlinedIcon from '@mui/icons-material/KeyboardOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';

const FEATURES: [React.ReactNode, string, string][] = [
  [<KeyboardOutlinedIcon key="k" />, 'Fast keyboard billing', 'FEFO batches, schemes and party rates filled in for you'],
  [<VerifiedUserOutlinedIcon key="v" />, 'Checks at every bill', 'Credit limit, overdue and drug-licence rules'],
  [<EventBusyOutlinedIcon key="e" />, 'Expiry under control', 'Expiry returns, company claims, stock & sales statements'],
  [<ReceiptLongOutlinedIcon key="r" />, 'GST ready', 'GSTR-1, GSTR-3B, e-invoice and e-way bill files'],
  [<AccountBalanceOutlinedIcon key="a" />, 'Complete accounts', 'Receipts, PDCs, outstanding ageing, double-entry books'],
];

export const AuthShell: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <Box sx={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.1fr 1fr' }, bgcolor: 'background.default' }}>
    <Box sx={{
      display: { xs: 'none', md: 'flex' }, flexDirection: 'column', justifyContent: 'center', px: { md: 6, lg: 10 }, color: '#d9e5ef', position: 'relative', overflow: 'hidden',
      background: 'radial-gradient(circle at 15% 15%, rgba(92,200,168,0.18), transparent 45%), radial-gradient(circle at 90% 90%, rgba(58,134,184,0.25), transparent 50%), #0b2a40',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box sx={{ width: 48, height: 48, borderRadius: 2.5, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 22, color: '#0b2a40', background: 'linear-gradient(135deg, #7fe0c2, #5cc8a8)' }}>M</Box>
        <Typography fontWeight={800} fontSize={32} color="#fff" lineHeight={1.1} letterSpacing={-0.5}>MedMek <Box component="span" sx={{ color: '#5cc8a8' }}>Wholesale</Box></Typography>
      </Box>
      <Typography fontSize={17} mt={2} maxWidth={480} color="#c3d4e2">Billing, stock, accounts and GST for pharma distributors — batch-wise, FEFO and credit-controlled.</Typography>
      <Box sx={{ mt: 4, display: 'grid', gap: 2, maxWidth: 480 }}>
        {FEATURES.map(([icon, t, d]) => (
          <Box key={t} sx={{ display: 'flex', gap: 1.75, alignItems: 'flex-start' }}>
            <Box sx={{ width: 38, height: 38, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.07)', color: '#7fe0c2', display: 'grid', placeItems: 'center', flexShrink: 0 }}>{icon}</Box>
            <Box>
              <Typography fontWeight={650} fontSize={14.5} color="#fff">{t}</Typography>
              <Typography fontSize={13} color="#9fb5c8">{d}</Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
    <Box sx={{ display: 'grid', placeItems: 'center', p: 2 }}>
      <Box sx={{ width: '100%', maxWidth: 420 }}>
        <Box sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center', gap: 1.25, mb: 3, justifyContent: 'center' }}>
          <Box sx={{ width: 40, height: 40, borderRadius: 2, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 19, color: '#0b2a40', background: 'linear-gradient(135deg, #7fe0c2, #5cc8a8)' }}>M</Box>
          <Typography fontWeight={800} fontSize={22} letterSpacing={-0.3}>MedMek <Box component="span" sx={{ color: 'secondary.main' }}>Wholesale</Box></Typography>
        </Box>
        <Paper sx={{ p: { xs: 3, sm: 4 }, boxShadow: '0 12px 40px rgba(16,24,40,0.08)' }}>
          <Typography variant="h5" mb={subtitle ? 0.5 : 2.5}>{title}</Typography>
          {subtitle && <Typography fontSize={13} color="text.secondary" mb={2.5}>{subtitle}</Typography>}
          {children}
        </Paper>
      </Box>
    </Box>
  </Box>
);
