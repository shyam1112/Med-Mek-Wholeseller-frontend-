import React from 'react';
import { Alert, Box, Button, Tooltip, Typography } from '@mui/material';
import CloudDoneOutlinedIcon from '@mui/icons-material/CloudDoneOutlined';
import CloudOffOutlinedIcon from '@mui/icons-material/CloudOffOutlined';
import SyncIcon from '@mui/icons-material/Sync';
import type { DraftApi } from '../lib/useDraft';

const when = (t: number) => new Date(t).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

// Restored / waiting draft messages for the top of an entry screen.
export const DraftBanner: React.FC<{ draft: DraftApi; label?: (d: unknown) => string; onDiscard: () => void; onOpen?: () => void }> = ({ draft, label, onDiscard, onOpen }) => (
  <>
    {draft.restored && (
      <Alert severity="info" sx={{ mb: 1.5 }} onClose={draft.dismissRestored}
        action={<Button color="inherit" size="small" onClick={onDiscard}>Discard & start new</Button>}>
        Your unsaved work is back, just as you left it{label ? ` (${label(draft.restored.data)})` : ''} — auto-saved {when(draft.restored.savedAt)}.
      </Alert>
    )}
    {draft.waiting && (
      <Alert severity="warning" sx={{ mb: 1.5 }}
        action={<>
          <Button color="inherit" size="small" onClick={() => { draft.openWaiting(); onOpen?.(); }}>Open it</Button>
          <Button color="inherit" size="small" onClick={draft.discardWaiting}>Discard it</Button>
        </>}>
        You have unsaved work from {when(draft.waiting.savedAt)}{label ? ` (${label(draft.waiting.data)})` : ''}. Opening it replaces what is on this screen.
      </Alert>
    )}
  </>
);

// Small "Draft saved" indicator for the page header.
export const DraftStatus: React.FC<{ draft: DraftApi }> = ({ draft }) => {
  const { status, lastSaved } = draft;
  if (status === 'idle') return null;
  const [icon, text, tip, color] =
    status === 'pending' ? [<SyncIcon key="i" sx={{ fontSize: 16 }} />, 'Saving draft…', 'Your entry is kept as you type.', 'text.secondary']
      : status === 'offline' ? [<CloudOffOutlinedIcon key="i" sx={{ fontSize: 16 }} />, 'Draft kept on this computer', 'Server not reachable — the draft is safe in this browser and will go up with your next change.', 'warning.dark']
        : [<CloudDoneOutlinedIcon key="i" sx={{ fontSize: 16 }} />, `Draft saved ${lastSaved ? new Date(lastSaved).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}`, 'Auto-saved. If you leave this screen, refresh or lose power, it comes back when you open this screen again. Press Save to make the real entry.', 'success.dark'];
  return (
    <Tooltip title={tip}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color, px: 0.5 }}>
        {icon}<Typography fontSize={12} color="inherit" noWrap>{text}</Typography>
      </Box>
    </Tooltip>
  );
};
