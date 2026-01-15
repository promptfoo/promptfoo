import { useEffect, useMemo, useState } from 'react';

import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { Label } from '@app/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import { useToast } from '@app/hooks/useToast';
import { addEvalAssertions } from '@app/utils/api';
import type { Assertion, EvalResultsFilterMode } from '@promptfoo/types';
import type { ResultsFilter } from './store';
import PosthocAssertionsForm from './PosthocAssertionsForm';

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

  useEffect(() => {
    if (open) {
      setScope(defaultScope);
      setAssertions([]);
    }
  }, [open, defaultScope]);

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

  const canSubmit = assertions.length > 0 && Boolean(evalId) && !readOnly;

  const handleSubmit = async () => {
    if (!evalId) {
      showToast('Eval ID not available', 'error');
      return;
    }

    if (!canSubmit) {
      showToast('Add at least one assertion', 'warning');
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
      setIsSubmitting(true);
      const response = await addEvalAssertions(evalId, {
        assertions,
        scope: scopePayload,
      });

      const data = response?.data;
      const updatedResults = data?.updatedResults ?? 0;
      const skippedResults = data?.skippedResults ?? 0;
      const skippedAssertions = data?.skippedAssertions ?? 0;

      showToast(
        `Added assertions to ${updatedResults} result${updatedResults === 1 ? '' : 's'}${skippedResults ? ` (${skippedResults} skipped)` : ''}${skippedAssertions ? `, ${skippedAssertions} duplicate assertion${skippedAssertions === 1 ? '' : 's'} skipped` : ''}.`,
        skippedResults > 0 ? 'warning' : 'success',
      );

      onApplied?.();
      setAssertions([]);
      onClose();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Failed to add assertions',
        'error',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add assertions</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {scopeOptions.length > 1 && (
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

          {scopeOptions.length === 1 && (
            <div className="text-sm text-muted-foreground">Apply to: {scopeOptions[0].label}</div>
          )}

          <PosthocAssertionsForm assertions={assertions} onChange={setAssertions} />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || isSubmitting}>
            {isSubmitting ? 'Adding...' : 'Add assertions'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
