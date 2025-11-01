// src/app/src/pages/eval/diff/components/ResultsTable.tsx
import * as React from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Paper from '@mui/material/Paper';
import type { Row } from '../lib/types';

type Props = {
  rows: Row[];
  onSelect?: (key: string) => void;
};

function statusColor(status: Row['status']) {
  switch (status) {
    case 'improved':
      return 'success';
    case 'regressed':
      return 'error';
    case 'changed':
      return 'default';
    case 'added':
      return 'info';
    case 'removed':
      return 'warning';
    case 'same':
    default:
      return 'default';
  }
}

function toSigned(n?: number | null) {
  if (n == null) return '';
  const v = Math.abs(n) < 1 ? n.toFixed(3) : n.toFixed(2);
  return n > 0 ? `+${v}` : v;
}

function preview(text?: string) {
  if (!text) return '';
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > 120 ? `${t.slice(0, 117)}…` : t;
}

export function ResultsTable({ rows, onSelect }: Props) {
  return (
    <TableContainer
      component={Paper}
      variant="outlined"
      sx={{
        '& tbody tr:nth-of-type(odd)': { backgroundColor: 'action.hover' },
        '& td, & th': { borderBottomColor: 'divider' },
      }}
    >
      <Table size="small" aria-label="diff-results" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: 24 }} />
            <TableCell sx={{ minWidth: 260 }}>Test</TableCell>
            <TableCell sx={{ width: 120 }}>Status</TableCell>
            <TableCell align="right" sx={{ width: 90 }}>Pass Δ</TableCell>
            <TableCell align="right" sx={{ width: 110 }}>Score Δ</TableCell>
            <TableCell>Preview</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => {
            // Prefer fields that may already be computed by the hook
            const passDelta: number | null =
              typeof (r as any).passDelta === 'number'
                ? (r as any).passDelta
                : r.baseline?.pass === r.current?.pass
                ? 0
                : r.baseline?.pass
                ? -1
                : r.current?.pass
                ? +1
                : 0;

            const baseScore = typeof r.baseline?.score === 'number' ? (r.baseline!.score as number) : null;
            const currScore = typeof r.current?.score === 'number' ? (r.current!.score as number) : null;
            const scoreDelta: number | null =
              typeof (r as any).scoreDelta === 'number'
                ? (r as any).scoreDelta
                : baseScore != null && currScore != null
                ? currScore - baseScore
                : null;

            const chipColor = statusColor(r.status);

            return (
              <TableRow
                key={r.key}
                hover
                sx={{ cursor: onSelect ? 'pointer' : 'default', height: 44 }}
                onClick={() => onSelect?.(r.key)}
              >
                <TableCell />
                <TableCell>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    <Box sx={{ fontWeight: 500 }}>{r.name ?? r.key}</Box>
                    {r.tags && r.tags.length > 0 && (
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {r.tags.slice(0, 4).map((t) => (
                          <Chip key={t} size="small" variant="outlined" label={t} />
                        ))}
                        {r.tags.length > 4 && (
                          <Chip size="small" variant="outlined" label={`+${r.tags.length - 4}`} />
                        )}
                      </Box>
                    )}
                  </Box>
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    color={chipColor as any}
                    label={r.status === 'same' ? 'unchanged' : r.status}
                  />
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  {passDelta === 0 ? '' : passDelta! > 0 ? '+1' : '-1'}
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  {scoreDelta == null ? '' : toSigned(scoreDelta)}
                </TableCell>
                <TableCell>
                  <Tooltip
                    title={
                      (r.current?.output ?? r.baseline?.output ?? '').slice(0, 2000) ||
                      'No output available'
                    }
                    arrow
                    placement="top"
                  >
                    <span>{preview(r.current?.output ?? r.baseline?.output)}</span>
                  </Tooltip>
                </TableCell>
              </TableRow>
            );
          })}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} align="center" sx={{ color: 'text.secondary' }}>
                No rows to display.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default ResultsTable;