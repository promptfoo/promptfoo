import { useMemo } from 'react';

import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import { CopyButton } from '@app/components/ui/copy-button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { EVAL_ROUTES, ROUTES } from '@app/constants/routes';
import { Link } from 'react-router-dom';
import type { ServerPromptWithMetadata } from '@promptfoo/types';

interface PromptDialogProps {
  openDialog: boolean;
  handleClose: () => void;
  selectedPrompt: ServerPromptWithMetadata;
  showDatasetColumn?: boolean;
}

const PromptDialog = ({
  openDialog,
  handleClose,
  selectedPrompt,
  showDatasetColumn = true,
}: PromptDialogProps) => {
  const sortedEvals = useMemo(
    () =>
      [...(selectedPrompt?.evals || [])]
        .sort((a, b) => b.id.localeCompare(a.id))
        .map((evalData) => {
          const passCount = evalData.metrics?.testPassCount ?? 0;
          const failCount = evalData.metrics?.testFailCount ?? 0;
          const errorCount = evalData.metrics?.testErrorCount ?? 0;
          const total = passCount + failCount + errorCount;

          return {
            ...evalData,
            metrics: {
              passCount,
              failCount,
              errorCount,
              passRate: total > 0 ? ((passCount / total) * 100.0).toFixed(1) + '%' : '-',
              score: evalData.metrics?.score,
            },
          };
        }),
    [selectedPrompt?.evals],
  );

  return (
    <Dialog open={openDialog} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-6xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex min-w-0 flex-col items-start gap-2 text-left sm:flex-row sm:items-center">
            <span className="min-w-0 break-words">
              {selectedPrompt.prompt.label || selectedPrompt.prompt.display || 'Prompt Details'}
            </span>
            <Badge variant="outline" className="font-mono text-xs">
              {selectedPrompt.id.slice(0, 6)}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div
          data-testid="prompt-dialog-scroll-body"
          className="min-h-0 min-w-0 flex-1 space-y-6 overflow-y-auto py-4"
        >
          {/* Prompt content section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Prompt</h4>
              <CopyButton value={selectedPrompt?.prompt?.raw || ''} />
            </div>
            <div className="p-3 rounded-lg bg-muted/50 border border-border max-h-48 overflow-y-auto">
              <pre className="text-sm whitespace-pre-wrap font-mono">
                {selectedPrompt?.prompt?.raw}
              </pre>
            </div>
          </div>

          {/* Eval history section */}
          {sortedEvals.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold">Eval History</h4>
                <Badge variant="secondary" className="text-xs">
                  {sortedEvals.length} evals
                </Badge>
              </div>

              <div className="rounded-lg border border-border overflow-x-auto">
                <table className="min-w-[720px] w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="border-b border-border">
                      <th className="px-3 py-2 text-left font-semibold">Eval ID</th>
                      {showDatasetColumn && (
                        <th className="px-3 py-2 text-left font-semibold">Dataset ID</th>
                      )}
                      <th className="px-3 py-2 text-right font-semibold">Raw Score</th>
                      <th className="px-3 py-2 text-right font-semibold">Pass Rate</th>
                      <th className="px-3 py-2 text-right font-semibold">Pass Count</th>
                      <th className="px-3 py-2 text-right font-semibold">Fail Count</th>
                      <th className="px-3 py-2 text-right font-semibold">Error Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedEvals.map((evalData, index) => (
                      <tr
                        key={`eval-${evalData.id}-${index}`}
                        className="border-b border-border hover:bg-muted/30"
                      >
                        <td className="px-3 py-2">
                          <Link
                            to={EVAL_ROUTES.DETAIL(evalData.id)}
                            className="text-primary hover:underline font-mono text-sm block truncate"
                          >
                            {evalData.id}
                          </Link>
                        </td>
                        {showDatasetColumn && (
                          <td className="px-3 py-2">
                            <Link
                              to={ROUTES.DATASET_DETAIL(evalData.datasetId)}
                              className="text-primary hover:underline font-mono text-sm"
                            >
                              {evalData.datasetId.slice(0, 6)}
                            </Link>
                          </td>
                        )}
                        <td className="px-3 py-2 text-right tabular-nums">
                          {evalData.metrics.score?.toFixed(2) ?? '-'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {evalData.metrics.passRate}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Badge variant="success" className="font-mono">
                            {evalData.metrics.passCount}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Badge variant="warning" className="font-mono">
                            {evalData.metrics.failCount}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {evalData.metrics.errorCount > 0 ? (
                            <Badge variant="critical" className="font-mono">
                              {evalData.metrics.errorCount}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter data-testid="prompt-dialog-footer" className="shrink-0">
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PromptDialog;
