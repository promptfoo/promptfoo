/**
 * GenerateTestCasesDialog - Simple dialog for generating test cases with sensible defaults.
 */
import { useCallback, useEffect, useState } from 'react';

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
import { Textarea } from '@app/components/ui/textarea';
import { cn } from '@app/lib/utils';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import {
  generateDataset,
  generateTestSuite,
  getGenerationCapabilities,
} from '../../api/generation';
import { useGenerationJob } from '../../hooks/useGenerationJob';
import { useGenerationStream } from '../../hooks/useGenerationStream';
import { GenerationProgressDialog } from './GenerationProgressDialog';
import type { Assertion, TestCase } from '@promptfoo/types';

import type {
  DatasetGenerationOptions,
  DatasetGenerationResult,
  GenerationPrompt,
  TestSuiteGenerationOptions,
  TestSuiteGenerationResult,
} from '../../api/generation';

interface GenerateTestCasesDialogProps {
  open: boolean;
  onClose: () => void;
  onGenerated: (
    testCases: Array<{ vars: Record<string, string>; description?: string }>,
    assertions?: Assertion[],
  ) => void;
  prompts: GenerationPrompt[];
  existingTests: TestCase[];
}

// Sensible defaults
const DEFAULT_NUM_PERSONAS = 5;
const DEFAULT_TESTS_PER_PERSONA = 3;

export function GenerateTestCasesDialog({
  open,
  onClose,
  onGenerated,
  prompts,
  existingTests,
}: GenerateTestCasesDialogProps) {
  // Simple state with good defaults
  const [numPersonas, setNumPersonas] = useState(DEFAULT_NUM_PERSONAS);
  const [numTestCasesPerPersona, setNumTestCasesPerPersona] = useState(DEFAULT_TESTS_PER_PERSONA);
  const [includeAssertions, setIncludeAssertions] = useState(true);
  const [instructions, setInstructions] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Assertion type (auto-detected)
  const [assertionType, setAssertionType] = useState<'pi' | 'g-eval' | 'llm-rubric'>('llm-rubric');

  // Dialog state
  const [showProgress, setShowProgress] = useState(false);

  // Fetch capabilities on mount
  useEffect(() => {
    getGenerationCapabilities().then((caps) => {
      setAssertionType(caps.defaultAssertionType);
    });
  }, []);

  // Generation job hook
  const { startJob, cancelJob, jobId, status, progress, total, phase, error, reset } =
    useGenerationJob({
      onComplete: (generationResult) => {
        const isCombinedResult = 'dataset' in generationResult || 'assertions' in generationResult;

        let testCases: Array<{ vars: Record<string, string>; description?: string }>;
        let assertions: Assertion[] | undefined;

        if (isCombinedResult) {
          const combinedResult = generationResult as TestSuiteGenerationResult;
          testCases = (combinedResult.dataset?.testCases || []).map((tc, idx) => ({
            vars: tc,
            description: `Generated Test Case #${idx + 1}`,
          }));
          assertions = combinedResult.assertions?.assertions;
        } else {
          const datasetResult = generationResult as DatasetGenerationResult;
          testCases = datasetResult.testCases.map((tc, idx) => ({
            vars: tc,
            description: `Generated Test Case #${idx + 1}`,
          }));
        }

        onGenerated(testCases, assertions);
        handleClose();
      },
      onError: () => {},
    });

  // Streaming hook for live preview
  const {
    connect: connectStream,
    disconnect: disconnectStream,
    testCases: streamedTestCases,
  } = useGenerationStream();

  useEffect(() => {
    if (jobId && showProgress) {
      connectStream(jobId);
    }
  }, [jobId, showProgress, connectStream]);

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

    const datasetOptions: DatasetGenerationOptions = {
      numPersonas,
      numTestCasesPerPersona,
      instructions: instructions.trim() || undefined,
      // Good defaults always enabled
      edgeCases: { enabled: true, types: ['boundary', 'format', 'empty', 'special-chars'] },
      diversity: { enabled: true, targetScore: 0.7 },
    };

    try {
      if (includeAssertions) {
        const testSuiteOptions: TestSuiteGenerationOptions = {
          dataset: datasetOptions,
          assertions: { type: assertionType, numAssertions: 3 },
        };
        await startJob('tests', () => generateTestSuite(prompts, existingTests, testSuiteOptions));
      } else {
        await startJob('dataset', () => generateDataset(prompts, existingTests, datasetOptions));
      }
    } catch {
      // Error handled by hook
    }
  }, [
    numPersonas,
    numTestCasesPerPersona,
    instructions,
    includeAssertions,
    assertionType,
    prompts,
    existingTests,
    startJob,
  ]);

  const hasPrompts = prompts.length > 0;
  const totalTests = numPersonas * numTestCasesPerPersona;

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
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-amber-500" />
            Generate Test Cases
          </DialogTitle>
          <DialogDescription>
            Generate {totalTests} test cases{includeAssertions ? ' with assertions' : ''} from your
            prompts.
          </DialogDescription>
        </DialogHeader>

        {hasPrompts ? (
          <div className="space-y-4 py-2">
            {/* Main option: assertions */}
            <div className="flex items-center gap-3">
              <Checkbox
                id="includeAssertions"
                checked={includeAssertions}
                onCheckedChange={(checked) => setIncludeAssertions(checked === true)}
              />
              <Label htmlFor="includeAssertions" className="text-sm cursor-pointer">
                Include assertions (recommended)
              </Label>
            </div>

            {/* Advanced options - collapsed by default */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showAdvanced ? (
                  <ChevronDown className="size-3" />
                ) : (
                  <ChevronRight className="size-3" />
                )}
                Customize
              </button>

              <div
                className={cn(
                  'grid transition-all duration-200 ease-in-out',
                  showAdvanced
                    ? 'grid-rows-[1fr] opacity-100 mt-3'
                    : 'grid-rows-[0fr] opacity-0 mt-0',
                )}
              >
                <div className="overflow-hidden">
                  <div className="space-y-3 rounded-lg border border-border p-3 bg-muted/30">
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
                          Tests per persona
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

                    <div className="space-y-1">
                      <Label htmlFor="instructions" className="text-xs">
                        Custom instructions (optional)
                      </Label>
                      <Textarea
                        id="instructions"
                        placeholder="Focus on enterprise use cases..."
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                        className="h-16 resize-none text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-6 text-center">
            <p className="text-sm text-muted-foreground">
              Add at least one prompt before generating test cases.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={!hasPrompts}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            <Sparkles className="size-4 mr-2" />
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
