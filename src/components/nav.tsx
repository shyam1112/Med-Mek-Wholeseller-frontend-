import React from 'react';
import DashboardOutlined from '@mui/icons-material/DashboardOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import ShoppingCartOutlined from '@mui/icons-material/ShoppingCartOutlined';
import AccountBalanceWalletOutlined from '@mui/icons-material/AccountBalanceWalletOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import PeopleAltOutlined from '@mui/icons-material/PeopleAltOutlined';
import LocalShippingOutlined from '@mui/icons-material/LocalShippingOutlined';
import AssessmentOutlined from '@mui/icons-material/AssessmentOutlined';
import GavelOutlined from '@mui/icons-material/GavelOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';

export interface NavItem { label: string; path: string; perm?: string; hotkey?: string }
export interface NavSection { label: string; icon: React.ReactNode; items: NavItem[] }

export const NAV: NavSection[] = [
  { label: 'Dashboard', icon: <DashboardOutlined fontSize="small" />, items: [{ label: 'Dashboard', path: '/' }] },
  {
    label: 'Sales', icon: <ReceiptLongOutlined fontSize="small" />,
    items: [
      { label: 'New Bill', path: '/sales/new', perm: 'sales:create', hotkey: 'Alt+N' },
      { label: 'Sales Bills', path: '/sales', perm: 'sales:view' },
      { label: 'Sales Orders', path: '/sales-orders', perm: 'sales_orders:view' },
      { label: 'Returns / Credit Notes', path: '/sales-returns', perm: 'sales_returns:view' },
    ],
  },
  {
    label: 'Purchase', icon: <ShoppingCartOutlined fontSize="small" />,
    items: [
      { label: 'New Purchase', path: '/purchases/new', perm: 'purchases:create', hotkey: 'Alt+P' },
      { label: 'Purchase Bills', path: '/purchases', perm: 'purchases:view' },
      { label: 'Purchase Orders', path: '/purchase-orders', perm: 'purchase_orders:view' },
      { label: 'Returns / Debit Notes', path: '/purchase-returns', perm: 'purchase_returns:view' },
    ],
  },
  {
    label: 'Accounts', icon: <AccountBalanceWalletOutlined fontSize="small" />,
    items: [
      { label: 'Receipts', path: '/receipts', perm: 'receipts:view', hotkey: 'Alt+R' },
      { label: 'Payments', path: '/payments', perm: 'payments:view' },
      { label: 'PDC Register', path: '/pdc', perm: 'receipts:view' },
      { label: 'Outstanding', path: '/outstanding', perm: 'reports:view' },
      { label: 'Journal / Expenses', path: '/journals', perm: 'journals:view' },
      { label: 'Ledger Statement', path: '/ledger-statement', perm: 'reports:view' },
      { label: 'Chart of Accounts', path: '/ledgers', perm: 'ledgers:view' },
    ],
  },
  {
    label: 'Inventory', icon: <Inventory2Outlined fontSize="small" />,
    items: [
      { label: 'Products', path: '/products', perm: 'products:view' },
      { label: 'Batches & Expiry', path: '/batches', perm: 'products:view' },
      { label: 'Stock Adjustments', path: '/stock-adjustments', perm: 'inventory:view' },
      { label: 'Companies', path: '/manufacturers', perm: 'products:view' },
    ],
  },
  {
    label: 'Parties', icon: <PeopleAltOutlined fontSize="small" />,
    items: [
      { label: 'Customers', path: '/customers', perm: 'parties:view' },
      { label: 'Suppliers', path: '/suppliers', perm: 'parties:view' },
      { label: 'Special Rates', path: '/special-rates', perm: 'parties:view' },
      { label: 'Routes & Areas', path: '/routes', perm: 'parties:view' },
    ],
  },
  {
    label: 'Dispatch', icon: <LocalShippingOutlined fontSize="small" />,
    items: [{ label: 'Delivery Runs', path: '/delivery', perm: 'delivery:view' }],
  },
  {
    label: 'Reports', icon: <AssessmentOutlined fontSize="small" />,
    items: [
      { label: 'Sales Analysis', path: '/reports/sales', perm: 'reports:view' },
      { label: 'Purchase Analysis', path: '/reports/purchases', perm: 'reports:view' },
      { label: 'Stock Summary', path: '/reports/stock', perm: 'reports:view' },
      { label: 'Stock Ledger', path: '/reports/stock-ledger', perm: 'reports:view' },
      { label: 'Company Stock & Sales', path: '/reports/company-statement', perm: 'reports:view' },
      { label: 'Reorder / Shortage', path: '/reports/reorder', perm: 'purchase_orders:view' },
      { label: 'Slow / Non-moving', path: '/reports/slow-moving', perm: 'reports:view' },
      { label: 'Salesman Performance', path: '/reports/salesman', perm: 'reports:view' },
      { label: 'Day Book', path: '/reports/day-book', perm: 'accounts_reports:view' },
      { label: 'Trial Balance', path: '/reports/trial-balance', perm: 'accounts_reports:view' },
      { label: 'Profit & Loss', path: '/reports/profit-loss', perm: 'accounts_reports:view' },
      { label: 'Balance Sheet', path: '/reports/balance-sheet', perm: 'accounts_reports:view' },
    ],
  },
  {
    label: 'GST & Compliance', icon: <GavelOutlined fontSize="small" />,
    items: [
      { label: 'GSTR-1', path: '/gst/gstr1', perm: 'gst:view' },
      { label: 'GSTR-3B', path: '/gst/gstr3b', perm: 'gst:view' },
      { label: 'HSN Summary', path: '/gst/hsn', perm: 'gst:view' },
      { label: 'Schedule H1 Register', path: '/reports/h1', perm: 'reports:view' },
      { label: 'Drug Licence Expiry', path: '/reports/dl-expiry', perm: 'reports:view' },
    ],
  },
  {
    label: 'Settings', icon: <SettingsOutlined fontSize="small" />,
    items: [
      { label: 'Business & Rules', path: '/settings', perm: 'settings:view' },
      { label: 'Users & Roles', path: '/users', perm: 'users:view' },
      { label: 'Import Data', path: '/import', perm: 'products:create' },
      { label: 'Audit Log', path: '/audit', perm: 'audit:view' },
    ],
  },
];

