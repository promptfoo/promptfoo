/**
 * GenerateTestCasesDialog - Main dialog for configuring and starting test case generation.
 * Features:
 * - Simple mode with just count
 * - Advanced options (personas, edge cases, diversity)
 * - Live preview estimation
 * - Progress tracking
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
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import { Textarea } from '@app/components/ui/textarea';
import { cn } from '@app/lib/utils';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { generateDataset } from '../../api/generation';
import { useGenerationJob } from '../../hooks/useGenerationJob';
import { useGenerationStream } from '../../hooks/useGenerationStream';
import { GenerationProgressDialog } from './GenerationProgressDialog';
import type { TestCase } from '@promptfoo/types';

import type {
  DatasetGenerationOptions,
  DatasetGenerationResult,
  GenerationPrompt,
} from '../../api/generation';

interface GenerateTestCasesDialogProps {
  open: boolean;
  onClose: () => void;
  onGenerated: (testCases: Array<{ vars: Record<string, string>; description?: string }>) => void;
  prompts: GenerationPrompt[];
  existingTests: TestCase[];
}

export function GenerateTestCasesDialog({
  open,
  onClose,
  onGenerated,
  prompts,
  existingTests,
}: GenerateTestCasesDialogProps) {
  // Form state
  const [numPersonas, setNumPersonas] = useState(5);
  const [numTestCasesPerPersona, setNumTestCasesPerPersona] = useState(3);
  const [includeEdgeCases, setIncludeEdgeCases] = useState(true);
  const [optimizeDiversity, setOptimizeDiversity] = useState(true);
  const [iterativeRefinement, setIterativeRefinement] = useState(false);
  const [instructions, setInstructions] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Dialog state
  const [showProgress, setShowProgress] = useState(false);

  // Generation job hook
  const {
    startJob,
    cancelJob,
    jobId,
    status,
    progress,
    total,
    phase,
    result: _result,
    error,
    reset,
  } = useGenerationJob({
    onComplete: (generationResult) => {
      const datasetResult = generationResult as DatasetGenerationResult;
      // Convert test cases to the expected format
      // Backend returns flat VarMapping objects (Record<string, string>)
      // Frontend expects { vars: Record<string, string> }
      const testCases = datasetResult.testCases.map((tc, idx) => ({
        vars: tc, // tc is already the vars object (Record<string, string>)
        description: `Generated Test Case #${idx + 1}`,
      }));
      onGenerated(testCases);
      handleClose();
    },
    onError: () => {
      // Error is already in state, dialog will show it
    },
  });

  // Streaming hook for live preview
  const {
    connect: connectStream,
    disconnect: disconnectStream,
    testCases: streamedTestCases,
  } = useGenerationStream();

  // Connect to stream when job starts
  useEffect(() => {
    if (jobId && showProgress) {
      connectStream(jobId);
    }
  }, [jobId, showProgress, connectStream]);

  // Estimated count
  const estimatedCount = useMemo(() => {
    let count = numPersonas * numTestCasesPerPersona;
    if (includeEdgeCases) {
      count += 5; // Estimate 5 edge cases
    }
    return count;
  }, [numPersonas, numTestCasesPerPersona, includeEdgeCases]);

  // Estimated time (rough estimate)
  const estimatedTime = useMemo(() => {
    // Roughly 2 seconds per test case + 5 seconds overhead
    const seconds = Math.ceil(estimatedCount * 2 + 5);
    if (iterativeRefinement) {
      return `~${Math.ceil(seconds * 1.5)} sec`;
    }
    return `~${seconds} sec`;
  }, [estimatedCount, iterativeRefinement]);

  const handleClose = useCallback(() => {
    setShowProgress(false);
    disconnectStream();
    reset();
    onClose();
  }, [reset, onClose, disconnectStream]);

  const handleCancel = useCallback(() => {
    cancelJob();
    disconnectStream();
    setShowProgress(false);
  }, [cancelJob, disconnectStream]);

  const handleGenerate = useCallback(async () => {
    setShowProgress(true);

    const options: DatasetGenerationOptions = {
      numPersonas,
      numTestCasesPerPersona,
      instructions: instructions.trim() || undefined,
      edgeCases: includeEdgeCases
        ? {
            enabled: true,
            types: ['boundary', 'format', 'empty', 'special-chars'],
          }
        : undefined,
      diversity: optimizeDiversity
        ? {
            enabled: true,
            targetScore: 0.7,
          }
        : undefined,
      iterative: iterativeRefinement
        ? {
            enabled: true,
            maxRounds: 2,
          }
        : undefined,
    };

    try {
      await startJob('dataset', () => generateDataset(prompts, existingTests, options));
    } catch {
      // Error handled by hook
    }
  }, [
    numPersonas,
    numTestCasesPerPersona,
    instructions,
    includeEdgeCases,
    optimizeDiversity,
    iterativeRefinement,
    prompts,
    existingTests,
    startJob,
  ]);

  // Check if we have prompts to generate from
  const hasPrompts = prompts.length > 0;

  // Show progress dialog if generating
  if (showProgress) {
    return (
      <GenerationProgressDialog
        open={showProgress}
        onCancel={handleCancel}
        title="Generating Test Cases..."
        description="Creating diverse test cases based on your prompts."
        progress={progress}
        total={total}
        phase={phase}
        status={status === 'complete' ? 'complete' : status === 'error' ? 'error' : 'in-progress'}
        error={error}
        streamedTestCases={streamedTestCases}
        showLivePreview={true}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-amber-500" />
            Generate Test Cases
          </DialogTitle>
          <DialogDescription>
            Based on your prompts, we'll generate diverse test cases to thoroughly evaluate your
            LLM.
          </DialogDescription>
        </DialogHeader>

        {hasPrompts ? (
          <div className="grid grid-cols-2 gap-6 py-4">
            {/* Configuration column */}
            <div className="space-y-4">
              {/* Simple count selector */}
              <div className="space-y-2">
                <Label htmlFor="totalCount">How many test cases?</Label>
                <Select
                  value={String(estimatedCount)}
                  onValueChange={(value) => {
                    const count = parseInt(value, 10);
                    // Adjust personas and per-persona to match
                    if (count <= 5) {
                      setNumPersonas(count);
                      setNumTestCasesPerPersona(1);
                    } else if (count <= 15) {
                      setNumPersonas(5);
                      setNumTestCasesPerPersona(Math.ceil(count / 5));
                    } else {
                      setNumPersonas(Math.ceil(count / 5));
                      setNumTestCasesPerPersona(5);
                    }
                  }}
                >
                  <SelectTrigger id="totalCount">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 test cases</SelectItem>
                    <SelectItem value="10">10 test cases</SelectItem>
                    <SelectItem value="15">15 test cases</SelectItem>
                    <SelectItem value="20">20 test cases</SelectItem>
                    <SelectItem value="25">25 test cases</SelectItem>
                    <SelectItem value="30">30 test cases</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Advanced options toggle */}
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {showAdvanced ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                )}
                Advanced options
              </button>

              {/* Advanced options */}
              {showAdvanced && (
                <div className="space-y-4 rounded-lg border border-border p-3 bg-muted/30">
                  {/* Personas and per-persona */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="numPersonas" className="text-xs">
                        Personas
                      </Label>
                      <Input
                        id="numPersonas"
                        type="number"
                        min={1}
                        max={10}
                        value={numPersonas}
                        onChange={(e) => setNumPersonas(parseInt(e.target.value, 10) || 1)}
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="perPersona" className="text-xs">
                        Per persona
                      </Label>
                      <Input
                        id="perPersona"
                        type="number"
                        min={1}
                        max={10}
                        value={numTestCasesPerPersona}
                        onChange={(e) =>
                          setNumTestCasesPerPersona(parseInt(e.target.value, 10) || 1)
                        }
                        className="h-8"
                      />
                    </div>
                  </div>

                  {/* Checkboxes */}
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="edgeCases"
                        checked={includeEdgeCases}
                        onCheckedChange={(checked) => setIncludeEdgeCases(checked === true)}
                      />
                      <div>
                        <Label htmlFor="edgeCases" className="text-sm font-normal cursor-pointer">
                          Include edge cases
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Boundary values, format errors, special characters
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="diversity"
                        checked={optimizeDiversity}
                        onCheckedChange={(checked) => setOptimizeDiversity(checked === true)}
                      />
                      <div>
                        <Label htmlFor="diversity" className="text-sm font-normal cursor-pointer">
                          Optimize for diversity
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Ensure test cases cover different scenarios
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="iterative"
                        checked={iterativeRefinement}
                        onCheckedChange={(checked) => setIterativeRefinement(checked === true)}
                      />
                      <div>
                        <Label htmlFor="iterative" className="text-sm font-normal cursor-pointer">
                          Iterative refinement
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Multiple passes to fill coverage gaps
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Instructions */}
                  <div className="space-y-1">
                    <Label htmlFor="instructions" className="text-xs">
                      Additional instructions (optional)
                    </Label>
                    <Textarea
                      id="instructions"
                      placeholder="Focus on enterprise customers..."
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                      className="h-16 resize-none text-sm"
                    />
                  </div>
                </div>
              )}

              {/* Estimated time */}
              <p className="text-xs text-muted-foreground">Est. time: {estimatedTime}</p>
            </div>

            {/* Preview column */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                Preview (estimated)
              </Label>
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 h-[240px] overflow-y-auto">
                <p className="text-sm font-medium">~{estimatedCount} test cases</p>

                {/* Sample previews */}
                <div className="space-y-2">
                  <div className="rounded border border-border/60 bg-background p-2">
                    <p className="text-xs text-muted-foreground truncate">
                      "Enterprise admin asking about SSO configuration..."
                    </p>
                  </div>
                  <div className="rounded border border-border/60 bg-background p-2">
                    <p className="text-xs text-muted-foreground truncate">
                      "Small business owner with billing question..."
                    </p>
                  </div>
                  {includeEdgeCases && (
                    <div
                      className={cn(
                        'rounded border p-2',
                        'border-amber-200 dark:border-amber-800/50',
                        'bg-amber-50/50 dark:bg-amber-950/20',
                      )}
                    >
                      <p className="text-xs text-amber-700 dark:text-amber-300 truncate">
                        Edge: empty input handling
                      </p>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground text-center">
                    ... +{Math.max(0, estimatedCount - 3)} more
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center">
            <p className="text-muted-foreground">
              Add at least one prompt before generating test cases.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={!hasPrompts}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            <Sparkles className="size-4 mr-2" />
            Generate Now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
