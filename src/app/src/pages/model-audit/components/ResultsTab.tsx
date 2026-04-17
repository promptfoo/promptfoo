import { useMemo, useState } from 'react';

import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@app/components/ui/dialog';
import {
  CheckCircleIcon,
  CodeIcon,
  DownloadIcon,
  ErrorIcon,
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import { getIssueFilePath, getSeverityLabel, isCriticalSeverity } from '../utils';
import ChecksSection from './ChecksSection';

import type { ScanIssue, ScanResult } from '../ModelAudit.types';

interface ResultsTabProps {
  scanResults: ScanResult;
  onShowFilesDialog: () => void;
  totalChecks?: number | null;
  passedChecks?: number | null;
  failedChecks?: number | null;
}

// Compact issue row component
function IssueRow({ issue }: { issue: ScanIssue }) {
  const filePath = getIssueFilePath(issue);
  const fileName = filePath !== 'Unknown' ? filePath.split('/').pop() : null;

  const severityConfig = {
    error: { icon: ErrorIcon, color: 'text-red-600 dark:text-red-400' },
    critical: { icon: ErrorIcon, color: 'text-red-600 dark:text-red-400' },
    warning: { icon: WarningIcon, color: 'text-amber-600 dark:text-amber-400' },
    info: { icon: InfoIcon, color: 'text-blue-600 dark:text-blue-400' },
    debug: { icon: InfoIcon, color: 'text-gray-500' },
  };

  const config =
    severityConfig[issue.severity as keyof typeof severityConfig] || severityConfig.info;
  const Icon = config.icon;

  return (
    <div className="group flex items-center gap-3 py-2.5 px-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
      {/* Icon - centered */}
      <Icon className={cn('size-4 shrink-0', config.color)} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground leading-snug">{issue.message}</p>
        {issue.why && (
          <p className="text-xs text-muted-foreground mt-1 leading-snug">{issue.why}</p>
        )}
      </div>

      {/* File path */}
      {fileName && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 max-w-[180px]">
              <FileIcon className="size-3.5 shrink-0" />
              <span className="truncate font-mono">{fileName}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="left" className="font-mono text-xs">
            {filePath}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

export default function ResultsTab({
  scanResults,
  onShowFilesDialog,
  totalChecks,
  passedChecks,
  failedChecks,
}: ResultsTabProps) {
  const [selectedSeverity, setSelectedSeverity] = useState<string | null>(null);
  const [showRawOutput, setShowRawOutput] = useState(false);
  const [showFullRawOutput, setShowFullRawOutput] = useState(false);

  const MAX_OUTPUT_LENGTH = 10000;

  // Compute check counts
  const checksTotal = totalChecks ?? scanResults.total_checks ?? scanResults.totalChecks ?? 0;
  const checksPassed = passedChecks ?? scanResults.passed_checks ?? scanResults.passedChecks ?? 0;
  const checksFailed = failedChecks ?? scanResults.failed_checks ?? scanResults.failedChecks ?? 0;

  // Filter issues
  const filteredIssues = useMemo(() => {
    return scanResults.issues.filter((issue) => {
      // Hide debug by default
      if (!selectedSeverity && issue.severity === 'debug') {
        return false;
      }
      if (!selectedSeverity) {
        return true;
      }
      if (selectedSeverity === 'error') {
        return isCriticalSeverity(issue.severity);
      }
      return issue.severity === selectedSeverity;
    });
  }, [scanResults.issues, selectedSeverity]);

  // Group by severity for display
  const issuesBySeverity = useMemo(() => {
    const critical = filteredIssues.filter((i) => isCriticalSeverity(i.severity));
    const warnings = filteredIssues.filter((i) => i.severity === 'warning');
    const info = filteredIssues.filter((i) => i.severity === 'info' || i.severity === 'debug');
    return { critical, warnings, info };
  }, [filteredIssues]);

  const stringifiedScanResults = useMemo(() => {
    return JSON.stringify(scanResults, null, 2);
  }, [scanResults]);

  const truncatedScanResults = useMemo(() => {
    return stringifiedScanResults.length > MAX_OUTPUT_LENGTH
      ? stringifiedScanResults.substring(0, MAX_OUTPUT_LENGTH) + '\n... [truncated]'
      : stringifiedScanResults;
  }, [stringifiedScanResults]);

  const handleDownloadCSV = () => {
    const csvHeaders = ['Severity', 'Message', 'Why', 'Location'];
    const csvRows = scanResults.issues.map((issue) => {
      const location = getIssueFilePath(issue);
      const why = issue.why ? issue.why.replace(/"/g, '""') : '';
      return [
        getSeverityLabel(issue.severity),
        `"${issue.message.replace(/"/g, '""')}"`,
        `"${why}"`,
        `"${location.replace(/"/g, '""')}"`,
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

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">
          Findings
          <span className="ml-2 text-muted-foreground font-normal">({filteredIssues.length})</span>
        </h2>
        <div className="flex-1" />

        <Select
          value={selectedSeverity || 'all'}
          onValueChange={(value) => setSelectedSeverity(value === 'all' ? null : value)}
        >
          <SelectTrigger className="w-[140px] h-8 text-sm">
            <SelectValue placeholder="All severities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            <SelectItem value="error">Critical only</SelectItem>
            <SelectItem value="warning">Warnings only</SelectItem>
            <SelectItem value="info">Info only</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="ghost" size="sm" onClick={handleDownloadCSV}>
          <DownloadIcon className="size-4 mr-1.5" />
          CSV
        </Button>

        <Button variant="ghost" size="sm" onClick={() => setShowRawOutput(true)}>
          <CodeIcon className="size-4 mr-1.5" />
          Raw
        </Button>

        <Button variant="ghost" size="sm" onClick={onShowFilesDialog}>
          <FileIcon className="size-4 mr-1.5" />
          Files
        </Button>
      </div>

      <Separator />

      {/* Findings List */}
      {filteredIssues.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <CheckCircleIcon className="size-12 text-emerald-500 mb-3" />
          <h3 className="text-lg font-medium text-emerald-700 dark:text-emerald-300">
            {selectedSeverity
              ? `No ${getSeverityLabel(selectedSeverity)} issues`
              : 'No issues found'}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {selectedSeverity
              ? 'Try selecting a different severity filter.'
              : 'Your model passed all security checks.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Critical Issues */}
          {issuesBySeverity.critical.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="critical">{issuesBySeverity.critical.length}</Badge>
                <span className="text-sm font-medium text-red-700 dark:text-red-300">
                  Critical Issues
                </span>
              </div>
              <div className="rounded-lg border border-red-200/70 dark:border-red-700/50 bg-red-50/50 dark:bg-red-950/40 divide-y divide-red-100 dark:divide-red-800/40">
                {issuesBySeverity.critical.map((issue, index) => (
                  <IssueRow key={`${issue.severity}-${issue.message}-${index}`} issue={issue} />
                ))}
              </div>
            </div>
          )}

          {/* Warnings */}
          {issuesBySeverity.warnings.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="warning">{issuesBySeverity.warnings.length}</Badge>
                <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                  Warnings
                </span>
              </div>
              <div className="rounded-lg border border-amber-200/70 dark:border-amber-700/50 bg-amber-50/50 dark:bg-amber-950/40 divide-y divide-amber-100 dark:divide-amber-800/40">
                {issuesBySeverity.warnings.map((issue, index) => (
                  <IssueRow key={`${issue.severity}-${issue.message}-${index}`} issue={issue} />
                ))}
              </div>
            </div>
          )}

          {/* Info */}
          {issuesBySeverity.info.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="info">{issuesBySeverity.info.length}</Badge>
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                  Informational
                </span>
              </div>
              <div className="rounded-lg border border-blue-200/70 dark:border-blue-700/50 bg-blue-50/50 dark:bg-blue-950/40 divide-y divide-blue-100 dark:divide-blue-800/40">
                {issuesBySeverity.info.map((issue, index) => (
                  <IssueRow key={`${issue.severity}-${issue.message}-${index}`} issue={issue} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Section Divider */}
      <Separator className="my-8" />

      {/* Security Checks Table */}
      <ChecksSection
        checks={scanResults.checks}
        totalChecks={checksTotal}
        passedChecks={checksPassed}
        failedChecks={checksFailed}
        assets={scanResults.assets}
        filesScanned={scanResults.files_scanned}
      />

      {/* Raw Output Dialog */}
      <Dialog open={showRawOutput} onOpenChange={setShowRawOutput}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Raw Scanner Output</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            <pre className="p-4 rounded-lg bg-muted font-mono text-xs whitespace-pre-wrap break-all">
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
