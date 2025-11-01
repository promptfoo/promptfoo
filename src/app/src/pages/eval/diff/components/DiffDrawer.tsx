// src/pages/eval/diff/components/DiffDrawer.tsx
import * as React from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import type { Row } from '../lib/types';
import { DiffMatchPatch } from './InlineDiff';

// Inline detail panel showing before/after outputs and unified diff
export function DiffDrawer({ row, onClose }: { row?: Row; onClose: () => void }) {
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (row && panelRef.current) {
      panelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [row]);

  const open = !!row; // render only when a row is selected
  if (!open) return null;

  // Safely compute before/after text
  const before = row?.baseline?.output ?? '';
  const after = row?.current?.output ?? '';

  // Deltas (defensive if fields are missing)
  const passDelta =
    row?.baseline?.pass === row?.current?.pass
      ? 0
      : row?.baseline?.pass
      ? -1
      : row?.current?.pass
      ? +1
      : 0;

  const baseScore = typeof row?.baseline?.score === 'number' ? (row!.baseline!.score as number) : null;
  const currScore = typeof row?.current?.score === 'number' ? (row!.current!.score as number) : null;
  const scoreDelta = baseScore != null && currScore != null ? currScore - baseScore : null;

  const toSigned = (n: number) => (Math.abs(n) < 1 ? n.toFixed(3) : n.toFixed(2)).replace(/^(-?)0\./, '$1.');

  const statusColor = (s: Row['status']) =>
    s === 'improved' ? 'success' : s === 'regressed' ? 'error' : s === 'added' ? 'info' : s === 'removed' ? 'warning' : 'default';

  return (
    <Collapse in={open} appear timeout={220} unmountOnExit>
      <Paper
        ref={panelRef}
        variant="outlined"
        sx={{ mt: 2, borderRadius: 2, overflow: 'hidden', bgcolor: 'background.paper' }}
        aria-label="diff detail panel"
      >
        {/* Header */}
        <Box
          sx={{
            px: 2,
            py: 1.25,
            borderBottom: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            background: (theme) => theme.palette.mode === 'light' ? '#fafafa' : 'rgba(255,255,255,0.04)',
          }}
        >
          <Typography variant="subtitle1" noWrap sx={{ fontWeight: 600 }}>
            {row?.name ?? row?.key}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ ml: 1 }}>
            <Chip
              size="small"
              label={row!.status === 'same' ? 'unchanged' : row!.status}
              color={statusColor(row!.status) as any}
            />
            <Chip
              size="small"
              color={passDelta > 0 ? 'success' : passDelta < 0 ? 'error' : 'default'}
              label={`Pass Δ: ${passDelta === 0 ? '—' : passDelta > 0 ? '+1' : '-1'}`}
            />
            <Chip
              size="small"
              color={scoreDelta != null ? (scoreDelta > 0 ? 'success' : scoreDelta < 0 ? 'error' : 'default') : 'default'}
              label={`Score Δ: ${scoreDelta == null ? '—' : (scoreDelta > 0 ? '+' : '') + toSigned(scoreDelta)}`}
            />
          </Stack>
          <Box sx={{ ml: 'auto' }} />
          <Tooltip title="Close">
            <IconButton size="small" onClick={onClose} aria-label="Close diff panel">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Content */}
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          {/* Baseline */}
          <Paper variant="outlined" sx={{ p: 1.5, minHeight: 140, maxHeight: '36vh', overflow: 'auto' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Baseline
            </Typography>
            <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', m: 0 }}>
              {before}
            </Typography>
            <Divider sx={{ my: 1 }} />
            <Stack direction="row" spacing={1}>
              <Chip size="small" variant="outlined" label={`pass: ${String(row?.baseline?.pass ?? '—')}`} />
              <Chip size="small" variant="outlined" label={`score: ${row?.baseline?.score ?? '—'}`} />
            </Stack>
          </Paper>

          {/* Current */}
          <Paper variant="outlined" sx={{ p: 1.5, minHeight: 140, maxHeight: '36vh', overflow: 'auto' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Current
            </Typography>
            <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', m: 0 }}>
              {after}
            </Typography>
            <Divider sx={{ my: 1 }} />
            <Stack direction="row" spacing={1}>
              <Chip size="small" variant="outlined" label={`pass: ${String(row?.current?.pass ?? '—')}`} />
              <Chip size="small" variant="outlined" label={`score: ${row?.current?.score ?? '—'}`} />
            </Stack>
          </Paper>
        </Box>

        {/* Unified inline diff */}
        <Box sx={{ px: 2, pb: 2 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Unified diff
          </Typography>
          <Paper variant="outlined" sx={{ p: 1.5, maxHeight: '36vh', overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
            {before === after ? (
              <Typography variant="body2" sx={{ color: 'text.secondary', m: 0 }}>
                No textual change.
              </Typography>
            ) : (
              <Box component="pre" sx={{ m: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                <Box component="div" sx={{ color: 'error.main' }}>- {before}</Box>
                <Box component="div" sx={{ color: 'success.main' }}>+ {after}</Box>
              </Box>
            )}
          </Paper>
        </Box>
      </Paper>
    </Collapse>
  );
}