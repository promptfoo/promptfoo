import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@app/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@app/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { Label } from '@app/components/ui/label';
import { Progress } from '@app/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import { useToast } from '@app/hooks/useToast';
import { type AssertionJobStatus, addEvalAssertions, getAssertionJobStatus } from '@app/utils/api';
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  Filter,
  RefreshCw,
  Search,
  XCircle,
  Zap,
} from 'lucide-react';
import PosthocAssertionsForm from './PosthocAssertionsForm';
import type { Assertion, AssertionType, EvalResultsFilterMode } from '@promptfoo/types';

// Assertion types that don't require a value (they check format/structure only)
// or where a value is optional (contains-* assertions can work without a schema to validate against)
const NO_VALUE_REQUIRED: Set<AssertionType> = new Set([
  'is-json',
  'is-xml',
  'is-sql',
  'not-is-json',
  'is-valid-function-call',
  'is-valid-openai-function-call',
  'is-valid-openai-tools-call',
  'moderation',
  'pi',
  // These assertions can work without a value (they just check format presence)
  'contains-json',
  'contains-xml',
  'contains-sql',
  'not-contains-json',
]);

// LLM assertion types for cost calculation
const LLM_ASSERTION_TYPES = new Set<AssertionType>([
  'similar',
  'llm-rubric',
  'factuality',
  'model-graded-closedqa',
  'answer-relevance',
  'context-faithfulness',
  'context-recall',
  'context-relevance',
  'g-eval',
  'moderation',
  'pi',
]);

// Threshold for showing confirmation step
const LARGE_RUN_THRESHOLD = 100;

import type { ResultsFilter } from './store';

type AssertionScope = 'results' | 'tests' | 'filtered';

const SCOPE_LABELS: Record<AssertionScope, string> = {
  results: 'This output only',
  tests: 'All prompts in this test case',
  filtered: 'Filtered test cases',
};

interface AddAssertionsDialogProps {
  open: boolean;
  onClose: () => void;
  evalId?: string;
  availableScopes: AssertionScope[];
  defaultScope: AssertionScope;
  resultId?: string;
  testIndex?: number;
  filters?: ResultsFilter[];
  filterMode?: EvalResultsFilterMode;
  searchText?: string;
  filteredCount?: number;
  onApplied?: () => void;
  readOnly?: boolean;
}

export default function AddAssertionsDialog({
  open,
  onClose,
  evalId,
  availableScopes,
  defaultScope,
  resultId,
  testIndex,
  filters,
  filterMode,
  searchText,
  filteredCount,
  onApplied,
  readOnly,
}: AddAssertionsDialogProps) {
  const { showToast } = useToast();
  const [assertions, setAssertions] = useState<Assertion[]>([]);
  const [scope, setScope] = useState<AssertionScope>(defaultScope);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jobStatus, setJobStatus] = useState<AssertionJobStatus | null>(null);
  const [showCompletedWithErrors, setShowCompletedWithErrors] = useState(false);
  const [errorsExpanded, setErrorsExpanded] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Clean up polling on unmount or close
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (open) {
      setScope(defaultScope);
      setAssertions([]);
      setJobStatus(null);
      setIsSubmitting(false);
      setShowCompletedWithErrors(false);
      setErrorsExpanded(false);
      setShowConfirmation(false);
    } else {
      // Stop polling when dialog closes
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }
  }, [open, defaultScope]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Enter to submit
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (canSubmit && !showConfirmation) {
          handleSubmitClick();
        } else if (showConfirmation) {
          executeSubmit();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, showConfirmation, canSubmit, executeSubmit, handleSubmitClick]);

  const scopeOptions = useMemo(
    () =>
      availableScopes.map((scopeValue) => ({
        value: scopeValue,
        label:
          scopeValue === 'filtered' && typeof filteredCount === 'number'
            ? `${SCOPE_LABELS[scopeValue]} (${filteredCount})`
            : SCOPE_LABELS[scopeValue],
      })),
    [availableScopes, filteredCount],
  );

  // Check if all assertions that require values have non-empty values
  const hasValidValues = assertions.every((assertion) => {
    if (NO_VALUE_REQUIRED.has(assertion.type)) {
      return true;
    }
    const value = assertion.value;
    return value !== undefined && value !== null && String(value).trim() !== '';
  });

  const canSubmit =
    assertions.length > 0 && Boolean(evalId) && !readOnly && hasValidValues && !isSubmitting;

  // Calculate target count for LLM cost estimation
  const targetCount = useMemo(() => {
    if (scope === 'filtered' && typeof filteredCount === 'number') {
      return filteredCount;
    }
    return 1; // 'results' or 'tests' scope targets 1 result/test case
  }, [scope, filteredCount]);

  // Calculate LLM assertion count and total API calls
  const llmAssertionCount = useMemo(
    () => assertions.filter((a) => LLM_ASSERTION_TYPES.has(a.type)).length,
    [assertions],
  );
  const totalApiCalls = llmAssertionCount * targetCount;

  // Determine if this is a large run requiring confirmation
  const isLargeRun = targetCount > LARGE_RUN_THRESHOLD;

  // Get active filter summary for confirmation
  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (filters && filters.length > 0) {
      parts.push(`${filters.length} filter${filters.length > 1 ? 's' : ''}`);
    }
    if (searchText) {
      parts.push(`search: "${searchText}"`);
    }
    return parts.length > 0 ? parts.join(', ') : null;
  }, [filters, searchText]);

  const pollJobStatus = useCallback(
    async (jobId: string) => {
      if (!evalId) {
        return;
      }

      try {
        const response = await getAssertionJobStatus(evalId, jobId);
        const status = response.data;
        setJobStatus(status);

        if (status.status === 'complete' || status.status === 'error') {
          // Stop polling
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }

          setIsSubmitting(false);

          if (status.status === 'complete') {
            const { updatedResults, skippedResults, skippedAssertions, errors } = status;
            const hasErrors = errors.length > 0;

            // Always refresh results for successful ones
            onApplied?.();

            if (hasErrors) {
              // Show retry UI instead of closing
              setShowCompletedWithErrors(true);
            } else {
              // All success - close dialog
              showToast(
                `Added assertions to ${updatedResults} result${updatedResults === 1 ? '' : 's'}${skippedResults ? ` (${skippedResults} skipped)` : ''}${skippedAssertions ? `, ${skippedAssertions} duplicate assertion${skippedAssertions === 1 ? '' : 's'} skipped` : ''}.`,
                skippedResults > 0 ? 'warning' : 'success',
              );
              setAssertions([]);
              onClose();
            }
          } else {
            showToast('Failed to process assertions', 'error');
          }
        }
      } catch (error) {
        // Stop polling on error
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        setIsSubmitting(false);
        showToast(error instanceof Error ? error.message : 'Failed to get job status', 'error');
      }
    },
    [evalId, showToast, onApplied, onClose],
  );

  const executeSubmit = useCallback(async () => {
    if (!evalId) {
      showToast('Eval ID not available', 'error');
      return;
    }

    if (assertions.length === 0) {
      showToast('Add at least one assertion', 'warning');
      return;
    }

    if (!hasValidValues) {
      showToast('Please provide a value for all assertions that require one', 'warning');
      return;
    }

    const scopePayload =
      scope === 'results'
        ? { type: 'results' as const, resultIds: resultId ? [resultId] : [] }
        : scope === 'tests'
          ? { type: 'tests' as const, testIndices: testIndex != null ? [testIndex] : [] }
          : {
              type: 'filtered' as const,
              filters,
              filterMode,
              searchText,
            };

    try {
      setShowConfirmation(false);
      setIsSubmitting(true);
      setJobStatus(null);

      const response = await addEvalAssertions(evalId, {
        assertions,
        scope: scopePayload,
      });

      const data = response?.data;

      // If no job was created (e.g., no assertions to add), handle immediately
      if (!data?.jobId) {
        const updatedResults = data?.updatedResults ?? 0;
        const skippedResults = data?.skippedResults ?? 0;
        const skippedAssertions = data?.skippedAssertions ?? 0;

        showToast(
          `Added assertions to ${updatedResults} result${updatedResults === 1 ? '' : 's'}${skippedResults ? ` (${skippedResults} skipped)` : ''}${skippedAssertions ? `, ${skippedAssertions} duplicate assertion${skippedAssertions === 1 ? '' : 's'} skipped` : ''}.`,
          skippedResults > 0 ? 'warning' : 'success',
        );

        setIsSubmitting(false);
        onApplied?.();
        setAssertions([]);
        onClose();
        return;
      }

      // Initialize job status for progress display
      setJobStatus({
        status: 'in-progress',
        progress: 0,
        total: data.total ?? 0,
        completedResults: [],
        updatedResults: 0,
        skippedResults: 0,
        skippedAssertions: 0,
        errors: [],
        matchedTestCount: data.matchedTestCount,
      });

      // Start polling for job status
      pollingRef.current = setInterval(() => {
        pollJobStatus(data.jobId!);
      }, 500);

      // Also poll immediately
      await pollJobStatus(data.jobId);
    } catch (error) {
      setIsSubmitting(false);
      showToast(error instanceof Error ? error.message : 'Failed to add assertions', 'error');
    }
  }, [
    evalId,
    showToast,
    assertions,
    hasValidValues,
    scope,
    resultId,
    testIndex,
    filters,
    filterMode,
    searchText,
    onApplied,
    onClose,
    pollJobStatus,
  ]);

  const handleSubmitClick = useCallback(() => {
    // Show confirmation for large runs
    if (isLargeRun) {
      setShowConfirmation(true);
    } else {
      executeSubmit();
    }
  }, [isLargeRun, executeSubmit]);

  const handleRetry = async () => {
    if (!evalId || !jobStatus || jobStatus.errors.length === 0) {
      return;
    }

    const failedResultIds = jobStatus.errors.map((e) => e.resultId);

    try {
      setShowCompletedWithErrors(false);
      setIsSubmitting(true);
      setJobStatus(null);
      setErrorsExpanded(false);

      const response = await addEvalAssertions(evalId, {
        assertions,
        scope: { type: 'results', resultIds: failedResultIds },
      });

      const data = response?.data;

      // If no job was created, handle immediately
      if (!data?.jobId) {
        const updatedResults = data?.updatedResults ?? 0;
        const skippedResults = data?.skippedResults ?? 0;
        const skippedAssertions = data?.skippedAssertions ?? 0;

        showToast(
          `Retry: Added assertions to ${updatedResults} result${updatedResults === 1 ? '' : 's'}${skippedResults ? ` (${skippedResults} skipped)` : ''}${skippedAssertions ? `, ${skippedAssertions} duplicate assertion${skippedAssertions === 1 ? '' : 's'} skipped` : ''}.`,
          skippedResults > 0 ? 'warning' : 'success',
        );

        setIsSubmitting(false);
        onApplied?.();
        setAssertions([]);
        onClose();
        return;
      }

      // Initialize job status for progress display
      setJobStatus({
        status: 'in-progress',
        progress: 0,
        total: data.total ?? failedResultIds.length,
        completedResults: [],
        updatedResults: 0,
        skippedResults: 0,
        skippedAssertions: 0,
        errors: [],
      });

      // Start polling for job status
      pollingRef.current = setInterval(() => {
        pollJobStatus(data.jobId!);
      }, 500);

      // Also poll immediately
      await pollJobStatus(data.jobId);
    } catch (error) {
      setIsSubmitting(false);
      showToast(error instanceof Error ? error.message : 'Failed to retry assertions', 'error');
    }
  };

  const progressPercent =
    jobStatus && jobStatus.total > 0 ? Math.round((jobStatus.progress / jobStatus.total) * 100) : 0;
  const passCount = jobStatus?.completedResults.filter((r) => r.pass).length ?? 0;
  const failCount = jobStatus?.completedResults.filter((r) => !r.pass).length ?? 0;

  // Group errors by message for display
  const errorGroups = useMemo(() => {
    if (!jobStatus?.errors.length) {
      return [];
    }
    const groups = new Map<string, number>();
    for (const err of jobStatus.errors) {
      const count = groups.get(err.error) ?? 0;
      groups.set(err.error, count + 1);
    }
    return Array.from(groups.entries()).map(([message, count]) => ({ message, count }));
  }, [jobStatus?.errors]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && !isSubmitting && onClose()}>
      <DialogContent ref={dialogRef} className="max-w-[95vw] sm:max-w-xl md:max-w-2xl lg:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add assertions</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Confirmation step for large runs */}
          {showConfirmation && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="size-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      Confirm large assertion run
                    </p>
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      You're about to run{' '}
                      <strong>
                        {assertions.length} assertion
                        {assertions.length > 1 ? 's' : ''}
                      </strong>{' '}
                      on{' '}
                      <strong>
                        {targetCount.toLocaleString()} test case
                        {targetCount > 1 ? 's' : ''}
                      </strong>
                      .
                    </p>
                  </div>
                </div>

                {/* Scope summary */}
                <div className="pl-8 space-y-2 text-sm">
                  {filterSummary && (
                    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                      <Filter className="size-3.5" />
                      <span>Active: {filterSummary}</span>
                    </div>
                  )}
                  {searchText && (
                    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                      <Search className="size-3.5" />
                      <span>Search: "{searchText}"</span>
                    </div>
                  )}
                  {llmAssertionCount > 0 && (
                    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                      <Zap className="size-3.5" />
                      <span>
                        {llmAssertionCount} LLM assertion{llmAssertionCount > 1 ? 's' : ''} ×{' '}
                        {targetCount.toLocaleString()} ={' '}
                        <strong>{totalApiCalls.toLocaleString()} API calls</strong>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Completed with errors - show retry UI */}
          {showCompletedWithErrors && jobStatus && (
            <div className="space-y-4 py-2">
              {/* Success/error summary */}
              <div className="flex items-center gap-4 text-sm">
                {jobStatus.updatedResults > 0 && (
                  <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle className="size-4" />
                    <span>
                      {jobStatus.updatedResults} result
                      {jobStatus.updatedResults === 1 ? '' : 's'} updated
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                  <XCircle className="size-4" />
                  <span>{jobStatus.errors.length} failed</span>
                </div>
              </div>

              {/* Error details (collapsible) */}
              <Collapsible open={errorsExpanded} onOpenChange={setErrorsExpanded}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronDown
                      className={`size-4 transition-transform ${errorsExpanded ? 'rotate-180' : ''}`}
                    />
                    <span>View error details</span>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                    {errorGroups.map(({ message, count }) => (
                      <div key={message} className="flex items-start gap-2 text-sm">
                        <AlertTriangle className="size-4 text-amber-500 dark:text-amber-400 mt-0.5 shrink-0" />
                        <span className="text-muted-foreground">
                          {message}
                          {count > 1 && <span className="ml-1 text-xs">({count} results)</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Info text */}
              <p className="text-sm text-muted-foreground">
                Some assertions failed to run. You can retry just the failed results, or close and
                keep the successful changes.
              </p>
            </div>
          )}

          {/* Scope selector - only when in form mode */}
          {!isSubmitting &&
            !showCompletedWithErrors &&
            !showConfirmation &&
            scopeOptions.length > 1 && (
              <div className="space-y-2">
                <Label>Apply to</Label>
                <Select value={scope} onValueChange={(value) => setScope(value as AssertionScope)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select scope" />
                  </SelectTrigger>
                  <SelectContent>
                    {scopeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

          {!isSubmitting &&
            !showCompletedWithErrors &&
            !showConfirmation &&
            scopeOptions.length === 1 && (
              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">Scope</Label>
                <p className="text-sm">{scopeOptions[0].label}</p>
              </div>
            )}

          {/* Progress UI when job is running */}
          {isSubmitting && jobStatus && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Running {assertions.map((a) => a.type).join(', ')}...
                  </span>
                  <span className="font-medium">
                    {jobStatus.progress} / {jobStatus.total} outputs
                    {jobStatus.matchedTestCount &&
                      jobStatus.matchedTestCount !== jobStatus.total && (
                        <span className="text-muted-foreground font-normal">
                          {' '}
                          ({jobStatus.matchedTestCount} test cases)
                        </span>
                      )}
                  </span>
                </div>
                <Progress value={progressPercent} className="h-2" />
              </div>

              {jobStatus.completedResults.length > 0 && (
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle className="size-4" />
                    <span>{passCount} passed</span>
                  </div>
                  {failCount > 0 && (
                    <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                      <XCircle className="size-4" />
                      <span>{failCount} failed</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Form when not submitting and not showing errors or confirmation */}
          {!isSubmitting && !showCompletedWithErrors && !showConfirmation && (
            <PosthocAssertionsForm
              assertions={assertions}
              onChange={setAssertions}
              targetCount={targetCount}
            />
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {showConfirmation ? (
            <>
              <Button variant="ghost" onClick={() => setShowConfirmation(false)}>
                Back
              </Button>
              <Button onClick={executeSubmit}>Confirm & Run</Button>
            </>
          ) : showCompletedWithErrors && jobStatus ? (
            <>
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
              <Button onClick={handleRetry}>
                <RefreshCw className="size-4 mr-2" />
                Retry {jobStatus.errors.length} failed
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button onClick={handleSubmitClick} disabled={!canSubmit}>
                {isSubmitting
                  ? 'Processing...'
                  : assertions.length > 0
                    ? `Run ${assertions.length} on ${targetCount.toLocaleString()} →`
                    : 'Add assertions'}
              </Button>
              {canSubmit && (
                <span className="hidden sm:inline text-xs text-muted-foreground ml-2">⌘↵</span>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
