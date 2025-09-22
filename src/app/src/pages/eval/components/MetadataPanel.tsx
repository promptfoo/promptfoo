import CheckIcon from '@mui/icons-material/Check';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import { ellipsize } from '../../../../../util/text';

const isValidUrl = (str: string): boolean => {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
};

export interface ExpandedMetadataState {
  [key: string]: {
    expanded: boolean;
    lastClickTime: number;
  };
}

interface MetadataPanelProps {
  metadata?: Record<string, any>;
  expandedMetadata: ExpandedMetadataState;
  copiedFields: Record<string, boolean>;
  onMetadataClick: (key: string) => void;
  onCopy: (key: string, text: string) => void;
  onApplyFilter: (field: string, value: string, operator?: 'equals' | 'contains') => void;
}

export function MetadataPanel({
  metadata,
  expandedMetadata,
  copiedFields,
  onMetadataClick,
  onCopy,
  onApplyFilter,
}: MetadataPanelProps) {
  if (!metadata || Object.keys(metadata).filter((key) => key !== 'citations').length === 0) {
    return null;
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>
              <strong>Key</strong>
            </TableCell>
            <TableCell>
              <strong>Value</strong>
            </TableCell>
            <TableCell width={80} />
          </TableRow>
        </TableHead>
        <TableBody>
          {Object.entries(metadata).map(([key, value]) => {
            // Skip citations in metadata display as they're shown in their own component
            if (key === 'citations') {
              return null;
            }

            const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
            const truncatedValue = ellipsize(stringValue, 300);
            const isUrl = typeof value === 'string' && isValidUrl(value);

            return (
              <TableRow key={key}>
                <TableCell>{key}</TableCell>
                <TableCell
                  style={{
                    whiteSpace: 'pre-wrap',
                    cursor: isUrl ? 'auto' : 'pointer',
                  }}
                  onClick={() => !isUrl && onMetadataClick(key)}
                >
                  {isUrl ? (
                    <Link href={value} target="_blank" rel="noopener noreferrer">
                      {expandedMetadata[key]?.expanded ? stringValue : truncatedValue}
                    </Link>
                  ) : expandedMetadata[key]?.expanded ? (
                    stringValue
                  ) : (
                    truncatedValue
                  )}
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <Tooltip title="Copy value">
                      <IconButton
                        size="small"
                        onClick={() => onCopy(key, stringValue)}
                        sx={{
                          color: 'text.disabled',
                          transition: 'color 0.2s ease',
                          '&:hover': {
                            color: 'text.secondary',
                          },
                        }}
                        aria-label={`Copy metadata value for ${key}`}
                      >
                        {copiedFields[key] ? (
                          <CheckIcon fontSize="small" />
                        ) : (
                          <ContentCopyIcon fontSize="small" />
                        )}
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Filter by value (replaces existing filters)">
                      <IconButton
                        size="small"
                        onClick={() => onApplyFilter(key, stringValue)}
                        sx={{
                          color: 'text.disabled',
                          transition: 'color 0.2s ease',
                          '&:hover': {
                            color: 'text.secondary',
                          },
                        }}
                        aria-label={`Filter by ${key}`}
                      >
                        <FilterAltIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
