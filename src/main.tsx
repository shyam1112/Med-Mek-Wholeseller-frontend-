import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline, GlobalStyles } from '@mui/material';
import { SnackbarProvider } from 'notistack';
import theme from './theme';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import { ConfirmProvider } from './components/Dialogs';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <GlobalStyles styles={{
        '@media print': { '.no-print, .MuiDrawer-root, header': { display: 'none !important' }, main: { padding: '0 !important' }, body: { background: '#fff' } },
        'input[type=number]::-webkit-inner-spin-button': { WebkitAppearance: 'none', margin: 0 },
        'input[type=number]': { MozAppearance: 'textfield' },
      }} />
      <SnackbarProvider maxSnack={4} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} autoHideDuration={4000}>
        <AuthProvider>
          <ConfirmProvider>
            <App />
          </ConfirmProvider>
        </AuthProvider>
      </SnackbarProvider>
    </ThemeProvider>
  </React.StrictMode>
);
