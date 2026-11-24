// Mirrors EFFECTS in backend services/inventoryService.ts: each reason has a
// fixed effect on the saleable / damaged buckets, so qty is always positive.
export type AdjustReason = 'opening' | 'excess' | 'shortage' | 'damage' | 'expired_to_damaged' | 'destroyed' | 'sample' | 'other';

export const REASONS: { v: AdjustReason; label: string; effect: string; color: 'success' | 'error' | 'warning' | 'default' | 'info'; allowsNewBatch: boolean }[] = [
  { v: 'opening', label: 'Opening stock', effect: 'Adds to saleable stock — stock carried in from before you started. A new batch can be created.', color: 'success', allowsNewBatch: true },
  { v: 'excess', label: 'Excess found', effect: 'Adds to saleable stock — physical count found more than the books. A new batch can be created.', color: 'success', allowsNewBatch: true },
  { v: 'shortage', label: 'Shortage', effect: 'Reduces saleable stock — physical count found less than the books (theft, mis-count).', color: 'error', allowsNewBatch: false },
  { v: 'damage', label: 'Damage / breakage', effect: 'Moves qty from saleable to damaged — broken in the godown; kept for claim or destruction.', color: 'warning', allowsNewBatch: false },
  { v: 'expired_to_damaged', label: 'Expired → damaged', effect: 'Moves expired qty from saleable to damaged so it can never be billed; claim it via a debit note.', color: 'warning', allowsNewBatch: false },
  { v: 'destroyed', label: 'Destroyed', effect: 'Reduces damaged stock — goods destroyed / disposed that cannot be claimed from the company.', color: 'error', allowsNewBatch: false },
  { v: 'sample', label: 'Sample / free issue', effect: 'Reduces saleable stock — given away as samples or free goods outside a bill.', color: 'error', allowsNewBatch: false },
  { v: 'other', label: 'Other', effect: 'Enter +qty to add or −qty to remove, in the saleable or damaged bucket you pick per line — use only when no other reason fits.', color: 'default', allowsNewBatch: false },
];

export const reasonLabel = (r: string) => REASONS.find((x) => x.v === r)?.label || r;
export const reasonOf = (r: string) => REASONS.find((x) => x.v === r);
