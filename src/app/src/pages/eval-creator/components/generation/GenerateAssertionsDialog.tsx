/**
 * GenerateAssertionsDialog - Dialog for configuring and generating assertions.
 * Features:
 * - Assertion type selection
 * - Number of assertions
 * - Coverage analysis option
 * - Negative tests option
 */
import { useCallback, useState } from 'react';

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
import { Label } from '@app/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import { Textarea } from '@app/components/ui/textarea';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { generateAssertions } from '../../api/generation';
import { useGenerationJob } from '../../hooks/useGenerationJob';
import { GenerationProgressDialog } from './GenerationProgressDialog';
import type { Assertion, TestCase } from '@promptfoo/types';

import type {
  AssertionGenerationOptions,
  AssertionGenerationResult,
  GenerationPrompt,
} from '../../api/generation';

interface GenerateAssertionsDialogProps {
  open: boolean;
  onClose: () => void;
  onGenerated: (assertions: Assertion[]) => void;
  prompts: GenerationPrompt[];
  existingTests: TestCase[];
}

export function GenerateAssertionsDialog({
  open,
  onClose,
  onGenerated,
  prompts,
  existingTests,
}: GenerateAssertionsDialogProps) {
  // Form state
  const [numAssertions, setNumAssertions] = useState(5);
  const [assertionType, setAssertionType] = useState<'pi' | 'g-eval' | 'llm-rubric'>('pi');
  const [enableCoverage, setEnableCoverage] = useState(true);
  const [enableNegativeTests, setEnableNegativeTests] = useState(false);
  const [instructions, setInstructions] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Dialog state
  const [showProgress, setShowProgress] = useState(false);

  // Generation job hook
  const { startJob, cancelJob, status, progress, total, phase, error, reset } = useGenerationJob({
    onComplete: (generationResult) => {
      const assertionsResult = generationResult as AssertionGenerationResult;
      // Combine main assertions with negative tests if present
      const allAssertions = [
        ...assertionsResult.assertions,
        ...(assertionsResult.negativeTests || []),
      ];
      onGenerated(allAssertions);
      handleClose();
    },
    onError: () => {
      // Error is already in state
    },
  });

  const handleClose = useCallback(() => {
    setShowProgress(false);
    reset();
    onClose();
  }, [reset, onClose]);

  const handleCancel = useCallback(() => {
    cancelJob();
    setShowProgress(false);
  }, [cancelJob]);

  const handleGenerate = useCallback(async () => {
    setShowProgress(true);

    const options: AssertionGenerationOptions = {
      numAssertions,
      type: assertionType,
      instructions: instructions.trim() || undefined,
      coverage: enableCoverage
        ? {
            enabled: true,
            extractRequirements: true,
          }
        : undefined,
      negativeTests: enableNegativeTests
        ? {
            enabled: true,
            types: ['should-not-contain', 'should-not-hallucinate'],
          }
        : undefined,
    };

    try {
      await startJob('assertions', () => generateAssertions(prompts, existingTests, options));
    } catch {
      // Error handled by hook
    }
  }, [
    numAssertions,
    assertionType,
    instructions,
    enableCoverage,
    enableNegativeTests,
    prompts,
    existingTests,
    startJob,
  ]);

  // Check if we have prompts
  const hasPrompts = prompts.length > 0;

  // Show progress dialog if generating
  if (showProgress) {
    return (
      <GenerationProgressDialog
        open={showProgress}
        onCancel={handleCancel}
        title="Generating Assertions..."
        description="Creating assertions based on your prompts' requirements."
        progress={progress}
        total={total}
        phase={phase}
        status={status === 'complete' ? 'complete' : status === 'error' ? 'error' : 'in-progress'}
        error={error}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-amber-500" />
            Generate Assertions
          </DialogTitle>
          <DialogDescription>
            Generate assertions based on your prompts' requirements.
          </DialogDescription>
        </DialogHeader>

        {hasPrompts ? (
          <div className="space-y-4 py-4">
            {/* Number of assertions */}
            <div className="space-y-2">
              <Label htmlFor="numAssertions">Number of assertions</Label>
              <Select
                value={String(numAssertions)}
                onValueChange={(value) => setNumAssertions(parseInt(value, 10))}
              >
                <SelectTrigger id="numAssertions">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 assertions</SelectItem>
                  <SelectItem value="5">5 assertions</SelectItem>
                  <SelectItem value="7">7 assertions</SelectItem>
                  <SelectItem value="10">10 assertions</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Assertion type */}
            <div className="space-y-2">
              <Label htmlFor="assertionType">Assertion type</Label>
              <Select
                value={assertionType}
                onValueChange={(value) => setAssertionType(value as 'pi' | 'g-eval' | 'llm-rubric')}
              >
                <SelectTrigger id="assertionType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pi">PI (Prompt Invariant)</SelectItem>
                  <SelectItem value="g-eval">G-Eval</SelectItem>
                  <SelectItem value="llm-rubric">LLM-Rubric</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {assertionType === 'pi' && 'Yes/no questions about the output'}
                {assertionType === 'g-eval' && 'Numeric scoring with criteria'}
                {assertionType === 'llm-rubric' && 'Detailed rubric-based evaluation'}
              </p>
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
              <div className="space-y-3 rounded-lg border border-border p-3 bg-muted/30">
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="coverage"
                    checked={enableCoverage}
                    onCheckedChange={(checked) => setEnableCoverage(checked === true)}
                  />
                  <div>
                    <Label htmlFor="coverage" className="text-sm font-normal cursor-pointer">
                      Enable coverage analysis
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Extract requirements and map assertions to them
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <Checkbox
                    id="negativeTests"
                    checked={enableNegativeTests}
                    onCheckedChange={(checked) => setEnableNegativeTests(checked === true)}
                  />
                  <div>
                    <Label htmlFor="negativeTests" className="text-sm font-normal cursor-pointer">
                      Include negative tests
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Generate "should not" assertions (banned content, PII, etc.)
                    </p>
                  </div>
                </div>

                {/* Instructions */}
                <div className="space-y-1">
                  <Label htmlFor="instructions" className="text-xs">
                    Focus areas (optional)
                  </Label>
                  <Textarea
                    id="instructions"
                    placeholder="Ensure responses are concise and factual..."
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    className="h-16 resize-none text-sm"
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="py-8 text-center">
            <p className="text-muted-foreground">
              Add at least one prompt before generating assertions.
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
