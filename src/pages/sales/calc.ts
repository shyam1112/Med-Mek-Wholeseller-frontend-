import { round2 } from '../../lib/format';

// Mirror of backend/src/services/compute.ts so the bill total on screen is
// exactly what the server will save.
export interface CalcLine { qty: number; rate: number; discountPct: number; gstRate: number }
export interface CalcResult { gross: number; disc: number; cd: number; taxable: number; cgst: number; sgst: number; igst: number; total: number }

export const calcLine = (l: CalcLine, inter: boolean, cdPct: number): CalcResult => {
  const gross = round2((Number(l.qty) || 0) * (Number(l.rate) || 0));
  const disc = round2((gross * (Number(l.discountPct) || 0)) / 100);
  const after = round2(gross - disc);
  const cd = round2((after * (Number(cdPct) || 0)) / 100);
  const taxable = round2(after - cd);
  let cgst = 0, sgst = 0, igst = 0;
  if (inter) igst = round2((taxable * l.gstRate) / 100);
  else { cgst = round2((taxable * l.gstRate) / 200); sgst = cgst; }
  return { gross, disc, cd, taxable, cgst, sgst, igst, total: round2(taxable + cgst + sgst + igst) };
};

export const calcTotals = (lines: CalcResult[], freight: number, roundOff = true) => {
  const s = (k: keyof CalcResult) => round2(lines.reduce((a, l) => a + l[k], 0));
  const taxable = s('taxable'), cgst = s('cgst'), sgst = s('sgst'), igst = s('igst');
  const raw = round2(taxable + cgst + sgst + igst + (Number(freight) || 0));
  const grand = roundOff ? Math.round(raw) : raw;
  return { gross: s('gross'), disc: s('disc'), cd: s('cd'), taxable, cgst, sgst, igst, freight: Number(freight) || 0, roundOff: round2(grand - raw), grand };
};

export const schemeFree = (qty: number, buy?: number, free?: number) => (buy && free && buy > 0 ? Math.floor(qty / buy) * free : 0);
