import { useState } from 'react';

import { ExpandMore, Security as SecurityIcon } from '@mui/icons-material';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Collapse,
  List,
  ListItem,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';

import type { ScanAsset, ScanCheck } from '../ModelAudit.types';

interface ChecksSectionProps {
  checks?: ScanCheck[];
  totalChecks?: number;
  passedChecks?: number;
  failedChecks?: number;
  assets?: ScanAsset[];
  filesScanned?: number;
}

export default function ChecksSection({
  checks = [],
  totalChecks,
  passedChecks,
  failedChecks,
  assets = [],
  filesScanned,
}: ChecksSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [showPassed, setShowPassed] = useState(true);
  const [showAssets, setShowAssets] = useState(false);

  // Apply filters
  let filteredChecks = checks;

  // Filter by pass/fail status
  if (!showPassed) {
    filteredChecks = filteredChecks.filter((check) => check.status !== 'passed');
  }

  // Define columns for data grid
  const getColumns = (): GridColDef[] => [
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      sortComparator: (v1: string, v2: string) => {
        // Define status priority: failed > skipped > passed
        const statusOrder = { failed: 2, skipped: 1, passed: 0 };
        const order1 = statusOrder[v1 as keyof typeof statusOrder] ?? 0;
        const order2 = statusOrder[v2 as keyof typeof statusOrder] ?? 0;
        return order1 - order2;
      },
      renderCell: (params: GridRenderCellParams) => {
        const status = params.value as string;
        const label = status === 'passed' ? 'Passed' : status === 'failed' ? 'Failed' : 'Skipped';
        const color = status === 'passed' ? 'success' : status === 'failed' ? 'error' : 'default';

        return (
          <Chip
            label={label}
            size="small"
            color={color}
            sx={{
              height: 22,
              fontWeight: 500,
              textTransform: 'capitalize',
            }}
          />
        );
      },
    },
    {
      field: 'name',
      headerName: 'Check Name',
      flex: 1,
      minWidth: 250,
      renderCell: (params: GridRenderCellParams) => (
        <Tooltip title={params.value || ''}>
          <Typography variant="body2" noWrap>
            {params.value}
          </Typography>
        </Tooltip>
      ),
    },
    {
      field: 'severity',
      headerName: 'Severity',
      width: 120,
      sortComparator: (v1: string, v2: string) => {
        // Define severity priority: critical > error > warning > info > debug
        const severityOrder = { critical: 4, error: 3, warning: 2, info: 1, debug: 0 };
        const order1 = severityOrder[v1 as keyof typeof severityOrder] ?? 0;
        const order2 = severityOrder[v2 as keyof typeof severityOrder] ?? 0;
        return order1 - order2;
      },
      renderCell: (params: GridRenderCellParams) => {
        if (!params.value) {
          return null;
        }
        return (
          <Chip
            label={params.value}
            size="small"
            color={
              params.value === 'error' || params.value === 'critical'
                ? 'error'
                : params.value === 'warning'
                  ? 'warning'
                  : 'info'
            }
            sx={{ height: 22 }}
          />
        );
      },
    },

    {
      field: 'message',
      headerName: 'Message',
      flex: 2,
      minWidth: 400,
      renderCell: (params: GridRenderCellParams) => (
        <Tooltip title={params.value || ''}>
          <Typography variant="body2" noWrap sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {params.value}
          </Typography>
        </Tooltip>
      ),
    },
    {
      field: 'location',
      headerName: 'Location',
      width: 200,
      renderCell: (params: GridRenderCellParams) => {
        if (!params.value) {
          return '-';
        }
        const shortPath = params.value.split('/').slice(-2).join('/');
        return (
          <Tooltip title={params.value}>
            <Typography variant="caption" noWrap sx={{ fontFamily: 'monospace' }}>
              {shortPath}
            </Typography>
          </Tooltip>
        );
      },
    },
    {
      field: 'why',
      headerName: 'Reason',
      flex: 1,
      minWidth: 200,
      renderCell: (params: GridRenderCellParams) => {
        if (!params.value) {
          return '-';
        }
        return (
          <Tooltip title={params.value}>
            <Typography variant="caption" noWrap sx={{ fontStyle: 'italic' }}>
              {params.value}
            </Typography>
          </Tooltip>
        );
      },
    },
  ];

  // Only show if we have check data
  if (totalChecks !== undefined && checks.length === 0) {
    return null;
  }

  return (
    <Accordion
      expanded={expanded}
      onChange={(_, isExpanded) => setExpanded(isExpanded)}
      sx={{
        mb: 3,
        borderRadius: '12px',
        '&:before': {
          display: 'none', // Remove the default divider line
        },
        '&.Mui-expanded': {
          margin: '0 0 24px 0', // Maintain consistent margin when expanded
        },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMore />}
        aria-controls="security-checks-content"
        id="security-checks-header"
      >
        <Stack direction="row" alignItems="center" spacing={2} sx={{ width: '100%' }}>
          <SecurityIcon color="primary" />
          <Typography variant="h6">Security Checks</Typography>

          {/* Summary chips */}
          {totalChecks !== undefined && (
            <Stack direction="row" spacing={1} sx={{ ml: 2 }}>
              <Chip label={`Total: ${totalChecks}`} size="small" variant="outlined" />
              {passedChecks !== undefined && (
                <Chip
                  label={`Passed: ${passedChecks}`}
                  size="small"
                  color="success"
                  variant="outlined"
                />
              )}
              {failedChecks !== undefined && failedChecks > 0 && (
                <Chip
                  label={`Failed: ${failedChecks}`}
                  size="small"
                  color="error"
                  variant="outlined"
                />
              )}
            </Stack>
          )}
        </Stack>
      </AccordionSummary>

      <AccordionDetails>
        {/* Filters and toggles */}
        {checks.length > 0 && (
          <>
            <Box sx={{ mb: 2 }}>
              <Chip
                label={showPassed ? 'Show Failed/Skipped Only' : 'Show All Checks'}
                onClick={() => setShowPassed(!showPassed)}
                size="small"
                color={showPassed ? 'default' : 'primary'}
                variant={showPassed ? 'outlined' : 'filled'}
              />
            </Box>

            {/* Checks data grid */}
            <Box sx={{ width: '100%' }}>
              <DataGrid
                rows={filteredChecks}
                getRowId={(row) =>
                  `${row.timestamp}-${row.name}-${row.location ?? ''}-${row.message}`
                }
                columns={getColumns()}
                initialState={{
                  pagination: {
                    paginationModel: { pageSize: 25 },
                  },
                  sorting: {
                    sortModel: [
                      { field: 'severity', sort: 'desc' }, // Most critical first
                      { field: 'status', sort: 'desc' }, // Failed checks first
                    ],
                  },
                }}
                pageSizeOptions={[10, 25, 50, 100]}
                disableRowSelectionOnClick
                autoHeight
                density="standard"
                getRowClassName={(params) =>
                  params.row.status === 'failed'
                    ? 'failed-check-row'
                    : params.row.status === 'passed'
                      ? 'passed-check-row'
                      : 'skipped-check-row'
                }
                sx={{
                  '& .failed-check-row': {
                    bgcolor: (theme) =>
                      theme.palette.mode === 'dark'
                        ? 'rgba(244, 67, 54, 0.05)'
                        : 'rgba(244, 67, 54, 0.02)',
                  },
                  '& .passed-check-row': {
                    bgcolor: (theme) =>
                      theme.palette.mode === 'dark'
                        ? 'rgba(76, 175, 80, 0.05)'
                        : 'rgba(76, 175, 80, 0.02)',
                  },
                  '& .skipped-check-row': {
                    bgcolor: (theme) =>
                      theme.palette.mode === 'dark'
                        ? 'rgba(158, 158, 158, 0.05)'
                        : 'rgba(158, 158, 158, 0.02)',
                  },
                  '& .MuiDataGrid-cell': {
                    borderBottom: 'none',
                    py: 2,
                    px: 2,
                    lineHeight: 'inherit',
                  },
                  '& .MuiDataGrid-columnHeaders': {
                    bgcolor: 'background.paper',
                    borderBottom: 2,
                    borderColor: 'divider',
                  },
                  '& .MuiDataGrid-columnHeader': {
                    px: 2,
                  },
                }}
                localeText={{
                  noRowsLabel: showPassed ? 'No checks to display' : 'All checks passed',
                }}
              />
            </Box>
          </>
        )}

        {/* Fallback if no detailed checks but we have counts */}
        {checks.length === 0 && totalChecks !== undefined && (
          <>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {totalChecks === 0
                ? 'No security checks were performed on this scan.'
                : `${totalChecks} checks were performed${filesScanned ? ` on ${filesScanned} files` : ''}.`}
            </Typography>

            {/* Show scanned assets when no detailed checks are available */}
            {assets.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="body2" fontWeight="medium">
                    Scanned Assets:
                  </Typography>
                  <Chip
                    label={showAssets ? 'Hide Details' : 'Show Details'}
                    onClick={() => setShowAssets(!showAssets)}
                    size="small"
                    variant="outlined"
                  />
                </Stack>

                <Collapse in={showAssets}>
                  <List
                    dense
                    sx={{
                      maxHeight: 300,
                      overflow: 'auto',
                      bgcolor: 'action.hover',
                      borderRadius: '12px',
                      p: 1,
                    }}
                  >
                    {assets.map((asset, index) => {
                      const fileName = asset.path.split('/').pop() || asset.path;
                      const fileExt = fileName.includes('.') ? fileName.split('.').pop() : '';

                      return (
                        <ListItem key={index} sx={{ py: 0.5 }}>
                          <ListItemText
                            primary={
                              <Stack direction="row" spacing={1} alignItems="center">
                                <Typography variant="caption" fontWeight="medium">
                                  {fileName}
                                </Typography>
                                {asset.type && asset.type !== 'unknown' && (
                                  <Chip
                                    label={asset.type}
                                    size="small"
                                    sx={{ height: 18 }}
                                    color="primary"
                                    variant="outlined"
                                  />
                                )}
                                {fileExt && (
                                  <Chip
                                    label={`.${fileExt}`}
                                    size="small"
                                    sx={{ height: 18 }}
                                    variant="outlined"
                                  />
                                )}
                              </Stack>
                            }
                            secondary={
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                component="div"
                                sx={{ fontFamily: 'monospace' }}
                              >
                                {asset.path}
                              </Typography>
                            }
                          />
                        </ListItem>
                      );
                    })}
                  </List>
                </Collapse>
              </Box>
            )}
          </>
        )}
      </AccordionDetails>
    </Accordion>
  );
}
