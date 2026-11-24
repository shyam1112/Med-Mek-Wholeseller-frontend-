import React from 'react';
import { Box, Paper, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

export const StatCard: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ReactNode; tone?: 'default' | 'good' | 'warn' | 'bad'; onClick?: () => void }> = ({ label, value, hint, icon, tone = 'default', onClick }) => {
  const theme = useTheme();
  const color = { default: theme.palette.primary.main, good: theme.palette.success.main, warn: theme.palette.warning.main, bad: theme.palette.error.main }[tone];
  return (
    <Paper
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter') onClick(); } : undefined}
      sx={{
        p: 1.75, height: '100%', display: 'flex', gap: 1.5, alignItems: 'center', position: 'relative', overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default', transition: 'border-color .15s, box-shadow .15s, transform .15s',
        '&::before': { content: '""', position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, bgcolor: tone === 'default' ? 'transparent' : color },
        '&:hover': onClick ? { borderColor: alpha(color, 0.5), boxShadow: '0 4px 14px rgba(16,24,40,0.08)', transform: 'translateY(-1px)' } : {},
      }}
    >
      {icon && <Box sx={{ color, display: 'flex', p: 1.1, borderRadius: 2.5, bgcolor: alpha(color, 0.1), flexShrink: 0 }}>{icon}</Box>}
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography fontSize={12} fontWeight={500} color="text.secondary" noWrap display="block">{label}</Typography>
        <Typography fontWeight={700} fontSize={20} lineHeight={1.3} noWrap letterSpacing={-0.3} color={tone === 'bad' ? 'error.dark' : 'text.primary'}>{value}</Typography>
        {hint && <Typography variant="caption" color="text.secondary" noWrap display="block">{hint}</Typography>}
      </Box>
      {onClick && <ChevronRightIcon fontSize="small" sx={{ color: 'text.disabled' }} />}
    </Paper>
  );
};
