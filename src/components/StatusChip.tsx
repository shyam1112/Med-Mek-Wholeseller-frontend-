import React from 'react';
import { Box, Chip } from '@mui/material';

const COLORS: Record<string, 'default' | 'success' | 'warning' | 'error' | 'info' | 'primary' | 'secondary'> = {
  paid: 'success', partial: 'warning', unpaid: 'error', active: 'success', cancelled: 'default',
  open: 'info', completed: 'success', pending: 'warning', cleared: 'success', bounced: 'error', na: 'default',
  dispatched: 'info', delivered: 'success', returned: 'error', closed: 'default',
  expired: 'error', expiring: 'warning', missing: 'warning', saleable: 'success', damaged: 'error', expiry: 'warning', breakage: 'error',
};

const LABELS: Record<string, string> = { na: '—', unpaid: 'Unpaid' };

// Soft tinted pill with a status dot — readable in long lists without
// turning the screen into a wall of red and orange.
export const StatusChip: React.FC<{ status?: string; label?: string }> = ({ status = '', label }) => {
  const color = COLORS[status] || 'default';
  const cancelled = status === 'cancelled';
  return (
    <Chip
      label={label ?? LABELS[status] ?? status.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}
      color={color}
      variant={cancelled ? 'outlined' : 'filled'}
      icon={color !== 'default' ? <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'currentColor', ml: '8px !important', mr: '-2px !important' }} /> : undefined}
      sx={{ fontWeight: 600, height: 22, fontSize: 11.5, color: cancelled ? 'text.secondary' : undefined }}
    />
  );
};
