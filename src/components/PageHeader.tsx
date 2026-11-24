import React from 'react';
import { Box, Breadcrumbs, IconButton, Link, Tooltip, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { WordsHelp } from './Help';

export const PageHeader: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  crumbs?: { label: string; to?: string }[];
  // Glossary ids of the trade words this screen uses (see glossary.ts).
  help?: string[];
}> = ({ title, subtitle, actions, crumbs, help }) => {
  const nav = useNavigate();
  // Back goes to the nearest linked crumb (e.g. Sales Bills from a bill).
  const back = [...(crumbs || [])].reverse().find((c) => c.to);
  return (
    <Box sx={{ display: 'flex', alignItems: { xs: 'stretch', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5, mb: 2.25 }}>
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        {back && (
          <Tooltip title={`Back to ${back.label}`}>
            <IconButton onClick={() => nav(back.to!)} sx={{ mt: crumbs?.length ? 2.1 : 0.25, border: 1, borderColor: 'divider', bgcolor: '#fff', display: { xs: 'none', sm: 'inline-flex' } }} aria-label={`Back to ${back.label}`}>
              <ArrowBackIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <Box sx={{ minWidth: 0 }}>
          {crumbs && (
            <Breadcrumbs separator={<NavigateNextIcon sx={{ fontSize: 14 }} />} sx={{ fontSize: 12, mb: 0.25 }}>
              {crumbs.map((c) => c.to
                ? <Link key={c.label} component={RouterLink} to={c.to} underline="hover" color="text.secondary" fontSize={12}>{c.label}</Link>
                : <Typography key={c.label} fontSize={12} color="text.secondary">{c.label}</Typography>)}
            </Breadcrumbs>
          )}
          <Typography variant="h5" component="div" noWrap sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>{title}</Typography>
          {subtitle && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{subtitle}</Typography>}
          {help && <Box sx={{ ml: -1, mt: 0.25 }}><WordsHelp ids={help} /></Box>}
        </Box>
      </Box>
      {actions && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: { xs: 'nowrap', sm: 'wrap' }, overflowX: { xs: 'auto', sm: 'visible' }, pb: { xs: 0.5, sm: 0 }, alignItems: 'center', '& > *': { flexShrink: 0 } }}>
          {actions}
        </Box>
      )}
    </Box>
  );
};
