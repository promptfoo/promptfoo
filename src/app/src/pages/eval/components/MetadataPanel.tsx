import { HIDDEN_METADATA_KEYS } from '@app/constants';
import CheckIcon from '@mui/icons-material/Check';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
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
import {
  determinePolicyTypeFromId,
  makeCustomPolicyCloudUrl,
} from '@promptfoo/redteam/plugins/policy/utils';
import { ellipsize } from '../../../../../util/text';

import type { CloudConfigData } from '../../../hooks/useCloudConfig';

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
  cloudConfig?: CloudConfigData | null;
}

export function MetadataPanel({
  metadata,
  expandedMetadata,
  copiedFields,
  onMetadataClick,
  onCopy,
  onApplyFilter,
  cloudConfig,
}: MetadataPanelProps) {
  if (!metadata) {
    return null;
  }

  const metadataEntries = Object.entries(metadata)
    .filter((d) => !HIDDEN_METADATA_KEYS.includes(d[0]))
    .sort((a, b) => a[0].localeCompare(b[0]));

  if (metadataEntries.length === 0) {
    return null;
  }

  return (
    <TableContainer component={Paper} variant="outlined" sx={{ overflow: 'auto' }}>
      <Table size="small" sx={{ tableLayout: 'fixed' }}>
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: '25%' }}>
              <strong>Key</strong>
            </TableCell>
            <TableCell sx={{ width: 'calc(75% - 80px)' }}>
              <strong>Value</strong>
            </TableCell>
            <TableCell sx={{ width: 80 }} />
          </TableRow>
        </TableHead>
        <TableBody>
          {metadataEntries.map(([key, value]) => {
            const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
            let cell: React.ReactNode;

            // Is reusable custom policy name?
            if (key === 'policyName' && cloudConfig?.isEnabled && cloudConfig?.appUrl) {
              const policyId: string | null =
                metadataEntries.find(([key]) => key === 'policyId')?.[1] ?? null;

              if (policyId) {
                cell = (
                  <TableCell
                    sx={{
                      whiteSpace: 'pre-wrap',
                      cursor: 'default',
                      wordBreak: 'break-word',
                      overflowWrap: 'break-word',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>{value}</span>
                      {determinePolicyTypeFromId(policyId) === 'reusable' &&
                        cloudConfig?.appUrl && (
                          <Link
                            target="_blank"
                            rel="noopener noreferrer"
                            href={makeCustomPolicyCloudUrl(cloudConfig?.appUrl, policyId)}
                            sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                            data-testId="pf-cloud-policy-detail-link"
                          >
                            <span>View policy in Promptfoo Cloud</span>
                            <OpenInNewIcon fontSize="small" sx={{ fontSize: 14 }} />
                          </Link>
                        )}
                    </div>
                  </TableCell>
                );
              } else {
                cell = (
                  <TableCell
                    sx={{
                      whiteSpace: 'pre-wrap',
                      cursor: 'default',
                      wordBreak: 'break-word',
                      overflowWrap: 'break-word',
                    }}
                  >
                    {value}
                  </TableCell>
                );
              }
            }
            // Is URL?
            else if (typeof value === 'string' && isValidUrl(value)) {
              cell = (
                <TableCell
                  sx={{
                    whiteSpace: 'pre-wrap',
                    cursor: 'pointer',
                    wordBreak: 'break-all',
                    overflowWrap: 'anywhere',
                  }}
                >
                  <Link href={value} target="_blank" rel="noopener noreferrer">
                    {value}
                  </Link>
                </TableCell>
              );
            } else {
              const truncatedValue = ellipsize(stringValue, 300);
              cell = (
                <TableCell
                  sx={{
                    whiteSpace: 'pre-wrap',
                    cursor: 'default',
                    wordBreak: 'break-word',
                    overflowWrap: 'break-word',
                  }}
                  onClick={() => onMetadataClick(key)}
                >
                  {expandedMetadata[key]?.expanded ? stringValue : truncatedValue}
                </TableCell>
              );
            }

            return (
              <TableRow key={key}>
                <TableCell sx={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                  {key}
                </TableCell>
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
