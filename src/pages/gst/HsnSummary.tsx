import { useState } from 'react';
import { ToggleButton, ToggleButtonGroup } from '@mui/material';
import { ReportShell } from '../../components/ReportShell';
import { DateRange } from '../../components/Filters';
import { useFetch } from '../../lib/hooks';
import { exportExcel } from '../../lib/excel';
import { today } from '../../lib/format';
import { ErrorBox, PrintSupport, periodLabel } from '../reports/reportKit';
import { GCol, GTable, MonthInput, monthLabel, prevMonth, sheetOf } from './gstKit';

interface Row { hsn: string; rate: number; qty: number; txval: number; igst: number; cgst: number; sgst: number; total: number }

const COLS: GCol<Row>[] = [
  { key: 'hsn', label: 'HSN', get: (r) => r.hsn || '(blank)' }, { key: 'rate', label: 'GST %', kind: 'pct', total: false }, { key: 'qty', label: 'Qty (incl. free)', kind: 'qty' },
  { key: 'txval', label: 'Taxable', kind: 'money' }, { key: 'igst', label: 'IGST', kind: 'money' }, { key: 'cgst', label: 'CGST', kind: 'money' },
  { key: 'sgst', label: 'SGST', kind: 'money' }, { key: 'total', label: 'Total value', kind: 'money' },
];

export default function HsnSummary() {
  const [mode, setMode] = useState<'month' | 'range'>('month');
  const [period, setPeriod] = useState(prevMonth());
  const [from, setFrom] = useState(`${prevMonth()}-01`);
  const [to, setTo] = useState(today());
  const [type, setType] = useState<'sales' | 'purchase'>('sales');
  const { data, loading, error, reload } = useFetch<{ data: Row[] }>('/gst/hsn', mode === 'month' ? { period, type } : { from, to, type });
  const rows = data?.data || [];
  const label = mode === 'month' ? monthLabel(period) : periodLabel(from, to);
  const what = type === 'sales' ? 'Outward (sales)' : 'Inward (purchases)';

  return (
    <ReportShell
      title="HSN-wise Summary"
      subtitle={`${what} · ${label}${type === 'sales' ? ' · sales returns not deducted (see GSTR-1 HSN for net)' : ''}`}
      onExport={rows.length ? () => exportExcel(`HSN_${type}_${mode === 'month' ? period : `${from}_${to}`}`, [sheetOf(`HSN ${type}`, COLS, rows)]) : undefined}
      filters={
        <>
          <ToggleButtonGroup size="small" exclusive value={type} onChange={(_, v) => v && setType(v)}>
            <ToggleButton value="sales" sx={{ px: 1.5 }}>Sales</ToggleButton><ToggleButton value="purchase" sx={{ px: 1.5 }}>Purchase</ToggleButton>
          </ToggleButtonGroup>
          <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, v) => v && setMode(v)}>
            <ToggleButton value="month" sx={{ px: 1.5 }}>Month</ToggleButton><ToggleButton value="range" sx={{ px: 1.5 }}>Date range</ToggleButton>
          </ToggleButtonGroup>
          {mode === 'month' ? <MonthInput value={period} onChange={setPeriod} label="Month" /> : <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />}
        </>
      }
    >
      <PrintSupport title={`HSN-wise Summary — ${what}`} subtitle={label} />
      <ErrorBox error={error} onRetry={reload} />
      <GTable cols={COLS} rows={rows} loading={loading} empty="No transactions in this period." maxHeight="calc(100vh - 230px)" />
    </ReportShell>
  );
}
