import React, { createContext, useCallback, useContext, useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, TextField } from '@mui/material';

interface ConfirmOpts { title: string; message?: React.ReactNode; confirmText?: string; danger?: boolean; prompt?: string; promptRequired?: boolean }
type Resolver = (v: { ok: boolean; text: string }) => void;

const Ctx = createContext<(o: ConfirmOpts) => Promise<{ ok: boolean; text: string }>>(async () => ({ ok: false, text: '' }));

// `const confirm = useConfirm(); const { ok, text } = await confirm({ title, prompt: 'Reason' })`
export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const [text, setText] = useState('');
  const [resolver, setResolver] = useState<Resolver | null>(null);

  const confirm = useCallback((o: ConfirmOpts) => new Promise<{ ok: boolean; text: string }>((res) => {
    setText('');
    setOpts(o);
    setResolver(() => res);
  }), []);

  const close = (ok: boolean) => { resolver?.({ ok, text }); setOpts(null); };

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Dialog open={!!opts} onClose={() => close(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{opts?.title}</DialogTitle>
        <DialogContent>
          {opts?.message && <DialogContentText sx={{ mb: opts.prompt ? 2 : 0 }}>{opts.message}</DialogContentText>}
          {opts?.prompt && <TextField autoFocus fullWidth label={opts.prompt} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (!opts.promptRequired || text.trim())) close(true); }} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => close(false)}>Cancel</Button>
          <Button variant="contained" color={opts?.danger ? 'error' : 'primary'} disabled={!!opts?.promptRequired && !text.trim()} onClick={() => close(true)} autoFocus={!opts?.prompt}>
            {opts?.confirmText || 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </Ctx.Provider>
  );
};

export const useConfirm = () => useContext(Ctx);
