import { ReturnRegister } from '../sales/returnParts';

// Debit note register: expiry claims and returns to suppliers / companies.
export default function PurchaseReturns() {
  return <ReturnRegister kind="purchase" />;
}
