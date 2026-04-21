import type { ReactNode } from 'react';

import { CopyButton } from '@app/components/ui/copy-button';
import { CheckCircleIcon, ErrorIcon, FolderIcon, WarningIcon } from '@app/components/ui/icons';
import { Separator } from '@app/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import { formatDataGridDate } from '@app/utils/date';
import SeverityScorecard from './SeverityScorecard';

import type { SeverityCounts } from '../hooks';

interface ScanResultHeaderProps {
  name: string;
  modelPath: string;
  createdAt: string;
  author?: string;
  severityCounts: SeverityCounts;
  /** Content rendered above the main header (e.g., back button, actions dropdown) */
  topBar?: ReactNode;
  /** Size variant for the scorecard */
  size?: 'sm' | 'default';
}

export default function ScanResultHeader({
  name,
  modelPath,
  createdAt,
  author,
  severityCounts,
  topBar,
  size = 'default',
}: ScanResultHeaderProps) {
  const isClean = severityCounts.critical === 0 && severityCounts.warning === 0;

  return (
    <div
      className={cn(
        'border-b border-border/50',
        isClean
          ? 'bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/50 dark:to-green-950/50'
          : severityCounts.critical > 0
            ? 'bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/50 dark:to-orange-950/50'
            : 'bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/50 dark:to-yellow-950/50',
      )}
    >
      <div className="container max-w-7xl mx-auto px-4 py-10">
        {/* Optional Top Bar (back button, actions, etc.) */}
        {topBar && <div className="mb-6">{topBar}</div>}

        {/* Main Header Content */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-6">
          {/* Left: Status Icon + Title */}
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <div
              className={cn(
                'shrink-0 size-14 rounded-2xl flex items-center justify-center',
                isClean
                  ? 'bg-emerald-100 dark:bg-emerald-900/60'
                  : severityCounts.critical > 0
                    ? 'bg-red-100 dark:bg-red-900/60'
                    : 'bg-amber-100 dark:bg-amber-900/60',
              )}
            >
              {isClean ? (
                <CheckCircleIcon className="size-7 text-emerald-600 dark:text-emerald-400" />
              ) : severityCounts.critical > 0 ? (
                <ErrorIcon className="size-7 text-red-600 dark:text-red-400" />
              ) : (
                <WarningIcon className="size-7 text-amber-600 dark:text-amber-400" />
              )}
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight truncate">{name}</h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-sm text-muted-foreground">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center gap-1.5 cursor-default">
                      <FolderIcon className="size-3.5" />
                      <span className="font-mono truncate max-w-[200px]">{modelPath}</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{modelPath}</TooltipContent>
                </Tooltip>
                <CopyButton value={modelPath} />
                <Separator orientation="vertical" className="h-4" />
                <span>{formatDataGridDate(createdAt)}</span>
                {author && (
                  <>
                    <Separator orientation="vertical" className="h-4" />
                    <span>{author}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right: Severity Scorecard */}
          <SeverityScorecard counts={severityCounts} size={size} />
        </div>
      </div>
    </div>
  );
}
