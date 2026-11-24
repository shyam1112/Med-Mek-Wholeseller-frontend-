import { ReturnRegister } from './returnParts';

// Credit note register: sales returns (saleable / expiry / breakage) and rate-difference notes.
export default function SalesReturns() {
  return <ReturnRegister kind="sales" />;
}
