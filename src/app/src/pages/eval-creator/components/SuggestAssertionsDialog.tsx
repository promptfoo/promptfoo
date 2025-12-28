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
import { requiresLlm } from '@app/utils/assertionRegistry';
import type { Assertion, TestCase } from '@promptfoo/types';

interface SuggestAssertionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompts: string[];
  existingTests?: TestCase[];
  onAdd: (assertions: Assertion[]) => void;
}

export function SuggestAssertionsDialog({
  open,
  onOpenChange,
  prompts,
  existingTests = [],
  onAdd,
}: SuggestAssertionsDialogProps) {
  const [instructions, setInstructions] = useState('');
  const [numAssertions, setNumAssertions] = useState(5);
  const [generatedAssertions, setGeneratedAssertions] = useState<Assertion[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [step, setStep] = useState<'configure' | 'review'>('configure');

  const { generateAssertions, isGeneratingAssertions, assertionsError } = useGeneration();

  const handleGenerate = async () => {
    try {
      const assertions = await generateAssertions({
        prompts,
        instructions: instructions.trim() || undefined,
        numAssertions,
        existingTests,
        type: 'llm-rubric',
      });

      setGeneratedAssertions(assertions);
      setSelectedIndices(new Set(assertions.map((_, i) => i))); // Select all by default
      setStep('review');
    } catch {
      // Error is already handled by the hook
    }
  };

  const handleAddSelected = () => {
    const selected = generatedAssertions.filter((_, i) => selectedIndices.has(i));
    onAdd(selected);
    handleClose();
  };

  const handleClose = () => {
    setStep('configure');
    setGeneratedAssertions([]);
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
    setSelectedIndices(new Set(generatedAssertions.map((_, i) => i)));
  };

  const selectNone = () => {
    setSelectedIndices(new Set());
  };

  const hasNoPrompts = prompts.length === 0 || prompts.every((p) => !p.trim());

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Suggest Assertions with AI
          </DialogTitle>
          <DialogDescription>
            {step === 'configure'
              ? 'AI will analyze your prompts and suggest relevant assertions to test your LLM outputs.'
              : 'Review and select the assertions you want to add.'}
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
                    Add at least one prompt to your evaluation before generating assertions.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="num-assertions">Number of assertions to generate</Label>
              <Input
                id="num-assertions"
                type="number"
                min={1}
                max={20}
                value={numAssertions}
                onChange={(e) => setNumAssertions(Number(e.target.value))}
                className="w-24"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="instructions">Additional instructions (optional)</Label>
              <Textarea
                id="instructions"
                placeholder="E.g., 'Focus on testing for harmful content' or 'Include assertions for JSON format validation'"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                className="min-h-[80px] resize-y"
              />
              <p className="text-xs text-muted-foreground">
                Guide the AI to generate specific types of assertions.
              </p>
            </div>

            {assertionsError && (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-red-800 dark:text-red-200">Generation failed</p>
                  <p className="text-red-700 dark:text-red-300 mt-1">{assertionsError}</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {selectedIndices.size} of {generatedAssertions.length} selected
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
              {generatedAssertions.map((assertion, index) => (
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
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{assertion.type}</span>
                        {requiresLlm(assertion.type) && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">
                            LLM
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {typeof assertion.value === 'string'
                          ? assertion.value
                          : JSON.stringify(assertion.value)}
                      </p>
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
              <Button onClick={handleGenerate} disabled={isGeneratingAssertions || hasNoPrompts}>
                {isGeneratingAssertions ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Assertions
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
                Add {selectedIndices.size} Assertion{selectedIndices.size !== 1 ? 's' : ''}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SuggestAssertionsDialog;
