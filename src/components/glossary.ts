// Plain-language meanings of the trade, GST and accounting words used across
// the app. Screens list the ids they use (PageHeader `help`), and the Help
// dialog shows the whole list with search.

export interface Word { id: string; term: string; aka?: string; meaning: string; example?: string }

export const GLOSSARY: Word[] = [
  // ---- prices & stock ----
  { id: 'mrp', term: 'MRP', aka: 'Maximum Retail Price', meaning: 'The highest price the patient can be charged. Printed on the pack.', example: 'Dolo 650 strip MRP ₹34' },
  { id: 'ptr', term: 'PTR', aka: 'Price to Retailer', meaning: 'Your selling rate to a chemist shop. Usually about 20% below MRP so the retailer earns a margin.', example: 'MRP ₹100 → PTR ₹80' },
  { id: 'pts', term: 'PTS', aka: 'Price to Stockist', meaning: 'The rate a stockist / wholesaler buys at from the company. Usually about 10% below PTR — this gap is your margin.', example: 'PTR ₹80 → PTS ₹72' },
  { id: 'rate', term: 'Rate', meaning: 'The price per unit used on this bill. Filled from the party’s special rate or PTR, and you can change it.' },
  { id: 'landing', term: 'Landing cost', aka: 'Cost', meaning: 'What one unit really cost you after discount, free goods and tax credit. Profit is worked out from this.' },
  { id: 'batch', term: 'Batch', meaning: 'A lot made by the company together. Each batch has its own number, expiry date and MRP. Stock is kept batch-wise.' },
  { id: 'fefo', term: 'FEFO', aka: 'First Expiry, First Out', meaning: 'The bill picks the batch that expires first, so old stock goes out before it expires. You can still choose another batch.' },
  { id: 'expiry', term: 'Expiry (MM/YY)', meaning: 'Month after which the batch can’t be sold. Expired stock is blocked on bills.' },
  { id: 'nearexpiry', term: 'Near expiry', meaning: 'Batches expiring in the next few months (set in Settings). Shown in orange so you push them first or return them.' },
  { id: 'shelflife', term: 'Min. shelf life', meaning: 'Some customers won’t accept stock expiring soon. Batches with less life than this are skipped for that customer.' },
  { id: 'scheme', term: 'Scheme (e.g. 10+1)', meaning: 'Free goods offer: buy 10, get 1 free. The free quantity fills in by itself.' },
  { id: 'free', term: 'Free qty', meaning: 'Units given free with the bill. They leave stock but have no charge.' },
  { id: 'damaged', term: 'Damaged stock', meaning: 'Broken, leaked or expired goods kept aside. It can’t be sold, only returned to the company or destroyed.' },
  { id: 'reserved', term: 'Reserved / held', meaning: 'Stock kept aside for a customer’s order. Other bills can’t use it until the order is billed or released.' },
  { id: 'adjustment', term: 'Stock in / out', aka: 'Stock adjustment', meaning: 'Correct the stock without a bill — physical count difference, breakage, opening stock, samples.' },
  { id: 'reorder', term: 'Reorder level', meaning: 'When stock falls to this number, the product shows in “What to order”.' },
  // ---- discounts & tax ----
  { id: 'disc', term: 'Disc %', aka: 'Trade discount', meaning: 'Discount on the rate of one line.' },
  { id: 'cd', term: 'CD %', aka: 'Cash discount', meaning: 'Extra discount on the whole bill, usually for paying quickly. Set per customer, can be changed per bill.' },
  { id: 'gst', term: 'GST', meaning: 'Tax on the bill. Inside your state it splits into CGST + SGST (half each). To another state it is IGST.' },
  { id: 'igst', term: 'CGST / SGST / IGST', meaning: 'CGST + SGST = same-state sale. IGST = sale to another state. The app decides from the customer’s state.' },
  { id: 'taxable', term: 'Taxable value', meaning: 'Amount after discounts, before GST.' },
  { id: 'hsn', term: 'HSN code', meaning: 'Government code for the type of product (e.g. 3004 for medicines). Needed on GST bills and returns.' },
  { id: 'gstin', term: 'GSTIN', meaning: '15-character GST number of a business. Customers without one are “Unregistered”.' },
  { id: 'roundoff', term: 'Round off', meaning: 'Small paise adjustment so the bill total is a whole rupee.' },
  // ---- licences ----
  { id: 'dl', term: 'Drug licence (DL)', aka: 'Form 20/20B, 21/21B', meaning: 'Licence needed to buy and sell medicines. 20 / 20B covers normal drugs, 21 / 21B covers Schedule C & C1 drugs. Retailers have 20 & 21, wholesalers 20B & 21B. Printed on every bill.' },
  { id: 'schedule', term: 'Schedule H / H1 / X', meaning: 'Prescription-only drugs. H1 sales (strong antibiotics etc.) are listed in the H1 register by law.' },
  // ---- parties & money ----
  { id: 'creditdays', term: 'Credit days', meaning: 'How many days the customer gets to pay. The bill’s due date = bill date + credit days.' },
  { id: 'creditlimit', term: 'Credit limit', meaning: 'Maximum amount a customer may owe you. A bill above it is stopped (owner can override).' },
  { id: 'outstanding', term: 'Outstanding', meaning: 'Bills not fully paid yet — who owes you, and whom you owe.' },
  { id: 'overdue', term: 'Overdue', meaning: 'Unpaid bills past their due date.' },
  { id: 'ledger', term: 'Ledger statement', aka: 'Party khata', meaning: 'Every entry of one party (bills, payments, returns) with the running balance — the page of your khata book for them.' },
  { id: 'drcr', term: 'Dr / Cr', aka: 'Debit / Credit', meaning: 'For a customer, Dr means they owe you, Cr means you owe them (advance). For a supplier it is the other way: Cr means you owe them.' },
  { id: 'receipt', term: 'Receipt', meaning: 'Money you received from a customer (cash, cheque, UPI). Adjusted against their bills.' },
  { id: 'payment', term: 'Payment', meaning: 'Money you paid to a supplier.' },
  { id: 'pdc', term: 'PDC', aka: 'Post-dated cheque', meaning: 'A cheque with a future date. Kept aside until its date, then deposited.' },
  { id: 'onaccount', term: 'On account', meaning: 'Money received but not yet linked to any bill.' },
  // ---- documents ----
  { id: 'salesorder', term: 'Sales order', meaning: 'What a customer asked for. No stock moves and no amount is due until you make the bill from it.' },
  { id: 'purchaseorder', term: 'Purchase order (PO)', meaning: 'What you ask a supplier to send. Stock comes in only with the purchase bill.' },
  { id: 'creditnote', term: 'Credit note', aka: 'Sales return', meaning: 'Goods a customer returned. Reduces what they owe you.' },
  { id: 'debitnote', term: 'Debit note', aka: 'Purchase return', meaning: 'Goods you sent back to a supplier. Reduces what you owe them.' },
  { id: 'narration', term: 'Narration / remarks', meaning: 'A note for yourself on the entry, e.g. “Against order SO/…”.' },
  { id: 'route', term: 'Route / area', meaning: 'Group of customers on one delivery line, used for orders, delivery runs and reports.' },
  { id: 'specialrate', term: 'Special rate', meaning: 'A fixed rate or discount for one customer on a product, used automatically on their bills.' },
  { id: 'fy', term: 'FY', aka: 'Financial year', meaning: 'April to March. Bill numbers start again each year, e.g. SI/26-27/00001.' },
  // ---- reports & GST filing ----
  { id: 'daybook', term: 'Day book', meaning: 'Every entry made on a day — bills, receipts, payments, expenses.' },
  { id: 'trialbalance', term: 'Trial balance', meaning: 'Balance of every account. Total Dr must equal total Cr — it checks the books are right.' },
  { id: 'pl', term: 'Profit & Loss', meaning: 'Sales minus cost of goods and expenses for a period = your profit.' },
  { id: 'balancesheet', term: 'Balance sheet', meaning: 'What the business owns (stock, cash, money to receive) and owes (suppliers, loans, capital) on a date.' },
  { id: 'gstr1', term: 'GSTR-1', meaning: 'Monthly GST return of your sales bills. Download the file here and upload it on the GST portal.' },
  { id: 'gstr3b', term: 'GSTR-3B', meaning: 'Monthly GST summary: tax on sales minus tax paid on purchases (ITC) = GST to pay.' },
  { id: 'itc', term: 'ITC', aka: 'Input tax credit', meaning: 'GST you paid on purchases, which is reduced from the GST you collect on sales.' },
  { id: 'einvoice', term: 'E-invoice / IRN', meaning: 'For larger businesses, each B2B bill is reported to the GST portal, which returns an IRN number and QR code.' },
  { id: 'ewaybill', term: 'E-way bill', meaning: 'Needed to transport goods worth over ₹50,000 by vehicle.' },
];

export const word = (id: string) => GLOSSARY.find((w) => w.id === id);

// Lets any screen open the Help dialog (Layout listens).
export const openHelp = (tab: 'words' | 'keys' = 'words', search = '') =>
  window.dispatchEvent(new CustomEvent('mmw:help', { detail: { tab, search } }));
