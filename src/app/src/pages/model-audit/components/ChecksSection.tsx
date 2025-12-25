import { useState } from 'react';

import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@app/components/ui/collapsible';
import { ExpandLessIcon, ExpandMoreIcon } from '@app/components/ui/icons';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@app/components/ui/tooltip';
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

// Status badge component for DataGrid cells
function StatusBadge({ status }: { status: string }) {
  const label = status === 'passed' ? 'Passed' : status === 'failed' ? 'Failed' : 'Skipped';
  const variant = status === 'passed' ? 'success' : status === 'failed' ? 'critical' : 'secondary';
  return <Badge variant={variant}>{label}</Badge>;
}

// Severity badge component for DataGrid cells
function SeverityBadge({ severity }: { severity: string }) {
  const variant =
    severity === 'error' || severity === 'critical'
      ? 'critical'
      : severity === 'warning'
        ? 'warning'
        : 'info';
  return <Badge variant={variant}>{severity}</Badge>;
}

export default function ChecksSection({
  checks = [],
  totalChecks,
  passedChecks,
  failedChecks,
  assets = [],
  filesScanned,
}: ChecksSectionProps) {
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
        const statusOrder = { failed: 2, skipped: 1, passed: 0 };
        const order1 = statusOrder[v1 as keyof typeof statusOrder] ?? 0;
        const order2 = statusOrder[v2 as keyof typeof statusOrder] ?? 0;
        return order1 - order2;
      },
      renderCell: (params: GridRenderCellParams) => <StatusBadge status={params.value as string} />,
    },
    {
      field: 'name',
      headerName: 'Check Name',
      flex: 1,
      minWidth: 250,
      renderCell: (params: GridRenderCellParams) => (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-sm truncate">{params.value}</span>
            </TooltipTrigger>
            <TooltipContent>{params.value}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ),
    },
    {
      field: 'severity',
      headerName: 'Severity',
      width: 120,
      sortComparator: (v1: string, v2: string) => {
        const severityOrder = { critical: 4, error: 3, warning: 2, info: 1, debug: 0 };
        const order1 = severityOrder[v1 as keyof typeof severityOrder] ?? 0;
        const order2 = severityOrder[v2 as keyof typeof severityOrder] ?? 0;
        return order1 - order2;
      },
      renderCell: (params: GridRenderCellParams) => {
        if (!params.value) {
          return null;
        }
        return <SeverityBadge severity={params.value as string} />;
      },
    },
    {
      field: 'message',
      headerName: 'Message',
      flex: 2,
      minWidth: 400,
      renderCell: (params: GridRenderCellParams) => (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-sm truncate">{params.value}</span>
            </TooltipTrigger>
            <TooltipContent className="max-w-md">{params.value}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ),
    },
    {
      field: 'location',
      headerName: 'Location',
      width: 200,
      renderCell: (params: GridRenderCellParams) => {
        if (!params.value) {
          return <span className="text-muted-foreground">-</span>;
        }
        const shortPath = params.value.split('/').slice(-2).join('/');
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs font-mono truncate">{shortPath}</span>
              </TooltipTrigger>
              <TooltipContent className="font-mono text-xs">{params.value}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
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
          return <span className="text-muted-foreground">-</span>;
        }
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs italic truncate text-muted-foreground">
                  {params.value}
                </span>
              </TooltipTrigger>
              <TooltipContent>{params.value}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
    },
  ];

  // Only show if we have check data
  if (totalChecks !== undefined && checks.length === 0 && totalChecks === 0) {
    return null;
  }

  return (
    <div>
      {/* Section Header */}
      <div className="flex items-center gap-4 mb-4">
        <h3 className="text-lg font-semibold">Security Checks</h3>

        {/* Summary badges */}
        {totalChecks !== undefined && (
          <div className="flex items-center gap-2">
            <Badge variant="outline">Total: {totalChecks}</Badge>
            {passedChecks !== undefined && (
              <Badge
                variant="success"
                className="border border-emerald-200 dark:border-emerald-800"
              >
                Passed: {passedChecks}
              </Badge>
            )}
            {failedChecks !== undefined && failedChecks > 0 && (
              <Badge variant="critical" className="border border-red-200 dark:border-red-800">
                Failed: {failedChecks}
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Checks Table */}
      {checks.length > 0 && (
        <>
          <div className="mb-3">
            <Button
              variant={showPassed ? 'outline' : 'default'}
              size="sm"
              onClick={() => setShowPassed(!showPassed)}
            >
              {showPassed ? 'Show Failed/Skipped Only' : 'Show All Checks'}
            </Button>
          </div>

          {/* Checks data grid */}
          <div className="w-full">
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
                    { field: 'severity', sort: 'desc' },
                    { field: 'status', sort: 'desc' },
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
                borderRadius: '8px',
                border: '1px solid',
                borderColor: 'divider',
                '& .failed-check-row': {
                  bgcolor: (theme) =>
                    theme.palette.mode === 'dark'
                      ? 'rgba(244, 67, 54, 0.08)'
                      : 'rgba(244, 67, 54, 0.04)',
                },
                '& .passed-check-row': {
                  bgcolor: (theme) =>
                    theme.palette.mode === 'dark'
                      ? 'rgba(76, 175, 80, 0.08)'
                      : 'rgba(76, 175, 80, 0.04)',
                },
                '& .skipped-check-row': {
                  bgcolor: (theme) =>
                    theme.palette.mode === 'dark'
                      ? 'rgba(158, 158, 158, 0.08)'
                      : 'rgba(158, 158, 158, 0.04)',
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
          </div>
        </>
      )}

      {/* Fallback if no detailed checks but we have counts */}
      {checks.length === 0 && totalChecks !== undefined && totalChecks > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {totalChecks} checks were performed{filesScanned ? ` on ${filesScanned} files` : ''}.
          </p>

          {/* Show scanned assets when no detailed checks are available */}
          {assets.length > 0 && (
            <Collapsible open={showAssets} onOpenChange={setShowAssets}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Scanned Assets:</span>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm">
                    {showAssets ? (
                      <>
                        <ExpandLessIcon className="h-4 w-4 mr-1" />
                        Hide Details
                      </>
                    ) : (
                      <>
                        <ExpandMoreIcon className="h-4 w-4 mr-1" />
                        Show Details
                      </>
                    )}
                  </Button>
                </CollapsibleTrigger>
              </div>

              <CollapsibleContent>
                <div className="mt-2 max-h-[300px] overflow-auto rounded-lg bg-muted/50 p-3 space-y-2">
                  {assets.map((asset, index) => {
                    const fileName = asset.path.split('/').pop() || asset.path;
                    const fileExt = fileName.includes('.') ? fileName.split('.').pop() : '';

                    return (
                      <div key={index} className="py-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">{fileName}</span>
                          {asset.type && asset.type !== 'unknown' && (
                            <Badge variant="outline" className="text-xs py-0 h-5">
                              {asset.type}
                            </Badge>
                          )}
                          {fileExt && (
                            <Badge variant="secondary" className="text-xs py-0 h-5">
                              .{fileExt}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">
                          {asset.path}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      )}
    </div>
  );
}
