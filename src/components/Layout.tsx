import React, { useEffect, useState } from 'react';
import {
  Avatar, BottomNavigation, BottomNavigationAction, Box, Button, Chip, Collapse, Divider, Drawer, IconButton,
  List, ListItemButton, ListItemIcon, ListItemText, ListSubheader, Menu, MenuItem, Paper, Toolbar, Tooltip, Typography, useMediaQuery,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import SearchIcon from '@mui/icons-material/Search';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import AddIcon from '@mui/icons-material/Add';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import KeyboardDoubleArrowLeftIcon from '@mui/icons-material/KeyboardDoubleArrowLeft';
import KeyboardDoubleArrowRightIcon from '@mui/icons-material/KeyboardDoubleArrowRight';
import DashboardOutlined from '@mui/icons-material/DashboardOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import AssignmentOutlined from '@mui/icons-material/AssignmentOutlined';
import PeopleAltOutlined from '@mui/icons-material/PeopleAltOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import LockResetIcon from '@mui/icons-material/LockReset';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { alpha, useTheme } from '@mui/material/styles';
import dayjs from 'dayjs';
import { NAV } from './nav';
import { HelpDialog } from './Help';
import { PrintHost } from './PrintHost';
import { useAuth } from '../auth/AuthContext';
import { GlobalSearch, useGlobalSearchHotkey } from './GlobalSearch';
import { useHotkey } from '../lib/hooks';

const WIDTH = 240;
const RAIL = 68;
const SIDEBAR_BG = '#0b2a40';

const fyLabel = (startMonth = 4) => {
  const d = dayjs();
  const y = d.month() + 1 >= startMonth ? d.year() : d.year() - 1;
  return `FY ${String(y).slice(-2)}-${String(y + 1).slice(-2)}`;
};

// "+ New" menu in the top bar — every create screen one click away.
const CREATE: { label: string; path: string; perm: string; key?: string; group: string }[] = [
  { label: 'Sales bill', path: '/sales/new', perm: 'sales:create', key: 'Alt+N', group: 'Sales' },
  { label: 'Sales order', path: '/sales-orders/new', perm: 'sales_orders:create', group: 'Sales' },
  { label: 'Credit note (sales return)', path: '/sales-returns/new', perm: 'sales_returns:create', group: 'Sales' },
  { label: 'Purchase bill', path: '/purchases/new', perm: 'purchases:create', key: 'Alt+P', group: 'Purchase' },
  { label: 'Purchase order', path: '/purchase-orders/new', perm: 'purchase_orders:create', group: 'Purchase' },
  { label: 'Debit note (purchase return)', path: '/purchase-returns/new', perm: 'purchase_returns:create', group: 'Purchase' },
  { label: 'Receipt', path: '/receipts/new', perm: 'receipts:create', key: 'Alt+R', group: 'Accounts' },
  { label: 'Payment', path: '/payments/new', perm: 'payments:create', group: 'Accounts' },
  { label: 'Product', path: '/products/new', perm: 'products:create', group: 'Masters' },
  { label: 'Customer', path: '/parties/new?type=customer', perm: 'parties:create', group: 'Masters' },
  { label: 'Supplier', path: '/parties/new?type=supplier', perm: 'parties:create', group: 'Masters' },
];


const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box component="kbd" sx={{ px: 0.75, py: 0.1, border: 1, borderColor: 'divider', borderBottomWidth: 2, borderRadius: 1, fontSize: 11.5, fontFamily: 'inherit', fontWeight: 600, bgcolor: '#f7f9fc', whiteSpace: 'nowrap' }}>{children}</Box>
);

export const Layout: React.FC = () => {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('md'));
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(false);
  const [help, setHelpOpen] = useState(false);
  const [helpTab, setHelpTab] = useState<'words' | 'keys'>('words');
  const [helpSearch, setHelpSearch] = useState('');
  const setHelp = (v: boolean) => { if (v) { setHelpTab('words'); setHelpSearch(''); } setHelpOpen(v); };

  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [createMenu, setCreateMenu] = useState<HTMLElement | null>(null);
  const [railMenu, setRailMenu] = useState<{ el: HTMLElement; label: string } | null>(null);
  const [rail, setRail] = useState(() => { try { return localStorage.getItem('mmw_nav_rail') === '1'; } catch { return false; } });
  const { user, business, can, logout } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const activeSection = NAV.find((s) => s.items.some((i) => i.path !== '/' && loc.pathname.startsWith(i.path)))?.label;
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => ({ [activeSection || 'Sales']: true }));
  const collapsed = rail && !mobile;

  // Open the section of the screen you navigate to.
  useEffect(() => { if (activeSection) setExpanded((e) => (e[activeSection] ? e : { ...e, [activeSection]: true })); }, [activeSection]);

  useGlobalSearchHotkey(() => setSearch(true));
  useHotkey('alt+n', () => can('sales:create') && nav('/sales/new'));
  useHotkey('alt+p', () => can('purchases:create') && nav('/purchases/new'));
  useHotkey('alt+r', () => can('receipts:create') && nav('/receipts/new'));
  // "?" opens the shortcut list — but not while typing in a field.
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== '?' || t.closest('input, textarea, [contenteditable="true"], [role="combobox"]')) return;
      e.preventDefault(); setHelp(true);
    };
    window.addEventListener('keydown', fn);
    // Screens open help on a word via openHelp().
    const ev = (e: Event) => { const d = (e as CustomEvent).detail || {}; setHelpTab(d.tab || 'words'); setHelpSearch(d.search || ''); setHelpOpen(true); };
    window.addEventListener('mmw:help', ev);
    return () => { window.removeEventListener('keydown', fn); window.removeEventListener('mmw:help', ev); };
  }, []);

  const toggleRail = () => setRail((r) => { try { localStorage.setItem('mmw_nav_rail', r ? '0' : '1'); } catch { /* storage blocked */ } return !r; });

  // Screens the role can't use (typed URL, old bookmark): show a message
  // instead of a page whose API calls all fail with 403.
  const navMatch = NAV.flatMap((sec) => sec.items).filter((i) => i.path !== '/' && (loc.pathname === i.path || loc.pathname.startsWith(i.path + '/')))
    .sort((a, b) => b.path.length - a.path.length)[0];
  const needed = navMatch?.perm && loc.pathname.endsWith('/edit') ? navMatch.perm.replace(/:\w+$/, ':edit') : navMatch?.perm;
  const denied = needed && !can(needed) ? navMatch : null;

  const go = (path: string) => { nav(path); if (mobile) setOpen(false); setRailMenu(null); };
  const isActive = (p: string) => (p === '/' ? loc.pathname === '/' : loc.pathname === p || (loc.pathname.startsWith(p + '/') && !NAV.some((s) => s.items.some((i) => i.path !== p && i.path.startsWith(p) && loc.pathname.startsWith(i.path)))));
  const creatable = CREATE.filter((c) => can(c.perm));
  const primaryCreate = can('sales:create') ? CREATE[0] : can('sales_orders:create') ? CREATE[1] : null;

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: SIDEBAR_BG, color: '#cfdbe6' }}>
      <Box sx={{ px: collapsed ? 1.5 : 2, py: 1.75, display: 'flex', alignItems: 'center', gap: 1.25, minHeight: 64 }}>
        <Box sx={{ width: 36, height: 36, borderRadius: 2, flexShrink: 0, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 17, color: '#0b2a40', background: 'linear-gradient(135deg, #7fe0c2, #5cc8a8)' }}>M</Box>
        {!collapsed && (
          <Box sx={{ minWidth: 0 }}>
            <Typography fontWeight={800} fontSize={15.5} color="#fff" letterSpacing={-0.2} lineHeight={1.2}>MedMek <Box component="span" sx={{ color: '#5cc8a8' }}>Wholesale</Box></Typography>
            <Typography fontSize={11} color="#8fa7bb" noWrap>{business?.name}</Typography>
          </Box>
        )}
      </Box>
      {primaryCreate && (
        <Box sx={{ px: collapsed ? 1.25 : 1.5, pb: 1.5 }}>
          {collapsed ? (
            <Tooltip title={`New ${primaryCreate.label.toLowerCase()}${primaryCreate.key ? ` (${primaryCreate.key})` : ''}`} placement="right">
              <IconButton onClick={() => go(primaryCreate.path)} sx={{ width: 44, height: 40, bgcolor: '#5cc8a8', color: '#0b2a40', '&:hover': { bgcolor: '#7fe0c2' } }}><AddIcon /></IconButton>
            </Tooltip>
          ) : (
            <Button fullWidth startIcon={<AddIcon />} onClick={() => go(primaryCreate.path)}
              sx={{ bgcolor: '#5cc8a8', color: '#0b2a40', fontWeight: 700, justifyContent: 'flex-start', '&:hover': { bgcolor: '#7fe0c2' } }}>
              New {primaryCreate.label.toLowerCase()}
              {primaryCreate.key && <Box component="span" sx={{ ml: 'auto', fontSize: 11, opacity: 0.7 }}>{primaryCreate.key}</Box>}
            </Button>
          )}
        </Box>
      )}
      <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
      <List dense sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', py: 1 }}>
        {NAV.map((s) => {
          const items = s.items.filter((i) => !i.perm || can(i.perm));
          if (!items.length) return null;
          const single = items.length === 1 && s.items.length === 1;
          const sectionActive = items.some((i) => isActive(i.path));
          if (collapsed) {
            return (
              <Tooltip key={s.label} title={s.label} placement="right">
                <ListItemButton selected={sectionActive} onClick={(e) => (single ? go(items[0].path) : setRailMenu({ el: e.currentTarget, label: s.label }))}
                  sx={{ ...navSx, justifyContent: 'center', py: 1.1, mx: 1.25 }}>
                  <ListItemIcon sx={{ minWidth: 0, color: 'inherit' }}>{s.icon}</ListItemIcon>
                </ListItemButton>
              </Tooltip>
            );
          }
          if (single) {
            const i = items[0];
            return (
              <ListItemButton key={s.label} onClick={() => go(i.path)} selected={isActive(i.path)} sx={navSx}>
                <ListItemIcon sx={{ minWidth: 34, color: 'inherit' }}>{s.icon}</ListItemIcon>
                <ListItemText primary={s.label} primaryTypographyProps={{ fontSize: 13.5, fontWeight: 600 }} />
              </ListItemButton>
            );
          }
          const isOpen = expanded[s.label];
          return (
            <React.Fragment key={s.label}>
              <ListItemButton onClick={() => setExpanded((e) => ({ ...e, [s.label]: !e[s.label] }))} sx={{ ...navSx, color: sectionActive ? '#fff' : navSx.color }}>
                <ListItemIcon sx={{ minWidth: 34, color: sectionActive ? '#5cc8a8' : 'inherit' }}>{s.icon}</ListItemIcon>
                <ListItemText primary={s.label} primaryTypographyProps={{ fontSize: 13.5, fontWeight: 600 }} />
                {isOpen ? <ExpandLess fontSize="small" sx={{ opacity: 0.6 }} /> : <ExpandMore fontSize="small" sx={{ opacity: 0.6 }} />}
              </ListItemButton>
              <Collapse in={isOpen}>
                <Box sx={{ ml: 3.4, pl: 1, borderLeft: '1px solid rgba(255,255,255,0.1)', mb: 0.5 }}>
                  {items.map((i) => (
                    <ListItemButton key={i.path} onClick={() => go(i.path)} selected={isActive(i.path)} sx={{ ...navSx, mx: 0.5, py: 0.45 }}>
                      <ListItemText primary={i.label} primaryTypographyProps={{ fontSize: 13 }} />
                      {i.hotkey && <Typography fontSize={10} color="#7f97ab">{i.hotkey}</Typography>}
                    </ListItemButton>
                  ))}
                </Box>
              </Collapse>
            </React.Fragment>
          );
        })}
      </List>
      {!mobile && (
        <Box sx={{ p: 1, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <Tooltip title={collapsed ? 'Expand menu' : ''} placement="right">
            <ListItemButton onClick={toggleRail} sx={{ ...navSx, justifyContent: collapsed ? 'center' : 'flex-start', mx: 0.5 }}>
              <ListItemIcon sx={{ minWidth: collapsed ? 0 : 34, color: 'inherit' }}>{collapsed ? <KeyboardDoubleArrowRightIcon fontSize="small" /> : <KeyboardDoubleArrowLeftIcon fontSize="small" />}</ListItemIcon>
              {!collapsed && <ListItemText primary="Collapse menu" primaryTypographyProps={{ fontSize: 12.5 }} />}
            </ListItemButton>
          </Tooltip>
        </Box>
      )}
    </Box>
  );

  const railItems = railMenu ? NAV.find((s) => s.label === railMenu.label)?.items.filter((i) => !i.perm || can(i.perm)) || [] : [];
  const width = collapsed ? RAIL : WIDTH;

  // Phone: bottom bar with the screens a person uses most for their role.
  const bottom = [
    { label: 'Home', path: '/', icon: <DashboardOutlined />, show: true },
    can('sales:view') ? { label: 'Bills', path: '/sales', icon: <ReceiptLongOutlined />, show: true } : { label: 'Orders', path: '/sales-orders', icon: <AssignmentOutlined />, show: can('sales_orders:view') },
    { label: 'New', path: '__new', icon: <AddIcon />, show: creatable.length > 0 },
    { label: 'Customers', path: '/customers', icon: <PeopleAltOutlined />, show: can('parties:view') },
    { label: 'Menu', path: '__menu', icon: <MenuIcon />, show: true },
  ].filter((b) => b.show);
  const bottomValue = bottom.find((b) => b.path !== '__new' && b.path !== '__menu' && isActive(b.path))?.path ?? false;

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Drawer
        className="no-print"
        variant={mobile ? 'temporary' : 'permanent'}
        open={mobile ? open : true}
        onClose={() => setOpen(false)}
        sx={{
          width: mobile ? undefined : width, flexShrink: 0, transition: 'width .18s',
          '& .MuiDrawer-paper': { width: mobile ? WIDTH : width, boxSizing: 'border-box', transition: 'width .18s', overflowX: 'hidden' },
        }}
      >
        {drawer}
      </Drawer>
      <Menu anchorEl={railMenu?.el} open={!!railMenu} onClose={() => setRailMenu(null)} anchorOrigin={{ vertical: 'top', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'left' }}>
        <ListSubheader sx={{ lineHeight: '32px', fontWeight: 700 }}>{railMenu?.label}</ListSubheader>
        {railItems.map((i) => (
          <MenuItem key={i.path} selected={isActive(i.path)} onClick={() => go(i.path)}>
            <ListItemText primary={i.label} primaryTypographyProps={{ fontSize: 13.5 }} />
            {i.hotkey && <Typography fontSize={11} color="text.secondary" sx={{ ml: 2 }}>{i.hotkey}</Typography>}
          </MenuItem>
        ))}
      </Menu>

      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Toolbar className="no-print" sx={{ minHeight: '56px !important', bgcolor: alpha('#ffffff', 0.92), backdropFilter: 'blur(8px)', borderBottom: 1, borderColor: 'divider', gap: 1, position: 'sticky', top: 0, zIndex: 10, px: { xs: 1, sm: 2 } }}>
          {mobile && <IconButton onClick={() => setOpen(true)} aria-label="Open menu"><MenuIcon /></IconButton>}
          <Button onClick={() => setSearch(true)} startIcon={<SearchIcon />} variant="outlined" color="inherit"
            sx={{ color: 'text.secondary', borderColor: 'divider', bgcolor: '#f7f9fc', justifyContent: 'flex-start', flex: { xs: 1, sm: 'none' }, width: { sm: 300, md: 380 }, fontWeight: 400, '&:hover': { bgcolor: '#fff' } }}>
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{phone ? 'Search…' : 'Search products, parties, bills…'}</Box>
            {!phone && <Box component="span" sx={{ ml: 'auto', pl: 1 }}><Kbd>Ctrl K</Kbd></Box>}
          </Button>
          <Box sx={{ flex: { xs: 0, sm: 1 } }} />
          {creatable.length > 0 && !phone && (
            <Button variant="contained" startIcon={<AddIcon />} endIcon={<ExpandMore />} onClick={(e) => setCreateMenu(e.currentTarget)}>New</Button>
          )}
          {!phone && (
            <Tooltip title="Help — meanings of words & shortcuts (?)">
              <IconButton onClick={() => setHelp(true)} aria-label="Help"><HelpOutlineIcon fontSize="small" /></IconButton>
            </Tooltip>
          )}
          {!phone && <Chip label={fyLabel(business?.fyStartMonth)} variant="outlined" sx={{ fontWeight: 600 }} />}
          <Button onClick={(e) => setMenu(e.currentTarget)} color="inherit" sx={{ pl: 0.5, pr: { xs: 0.5, md: 1 }, minWidth: 0, gap: 1 }}>
            <Avatar sx={{ width: 30, height: 30, fontSize: 13, fontWeight: 700, bgcolor: 'primary.main' }}>{user?.name?.[0]}</Avatar>
            <Box sx={{ display: { xs: 'none', md: 'block' }, textAlign: 'left', lineHeight: 1.1 }}>
              <Typography fontSize={12.5} fontWeight={600} lineHeight={1.2}>{user?.name}</Typography>
              <Typography fontSize={11} color="text.secondary" lineHeight={1.2} textTransform="capitalize">{user?.role}</Typography>
            </Box>
          </Button>
          <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
            <Box sx={{ px: 2, py: 1 }}>
              <Typography fontSize={13.5} fontWeight={700}>{user?.name}</Typography>
              <Typography fontSize={12} color="text.secondary" textTransform="capitalize">{user?.role} · {business?.name}</Typography>
            </Box>
            <Divider sx={{ my: 0.5 }} />
            <MenuItem onClick={() => { setMenu(null); nav('/profile'); }}><ListItemIcon><LockResetIcon fontSize="small" /></ListItemIcon>Change password</MenuItem>
            <MenuItem onClick={logout}><ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>Sign out</MenuItem>
          </Menu>
          <Menu anchorEl={createMenu} open={!!createMenu} onClose={() => setCreateMenu(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{ paper: { sx: { minWidth: 260 } } }}>
            {[...new Set(creatable.map((c) => c.group))].map((g) => [
              <ListSubheader key={g} sx={{ lineHeight: '28px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>{g}</ListSubheader>,
              ...creatable.filter((c) => c.group === g).map((c) => (
                <MenuItem key={c.path} onClick={() => { setCreateMenu(null); setTimeout(() => nav(c.path), 0); }}>
                  <ListItemText primary={c.label} primaryTypographyProps={{ fontSize: 13.5 }} />
                  {c.key && <Box sx={{ ml: 2 }}><Kbd>{c.key}</Kbd></Box>}
                </MenuItem>
              )),
            ])}
          </Menu>
        </Toolbar>
        <Box component="main" sx={{ p: { xs: 1.5, md: 2.5 }, pb: { xs: 10, sm: 2.5 }, flex: 1, minWidth: 0, maxWidth: 1680, width: '100%', mx: 'auto' }}>
          {denied ? (
            <Paper sx={{ py: 8, px: 3, textAlign: 'center', maxWidth: 520, mx: 'auto', mt: 4 }}>
              <LockResetIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
              <Typography variant="h6" mt={1}>You don't have access to {denied.label}</Typography>
              <Typography color="text.secondary" fontSize={13} mt={0.5}>Ask the owner or an admin to change your role in Settings → Users.</Typography>
              <Button sx={{ mt: 2 }} variant="outlined" onClick={() => nav('/')}>Go to dashboard</Button>
            </Paper>
          ) : <Outlet />}
        </Box>
      </Box>

      {phone && (
        <Paper className="no-print" sx={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 9, borderRadius: 0, borderWidth: '1px 0 0', boxShadow: '0 -4px 16px rgba(16,24,40,0.08)', display: hideBottomOn(loc.pathname) ? 'none' : 'block' }}>
          <BottomNavigation showLabels value={bottomValue} sx={{ height: 60 }}
            onChange={(e, v) => {
              if (v === '__menu') setOpen(true);
              else if (v === '__new') setCreateMenu(e.currentTarget as HTMLElement);
              else nav(v);
            }}>
            {bottom.map((b) => <BottomNavigationAction key={b.path} value={b.path} label={b.label} icon={b.icon} sx={{ minWidth: 0, '&.Mui-selected': { color: 'primary.main' } }} />)}
          </BottomNavigation>
        </Paper>
      )}

      <GlobalSearch open={search} onClose={() => setSearch(false)} />
      <HelpDialog open={help} tab={helpTab} search={helpSearch} onTab={setHelpTab} onSearch={setHelpSearch} onClose={() => setHelp(false)} />
      <PrintHost />
    </Box>
  );
};

// Entry screens have their own sticky save bar on phones.
const hideBottomOn = (p: string) => /\/(new|edit)$/.test(p) || /^\/(sales-orders|purchase-orders)\/[^/]+$/.test(p);

const navSx = {
  mx: 1, my: 0.15, borderRadius: 2, color: '#cfdbe6',
  '&.Mui-selected': { bgcolor: 'rgba(92,200,168,0.16)', color: '#fff', boxShadow: 'inset 3px 0 0 #5cc8a8' },
  '&.Mui-selected:hover': { bgcolor: 'rgba(92,200,168,0.22)' },
  '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' },
};
