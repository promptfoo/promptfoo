import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { FileIcon, FolderIcon } from '@app/components/ui/icons';
import { getIssueFilePath, isCriticalSeverity } from '../utils';

import type { ScanPath, ScanResult } from '../ModelAudit.types';

interface ScannedFilesDialogProps {
  open: boolean;
  onClose: () => void;
  scanResults: ScanResult | null;
  paths: ScanPath[];
}

export default function ScannedFilesDialog({
  open,
  onClose,
  scanResults,
  paths,
}: ScannedFilesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <FileIcon className="size-5" />
            <DialogTitle>Scanned Files</DialogTitle>
          </div>
        </DialogHeader>

        <div className="overflow-y-auto">
          {scanResults?.scannedFilesList && scanResults.scannedFilesList.length > 0 ? (
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                Total: {scanResults.scannedFilesList.length} files scanned
              </p>
              <div className="space-y-1 max-h-96 overflow-y-auto border border-border rounded-lg">
                {scanResults.scannedFilesList.map((file, index) => {
                  // Count issues for this file
                  const fileIssues = (scanResults.issues || []).filter((issue) => {
                    const issueFile = getIssueFilePath(issue);
                    return issueFile !== 'Unknown' && issueFile.startsWith(file);
                  });
                  const criticalCount = fileIssues.filter((i) =>
                    isCriticalSeverity(i.severity),
                  ).length;
                  const warningCount = fileIssues.filter((i) => i.severity === 'warning').length;

                  return (
                    <div
                      key={index}
                      className="flex items-start gap-3 px-4 py-2 hover:bg-muted/50 border-b last:border-b-0"
                    >
                      <FileIcon className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.split('/').pop()}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-xs font-mono text-muted-foreground truncate">{file}</p>
                          {fileIssues.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              • {criticalCount > 0 && `${criticalCount} critical`}
                              {criticalCount > 0 && warningCount > 0 && ', '}
                              {warningCount > 0 && `${warningCount} warnings`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="py-6">
              {scanResults && paths.length > 0 ? (
                <>
                  <p className="text-sm font-semibold mb-3">Scanned Paths:</p>
                  <div className="space-y-1 border border-border rounded-lg">
                    {paths.map((path, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-3 px-4 py-2 hover:bg-muted/50 border-b last:border-b-0"
                      >
                        {path.type === 'directory' ? (
                          <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-mono truncate">{path.path}</p>
                          <p className="text-xs text-muted-foreground">{path.type}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-center text-muted-foreground">No scan results available</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
