import { alpha, createTheme } from '@mui/material/styles';

// Desk-first theme: distributors bill on desktops all day, so rows stay
// compact, but controls share one height, focus is always visible (keyboard
// billing) and status colours are soft tints rather than loud blocks.

const BRAND = '#0f5c8c';
const BORDER = '#e3e8ef';
const INK = '#14212e';
const MUTED = '#5b6b7c';

const theme = createTheme({
  palette: {
    primary: { main: BRAND, dark: '#0b4468', light: '#3a86b8', contrastText: '#fff' },
    secondary: { main: '#0d8a6a' },
    success: { main: '#1e8e3e', dark: '#17703a', light: '#e6f4ea' },
    warning: { main: '#c77700', dark: '#9a5b00', light: '#fff4e0' },
    error: { main: '#d32f2f', dark: '#a61f1f', light: '#fdecec' },
    info: { main: '#0277bd', dark: '#01579b', light: '#e3f2fd' },
    background: { default: '#f4f6fa', paper: '#ffffff' },
    divider: BORDER,
    text: { primary: INK, secondary: MUTED },
    action: { hover: 'rgba(15,92,140,0.05)', selected: 'rgba(15,92,140,0.10)' },
  },
  typography: {
    fontFamily: '"Inter", "Segoe UI", Roboto, Arial, sans-serif',
    fontSize: 13,
    h4: { fontWeight: 700, letterSpacing: -0.4 },
    h5: { fontWeight: 700, fontSize: '1.35rem', letterSpacing: -0.3 },
    h6: { fontWeight: 650, fontSize: '1.05rem', letterSpacing: -0.1 },
    subtitle1: { fontWeight: 600 },
    subtitle2: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600, letterSpacing: 0 },
    caption: { lineHeight: 1.45 },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { WebkitFontSmoothing: 'antialiased' },
        '*::-webkit-scrollbar': { width: 10, height: 10 },
        '*::-webkit-scrollbar-thumb': { background: '#c9d3de', borderRadius: 8, border: '2px solid transparent', backgroundClip: 'padding-box' },
        '*::-webkit-scrollbar-thumb:hover': { background: '#a9b7c6', backgroundClip: 'padding-box' },
        '*::-webkit-scrollbar-track': { background: 'transparent' },
      },
    },

    // ---- buttons: one height (36px) that lines up with inputs (38px) ----
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 8, minHeight: 36, paddingInline: 14, whiteSpace: 'nowrap' },
        sizeSmall: { minHeight: 30, paddingInline: 10, fontSize: 12.5 },
        sizeLarge: { minHeight: 44, fontSize: 15 },
        outlined: { borderColor: '#cfd8e3', '&:hover': { borderColor: BRAND, background: alpha(BRAND, 0.04) } },
        contained: { '&:hover': { boxShadow: `0 2px 8px ${alpha(BRAND, 0.25)}` } },
      },
    },
    MuiIconButton: {
      defaultProps: { size: 'small' },
      styleOverrides: { root: { borderRadius: 8 } },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          textTransform: 'none', fontWeight: 600, borderColor: '#cfd8e3', color: MUTED,
          '&.Mui-selected': { color: BRAND, background: alpha(BRAND, 0.1), '&:hover': { background: alpha(BRAND, 0.15) } },
        },
      },
    },

    // ---- inputs: white, clear border, strong focus ring ----
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiFormControl: { defaultProps: { size: 'small' } },
    MuiSelect: { defaultProps: { size: 'small' } },
    MuiAutocomplete: {
      defaultProps: { size: 'small' },
      styleOverrides: {
        paper: { borderRadius: 10, boxShadow: '0 10px 30px rgba(16,24,40,0.14)', border: `1px solid ${BORDER}` },
        listbox: {
          padding: 4,
          '& .MuiAutocomplete-option': { borderRadius: 6, minHeight: 36 },
          '& .MuiAutocomplete-option.Mui-focused': { background: alpha(BRAND, 0.08) },
          '& .MuiAutocomplete-option[aria-selected="true"]': { background: alpha(BRAND, 0.12) },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          background: '#fff',
          '& .MuiOutlinedInput-notchedOutline': { borderColor: '#d3dbe5' },
          '&:hover:not(.Mui-disabled) .MuiOutlinedInput-notchedOutline': { borderColor: '#9fb0c2' },
          '&.Mui-focused': { boxShadow: `0 0 0 3px ${alpha(BRAND, 0.14)}` },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderWidth: 1.5 },
          '&.Mui-error.Mui-focused': { boxShadow: '0 0 0 3px rgba(211,47,47,0.14)' },
          '&.Mui-disabled': { background: '#f6f8fa' },
        },
      },
    },
    MuiInputLabel: { styleOverrides: { root: { color: MUTED } } },
    MuiFormHelperText: { styleOverrides: { root: { marginLeft: 2, marginTop: 3 } } },

    // ---- chips: soft tints, readable text ----
    MuiChip: {
      defaultProps: { size: 'small' },
      styleOverrides: {
        root: ({ ownerState, theme: t }) => {
          const c = ownerState.color && ownerState.color !== 'default' ? t.palette[ownerState.color] : null;
          if (ownerState.variant === 'outlined') {
            return { fontWeight: 500, ...(c ? { borderColor: alpha(c.main, 0.45), color: c.dark } : { borderColor: '#cfd8e3' }) };
          }
          return {
            fontWeight: 600,
            ...(c
              ? { background: alpha(c.main, 0.12), color: c.dark, '&.MuiChip-clickable:hover': { background: alpha(c.main, 0.2) } }
              : { background: '#eef2f6', color: '#3b4a5a' }),
          };
        },
      },
    },

    // ---- tables ----
    MuiTable: { defaultProps: { size: 'small' } },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 600, background: '#f7f9fc', color: '#4a5a6b', whiteSpace: 'nowrap',
          fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: `1px solid ${BORDER}`,
        },
        // Tabular digits so amounts line up in columns.
        root: { borderColor: '#eef1f5', padding: '7px 10px', fontFeatureSettings: '"tnum" 1' },
        footer: { fontSize: 13 },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&.MuiTableRow-hover:hover': { backgroundColor: alpha(BRAND, 0.035) },
          '&.Mui-selected, &.Mui-selected:hover': { backgroundColor: alpha(BRAND, 0.09) },
        },
      },
    },
    MuiTablePagination: { styleOverrides: { root: { borderTop: `1px solid ${BORDER}` }, toolbar: { minHeight: 48 } } },

    // ---- surfaces ----
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { border: `1px solid ${BORDER}`, backgroundImage: 'none' },
        rounded: { borderRadius: 12 },
      },
    },
    MuiCard: { styleOverrides: { root: { borderRadius: 12 } } },
    MuiAppBar: { styleOverrides: { root: { border: 'none' } } },
    MuiDrawer: { styleOverrides: { paper: { border: 'none' } } },
    MuiDialog: { styleOverrides: { paper: { border: 'none', borderRadius: 14, boxShadow: '0 24px 60px rgba(16,24,40,0.25)' } } },
    MuiDialogTitle: { styleOverrides: { root: { fontWeight: 700, fontSize: 17, paddingBottom: 8 } } },
    MuiDialogActions: { styleOverrides: { root: { padding: '12px 20px 16px', gap: 4 } } },
    MuiMenu: { styleOverrides: { paper: { border: `1px solid ${BORDER}`, borderRadius: 10, boxShadow: '0 10px 30px rgba(16,24,40,0.14)' } } },
    MuiMenuItem: { styleOverrides: { root: { minHeight: 36, borderRadius: 6, marginInline: 4 } } },
    MuiPopover: { styleOverrides: { paper: { borderRadius: 10 } } },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 10, alignItems: 'center' },
        standardInfo: { background: '#eef6fc', color: '#0b4468' },
        standardWarning: { background: '#fff6e5', color: '#7a4a00' },
        standardError: { background: '#fdeeee', color: '#8c1d1d' },
        standardSuccess: { background: '#eaf6ee', color: '#155c2e' },
      },
    },
    MuiTooltip: {
      defaultProps: { arrow: true, enterDelay: 300 },
      styleOverrides: { tooltip: { fontSize: 12, background: '#1c2b39', padding: '6px 10px', borderRadius: 6 }, arrow: { color: '#1c2b39' } },
    },
    MuiTabs: {
      styleOverrides: {
        root: { minHeight: 44 },
        indicator: { height: 3, borderRadius: '3px 3px 0 0' },
      },
    },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600, minHeight: 44, fontSize: 13.5 } } },
    MuiLinearProgress: { styleOverrides: { root: { borderRadius: 4 } } },
    MuiBreadcrumbs: { styleOverrides: { separator: { marginInline: 6 } } },
    MuiSwitch: { styleOverrides: { switchBase: { '&.Mui-checked + .MuiSwitch-track': { opacity: 0.7 } } } },
  },
});

export default theme;
