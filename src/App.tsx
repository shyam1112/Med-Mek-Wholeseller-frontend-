import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';

const L = (f: () => Promise<{ default: React.ComponentType<any> }>) => lazy(f);

const Login = L(() => import('./pages/auth/Login'));
const Register = L(() => import('./pages/auth/Register'));
const Profile = L(() => import('./pages/auth/Profile'));
const Dashboard = L(() => import('./pages/Dashboard'));
// sales
const SalesInvoiceEntry = L(() => import('./pages/sales/SalesInvoiceEntry'));
const SalesList = L(() => import('./pages/sales/SalesList'));
const SalesInvoiceView = L(() => import('./pages/sales/SalesInvoiceView'));
const SalesOrders = L(() => import('./pages/sales/SalesOrders'));
const SalesOrderEntry = L(() => import('./pages/sales/SalesOrderEntry'));
const SalesReturns = L(() => import('./pages/sales/SalesReturns'));
const SalesReturnEntry = L(() => import('./pages/sales/SalesReturnEntry'));
// purchase
const PurchaseEntry = L(() => import('./pages/purchase/PurchaseEntry'));
const PurchaseList = L(() => import('./pages/purchase/PurchaseList'));
const PurchaseView = L(() => import('./pages/purchase/PurchaseView'));
const PurchaseOrders = L(() => import('./pages/purchase/PurchaseOrders'));
const PurchaseOrderEntry = L(() => import('./pages/purchase/PurchaseOrderEntry'));
const PurchaseReturns = L(() => import('./pages/purchase/PurchaseReturns'));
const PurchaseReturnEntry = L(() => import('./pages/purchase/PurchaseReturnEntry'));
// accounts
const MoneyList = L(() => import('./pages/accounts/MoneyList'));
const MoneyEntry = L(() => import('./pages/accounts/MoneyEntry'));
const PdcRegister = L(() => import('./pages/accounts/PdcRegister'));
const Outstanding = L(() => import('./pages/accounts/Outstanding'));
const Journals = L(() => import('./pages/accounts/Journals'));
const LedgerStatement = L(() => import('./pages/accounts/LedgerStatement'));
const Ledgers = L(() => import('./pages/accounts/Ledgers'));
// masters / inventory
const Products = L(() => import('./pages/masters/Products'));
const ProductForm = L(() => import('./pages/masters/ProductForm'));
const ProductDetail = L(() => import('./pages/masters/ProductDetail'));
const Manufacturers = L(() => import('./pages/masters/Manufacturers'));
const Parties = L(() => import('./pages/masters/Parties'));
const PartyForm = L(() => import('./pages/masters/PartyForm'));
const PartyDetail = L(() => import('./pages/masters/PartyDetail'));
const RoutesPage = L(() => import('./pages/masters/RoutesPage'));
const SpecialRates = L(() => import('./pages/masters/SpecialRates'));
const ImportData = L(() => import('./pages/masters/ImportData'));
const Batches = L(() => import('./pages/inventory/Batches'));
const StockAdjustments = L(() => import('./pages/inventory/StockAdjustments'));
const StockAdjustmentEntry = L(() => import('./pages/inventory/StockAdjustmentEntry'));
// dispatch
const DeliveryRuns = L(() => import('./pages/delivery/DeliveryRuns'));
const DeliveryRunView = L(() => import('./pages/delivery/DeliveryRunView'));
// reports
const SalesAnalysis = L(() => import('./pages/reports/SalesAnalysis'));
const PurchaseAnalysis = L(() => import('./pages/reports/PurchaseAnalysis'));
const StockSummary = L(() => import('./pages/reports/StockSummary'));
const StockLedger = L(() => import('./pages/reports/StockLedger'));
const CompanyStatement = L(() => import('./pages/reports/CompanyStatement'));
const Reorder = L(() => import('./pages/reports/Reorder'));
const SlowMoving = L(() => import('./pages/reports/SlowMoving'));
const SalesmanReport = L(() => import('./pages/reports/SalesmanReport'));
const DayBook = L(() => import('./pages/reports/DayBook'));
const TrialBalance = L(() => import('./pages/reports/TrialBalance'));
const ProfitLoss = L(() => import('./pages/reports/ProfitLoss'));
const BalanceSheet = L(() => import('./pages/reports/BalanceSheet'));
const H1Register = L(() => import('./pages/reports/H1Register'));
const DlExpiry = L(() => import('./pages/reports/DlExpiry'));
// gst
const Gstr1 = L(() => import('./pages/gst/Gstr1'));
const Gstr3b = L(() => import('./pages/gst/Gstr3b'));
const HsnSummary = L(() => import('./pages/gst/HsnSummary'));
// settings
const BusinessSettings = L(() => import('./pages/settings/BusinessSettings'));
const Users = L(() => import('./pages/settings/Users'));
const AuditLog = L(() => import('./pages/settings/AuditLog'));

const Spinner = () => <Box sx={{ display: 'grid', placeItems: 'center', height: '60vh' }}><CircularProgress /></Box>;

const Protected: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

export default function App() {
  const { user } = useAuth();
  return (
    <BrowserRouter>
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
          <Route path="/register" element={user ? <Navigate to="/" /> : <Register />} />
          <Route element={<Protected><Layout /></Protected>}>
            <Route index element={<Dashboard />} />
            <Route path="profile" element={<Profile />} />

            <Route path="sales" element={<SalesList />} />
            <Route path="sales/new" element={<SalesInvoiceEntry />} />
            <Route path="sales/:id" element={<SalesInvoiceView />} />
            <Route path="sales/:id/edit" element={<SalesInvoiceEntry />} />
            <Route path="sales-orders" element={<SalesOrders />} />
            <Route path="sales-orders/new" element={<SalesOrderEntry />} />
            <Route path="sales-orders/:id" element={<SalesOrderEntry />} />
            <Route path="sales-returns" element={<SalesReturns />} />
            <Route path="sales-returns/new" element={<SalesReturnEntry />} />

            <Route path="purchases" element={<PurchaseList />} />
            <Route path="purchases/new" element={<PurchaseEntry />} />
            <Route path="purchases/:id" element={<PurchaseView />} />
            <Route path="purchases/:id/edit" element={<PurchaseEntry />} />
            <Route path="purchase-orders" element={<PurchaseOrders />} />
            <Route path="purchase-orders/new" element={<PurchaseOrderEntry />} />
            <Route path="purchase-orders/:id" element={<PurchaseOrderEntry />} />
            <Route path="purchase-returns" element={<PurchaseReturns />} />
            <Route path="purchase-returns/new" element={<PurchaseReturnEntry />} />

            <Route path="receipts" element={<MoneyList kind="receipt" />} />
            <Route path="receipts/new" element={<MoneyEntry kind="receipt" />} />
            <Route path="payments" element={<MoneyList kind="payment" />} />
            <Route path="payments/new" element={<MoneyEntry kind="payment" />} />
            <Route path="pdc" element={<PdcRegister />} />
            <Route path="outstanding" element={<Outstanding />} />
            <Route path="journals" element={<Journals />} />
            <Route path="ledger-statement" element={<LedgerStatement />} />
            <Route path="ledgers" element={<Ledgers />} />

            <Route path="products" element={<Products />} />
            <Route path="products/new" element={<ProductForm />} />
            <Route path="products/:id" element={<ProductDetail />} />
            <Route path="products/:id/edit" element={<ProductForm />} />
            <Route path="manufacturers" element={<Manufacturers />} />
            <Route path="customers" element={<Parties type="customer" />} />
            <Route path="suppliers" element={<Parties type="supplier" />} />
            <Route path="parties/new" element={<PartyForm />} />
            <Route path="parties/:id" element={<PartyDetail />} />
            <Route path="parties/:id/edit" element={<PartyForm />} />
            <Route path="routes" element={<RoutesPage />} />
            <Route path="special-rates" element={<SpecialRates />} />
            <Route path="import" element={<ImportData />} />
            <Route path="batches" element={<Batches />} />
            <Route path="stock-adjustments" element={<StockAdjustments />} />
            <Route path="stock-adjustments/new" element={<StockAdjustmentEntry />} />

            <Route path="delivery" element={<DeliveryRuns />} />
            <Route path="delivery/:id" element={<DeliveryRunView />} />

            <Route path="reports/sales" element={<SalesAnalysis />} />
            <Route path="reports/purchases" element={<PurchaseAnalysis />} />
            <Route path="reports/stock" element={<StockSummary />} />
            <Route path="reports/stock-ledger" element={<StockLedger />} />
            <Route path="reports/company-statement" element={<CompanyStatement />} />
            <Route path="reports/reorder" element={<Reorder />} />
            <Route path="reports/slow-moving" element={<SlowMoving />} />
            <Route path="reports/salesman" element={<SalesmanReport />} />
            <Route path="reports/day-book" element={<DayBook />} />
            <Route path="reports/trial-balance" element={<TrialBalance />} />
            <Route path="reports/profit-loss" element={<ProfitLoss />} />
            <Route path="reports/balance-sheet" element={<BalanceSheet />} />
            <Route path="reports/h1" element={<H1Register />} />
            <Route path="reports/dl-expiry" element={<DlExpiry />} />

            <Route path="gst/gstr1" element={<Gstr1 />} />
            <Route path="gst/gstr3b" element={<Gstr3b />} />
            <Route path="gst/hsn" element={<HsnSummary />} />

            <Route path="settings" element={<BusinessSettings />} />
            <Route path="users" element={<Users />} />
            <Route path="audit" element={<AuditLog />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
