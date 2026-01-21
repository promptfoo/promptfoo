import { useMemo, useState } from 'react';

import { Alert, AlertContent, AlertDescription } from '@app/components/ui/alert';
import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@app/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@app/components/ui/dialog';
import {
  CheckCircleIcon,
  CodeIcon,
  DownloadIcon,
  ErrorIcon,
  ExpandLessIcon,
  ExpandMoreIcon,
  FileIcon,
  InfoIcon,
  WarningIcon,
} from '@app/components/ui/icons';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import { Separator } from '@app/components/ui/separator';
import { cn } from '@app/lib/utils';
import {
  getIssueFilePath,
  getSeverityLabel,
  isCriticalSeverity,
  mapSeverityForFiltering,
} from '../utils';

import type { ScanIssue, ScanResult } from '../ModelAudit.types';

interface SecurityFindingsProps {
  scanResults: ScanResult;
  selectedSeverity: string | null;
  onSeverityChange: (severity: string | null) => void;
  showRawOutput: boolean;
  onToggleRawOutput: () => void;
}

const severityConfig = {
  error: {
    icon: ErrorIcon,
    badge: 'critical' as const,
    border: 'border-l-red-500',
    bg: 'bg-red-50/50 dark:bg-red-950/20',
    headerBg: 'bg-red-100/50 dark:bg-red-950/30',
    iconColor: 'text-red-600 dark:text-red-400',
  },
  critical: {
    icon: ErrorIcon,
    badge: 'critical' as const,
    border: 'border-l-red-500',
    bg: 'bg-red-50/50 dark:bg-red-950/20',
    headerBg: 'bg-red-100/50 dark:bg-red-950/30',
    iconColor: 'text-red-600 dark:text-red-400',
  },
  warning: {
    icon: WarningIcon,
    badge: 'warning' as const,
    border: 'border-l-amber-500',
    bg: 'bg-amber-50/50 dark:bg-amber-950/20',
    headerBg: 'bg-amber-100/50 dark:bg-amber-950/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  info: {
    icon: InfoIcon,
    badge: 'info' as const,
    border: 'border-l-blue-500',
    bg: 'bg-blue-50/50 dark:bg-blue-950/20',
    headerBg: 'bg-blue-100/50 dark:bg-blue-950/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  debug: {
    icon: InfoIcon,
    badge: 'secondary' as const,
    border: 'border-l-gray-400',
    bg: 'bg-gray-50/50 dark:bg-gray-950/20',
    headerBg: 'bg-gray-100/50 dark:bg-gray-950/30',
    iconColor: 'text-gray-500',
  },
};

function getIssueSummaryText(issues: ScanIssue[]): string {
  const criticalCount = issues.filter((i) => i.severity === 'critical').length;
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const totalMeaningful = criticalCount + errorCount + warningCount;

  if (totalMeaningful === 0) {
    return `${issues.length} informational messages found`;
  }

  const parts = [];
  if (criticalCount > 0) {
    parts.push(`${criticalCount} critical`);
  }
  if (errorCount > 0) {
    parts.push(`${errorCount} error${errorCount > 1 ? 's' : ''}`);
  }
  if (warningCount > 0) {
    parts.push(`${warningCount} warning${warningCount > 1 ? 's' : ''}`);
  }

  return `${totalMeaningful} security issue${totalMeaningful > 1 ? 's' : ''} found: ${parts.join(', ')}`;
}

function IssueCard({ issue }: { issue: ScanIssue }) {
  const config =
    severityConfig[issue.severity as keyof typeof severityConfig] || severityConfig.info;
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'rounded-lg border-l-4 p-4',
        config.border,
        config.bg,
        'border border-l-4 border-border',
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn('size-5 mt-0.5 shrink-0', config.iconColor)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="font-semibold text-foreground">{issue.message}</span>
            <Badge variant={config.badge}>{getSeverityLabel(issue.severity)}</Badge>
          </div>
          {issue.why && <p className="text-sm text-muted-foreground mt-1">{issue.why}</p>}
          {issue.details && (
            <Alert variant="info" className="mt-3">
              <AlertContent>
                <AlertDescription>
                  <pre className="text-xs whitespace-pre-wrap font-mono overflow-x-auto">
                    {JSON.stringify(issue.details, null, 2)}
                  </pre>
                </AlertDescription>
              </AlertContent>
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}

function FileGroup({
  file,
  issues,
  isExpanded,
  onToggle,
}: {
  file: string;
  issues: ScanIssue[];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const criticalCount = issues.filter((i) => isCriticalSeverity(i.severity)).length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const infoCount = issues.filter((i) => i.severity === 'info').length;
  const fileName = file.split('/').pop() || file;

  const headerConfig =
    criticalCount > 0
      ? severityConfig.error
      : warningCount > 0
        ? severityConfig.warning
        : severityConfig.info;

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <div
        className={cn(
          'rounded-xl border overflow-hidden transition-all',
          criticalCount > 0 ? 'border-red-300 dark:border-red-800' : 'border-border',
        )}
      >
        {/* File Header */}
        <div className={cn('p-4 border-b', headerConfig.headerBg)}>
          <div className="flex items-center gap-3">
            <FileIcon className={cn('size-5', headerConfig.iconColor)} />
            <div className="flex-1 min-w-0">
              <h3
                className={cn(
                  'font-semibold text-base truncate',
                  criticalCount > 0
                    ? 'text-red-700 dark:text-red-300'
                    : warningCount > 0
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-foreground',
                )}
              >
                {fileName}
              </h3>
              <p className="text-xs text-muted-foreground font-mono truncate">{file}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {criticalCount > 0 && <Badge variant="critical">{criticalCount} critical</Badge>}
              {warningCount > 0 && (
                <Badge variant="warning">
                  {warningCount} warning{warningCount > 1 ? 's' : ''}
                </Badge>
              )}
              {infoCount > 0 && <Badge variant="info">{infoCount} info</Badge>}
            </div>
          </div>
        </div>

        {/* Expandable Toggle */}
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full p-3 flex items-center gap-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            {isExpanded ? (
              <ExpandLessIcon className="size-4" />
            ) : (
              <ExpandMoreIcon className="size-4" />
            )}
            {isExpanded ? 'Hide' : 'Show'} {issues.length} issue{issues.length !== 1 ? 's' : ''}
          </button>
        </CollapsibleTrigger>

        {/* Issues Content */}
        <CollapsibleContent>
          <Separator />
          <div className="p-4 space-y-3 bg-muted/20">
            {issues.map((issue, index) => (
              <IssueCard key={`issue-${issue.timestamp}-${index}`} issue={issue} />
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export default function SecurityFindings({
  scanResults,
  selectedSeverity,
  onSeverityChange,
  showRawOutput,
  onToggleRawOutput,
}: SecurityFindingsProps) {
  const [groupByFile, setGroupByFile] = useState(true);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [showFullRawOutput, setShowFullRawOutput] = useState(false);

  const MAX_OUTPUT_LENGTH = 10000;

  const stringifiedScanResults = useMemo(() => {
    return JSON.stringify(scanResults, null, 2);
  }, [scanResults]);

  const truncatedScanResults = useMemo(() => {
    return stringifiedScanResults.length > MAX_OUTPUT_LENGTH
      ? stringifiedScanResults.substring(0, MAX_OUTPUT_LENGTH) + '\n... [truncated]'
      : stringifiedScanResults;
  }, [stringifiedScanResults]);

  const handleDownloadResults = () => {
    const csvHeaders = ['Severity', 'Message', 'Why', 'Location', 'Details'];
    const csvRows = scanResults.issues.map((issue) => {
      const details = issue.details ? JSON.stringify(issue.details).replace(/"/g, '""') : '';
      const location = getIssueFilePath(issue);
      const why = issue.why ? issue.why.replace(/"/g, '""') : '';
      return [
        getSeverityLabel(issue.severity),
        `"${issue.message.replace(/"/g, '""')}"`,
        `"${why}"`,
        `"${location.replace(/"/g, '""')}"`,
        `"${details}"`,
      ].join(',');
    });

    const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');
    const dataUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent);
    const exportFileDefaultName = `model-audit-${new Date().toISOString().split('T')[0]}.csv`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const filteredIssues = scanResults.issues.filter((issue) => {
    if (!selectedSeverity && issue.severity === 'debug') {
      return false;
    }
    return mapSeverityForFiltering(selectedSeverity, issue.severity);
  });

  const issuesByFile = filteredIssues.reduce(
    (acc, issue) => {
      const file = getIssueFilePath(issue);
      if (!acc[file]) {
        acc[file] = [];
      }
      acc[file].push(issue);
      return acc;
    },
    {} as Record<string, ScanIssue[]>,
  );

  const toggleFileExpansion = (file: string) => {
    const newExpanded = new Set(expandedFiles);
    if (newExpanded.has(file)) {
      newExpanded.delete(file);
    } else {
      newExpanded.add(file);
    }
    setExpandedFiles(newExpanded);
  };

  const toggleAllFiles = () => {
    if (expandedFiles.size === Object.keys(issuesByFile).length) {
      setExpandedFiles(new Set());
    } else {
      setExpandedFiles(new Set(Object.keys(issuesByFile)));
    }
  };

  return (
    <div className="space-y-6">
      {scanResults.issues.length > 0 && (
        <Alert variant="info">
          <InfoIcon className="size-4" />
          <AlertContent>
            <AlertDescription>{getIssueSummaryText(scanResults.issues)}</AlertDescription>
          </AlertContent>
        </Alert>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold text-foreground">Security Findings</h2>
        <div className="flex-1" />

        <Button variant="outline" size="sm" onClick={() => setGroupByFile(!groupByFile)}>
          {groupByFile ? (
            <FileIcon className="size-4 mr-2" />
          ) : (
            <CodeIcon className="size-4 mr-2" />
          )}
          {groupByFile ? 'Group by File' : 'Flat List'}
        </Button>

        {groupByFile && Object.keys(issuesByFile).length > 1 && (
          <Button variant="outline" size="sm" onClick={toggleAllFiles}>
            {expandedFiles.size === Object.keys(issuesByFile).length ? (
              <ExpandLessIcon className="size-4 mr-2" />
            ) : (
              <ExpandMoreIcon className="size-4 mr-2" />
            )}
            {expandedFiles.size === Object.keys(issuesByFile).length
              ? 'Collapse All'
              : 'Expand All'}
          </Button>
        )}

        <Select
          value={selectedSeverity || 'all'}
          onValueChange={(value) => onSeverityChange(value === 'all' ? null : value)}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="error">Critical Only</SelectItem>
            <SelectItem value="warning">Warnings Only</SelectItem>
            <SelectItem value="info">Info Only</SelectItem>
            <SelectItem value="debug">Debug Only</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" onClick={handleDownloadResults}>
          <DownloadIcon className="size-4 mr-2" />
          Export CSV
        </Button>

        <Button variant="outline" size="sm" onClick={onToggleRawOutput}>
          <CodeIcon className="size-4 mr-2" />
          {showRawOutput ? 'Hide' : 'Show'} Raw
        </Button>
      </div>

      <Separator />

      {/* Content */}
      {filteredIssues.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
          <CheckCircleIcon className="size-16 text-emerald-600 dark:text-emerald-400 mb-4" />
          <h3 className="text-xl font-semibold text-emerald-700 dark:text-emerald-300">
            {selectedSeverity
              ? `No ${getSeverityLabel(selectedSeverity)} issues found`
              : 'No security issues detected'}
          </h3>
          <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">
            Your models appear to be secure and ready for deployment.
          </p>
        </div>
      ) : groupByFile ? (
        <div className="space-y-4">
          {Object.entries(issuesByFile).map(([file, issues]) => (
            <FileGroup
              key={file}
              file={file}
              issues={issues}
              isExpanded={expandedFiles.has(file)}
              onToggle={() => toggleFileExpansion(file)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredIssues.map((issue, index) => (
            <div key={`issue-${issue.timestamp}-${index}`}>
              <IssueCard issue={issue} />
              {getIssueFilePath(issue) !== 'Unknown' && (
                <p className="text-xs text-muted-foreground mt-1 ml-8 font-mono">
                  {getIssueFilePath(issue)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Raw Output Dialog */}
      <Dialog open={showRawOutput} onOpenChange={onToggleRawOutput}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Raw Scanner Output</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            <pre className="p-4 rounded-lg bg-muted font-mono text-sm whitespace-pre-wrap break-all">
              {scanResults.rawOutput
                ? scanResults.rawOutput
                : showFullRawOutput
                  ? stringifiedScanResults
                  : truncatedScanResults}
            </pre>
          </div>
          {!scanResults.rawOutput && stringifiedScanResults.length > MAX_OUTPUT_LENGTH && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4 self-start"
              onClick={() => setShowFullRawOutput((prev) => !prev)}
            >
              {showFullRawOutput ? 'Show Less' : 'Show More'}
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
