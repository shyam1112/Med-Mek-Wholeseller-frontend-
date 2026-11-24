// Shapes returned by the backend (see backend/src/models). Kept loose where
// the UI only reads a few fields.
export type Id = string;

export interface User {
  _id: Id; name: string; username: string; email: string; phone: string;
  role: 'owner' | 'admin' | 'accountant' | 'billing' | 'salesman' | 'dispatch' | 'viewer';
  permissions: string[]; extraPermissions: string[]; isActive: boolean; lastLoginAt?: string;
}

export interface BusinessSettings {
  creditLimitAction: 'block' | 'warn' | 'ignore';
  overdueAction: 'block' | 'warn' | 'ignore';
  overdueGraceDays: number;
  dlExpiryAction: 'block' | 'warn' | 'ignore';
  minExpiryDaysForSale: number;
  nearExpiryDays: number;
  batchSelection?: 'auto' | 'ask';
  reserveOnOrder?: boolean;
  reserveDays?: number;
  defaultRateType: 'ptr' | 'pts' | 'mrp';
  roundOff: boolean;
  defaultCreditDays: number;
  ewayBillThreshold: number;
  einvoiceEnabled: boolean;
  printShowPts: boolean;
  invoiceTerms: string;
  printFormat?: Record<string, unknown>;
  prefixes: Record<string, string>;
}

export interface Business {
  _id: Id; name: string; legalName: string; gstin: string; pan: string; stateCode: string; address: string; city: string;
  pincode: string; phone: string; email: string; dl20b: string; dl21b: string; dlExpiry?: string; fssai: string;
  bankName: string; bankAccount: string; bankIfsc: string; upiId: string; fyStartMonth: number; settings: BusinessSettings;
}

export interface Product {
  _id: Id; name: string; code: string; manufacturer?: Id; manufacturerName: string; division: string; salt: string; form: string;
  category: string; hsn: string; gstRate: number; packing: string; unit: string; unitsPerBox: number; schedule: string;
  coldChain: boolean; isBanned: boolean; rack: string; barcode: string; minStock: number; reorderLevel: number; reorderQty: number;
  maxStock: number; schemeBuy: number; schemeFree: number; defaultDiscountPct: number; mrp: number; ptr: number; pts: number;
  purchaseRate: number; isActive: boolean; stock?: number; damaged?: number; stockValue?: number; nearestExpiry?: string | null;
}

export interface Quote { rate: number; discountPct: number; schemeBuy: number; schemeFree: number; source: string }

export interface Batch {
  _id: Id; product: Id; batchNo: string; expiry: string; mfgDate?: string; mrp: number; ptr: number; pts: number;
  purchaseRate: number; landingCost: number; qty: number; damagedQty: number; reservedQty?: number; isBlocked: boolean;
  supplier?: Id; createdAt?: string;
  quote?: Quote; isExpired?: boolean; isNearExpiry?: boolean;
}

export interface Party {
  _id: Id; name: string; group: string; code: string; gstin: string; gstType: string; pan: string; stateCode: string;
  address: string; city: string; pincode: string; phone: string; mobile: string; email: string; contactPerson: string;
  dl20b: string; dl21b: string; dlExpiry?: string; creditLimit: number; creditDays: number;
  rateType: 'ptr' | 'pts' | 'mrp' | 'mrp_less' | 'ptr_plus'; rateAdjustPct: number; extraDiscountPct: number; cashDiscountPct: number; minExpiryDays?: number;
  route?: Id | { _id: Id; name: string }; area: string; salesman?: Id | { _id: Id; name: string }; isHold: boolean; holdReason: string;
  openingBalance: number; openingType: 'dr' | 'cr'; notes: string; isActive: boolean; balance?: number;
  bankAccountNo?: string; ifsc?: string; systemKey?: string;
}

export interface VoucherLine {
  _id?: Id; product: Id; productName: string; manufacturerName: string; hsn: string; packing: string; schedule: string;
  batch?: Id; batchNo: string; expiry?: string; mfgDate?: string; mrp: number; ptr: number; pts: number; qty: number; freeQty: number;
  rate: number; discountPct: number; discountAmount: number; cdAmount: number; taxableValue: number; gstRate: number;
  cgst: number; sgst: number; igst: number; total: number; costRate: number;
  returnType?: string; claimPct?: number; stockBucket?: string; orderItem?: Id; salesOrder?: Id;
}

export interface Voucher {
  _id: Id; number: string; date: string; party: Id; partyName: string; partyGstin: string; partyStateCode: string;
  partyAddress: string; partyPhone: string; partyDl: string; isInterState: boolean; items: VoucherLine[];
  grossAmount: number; discountAmount: number; cdPct: number; cdAmount: number; taxableAmount: number;
  cgst: number; sgst: number; igst: number; freight: number; roundOff: number; grandTotal: number;
  dueDate?: string; paidAmount?: number; balance?: number; paymentStatus?: 'unpaid' | 'partial' | 'paid';
  status: 'active' | 'cancelled'; cancelReason?: string; narration: string; createdAt: string;
  [k: string]: any;
}

export interface MoneyVoucher {
  _id: Id; kind: 'receipt' | 'payment'; number: string; date: string; party: Id; partyName: string; mode: string;
  account: Id; accountName: string; amount: number; discount: number; tds: number; chequeNo: string; chequeDate?: string;
  bankName: string; reference: string; isPdc: boolean; chequeStatus: 'na' | 'pending' | 'cleared' | 'bounced';
  allocations: { bill: Id; billNo: string; billDate: string; amount: number }[]; onAccount: number;
  collectedByName?: string; status: 'active' | 'cancelled'; narration: string;
}

export const STATES: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
  '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
  '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '26': 'Dadra & Nagar Haveli and Daman & Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep',
  '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman & Nicobar Islands', '36': 'Telangana',
  '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory',
};

export const GST_RATES = [0, 5, 12, 18, 28];
