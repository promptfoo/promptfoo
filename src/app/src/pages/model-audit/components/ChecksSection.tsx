import { useMemo, useState } from 'react';

import { DataTable } from '@app/components/data-table/data-table';
import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@app/components/ui/collapsible';
import { ExpandLessIcon, ExpandMoreIcon } from '@app/components/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import type { ColumnDef } from '@tanstack/react-table';

import type { ScanAsset, ScanCheck } from '../ModelAudit.types';

interface ChecksSectionProps {
  checks?: ScanCheck[];
  totalChecks?: number;
  passedChecks?: number;
  failedChecks?: number;
  assets?: ScanAsset[];
  filesScanned?: number;
}

// Status badge component for table cells
function StatusBadge({ status }: { status: string }) {
  const label = status === 'passed' ? 'Passed' : status === 'failed' ? 'Failed' : 'Skipped';
  const variant = status === 'passed' ? 'success' : status === 'failed' ? 'critical' : 'secondary';
  return <Badge variant={variant}>{label}</Badge>;
}

// Severity badge component for table cells
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

  // Define columns for table
  const columns = useMemo<ColumnDef<ScanCheck>[]>(
    () => [
      {
        accessorKey: 'status',
        header: 'Status',
        size: 120,
        sortingFn: (rowA, rowB) => {
          const statusOrder = { failed: 2, skipped: 1, passed: 0 };
          const a = statusOrder[rowA.original.status as keyof typeof statusOrder] ?? 0;
          const b = statusOrder[rowB.original.status as keyof typeof statusOrder] ?? 0;
          return a - b;
        },
        cell: ({ getValue }) => <StatusBadge status={getValue<string>()} />,
        meta: {
          filterVariant: 'select',
          filterOptions: [
            { label: 'Failed', value: 'failed' },
            { label: 'Passed', value: 'passed' },
            { label: 'Skipped', value: 'skipped' },
          ],
        },
      },
      {
        accessorKey: 'name',
        header: 'Check Name',
        size: 250,
        cell: ({ getValue }) => {
          const value = getValue<string>();
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-sm truncate block">{value}</span>
              </TooltipTrigger>
              <TooltipContent>{value}</TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        accessorKey: 'severity',
        header: 'Severity',
        size: 120,
        sortingFn: (rowA, rowB) => {
          const severityOrder = { critical: 4, error: 3, warning: 2, info: 1, debug: 0 };
          const a = severityOrder[rowA.original.severity as keyof typeof severityOrder] ?? 0;
          const b = severityOrder[rowB.original.severity as keyof typeof severityOrder] ?? 0;
          return a - b;
        },
        cell: ({ getValue }) => {
          const value = getValue<string>();
          if (!value) {
            return null;
          }
          return <SeverityBadge severity={value} />;
        },
        meta: {
          filterVariant: 'select',
          filterOptions: [
            { label: 'Critical', value: 'critical' },
            { label: 'Error', value: 'error' },
            { label: 'Warning', value: 'warning' },
            { label: 'Info', value: 'info' },
            { label: 'Debug', value: 'debug' },
          ],
        },
      },
      {
        accessorKey: 'message',
        header: 'Message',
        size: 400,
        cell: ({ getValue }) => {
          const value = getValue<string>();
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-sm truncate block">{value}</span>
              </TooltipTrigger>
              <TooltipContent className="max-w-md">{value}</TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        accessorKey: 'location',
        header: 'Location',
        size: 200,
        cell: ({ getValue }) => {
          const value = getValue<string>();
          if (!value) {
            return <span className="text-muted-foreground">-</span>;
          }
          const shortPath = value.split('/').slice(-2).join('/');
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs font-mono truncate block">{shortPath}</span>
              </TooltipTrigger>
              <TooltipContent className="font-mono text-xs">{value}</TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        accessorKey: 'why',
        header: 'Reason',
        size: 200,
        cell: ({ getValue }) => {
          const value = getValue<string>();
          if (!value) {
            return <span className="text-muted-foreground">-</span>;
          }
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs italic truncate block text-muted-foreground">{value}</span>
              </TooltipTrigger>
              <TooltipContent>{value}</TooltipContent>
            </Tooltip>
          );
        },
      },
    ],
    [],
  );

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

          <DataTable
            columns={columns}
            data={filteredChecks}
            getRowId={(row) => `${row.timestamp}-${row.name}-${row.location ?? ''}-${row.message}`}
            initialSorting={[
              { id: 'severity', desc: true },
              { id: 'status', desc: true },
            ]}
            initialPageSize={25}
            emptyMessage={showPassed ? 'No checks to display' : 'All checks passed'}
            showToolbar={false}
            showPagination
          />
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
                        <ExpandLessIcon className="size-4 mr-1" />
                        Hide Details
                      </>
                    ) : (
                      <>
                        <ExpandMoreIcon className="size-4 mr-1" />
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
