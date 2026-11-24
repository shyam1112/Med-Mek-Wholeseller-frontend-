import dayjs from 'dayjs';

const inrFmt = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const intFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export const inr = (n: number | undefined | null) => `₹${inrFmt.format(Number(n) || 0)}`;
export const amt = (n: number | undefined | null) => inrFmt.format(Number(n) || 0);
export const num = (n: number | undefined | null) => intFmt.format(Number(n) || 0);
export const round2 = (n: number) => Math.round((Number(n) || 0) * 100 + Number.EPSILON) / 100;

// Lakh/crore compact form for dashboards: ₹12.4 L, ₹1.2 Cr.
export const inrShort = (n: number) => {
  const v = Number(n) || 0;
  const a = Math.abs(v);
  if (a >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  if (a >= 1e3) return `₹${(v / 1e3).toFixed(1)} K`;
  return `₹${v.toFixed(0)}`;
};

export const fdate = (d?: string | Date | null) => (d ? dayjs(d).format('DD-MM-YYYY') : '');
export const fdatetime = (d?: string | Date | null) => (d ? dayjs(d).format('DD-MM-YYYY HH:mm') : '');
// Pharma expiry is shown MM/YY.
export const fexp = (d?: string | Date | null) => (d ? dayjs(d).format('MM/YY') : '');
export const isoDate = (d?: string | Date | null) => (d ? dayjs(d).format('YYYY-MM-DD') : '');
export const today = () => dayjs().format('YYYY-MM-DD');
export const monthStart = () => dayjs().startOf('month').format('YYYY-MM-DD');

// Balance with Dr/Cr suffix (+ = debit).
export const drcr = (n: number) => `${amt(Math.abs(n))} ${n >= 0 ? 'Dr' : 'Cr'}`;

// Parses "MM/YY", "MM/YYYY", "MMYY" or a date into end-of-month ISO date.
export const parseExpiry = (s: string): string | null => {
  const t = s.trim();
  let m: number | undefined, y: number | undefined;
  const a = t.match(/^(\d{1,2})[/\-.]?(\d{2}|\d{4})$/);
  if (a) { m = Number(a[1]); y = Number(a[2]); }
  else if (dayjs(t).isValid()) return dayjs(t).endOf('month').format('YYYY-MM-DD');
  if (!m || !y || m < 1 || m > 12) return null;
  if (y < 100) y += 2000;
  return dayjs(new Date(y, m - 1, 1)).endOf('month').format('YYYY-MM-DD');
};

// Indian-format amount in words for invoices.
export const inWords = (n: number) => {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (x: number) => (x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? ' ' + ones[x % 10] : ''}`);
  const three = (x: number) => (x >= 100 ? `${ones[Math.floor(x / 100)]} Hundred${x % 100 ? ' ' + two(x % 100) : ''}` : two(x));
  const rupees = Math.floor(Math.abs(n));
  const paise = Math.round((Math.abs(n) - rupees) * 100);
  if (rupees === 0 && paise === 0) return 'Zero Rupees Only';
  const parts: string[] = [];
  const cr = Math.floor(rupees / 1e7), lk = Math.floor((rupees % 1e7) / 1e5), th = Math.floor((rupees % 1e5) / 1e3), rest = rupees % 1e3;
  if (cr) parts.push(`${three(cr)} Crore`);
  if (lk) parts.push(`${two(lk)} Lakh`);
  if (th) parts.push(`${two(th)} Thousand`);
  if (rest) parts.push(three(rest));
  return `Rupees ${parts.join(' ')}${paise ? ` and ${two(paise)} Paise` : ''} Only`;
};
