import * as XLSX from 'xlsx';

export interface Column<T> {
  key: string;
  label: string;
  value?: (row: T) => unknown;
}

// Every report/list can export exactly what's on screen.
export const exportExcel = <T,>(filename: string, sheets: { name: string; columns: Column<T>[]; rows: T[] }[]) => {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const data = s.rows.map((r) => Object.fromEntries(s.columns.map((c) => [c.label, c.value ? c.value(r) : (r as Record<string, unknown>)[c.key]])));
    const ws = XLSX.utils.json_to_sheet(data, { header: s.columns.map((c) => c.label) });
    ws['!cols'] = s.columns.map((c) => ({ wch: Math.max(10, c.label.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
};

// Reads the first sheet of an uploaded xlsx/csv into row objects keyed by header.
export const readSheet = async (file: File): Promise<Record<string, unknown>[]> => {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
};

export const downloadJson = (filename: string, data: unknown) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
};
