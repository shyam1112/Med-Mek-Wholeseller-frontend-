import ReturnEntry from '../sales/ReturnEntry';

// Debit note entry — also opened from a purchase as /purchase-returns/new?purchase=ID&party=ID.
export default function PurchaseReturnEntry() {
  return <ReturnEntry kind="purchase" />;
}
