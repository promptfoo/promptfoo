/**
 * CellActionMenu - Enhanced action menu for evaluation output cells.
 *
 * Provides a dropdown menu with actions for individual cells including:
 * - Re-run evaluation
 * - Mark as golden output
 * - Add assertions
 * - Compare with other cells
 * - Export cell data
 */

import React, { useState } from 'react';

import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@app/components/ui/dropdown-menu';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import { Spinner } from '@app/components/ui/spinner';
import { Textarea } from '@app/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { useToast } from '@app/hooks/useToast';
import type { EvaluateTableOutput } from '@promptfoo/types';
import {
  Award,
  ChevronDown,
  ClipboardCopy,
  GitCompare,
  MoreHorizontal,
  Play,
  Plus,
  Shield,
} from 'lucide-react';

export interface CellActionMenuProps {
  /** The output data for this cell */
  output: EvaluateTableOutput;
  /** Row index in the table */
  rowIndex: number;
  /** Prompt/column index in the table */
  promptIndex: number;
  /** Evaluation ID */
  evaluationId?: string;
  /** Callback to trigger a cell re-run */
  onRerun?: () => void;
  /** Callback when marking output as golden */
  onMarkGolden?: (output: string, assertionType: string) => void;
  /** Callback to add a custom assertion */
  onAddAssertion?: (assertion: { type: string; value: string; metric?: string }) => void;
  /** Callback to compare with another cell */
  onCompare?: (targetRowIndex: number, targetPromptIndex: number) => void;
  /** Whether replay is loading */
  isReplayLoading?: boolean;
  /** Whether the menu is in compact mode */
  compact?: boolean;
}

/**
 * Assertion type options for the add assertion dialog.
 */
const ASSERTION_TYPES = [
  { value: 'equals', label: 'Equals', description: 'Exact match' },
  { value: 'contains', label: 'Contains', description: 'Output contains text' },
  { value: 'icontains', label: 'Contains (case-insensitive)', description: 'Case-insensitive contains' },
  { value: 'starts-with', label: 'Starts with', description: 'Output starts with text' },
  { value: 'regex', label: 'Regex', description: 'Matches regular expression' },
  { value: 'not-contains', label: 'Not contains', description: 'Output does not contain text' },
  { value: 'javascript', label: 'JavaScript', description: 'Custom JavaScript assertion' },
  { value: 'llm-rubric', label: 'LLM Rubric', description: 'LLM-based evaluation' },
];

export function CellActionMenu({
  output,
  rowIndex,
  promptIndex,
  evaluationId,
  onRerun,
  onMarkGolden,
  onAddAssertion,
  onCompare,
  isReplayLoading = false,
  compact = false,
}: CellActionMenuProps) {
  const { showToast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [goldenDialogOpen, setGoldenDialogOpen] = useState(false);
  const [assertionDialogOpen, setAssertionDialogOpen] = useState(false);
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);

  // Golden output dialog state
  const [goldenAssertionType, setGoldenAssertionType] = useState('equals');

  // Add assertion dialog state
  const [assertionType, setAssertionType] = useState('contains');
  const [assertionValue, setAssertionValue] = useState('');
  const [assertionMetric, setAssertionMetric] = useState('');

  // Compare dialog state
  const [compareTargetRow, setCompareTargetRow] = useState('');
  const [compareTargetPrompt, setCompareTargetPrompt] = useState('');

  const outputText = typeof output.text === 'string' ? output.text : JSON.stringify(output.text);

  const handleCopyOutput = async () => {
    try {
      await navigator.clipboard.writeText(outputText);
      showToast('Output copied to clipboard', 'success');
    } catch {
      showToast('Failed to copy output', 'error');
    }
    setMenuOpen(false);
  };

  const handleCopyAssertion = async () => {
    // Generate a YAML assertion based on current output
    const assertion = `- type: equals\n  value: ${JSON.stringify(outputText)}`;
    try {
      await navigator.clipboard.writeText(assertion);
      showToast('Assertion copied to clipboard', 'success');
    } catch {
      showToast('Failed to copy assertion', 'error');
    }
    setMenuOpen(false);
  };

  const handleRerun = () => {
    onRerun?.();
    setMenuOpen(false);
  };

  const handleMarkGolden = () => {
    onMarkGolden?.(outputText, goldenAssertionType);
    setGoldenDialogOpen(false);
    setMenuOpen(false);
    showToast('Output marked as golden', 'success');
  };

  const handleAddAssertion = () => {
    if (!assertionValue.trim()) {
      showToast('Please enter an assertion value', 'error');
      return;
    }
    onAddAssertion?.({
      type: assertionType,
      value: assertionValue,
      metric: assertionMetric || undefined,
    });
    setAssertionDialogOpen(false);
    setAssertionValue('');
    setAssertionMetric('');
    setMenuOpen(false);
    showToast('Assertion added', 'success');
  };

  const handleCompare = () => {
    const targetRow = parseInt(compareTargetRow, 10);
    const targetPrompt = parseInt(compareTargetPrompt, 10);
    if (isNaN(targetRow) || isNaN(targetPrompt)) {
      showToast('Please enter valid row and column indices', 'error');
      return;
    }
    onCompare?.(targetRow, targetPrompt);
    setCompareDialogOpen(false);
    setCompareTargetRow('');
    setCompareTargetPrompt('');
    setMenuOpen(false);
  };

  const menuTrigger = compact ? (
    <Button variant="ghost" size="icon" className="size-6">
      <MoreHorizontal className="size-4" />
    </Button>
  ) : (
    <Button variant="ghost" size="sm" className="h-7 px-2">
      <span className="text-xs">Actions</span>
      <ChevronDown className="size-3 ml-1" />
    </Button>
  );

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>{menuTrigger}</DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Cell actions</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-56">
          {/* Re-run action */}
          {onRerun && (
            <DropdownMenuItem onClick={handleRerun} disabled={isReplayLoading}>
              {isReplayLoading ? (
                <Spinner className="size-4 mr-2" />
              ) : (
                <Play className="size-4 mr-2" />
              )}
              Re-run this cell
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          {/* Golden output action */}
          {onMarkGolden && (
            <DropdownMenuItem onClick={() => setGoldenDialogOpen(true)}>
              <Award className="size-4 mr-2 text-amber-500" />
              Mark as golden output
            </DropdownMenuItem>
          )}

          {/* Add assertion action */}
          {onAddAssertion && (
            <DropdownMenuItem onClick={() => setAssertionDialogOpen(true)}>
              <Shield className="size-4 mr-2 text-blue-500" />
              Add assertion
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          {/* Copy actions */}
          <DropdownMenuItem onClick={handleCopyOutput}>
            <ClipboardCopy className="size-4 mr-2" />
            Copy output
          </DropdownMenuItem>

          <DropdownMenuItem onClick={handleCopyAssertion}>
            <Plus className="size-4 mr-2" />
            Copy as assertion
          </DropdownMenuItem>

          {/* Compare action */}
          {onCompare && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setCompareDialogOpen(true)}>
                <GitCompare className="size-4 mr-2" />
                Compare with...
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Mark as Golden Dialog */}
      <Dialog open={goldenDialogOpen} onOpenChange={setGoldenDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Award className="size-5 text-amber-500" />
              Mark as Golden Output
            </DialogTitle>
            <DialogDescription>
              Create an assertion that expects this exact output for future evaluations.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Assertion Type</Label>
              <Select value={goldenAssertionType} onValueChange={setGoldenAssertionType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="equals">Equals (exact match)</SelectItem>
                  <SelectItem value="contains">Contains</SelectItem>
                  <SelectItem value="icontains">Contains (case-insensitive)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Output Preview</Label>
              <div className="rounded-md border bg-muted/50 p-3 max-h-32 overflow-auto">
                <pre className="text-xs whitespace-pre-wrap break-words">
                  {outputText.length > 500 ? `${outputText.slice(0, 500)}...` : outputText}
                </pre>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGoldenDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleMarkGolden} className="bg-amber-600 hover:bg-amber-700">
              <Award className="size-4 mr-2" />
              Mark as Golden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Assertion Dialog */}
      <Dialog open={assertionDialogOpen} onOpenChange={setAssertionDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="size-5 text-blue-500" />
              Add Assertion
            </DialogTitle>
            <DialogDescription>
              Create a custom assertion for this test case.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Assertion Type</Label>
              <Select value={assertionType} onValueChange={setAssertionType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSERTION_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex flex-col">
                        <span>{type.label}</span>
                        <span className="text-xs text-muted-foreground">{type.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Value</Label>
              <Textarea
                placeholder="Enter assertion value..."
                value={assertionValue}
                onChange={(e) => setAssertionValue(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Metric Name (optional)</Label>
              <Input
                placeholder="e.g., accuracy, relevance"
                value={assertionMetric}
                onChange={(e) => setAssertionMetric(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                A custom metric name for tracking this assertion's results.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssertionDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddAssertion}>
              <Plus className="size-4 mr-2" />
              Add Assertion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Compare Dialog */}
      <Dialog open={compareDialogOpen} onOpenChange={setCompareDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitCompare className="size-5" />
              Compare with Another Cell
            </DialogTitle>
            <DialogDescription>
              Compare this cell's output with another cell in the table.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Target Row</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="Row index"
                  value={compareTargetRow}
                  onChange={(e) => setCompareTargetRow(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Target Column</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="Column index"
                  value={compareTargetPrompt}
                  onChange={(e) => setCompareTargetPrompt(e.target.value)}
                />
              </div>
            </div>
            <div className="p-3 bg-muted/50 rounded-md border">
              <p className="text-sm text-muted-foreground">
                Current cell: Row {rowIndex}, Column {promptIndex}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompareDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCompare}>
              <GitCompare className="size-4 mr-2" />
              Compare
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default CellActionMenu;
