import CheckIcon from '@mui/icons-material/Check';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
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
import { makeCustomPolicyCloudUrl } from '@promptfoo/redteam/plugins/policy/utils';
import EmptyState from '@app/components/EmptyState';
import { hasDisplayableMetadata, isFilteredMetadataKey } from '@app/constants/metadata';
import { ellipsize } from '../../../../../util/text';
import useCloudConfig from '../../../hooks/useCloudConfig';

const isValidUrl = (str: string): boolean => {
  try {
    // Check for basic malformed patterns first
    if (str.includes(':/') && !str.includes('://')) {
      return false; // Malformed like 'http:/example.com'
    }

    const url = new URL(str);
    // Must have a valid protocol and hostname
    return url.protocol.length > 0 && url.hostname.length > 0;
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
  const { data: cloudConfig } = useCloudConfig();

  if (!hasDisplayableMetadata(metadata)) {
    return (
      <EmptyState
        icon={<InfoOutlinedIcon />}
        title="No metadata available"
        description="Metadata will appear here when available"
      />
    );
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
          {Object.entries(metadata || {})
            .filter(([key]) => !isFilteredMetadataKey(key))
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => {
              const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
              const truncatedValue = ellipsize(stringValue, 300);
              const isUrl = typeof value === 'string' && isValidUrl(value);

              let cell: React.ReactNode;

              // Is reusable custom policy name?
              if (key === 'policyName' && cloudConfig?.isEnabled && cloudConfig?.appUrl) {
                const policyId: string | null =
                  Object.entries(metadata || {}).find(([k]) => k === 'policyId')?.[1] ?? null;

                if (policyId) {
                  cell = (
                    <TableCell style={{ whiteSpace: 'pre-wrap', cursor: 'default' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{expandedMetadata[key]?.expanded ? stringValue : truncatedValue}</span>
                        <Link
                          target="_blank"
                          rel="noopener noreferrer"
                          href={makeCustomPolicyCloudUrl(cloudConfig?.appUrl, policyId)}
                          sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                        >
                          <span>View policy in Promptfoo Cloud</span>
                          <OpenInNewIcon fontSize="small" sx={{ fontSize: 14 }} />
                        </Link>
                      </div>
                    </TableCell>
                  );
                } else {
                  cell = (
                    <TableCell
                      style={{ whiteSpace: 'pre-wrap', cursor: 'pointer' }}
                      onClick={() => onMetadataClick(key)}
                    >
                      {expandedMetadata[key]?.expanded ? stringValue : truncatedValue}
                    </TableCell>
                  );
                }
              }
              // Is URL?
              else if (isUrl) {
                cell = (
                  <TableCell style={{ whiteSpace: 'pre-wrap', cursor: 'auto' }}>
                    <Link href={value} target="_blank" rel="noopener noreferrer">
                      {expandedMetadata[key]?.expanded ? stringValue : truncatedValue}
                    </Link>
                  </TableCell>
                );
              } else {
                cell = (
                  <TableCell
                    style={{ whiteSpace: 'pre-wrap', cursor: 'pointer' }}
                    onClick={() => onMetadataClick(key)}
                  >
                    {expandedMetadata[key]?.expanded ? stringValue : truncatedValue}
                  </TableCell>
                );
              }

              return (
                <TableRow key={key}>
                  <TableCell>{key}</TableCell>
                  {cell}
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
