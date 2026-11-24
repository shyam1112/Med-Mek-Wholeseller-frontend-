import React from 'react';
import {
  Box, LinearProgress, Paper, Table, TableBody, TableCell, TableContainer, TableFooter, TableHead, TablePagination, TableRow, Typography, useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';

export interface Col<T> {
  key: string;
  label: React.ReactNode;
  render?: (row: T, index: number) => React.ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: number | string;
  // Footer cell (totals row). Omit for blank.
  footer?: React.ReactNode;
  nowrap?: boolean;
}

interface Props<T> {
  columns: Col<T>[];
  rows: T[];
  loading?: boolean;
  rowKey?: (row: T, i: number) => string;
  onRowClick?: (row: T) => void;
  // Server-side pagination (0-based page for MUI).
  total?: number;
  page?: number;
  limit?: number;
  onPage?: (page: number) => void;
  onLimit?: (limit: number) => void;
  empty?: string;
  maxHeight?: number | string;
  dense?: boolean;
  rowSx?: (row: T) => object | undefined;
}

const NAME_KEYS = new Set(['partyName', 'name', 'productName', 'party', 'customer', 'supplier']);

const cellValue = <T,>(c: Col<T>, r: T, i: number) => (c.render ? c.render(r, i) : String((r as Record<string, unknown>)[c.key] ?? ''));
const isBlank = (v: React.ReactNode) => v === null || v === undefined || v === false || v === '';

const Empty: React.FC<{ text: string }> = ({ text }) => (
  <Box sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
    <InboxOutlinedIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
    <Typography color="text.secondary" fontSize={13.5} mt={0.5}>{text}</Typography>
  </Box>
);

export function DataTable<T>({ columns, rows, loading, rowKey, onRowClick, total, page, limit, onPage, onLimit, empty = 'Nothing to show.', maxHeight, rowSx }: Props<T>) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const hasFooter = columns.some((c) => c.footer !== undefined);
  const keyOf = (r: T, i: number) => (rowKey ? rowKey(r, i) : ((r as { _id?: string })._id ?? String(i)));

  const pager = total !== undefined && onPage && (
    <TablePagination
      component="div"
      count={total}
      page={page ?? 0}
      rowsPerPage={limit ?? 25}
      onPageChange={(_, p) => onPage(p)}
      onRowsPerPageChange={(e) => onLimit?.(Number(e.target.value))}
      rowsPerPageOptions={phone ? [] : [25, 50, 100, 250]}
      labelRowsPerPage="Rows"
    />
  );

  // Phones: each row becomes a card — first column as the title, the rest
  // as label/value pairs, action buttons (blank-label columns) at the bottom.
  if (phone) {
    const [head, ...rest] = columns;
    const fields = rest.filter((c) => c.label !== '' && c.label !== null);
    const actions = rest.filter((c) => c.label === '' || c.label === null);
    return (
      <Box>
        {loading && <LinearProgress sx={{ height: 2, mb: 1 }} />}
        {rows.map((r, i) => {
          const acts = actions.map((c) => cellValue(c, r, i)).filter((v) => !isBlank(v));
          return (
            <Paper key={keyOf(r, i)} onClick={onRowClick ? () => onRowClick(r) : undefined}
              sx={{ p: 1.5, mb: 1, cursor: onRowClick ? 'pointer' : undefined, '&:active': onRowClick ? { bgcolor: 'action.hover' } : {}, ...(rowSx?.(r) || {}) }}>
              {head && <Box sx={{ fontWeight: 700, fontSize: 14, mb: 0.75 }}>{cellValue(head, r, i)}</Box>}
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 1.5, rowGap: 0.75 }}>
                {fields.map((c) => {
                  const v = cellValue(c, r, i);
                  if (isBlank(v)) return null;
                  return (
                    <Box key={c.key} sx={{ minWidth: 0 }}>
                      <Typography fontSize={10.5} color="text.secondary" textTransform="uppercase" letterSpacing={0.4} noWrap>{c.label}</Typography>
                      <Box sx={{ fontSize: 13, overflowWrap: 'anywhere' }}>{v}</Box>
                    </Box>
                  );
                })}
              </Box>
              {acts.length > 0 && <Box onClick={(e) => e.stopPropagation()} sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5, mt: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>{acts.map((a, k) => <React.Fragment key={k}>{a}</React.Fragment>)}</Box>}
            </Paper>
          );
        })}
        {!rows.length && !loading && <Paper><Empty text={empty} /></Paper>}
        {hasFooter && rows.length > 0 && (
          <Paper sx={{ p: 1.5, mb: 1, bgcolor: '#f7f9fc' }}>
            <Typography fontSize={10.5} color="text.secondary" textTransform="uppercase" letterSpacing={0.4} mb={0.5}>Totals</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.75 }}>
              {columns.filter((c) => !isBlank(c.footer as React.ReactNode) && c !== head).map((c) => (
                <Box key={c.key}><Typography fontSize={10.5} color="text.secondary" textTransform="uppercase">{c.label}</Typography><Typography fontWeight={700} fontSize={13.5}>{c.footer}</Typography></Box>
              ))}
            </Box>
          </Paper>
        )}
        {pager && <Paper>{pager}</Paper>}
      </Box>
    );
  }

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      {loading && <LinearProgress sx={{ height: 2 }} />}
      <TableContainer sx={{ maxHeight: maxHeight ?? 'calc(100vh - 260px)' }}>
        <Table stickyHeader>
          <TableHead>
            <TableRow>
              {columns.map((c) => (
                <TableCell key={c.key} align={c.align} sx={{ width: c.width }}>{c.label}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow
                key={keyOf(r, i)}
                hover
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                sx={{ cursor: onRowClick ? 'pointer' : undefined, '&:nth-of-type(even)': { bgcolor: '#fbfcfe' }, ...(rowSx?.(r) || {}) }}
              >
                {columns.map((c) => (
                  // One line per row keeps rows an even height; long names are
                  // cut with "…" (full text on hover) instead of wrapping.
                  <TableCell key={c.key} align={c.align}
                    title={NAME_KEYS.has(c.key) && typeof (r as Record<string, unknown>)[c.key] === 'string' ? String((r as Record<string, unknown>)[c.key]) : undefined}
                    sx={{ whiteSpace: 'nowrap', ...(NAME_KEYS.has(c.key) ? { maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' } : {}) }}>
                    {cellValue(c, r, i)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {!rows.length && !loading && (
              <TableRow>
                <TableCell colSpan={columns.length}><Empty text={empty} /></TableCell>
              </TableRow>
            )}
          </TableBody>
          {hasFooter && rows.length > 0 && (
            <TableFooter>
              <TableRow sx={{ '& td': { fontWeight: 700, color: 'text.primary', background: '#f2f6fa', fontSize: 13, position: 'sticky', bottom: 0, borderTop: '1px solid #e3e8ef', whiteSpace: 'nowrap' } }}>
                {columns.map((c) => <TableCell key={c.key} align={c.align}>{c.footer}</TableCell>)}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </TableContainer>
      {pager}
    </Paper>
  );
}
