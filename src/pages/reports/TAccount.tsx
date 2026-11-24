// Two-sided (Dr | Cr, Liabilities | Assets) account layout used by the
// P&L and Balance Sheet, the way CAs and Tally users expect to read them.
import React, { useEffect, useState } from 'react';
import { Box, Collapse, Grid, IconButton, Paper, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { amt } from '../../lib/format';

export interface TItem {
  label: string;
  amount: number;
  detail?: { name: string; amount: number }[];
  tone?: 'good' | 'bad' | 'muted';
  bold?: boolean;
  note?: string;
}

const toneColor = { good: 'success.main', bad: 'error.main', muted: 'text.secondary' } as const;

const ItemRow: React.FC<{ it: TItem; expandAll: boolean }> = ({ it, expandAll }) => {
  const [open, setOpen] = useState<boolean | null>(null);
  useEffect(() => setOpen(null), [expandAll]);
  const has = !!it.detail?.length;
  const shown = has && (open ?? expandAll);
  return (
    <Box sx={{ borderBottom: '1px dashed', borderColor: 'divider', py: 0.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: has ? 'pointer' : 'default' }} onClick={() => has && setOpen(!shown)}>
        <Box sx={{ width: 22, display: 'flex' }} className="print-hide">
          {has && <IconButton size="small" sx={{ p: 0 }}>{shown ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}</IconButton>}
        </Box>
        <Typography fontSize={13.5} fontWeight={it.bold ? 700 : 600} color={it.tone ? toneColor[it.tone] : undefined} sx={{ flex: 1 }}>
          {it.label}
          {it.note && <Typography component="span" fontSize={11} color="text.secondary" fontWeight={400}> — {it.note}</Typography>}
        </Typography>
        <Typography fontSize={13.5} fontWeight={it.bold ? 700 : 600} color={it.tone ? toneColor[it.tone] : undefined}>{amt(it.amount)}</Typography>
      </Box>
      {has && (
        <Collapse in={shown}>
          {it.detail!.map((d, i) => (
            <Box key={i} sx={{ display: 'flex', pl: 4.5, pr: 13, py: 0.1 }}>
              <Typography fontSize={12} color="text.secondary" sx={{ flex: 1 }} noWrap>{d.name}</Typography>
              <Typography fontSize={12} color="text.secondary">{amt(d.amount)}</Typography>
            </Box>
          ))}
        </Collapse>
      )}
    </Box>
  );
};

const Side: React.FC<{ title: string; items: TItem[]; total: number; expandAll: boolean }> = ({ title, items, total, expandAll }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <Box sx={{ display: 'flex', px: 1.5, py: 0.75, bgcolor: 'action.hover', borderBottom: '1px solid', borderColor: 'divider' }}>
      <Typography fontSize={12} fontWeight={700} sx={{ flex: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</Typography>
      <Typography fontSize={12} fontWeight={700}>Amount (₹)</Typography>
    </Box>
    <Box sx={{ px: 1.5, flex: 1 }}>{items.filter((i) => i.amount || i.bold).map((it) => <ItemRow key={it.label} it={it} expandAll={expandAll} />)}</Box>
    <Box sx={{ display: 'flex', px: 1.5, py: 0.75, borderTop: '2px solid', borderColor: 'text.primary' }}>
      <Typography fontWeight={800} sx={{ flex: 1 }}>Total</Typography>
      <Typography fontWeight={800}>{amt(total)}</Typography>
    </Box>
  </Box>
);

export const TAccount: React.FC<{ heading?: string; leftTitle: string; rightTitle: string; left: TItem[]; right: TItem[]; leftTotal: number; rightTotal: number; expandAll?: boolean }> = ({ heading, leftTitle, rightTitle, left, right, leftTotal, rightTotal, expandAll = false }) => (
  <Paper sx={{ mb: 2, overflow: 'hidden', breakInside: 'avoid' }}>
    {heading && <Typography fontWeight={800} sx={{ px: 1.5, pt: 1.25, pb: 0.75 }}>{heading}</Typography>}
    <Grid container sx={{ borderTop: heading ? '1px solid' : 'none', borderColor: 'divider' }}>
      <Grid item xs={12} md={6} sx={{ borderRight: { md: '1px solid' }, borderColor: { md: 'divider' } }}>
        <Side title={leftTitle} items={left} total={leftTotal} expandAll={expandAll} />
      </Grid>
      <Grid item xs={12} md={6}>
        <Side title={rightTitle} items={right} total={rightTotal} expandAll={expandAll} />
      </Grid>
    </Grid>
  </Paper>
);

// Flatten both sides for Excel: one row per item / detail line, sides side by side.
export const tAccountRows = (left: TItem[], right: TItem[], withDetail: boolean) => {
  const flat = (items: TItem[]) => items.filter((i) => i.amount || i.bold).flatMap((i) => [
    [i.label, i.amount] as (string | number)[],
    ...(withDetail ? (i.detail || []).map((d) => [`    ${d.name}`, d.amount]) : []),
  ]);
  const l = flat(left), r = flat(right);
  return Array.from({ length: Math.max(l.length, r.length) }, (_, i) => [...(l[i] || ['', '']), ...(r[i] || ['', ''])]);
};
