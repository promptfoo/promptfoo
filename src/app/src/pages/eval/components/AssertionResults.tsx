import { useState } from 'react';
import Box from '@mui/material/Box';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import type { GradingResult } from './types';
import { ellipsize } from './utils';

export function AssertionResults({ gradingResults }: { gradingResults?: GradingResult[] }) {
  const [expandedValues, setExpandedValues] = useState<Set<number>>(new Set());

  if (!gradingResults) {
    return null;
  }

  const hasMetrics = gradingResults.some((result) => result?.assertion?.metric);

  const toggleExpand = (index: number) => {
    setExpandedValues((prev) => {
      const newSet = new Set(prev);
      newSet.add(index);
      return newSet;
    });
  };

  return (
    <Box mt={2}>
      <Typography variant="subtitle1">Assertions</Typography>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              {hasMetrics && <TableCell sx={{ fontWeight: 'bold' }}>Metric</TableCell>}
              <TableCell sx={{ fontWeight: 'bold' }}>Pass</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Score</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Type</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Value</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Reason</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {gradingResults.map((result, i) => {
              if (!result) {
                return null;
              }
              const value = result.assertion?.value
                ? typeof result.assertion.value === 'object'
                  ? JSON.stringify(result.assertion.value, null, 2)
                  : String(result.assertion.value)
                : '-';
              const isExpanded = expandedValues.has(i);
              const displayValue = isExpanded ? value : ellipsize(value, 300);

              return (
                <TableRow key={i} sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                  {hasMetrics && <TableCell>{result.assertion?.metric || ''}</TableCell>}
                  <TableCell>{result.pass ? '✅' : '❌'}</TableCell>
                  <TableCell>{result.score?.toFixed(2)}</TableCell>
                  <TableCell>{result.assertion?.type || ''}</TableCell>
                  <TableCell
                    onClick={() => toggleExpand(i)}
                    sx={{
                      whiteSpace: 'pre-wrap',
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                      transition: 'all 0.2s',
                    }}
                  >
                    {displayValue}
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'pre-wrap' }}>{result.reason}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
