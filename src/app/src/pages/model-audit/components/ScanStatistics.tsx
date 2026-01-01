import { CheckCircleIcon, ErrorIcon, InfoIcon, WarningIcon } from '@app/components/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import { isCriticalSeverity } from '../utils';

import type { ScanResult } from '../ModelAudit.types';

interface ScanStatisticsProps {
  scanResults: ScanResult;
  selectedSeverity: string | null;
  onSeverityClick: (severity: string | null) => void;
  onFilesClick: () => void;
}

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  count: number;
  severity: 'critical' | 'warning' | 'info' | 'success';
  isSelected: boolean;
  onClick: () => void;
  tooltip: string;
}

const severityStyles = {
  critical: {
    bg: 'bg-red-50 dark:bg-red-950/30',
    bgHover: 'hover:bg-red-100 dark:hover:bg-red-950/50',
    border: 'border-red-200 dark:border-red-900',
    borderSelected: 'border-red-500 dark:border-red-500',
    icon: 'text-red-600 dark:text-red-400',
    count: 'text-red-700 dark:text-red-300',
    ring: 'ring-red-500/20',
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    bgHover: 'hover:bg-amber-100 dark:hover:bg-amber-950/50',
    border: 'border-amber-200 dark:border-amber-900',
    borderSelected: 'border-amber-500 dark:border-amber-500',
    icon: 'text-amber-600 dark:text-amber-400',
    count: 'text-amber-700 dark:text-amber-300',
    ring: 'ring-amber-500/20',
  },
  info: {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    bgHover: 'hover:bg-blue-100 dark:hover:bg-blue-950/50',
    border: 'border-blue-200 dark:border-blue-900',
    borderSelected: 'border-blue-500 dark:border-blue-500',
    icon: 'text-blue-600 dark:text-blue-400',
    count: 'text-blue-700 dark:text-blue-300',
    ring: 'ring-blue-500/20',
  },
  success: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    bgHover: 'hover:bg-emerald-100 dark:hover:bg-emerald-950/50',
    border: 'border-emerald-200 dark:border-emerald-900',
    borderSelected: 'border-emerald-500 dark:border-emerald-500',
    icon: 'text-emerald-600 dark:text-emerald-400',
    count: 'text-emerald-700 dark:text-emerald-300',
    ring: 'ring-emerald-500/20',
  },
};

function StatCard({
  icon: Icon,
  label,
  count,
  severity,
  isSelected,
  onClick,
  tooltip,
}: StatCardProps) {
  const styles = severityStyles[severity];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className={cn(
            'group relative flex flex-col items-center justify-center p-6 rounded-xl border-2 transition-all duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
            styles.bg,
            styles.bgHover,
            isSelected ? styles.borderSelected : styles.border,
            isSelected && `ring-4 ${styles.ring}`,
            'hover:-translate-y-1 hover:shadow-lg',
            'active:translate-y-0 active:shadow-md',
          )}
        >
          <Icon className={cn('size-10 mb-3', styles.icon)} />
          <span className={cn('text-4xl font-bold tracking-tight', styles.count)}>{count}</span>
          <span className="text-sm font-medium text-muted-foreground mt-1">{label}</span>
          {isSelected && (
            <span className="absolute -top-1 -right-1 size-3 rounded-full bg-primary animate-pulse" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export default function ScanStatistics({
  scanResults,
  selectedSeverity,
  onSeverityClick,
  onFilesClick,
}: ScanStatisticsProps) {
  const severityStats = [
    {
      severity: 'error' as const,
      mappedSeverity: 'critical' as const,
      icon: ErrorIcon,
      label: 'Critical',
      count: scanResults.issues.filter((i) => isCriticalSeverity(i.severity)).length,
    },
    {
      severity: 'warning' as const,
      mappedSeverity: 'warning' as const,
      icon: WarningIcon,
      label: 'Warnings',
      count: scanResults.issues.filter((i) => i.severity === 'warning').length,
    },
    {
      severity: 'info' as const,
      mappedSeverity: 'info' as const,
      icon: InfoIcon,
      label: 'Information',
      count: scanResults.issues.filter((i) => i.severity === 'info').length,
    },
  ];

  const filesScanned = scanResults.files_scanned ?? scanResults.scannedFiles ?? 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {severityStats.map(({ severity, mappedSeverity, icon, label, count }) => (
        <StatCard
          key={severity}
          icon={icon}
          label={label}
          count={count}
          severity={mappedSeverity}
          isSelected={selectedSeverity === severity}
          onClick={() => onSeverityClick(selectedSeverity === severity ? null : severity)}
          tooltip={
            selectedSeverity === severity
              ? 'Click to show all issues'
              : `Click to filter by ${label.toLowerCase()}`
          }
        />
      ))}
      <StatCard
        icon={CheckCircleIcon}
        label="Files Scanned"
        count={filesScanned}
        severity="success"
        isSelected={false}
        onClick={onFilesClick}
        tooltip="Click to see which files were scanned"
      />
    </div>
  );
}
