/**
 * RowActionMenu - Action menu for entire test case rows.
 *
 * Provides row-level actions including:
 * - Re-run entire test case (all providers)
 * - Edit test variables
 * - Add row-level assertions
 * - Set triage status (new, investigating, resolved)
 * - Export row data
 */

import React, { useState } from 'react';

import { Badge } from '@app/components/ui/badge';
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@app/components/ui/dropdown-menu';
import { Label } from '@app/components/ui/label';
import { Spinner } from '@app/components/ui/spinner';
import { Textarea } from '@app/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { useToast } from '@app/hooks/useToast';
import type { EvaluateTableRow } from '@promptfoo/types';
import {
  AlertCircle,
  Check,
  CheckCircle,
  ChevronDown,
  ClipboardCopy,
  Download,
  Edit,
  Flag,
  MoreVertical,
  Play,
  Search,
  Shield,
} from 'lucide-react';

export type TriageStatus = 'new' | 'investigating' | 'resolved' | 'wont_fix';

export interface RowActionMenuProps {
  /** The row data */
  row: EvaluateTableRow;
  /** Row index in the table */
  rowIndex: number;
  /** Evaluation ID */
  evaluationId?: string;
  /** Current triage status */
  triageStatus?: TriageStatus;
  /** Callback to re-run the entire row */
  onRerunRow?: (rowIndex: number) => Promise<void>;
  /** Callback to edit variables */
  onEditVariables?: (rowIndex: number, variables: Record<string, unknown>) => void;
  /** Callback to add row-level assertion */
  onAddAssertion?: (rowIndex: number, assertion: { type: string; value: string }) => void;
  /** Callback to change triage status */
  onTriageStatusChange?: (rowIndex: number, status: TriageStatus) => void;
  /** Callback to export row data */
  onExportRow?: (rowIndex: number, format: 'json' | 'yaml') => void;
  /** Whether re-run is in progress */
  isRerunning?: boolean;
  /** Total number of prompts/columns */
  promptCount?: number;
}

const TRIAGE_STATUS_CONFIG: Record<TriageStatus, { label: string; icon: typeof Flag; color: string }> = {
  new: { label: 'New', icon: Flag, color: 'text-blue-500' },
  investigating: { label: 'Investigating', icon: Search, color: 'text-amber-500' },
  resolved: { label: 'Resolved', icon: CheckCircle, color: 'text-emerald-500' },
  wont_fix: { label: "Won't Fix", icon: AlertCircle, color: 'text-gray-500' },
};

export function RowActionMenu({
  row,
  rowIndex,
  evaluationId,
  triageStatus = 'new',
  onRerunRow,
  onEditVariables,
  onAddAssertion,
  onTriageStatusChange,
  onExportRow,
  isRerunning = false,
  promptCount = 1,
}: RowActionMenuProps) {
  const { showToast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editVarsDialogOpen, setEditVarsDialogOpen] = useState(false);
  const [assertionDialogOpen, setAssertionDialogOpen] = useState(false);

  // Edit variables state
  const [editedVars, setEditedVars] = useState('');

  // Assertion state
  const [assertionType, setAssertionType] = useState('contains');
  const [assertionValue, setAssertionValue] = useState('');

  const currentTriageConfig = TRIAGE_STATUS_CONFIG[triageStatus];

  const handleRerunRow = async () => {
    if (!onRerunRow) return;
    setMenuOpen(false);
    try {
      await onRerunRow(rowIndex);
      showToast(`Re-running test case ${rowIndex + 1}...`, 'info');
    } catch (error) {
      showToast('Failed to re-run test case', 'error');
    }
  };

  const handleOpenEditVars = () => {
    // Initialize with current variables
    const vars = row.test?.vars || {};
    setEditedVars(JSON.stringify(vars, null, 2));
    setEditVarsDialogOpen(true);
    setMenuOpen(false);
  };

  const handleSaveVariables = () => {
    try {
      const parsedVars = JSON.parse(editedVars);
      onEditVariables?.(rowIndex, parsedVars);
      setEditVarsDialogOpen(false);
      showToast('Variables updated', 'success');
    } catch {
      showToast('Invalid JSON format', 'error');
    }
  };

  const handleAddAssertion = () => {
    if (!assertionValue.trim()) {
      showToast('Please enter an assertion value', 'error');
      return;
    }
    onAddAssertion?.(rowIndex, { type: assertionType, value: assertionValue });
    setAssertionDialogOpen(false);
    setAssertionValue('');
    showToast('Assertion added to test case', 'success');
  };

  const handleTriageChange = (status: TriageStatus) => {
    onTriageStatusChange?.(rowIndex, status);
    setMenuOpen(false);
    showToast(`Status changed to ${TRIAGE_STATUS_CONFIG[status].label}`, 'success');
  };

  const handleCopyRowData = async () => {
    try {
      const rowData = {
        vars: row.vars,
        test: row.test,
        outputs: row.outputs.map((o) => ({
          text: o.text,
          pass: o.pass,
          score: o.score,
        })),
      };
      await navigator.clipboard.writeText(JSON.stringify(rowData, null, 2));
      showToast('Row data copied to clipboard', 'success');
    } catch {
      showToast('Failed to copy row data', 'error');
    }
    setMenuOpen(false);
  };

  const handleExport = (format: 'json' | 'yaml') => {
    onExportRow?.(rowIndex, format);
    setMenuOpen(false);
  };

  // Calculate row pass rate
  const passCount = row.outputs.filter((o) => o.pass).length;
  const passRate = row.outputs.length > 0 ? Math.round((passCount / row.outputs.length) * 100) : 0;

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Row actions</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="w-56">
          {/* Row info header */}
          <div className="px-2 py-1.5 text-xs text-muted-foreground border-b mb-1">
            <div className="flex items-center justify-between">
              <span>Test Case {rowIndex + 1}</span>
              <Badge
                variant="secondary"
                className={
                  passRate === 100
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                    : passRate >= 50
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'
                      : 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300'
                }
              >
                {passRate}% pass
              </Badge>
            </div>
          </div>

          {/* Re-run row */}
          {onRerunRow && (
            <DropdownMenuItem onClick={handleRerunRow} disabled={isRerunning}>
              {isRerunning ? (
                <Spinner className="size-4 mr-2" />
              ) : (
                <Play className="size-4 mr-2" />
              )}
              Re-run test case ({promptCount} provider{promptCount > 1 ? 's' : ''})
            </DropdownMenuItem>
          )}

          {/* Edit variables */}
          {onEditVariables && (
            <DropdownMenuItem onClick={handleOpenEditVars}>
              <Edit className="size-4 mr-2" />
              Edit variables
            </DropdownMenuItem>
          )}

          {/* Add assertion */}
          {onAddAssertion && (
            <DropdownMenuItem onClick={() => { setAssertionDialogOpen(true); setMenuOpen(false); }}>
              <Shield className="size-4 mr-2" />
              Add assertion
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          {/* Triage status submenu */}
          {onTriageStatusChange && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <currentTriageConfig.icon className={`size-4 mr-2 ${currentTriageConfig.color}`} />
                Triage: {currentTriageConfig.label}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {(Object.entries(TRIAGE_STATUS_CONFIG) as [TriageStatus, typeof currentTriageConfig][]).map(
                  ([status, config]) => (
                    <DropdownMenuItem
                      key={status}
                      onClick={() => handleTriageChange(status)}
                      className="flex items-center justify-between"
                    >
                      <span className="flex items-center">
                        <config.icon className={`size-4 mr-2 ${config.color}`} />
                        {config.label}
                      </span>
                      {triageStatus === status && <Check className="size-4 ml-2" />}
                    </DropdownMenuItem>
                  )
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          <DropdownMenuSeparator />

          {/* Copy row data */}
          <DropdownMenuItem onClick={handleCopyRowData}>
            <ClipboardCopy className="size-4 mr-2" />
            Copy row data
          </DropdownMenuItem>

          {/* Export submenu */}
          {onExportRow && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Download className="size-4 mr-2" />
                Export row
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={() => handleExport('json')}>
                  Export as JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('yaml')}>
                  Export as YAML
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Edit Variables Dialog */}
      <Dialog open={editVarsDialogOpen} onOpenChange={setEditVarsDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="size-5" />
              Edit Test Variables
            </DialogTitle>
            <DialogDescription>
              Modify the variables for test case {rowIndex + 1}. Changes will be used for re-runs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Variables (JSON)</Label>
              <Textarea
                value={editedVars}
                onChange={(e) => setEditedVars(e.target.value)}
                rows={10}
                className="font-mono text-sm"
                placeholder='{"key": "value"}'
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditVarsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveVariables}>
              Save Variables
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
              Add Row Assertion
            </DialogTitle>
            <DialogDescription>
              Add an assertion that applies to all outputs in this test case.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Assertion Type</Label>
              <select
                value={assertionType}
                onChange={(e) => setAssertionType(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="contains">Contains</option>
                <option value="icontains">Contains (case-insensitive)</option>
                <option value="not-contains">Not contains</option>
                <option value="regex">Regex</option>
                <option value="llm-rubric">LLM Rubric</option>
              </select>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssertionDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddAssertion}>
              Add Assertion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default RowActionMenu;
