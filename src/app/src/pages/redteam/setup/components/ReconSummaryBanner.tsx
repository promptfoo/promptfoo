import { Alert, AlertDescription, AlertTitle } from '@app/components/ui/alert';
import { Badge } from '@app/components/ui/badge';
import { AlertTriangle, Code } from 'lucide-react';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';

/**
 * Banner component that displays when the configuration was loaded from recon.
 * Shows summary information about the codebase analysis.
 */
export default function ReconSummaryBanner() {
  const { reconContext } = useRedTeamConfig();

  // Only render if we have recon context
  if (!reconContext || reconContext.source !== 'recon-cli') {
    return null;
  }

  const formatDate = (timestamp: number) => {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(timestamp));
  };

  const truncateDirectory = (directoryPath: string) => {
    const normalizedPath = directoryPath.replace(/\\/g, '/');
    const parts = normalizedPath.split('/').filter(Boolean);
    if (parts.length <= 3) {
      return directoryPath;
    }
    return `.../${parts.slice(-2).join('/')}`;
  };

  const keyFilesAnalyzed = reconContext.keyFilesAnalyzed ?? 0;
  const fieldsPopulated = reconContext.fieldsPopulated ?? 0;
  const discoveredToolsCount = reconContext.discoveredToolsCount ?? 0;
  const securityNotes = reconContext.securityNotes ?? [];
  const countSummaryParts: string[] = [];

  if (keyFilesAnalyzed > 0) {
    countSummaryParts.push(`${keyFilesAnalyzed} key files analyzed`);
  }

  if (fieldsPopulated > 0) {
    countSummaryParts.push(`${fieldsPopulated} fields populated`);
  }

  if (discoveredToolsCount > 0) {
    countSummaryParts.push(`${discoveredToolsCount} tools discovered`);
  }

  const countSummary = countSummaryParts.join(' • ');

  return (
    <Alert variant="info">
      <Code className="h-5 w-5" />
      <div className="flex flex-col gap-2 w-full">
        <AlertTitle>Configuration loaded from Recon CLI</AlertTitle>
        <AlertDescription>
          <div className="flex flex-wrap gap-2 items-center">
            {reconContext.codebaseDirectory && (
              <Badge
                variant="info"
                truncate
                className="font-mono"
                title={reconContext.codebaseDirectory}
              >
                {truncateDirectory(reconContext.codebaseDirectory)}
              </Badge>
            )}
            {countSummary ? <span className="text-sm">{countSummary}</span> : null}
          </div>
          {securityNotes.length > 0 ? (
            <div className="mt-2 rounded-md border border-border bg-background/70 p-2">
              <Badge variant="warning" className="mb-1 gap-1">
                <AlertTriangle className="h-3 w-3" />
                Security observations
              </Badge>
              <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
                {securityNotes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-sm text-muted-foreground mt-2">
            Analyzed on {formatDate(reconContext.timestamp)}. Review and adjust the details below as
            needed.
          </p>
        </AlertDescription>
      </div>
    </Alert>
  );
}
