import { useMemo, useState } from 'react';

import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { EVAL_ROUTES, ROUTES } from '@app/constants/routes';
import yaml from 'js-yaml';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { TestCasesWithMetadata } from '@promptfoo/types';

interface DatasetDialogProps {
  openDialog: boolean;
  handleClose: () => void;
  testCase: TestCasesWithMetadata & { recentEvalDate: string };
}

const ROWS_PER_PAGE = 10;

export default function DatasetDialog({ openDialog, handleClose, testCase }: DatasetDialogProps) {
  const [page, setPage] = useState(1);

  const sortedPrompts = useMemo(() => {
    return [...(testCase?.prompts || [])]
      .sort((a, b) => b.evalId.localeCompare(a.evalId))
      .map((promptData) => {
        const testPassCount = promptData.prompt.metrics?.testPassCount ?? 0;
        const testFailCount = promptData.prompt.metrics?.testFailCount ?? 0;
        const testErrorCount = promptData.prompt.metrics?.testErrorCount ?? 0;
        const total = testPassCount + testFailCount + testErrorCount;

        return {
          ...promptData,
          metrics: {
            passCount: testPassCount,
            failCount: testFailCount,
            errorCount: testErrorCount,
            passRate: total > 0 ? ((testPassCount / total) * 100.0).toFixed(1) + '%' : '-',
            score: promptData.prompt.metrics?.score,
          },
        };
      });
  }, [testCase?.prompts]);

  const paginatedPrompts = useMemo(() => {
    const startIndex = (page - 1) * ROWS_PER_PAGE;
    return sortedPrompts.slice(startIndex, startIndex + ROWS_PER_PAGE);
  }, [sortedPrompts, page]);

  const totalPages = Math.ceil(sortedPrompts.length / ROWS_PER_PAGE);

  return (
    <Dialog open={openDialog} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Dataset Details
            <Badge variant="outline" className="font-mono text-xs">
              {testCase.id.slice(0, 6)}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Test Cases YAML section */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Test Cases</h4>
            <div className="p-3 rounded-lg bg-muted/50 border border-border max-h-48 overflow-y-auto">
              <pre className="text-xs whitespace-pre-wrap font-mono">
                {yaml.dump(testCase.testCases)}
              </pre>
            </div>
          </div>

          {/* Prompts section */}
          {sortedPrompts.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold">Prompts</h4>
                  <Badge variant="secondary" className="text-xs">
                    {sortedPrompts.length} prompts
                  </Badge>
                </div>
                {/* Pagination controls */}
                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="border-b border-border">
                      <th className="px-3 py-2 text-left font-semibold w-[15%]">Prompt ID</th>
                      <th className="px-3 py-2 text-left font-semibold w-1/4">Prompt Content</th>
                      <th className="px-3 py-2 text-right font-semibold w-[12%]">Raw Score</th>
                      <th className="px-3 py-2 text-right font-semibold w-[12%]">Pass Rate</th>
                      <th className="px-3 py-2 text-right font-semibold w-[12%]">Pass Count</th>
                      <th className="px-3 py-2 text-right font-semibold w-[12%]">Fail Count</th>
                      <th className="px-3 py-2 text-left font-semibold w-1/5">Latest Eval</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedPrompts.map((promptData) => (
                      <tr
                        key={`prompt-${promptData.id}`}
                        className="border-b border-border hover:bg-muted/30"
                      >
                        <td className="px-3 py-2">
                          <Link
                            to={ROUTES.PROMPT_DETAIL(promptData.id)}
                            className="text-primary hover:underline font-mono text-sm block truncate"
                          >
                            {promptData.id.slice(0, 6)}
                          </Link>
                        </td>
                        <td className="px-3 py-2">
                          <span className="text-sm text-muted-foreground line-clamp-2">
                            {promptData.prompt.raw.length > 250
                              ? promptData.prompt.raw.slice(0, 250) + '...'
                              : promptData.prompt.raw}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {promptData.metrics.score?.toFixed(2) ?? '-'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {promptData.metrics.passRate}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Badge variant="success" className="font-mono">
                            {promptData.metrics.passCount}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Badge variant="warning" className="font-mono">
                            {promptData.metrics.failCount}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          <Link
                            to={EVAL_ROUTES.DETAIL(promptData.evalId)}
                            className="text-primary hover:underline font-mono text-sm block truncate"
                          >
                            {promptData.evalId}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
