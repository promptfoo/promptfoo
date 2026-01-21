/**
 * GeneratedTestCasesPreview - Shows generated test cases for selection.
 * Features:
 * - Semantic grouping (core scenarios, edge cases)
 * - Select all / deselect all
 * - Individual selection with checkboxes
 * - Diversity score display
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@app/components/ui/button';
import { Checkbox } from '@app/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { cn } from '@app/lib/utils';
import { CheckCircle, ChevronDown, ChevronRight, RefreshCw, Sparkles } from 'lucide-react';

import type { DatasetGenerationResult } from '../../api/generation';

interface GeneratedTestCase {
  vars: Record<string, string>;
  description?: string;
  type?: 'core' | 'edge';
  category?: string;
}

interface GeneratedTestCasesPreviewProps {
  open: boolean;
  onClose: () => void;
  onAdd: (testCases: GeneratedTestCase[]) => void;
  onRegenerate?: () => void;
  result: DatasetGenerationResult;
}

export function GeneratedTestCasesPreview({
  open,
  onClose,
  onAdd,
  onRegenerate,
  result,
}: GeneratedTestCasesPreviewProps) {
  // Categorize test cases
  const categorizedTestCases = useMemo(() => {
    const core: GeneratedTestCase[] = [];
    const edge: GeneratedTestCase[] = [];

    // Process main test cases
    // Note: tc is already Record<string, string> (flat VarMapping), not wrapped object
    result.testCases.forEach((tc, idx) => {
      core.push({
        vars: tc,
        description: `Test Case #${idx + 1}`,
        type: 'core',
      });
    });

    // Process edge cases if present
    result.edgeCases?.forEach((ec) => {
      edge.push({
        vars: ec.vars,
        description: ec.description,
        type: 'edge',
        category: ec.type,
      });
    });

    return { core, edge };
  }, [result]);

  const allTestCases = useMemo(
    () => [...categorizedTestCases.core, ...categorizedTestCases.edge],
    [categorizedTestCases],
  );

  // Selection state
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(() => {
    // Select all by default
    return new Set(allTestCases.map((_, idx) => idx));
  });

  // Reset selection when test cases change (e.g., on regenerate)
  useEffect(() => {
    setSelectedIndices(new Set(allTestCases.map((_, idx) => idx)));
  }, [allTestCases]);

  // Group expansion state
  const [coreExpanded, setCoreExpanded] = useState(true);
  const [edgeExpanded, setEdgeExpanded] = useState(true);

  const handleToggleAll = useCallback(() => {
    if (selectedIndices.size === allTestCases.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(allTestCases.map((_, idx) => idx)));
    }
  }, [selectedIndices.size, allTestCases]);

  const handleToggle = useCallback((index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const handleAdd = useCallback(() => {
    const selected = allTestCases.filter((_, idx) => selectedIndices.has(idx));
    onAdd(selected);
    onClose();
  }, [allTestCases, selectedIndices, onAdd, onClose]);

  // Diversity score display
  const diversityScore = result.diversity?.score ?? 0;
  const diversityLabel = useMemo(() => {
    if (diversityScore >= 0.8) {
      return 'Excellent';
    }
    if (diversityScore >= 0.6) {
      return 'Good';
    }
    if (diversityScore >= 0.4) {
      return 'Fair';
    }
    return 'Low';
  }, [diversityScore]);

  const renderTestCaseItem = (tc: GeneratedTestCase, globalIndex: number) => {
    const isSelected = selectedIndices.has(globalIndex);
    const varsPreview = Object.entries(tc.vars)
      .slice(0, 2)
      .map(([k, v]) => `${k}="${String(v).slice(0, 20)}${String(v).length > 20 ? '...' : ''}"`)
      .join(', ');

    return (
      <div
        key={globalIndex}
        className={cn(
          'flex items-start gap-3 p-2 rounded-md transition-colors cursor-pointer',
          isSelected ? 'bg-muted/50' : 'hover:bg-muted/30',
          tc.type === 'edge' && 'border-l-2 border-amber-400',
        )}
        onClick={() => handleToggle(globalIndex)}
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => handleToggle(globalIndex)}
          onClick={(e) => e.stopPropagation()}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm truncate">{tc.description}</p>
          <p className="text-xs text-muted-foreground truncate">{varsPreview}</p>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-amber-500" />
            Generated Test Cases
          </DialogTitle>
          <DialogDescription>
            Review and select the test cases you want to add to your evaluation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Summary */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-sm font-medium">{allTestCases.length} test cases</p>
                <p className="text-xs text-muted-foreground">
                  {categorizedTestCases.core.length} core, {categorizedTestCases.edge.length} edge
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <p className="text-sm font-medium">
                  Diversity: {(diversityScore * 100).toFixed(0)}%
                </p>
                <p
                  className={cn(
                    'text-xs',
                    diversityScore >= 0.6
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400',
                  )}
                >
                  {diversityLabel}
                </p>
              </div>
              <CheckCircle
                className={cn(
                  'size-5',
                  diversityScore >= 0.6 ? 'text-emerald-500' : 'text-amber-500',
                )}
              />
            </div>
          </div>

          {/* Selection controls */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handleToggleAll}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {selectedIndices.size === allTestCases.length ? 'Deselect all' : 'Select all'}
            </button>
            <span className="text-sm text-muted-foreground">
              Selected: {selectedIndices.size}/{allTestCases.length}
            </span>
          </div>

          {/* Test case groups */}
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {/* Core scenarios */}
            {categorizedTestCases.core.length > 0 && (
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setCoreExpanded(!coreExpanded)}
                  className="flex items-center gap-1 text-sm font-medium w-full text-left"
                >
                  {coreExpanded ? (
                    <ChevronDown className="size-4" />
                  ) : (
                    <ChevronRight className="size-4" />
                  )}
                  Core Scenarios ({categorizedTestCases.core.length})
                </button>
                {coreExpanded && (
                  <div className="space-y-1 ml-4">
                    {categorizedTestCases.core.map((tc, idx) => renderTestCaseItem(tc, idx))}
                  </div>
                )}
              </div>
            )}

            {/* Edge cases */}
            {categorizedTestCases.edge.length > 0 && (
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setEdgeExpanded(!edgeExpanded)}
                  className="flex items-center gap-1 text-sm font-medium w-full text-left"
                >
                  {edgeExpanded ? (
                    <ChevronDown className="size-4" />
                  ) : (
                    <ChevronRight className="size-4" />
                  )}
                  <span className="text-amber-600 dark:text-amber-400">
                    Edge Cases ({categorizedTestCases.edge.length})
                  </span>
                  <span className="text-xs text-muted-foreground ml-1">Recommended</span>
                </button>
                {edgeExpanded && (
                  <div className="space-y-1 ml-4">
                    {categorizedTestCases.edge.map((tc, idx) =>
                      renderTestCaseItem(tc, categorizedTestCases.core.length + idx),
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="flex gap-2 sm:mr-auto">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            {onRegenerate && (
              <Button variant="outline" onClick={onRegenerate}>
                <RefreshCw className="size-4 mr-2" />
                Regenerate
              </Button>
            )}
          </div>
          <Button
            onClick={handleAdd}
            disabled={selectedIndices.size === 0}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            Add Selected ({selectedIndices.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
