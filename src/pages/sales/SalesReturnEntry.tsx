import ReturnEntry from './ReturnEntry';

// Credit note entry — also opened from a bill as /sales-returns/new?invoice=ID.
export default function SalesReturnEntry() {
  return <ReturnEntry kind="sales" />;
}
