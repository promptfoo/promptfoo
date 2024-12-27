import { useState } from 'react';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { ellipsize } from './utils';

interface MetadataTableProps {
  metadata: Record<string, any>;
}

export function MetadataTable({ metadata }: MetadataTableProps) {
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());
  const [clickTimer, setClickTimer] = useState<NodeJS.Timeout | null>(null);

  const handleClick = (key: string) => {
    if (clickTimer) {
      // Double click detected
      clearTimeout(clickTimer);
      setClickTimer(null);
      if (expandedFields.has(key)) {
        setExpandedFields((prev) => {
          const newSet = new Set(prev);
          newSet.delete(key);
          return newSet;
        });
      }
    } else {
      // Set timer for potential second click
      setClickTimer(
        setTimeout(() => {
          // Single click action
          setClickTimer(null);
          if (!expandedFields.has(key)) {
            setExpandedFields((prev) => {
              const newSet = new Set(prev);
              newSet.add(key);
              return newSet;
            });
          }
        }, 250), // 250ms delay
      );
    }
  };

  const renderValue = (key: string, value: any) => {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    const isExpanded = expandedFields.has(key);
    const displayValue = isExpanded ? stringValue : ellipsize(stringValue, 300);

    return <span style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{displayValue}</span>;
  };

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>
              <strong>Key</strong>
            </TableCell>
            <TableCell>
              <strong>Value</strong>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {Object.entries(metadata).map(([key, value]) => (
            <TableRow key={key} sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
              <TableCell>{key}</TableCell>
              <TableCell
                onClick={() => handleClick(key)}
                sx={{
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  userSelect: 'none',
                }}
              >
                {renderValue(key, value)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
