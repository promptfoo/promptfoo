import { useState } from 'react';

import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
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
import { AlertCircle, Loader2, Sparkles } from 'lucide-react';
import { useGeneration } from '../hooks/useGeneration';
import type { TestCase } from '@promptfoo/types';

interface GenerateTestCasesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompts: string[];
  existingTests?: TestCase[];
  onAdd: (testCases: TestCase[]) => void;
}

export function GenerateTestCasesDialog({
  open,
  onOpenChange,
  prompts,
  existingTests = [],
  onAdd,
}: GenerateTestCasesDialogProps) {
  const [instructions, setInstructions] = useState('');
  const [numPersonas, setNumPersonas] = useState(3);
  const [numTestCasesPerPersona, setNumTestCasesPerPersona] = useState(2);
  const [generatedTestCases, setGeneratedTestCases] = useState<TestCase[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [step, setStep] = useState<'configure' | 'review'>('configure');

  const { generateTestCases, isGeneratingTestCases, testCasesError } = useGeneration();

  const handleGenerate = async () => {
    try {
      const testCases = await generateTestCases({
        prompts,
        instructions: instructions.trim() || undefined,
        numPersonas,
        numTestCasesPerPersona,
        existingTests,
      });

      setGeneratedTestCases(testCases);
      setSelectedIndices(new Set(testCases.map((_, i) => i))); // Select all by default
      setStep('review');
    } catch {
      // Error is already handled by the hook
    }
  };

  const handleAddSelected = () => {
    const selected = generatedTestCases.filter((_, i) => selectedIndices.has(i));
    onAdd(selected);
    handleClose();
  };

  const handleClose = () => {
    setStep('configure');
    setGeneratedTestCases([]);
    setSelectedIndices(new Set());
    setInstructions('');
    onOpenChange(false);
  };

  const toggleSelection = (index: number) => {
    const newSelected = new Set(selectedIndices);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedIndices(newSelected);
  };

  const selectAll = () => {
    setSelectedIndices(new Set(generatedTestCases.map((_, i) => i)));
  };

  const selectNone = () => {
    setSelectedIndices(new Set());
  };

  const hasNoPrompts = prompts.length === 0 || prompts.every((p) => !p.trim());
  const totalTestCases = numPersonas * numTestCasesPerPersona;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Generate Test Cases with AI
          </DialogTitle>
          <DialogDescription>
            {step === 'configure'
              ? 'AI will create diverse test cases based on user personas to thoroughly test your prompts.'
              : 'Review and select the test cases you want to add.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'configure' ? (
          <div className="space-y-6 py-4">
            {hasNoPrompts && (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-amber-800 dark:text-amber-200">
                    No prompts defined
                  </p>
                  <p className="text-amber-700 dark:text-amber-300 mt-1">
                    Add at least one prompt to your evaluation before generating test cases.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="num-personas">Number of personas</Label>
                <Input
                  id="num-personas"
                  type="number"
                  min={1}
                  max={10}
                  value={numPersonas}
                  onChange={(e) => setNumPersonas(Number(e.target.value))}
                  className="w-24"
                />
                <p className="text-xs text-muted-foreground">
                  Different user types to generate test cases for
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="num-per-persona">Test cases per persona</Label>
                <Input
                  id="num-per-persona"
                  type="number"
                  min={1}
                  max={10}
                  value={numTestCasesPerPersona}
                  onChange={(e) => setNumTestCasesPerPersona(Number(e.target.value))}
                  className="w-24"
                />
                <p className="text-xs text-muted-foreground">
                  Will generate up to {totalTestCases} test cases
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="instructions">Additional instructions (optional)</Label>
              <Textarea
                id="instructions"
                placeholder="E.g., 'Focus on edge cases' or 'Include some adversarial inputs'"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                className="min-h-[80px] resize-y"
              />
              <p className="text-xs text-muted-foreground">
                Guide the AI to generate specific types of test cases.
              </p>
            </div>

            {testCasesError && (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-red-800 dark:text-red-200">Generation failed</p>
                  <p className="text-red-700 dark:text-red-300 mt-1">{testCasesError}</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {selectedIndices.size} of {generatedTestCases.length} selected
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={selectAll}>
                  Select all
                </Button>
                <Button variant="ghost" size="sm" onClick={selectNone}>
                  Clear
                </Button>
              </div>
            </div>

            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {generatedTestCases.map((testCase, index) => (
                <Card
                  key={index}
                  className={cn(
                    'p-4 cursor-pointer transition-colors',
                    selectedIndices.has(index)
                      ? 'border-primary bg-primary/5'
                      : 'hover:border-muted-foreground/30',
                  )}
                  onClick={() => toggleSelection(index)}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selectedIndices.has(index)}
                      onCheckedChange={() => toggleSelection(index)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-medium text-sm">
                          {testCase.description || `Test Case #${index + 1}`}
                        </span>
                        {testCase.assert && testCase.assert.length > 0 && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">
                            {testCase.assert.length} assertions
                          </Badge>
                        )}
                      </div>
                      {testCase.vars && Object.keys(testCase.vars).length > 0 && (
                        <div className="space-y-1">
                          {Object.entries(testCase.vars).map(([key, value]) => (
                            <div key={key} className="text-xs">
                              <span className="font-mono text-muted-foreground">{key}:</span>{' '}
                              <span className="text-foreground">
                                {typeof value === 'string' ? value : JSON.stringify(value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 'configure' ? (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleGenerate} disabled={isGeneratingTestCases || hasNoPrompts}>
                {isGeneratingTestCases ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Test Cases
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep('configure')}>
                Back
              </Button>
              <Button onClick={handleAddSelected} disabled={selectedIndices.size === 0}>
                Add {selectedIndices.size} Test Case{selectedIndices.size !== 1 ? 's' : ''}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default GenerateTestCasesDialog;
