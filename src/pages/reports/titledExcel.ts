import * as XLSX from 'xlsx';

// Excel with title rows above the table (distributor name, GSTIN, period…) —
// the shared exportExcel only writes a bare table. Used for statements that
// get emailed to companies / the CA.
export const exportTitledExcel = (
  filename: string,
  sheetName: string,
  titleLines: string[],
  headers: string[],
  rows: (string | number | null | undefined)[][],
  footer?: (string | number | null | undefined)[],
) => {
  const aoa: unknown[][] = [...titleLines.map((t) => [t]), [], headers, ...rows, ...(footer ? [footer] : [])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = headers.map((h, i) => ({ wch: Math.max(10, h.length + 2, ...rows.slice(0, 200).map((r) => String(r[i] ?? '').length + 1)) }));
  ws['!merges'] = titleLines.map((_, i) => ({ s: { r: i, c: 0 }, e: { r: i, c: Math.max(0, headers.length - 1) } }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
};
