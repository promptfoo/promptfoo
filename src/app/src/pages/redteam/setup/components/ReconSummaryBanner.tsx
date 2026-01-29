import { Alert, AlertDescription, AlertTitle } from '@app/components/ui/alert';
import { Badge } from '@app/components/ui/badge';
import { AlertTriangle, Code, File, FolderOpen, Settings, Wrench } from 'lucide-react';
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

  const truncateDirectory = (path: string | undefined) => {
    if (!path) {
      return 'Unknown';
    }
    const parts = path.split('/');
    if (parts.length <= 3) {
      return path;
    }
    return `.../${parts.slice(-2).join('/')}`;
  };

  return (
    <Alert variant="info">
      <Code className="h-5 w-5" />
      <div className="flex flex-col gap-2 w-full">
        <AlertTitle className="text-blue-700 dark:text-blue-300">
          Configuration loaded from Recon CLI
        </AlertTitle>
        <AlertDescription>
          <div className="flex flex-wrap gap-2 items-center">
            {reconContext.codebaseDirectory && (
              <Badge
                variant="outline"
                className="border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
                title={reconContext.codebaseDirectory}
              >
                <FolderOpen className="h-3 w-3 mr-1" />
                {truncateDirectory(reconContext.codebaseDirectory)}
              </Badge>
            )}
            {reconContext.keyFilesAnalyzed !== undefined && reconContext.keyFilesAnalyzed > 0 && (
              <Badge
                variant="outline"
                className="border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
              >
                <File className="h-3 w-3 mr-1" />
                {reconContext.keyFilesAnalyzed} key files analyzed
              </Badge>
            )}
            {reconContext.fieldsPopulated !== undefined && reconContext.fieldsPopulated > 0 && (
              <Badge
                variant="outline"
                className="border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
              >
                <Settings className="h-3 w-3 mr-1" />
                {reconContext.fieldsPopulated} fields populated
              </Badge>
            )}
            {reconContext.discoveredToolsCount !== undefined &&
              reconContext.discoveredToolsCount > 0 && (
                <Badge
                  variant="outline"
                  className="border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
                >
                  <Wrench className="h-3 w-3 mr-1" />
                  {reconContext.discoveredToolsCount} tools discovered
                </Badge>
              )}
          </div>
          {reconContext.securityNotes && reconContext.securityNotes.length > 0 && (
            <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-300 flex items-center gap-1 mb-1">
                <AlertTriangle className="h-3 w-3" />
                Security observations
              </p>
              <ul className="text-xs text-amber-600 dark:text-amber-400 list-disc list-inside space-y-0.5">
                {reconContext.securityNotes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-sm text-blue-600 dark:text-blue-400 mt-2">
            Analyzed on {formatDate(reconContext.timestamp)}. Review and adjust the details below as
            needed.
          </p>
        </AlertDescription>
      </div>
    </Alert>
  );
}
