import React, { useState } from 'react';

import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { useToast } from '@app/hooks/useToast';
import { Sparkles } from 'lucide-react';
import AssertsForm from './AssertsForm';
import { GenerateAssertionsDialog } from './generation';
import VarsForm from './VarsForm';
import type { Assertion, TestCase } from '@promptfoo/types';

import type { GenerationPrompt } from '../api/generation';

interface TestCaseFormProps {
  open: boolean;
  onAdd: (testCase: TestCase, shouldClose: boolean) => void;
  varsList: string[];
  initialValues?: TestCase;
  onCancel: () => void;
  prompts?: GenerationPrompt[];
  existingTests?: TestCase[];
}

const TestCaseForm = ({
  open,
  onAdd,
  varsList,
  initialValues,
  onCancel,
  prompts = [],
  existingTests = [],
}: TestCaseFormProps) => {
  const { showToast } = useToast();
  const [description, setDescription] = useState(initialValues?.description || '');
  const [vars, setVars] = useState(initialValues?.vars || {});
  const [asserts, setAsserts] = useState(initialValues?.assert || []);
  const [assertsFormKey, setAssertsFormKey] = useState(0);
  const [generateAssertionsOpen, setGenerateAssertionsOpen] = useState(false);

  React.useEffect(() => {
    if (initialValues) {
      setDescription(initialValues.description || '');
      setVars(initialValues.vars || {});
      setAsserts(initialValues.assert || []);
    } else {
      setDescription('');
      setVars({});
      setAsserts([]);
    }
  }, [initialValues]);

  const handleAdd = (close: boolean) => {
    onAdd(
      {
        description,
        vars,
        assert: asserts,
      },
      close,
    );
    if (close) {
      onCancel();
    }
    setDescription('');
    setVars({});
    setAsserts([]);
    setAssertsFormKey((prevKey) => prevKey + 1);
  };

  const handleGeneratedAssertions = (generatedAssertions: Assertion[]) => {
    const newAsserts = [...asserts, ...generatedAssertions];
    setAsserts(newAsserts);
    setAssertsFormKey((prevKey) => prevKey + 1);
    showToast(
      `Added ${generatedAssertions.length} assertion${generatedAssertions.length === 1 ? '' : 's'}`,
      'success',
    );
  };

  const hasPrompts = prompts.length > 0;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="flex max-h-[85vh] max-w-4xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{initialValues ? 'Edit Test Case' : 'Add Test Case'}</DialogTitle>
        </DialogHeader>

        <div
          data-testid="test-case-dialog-scroll-body"
          className="min-h-0 flex-1 space-y-6 overflow-y-auto py-4"
        >
          <div className="space-y-2">
            <div className="flex items-baseline gap-1.5">
              <Label htmlFor="test-case-description" className="text-lg font-semibold">
                Description
              </Label>
              <span className="text-xs text-muted-foreground">(optional)</span>
            </div>
            <Input
              id="test-case-description"
              placeholder="Enter a description for this test case"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <VarsForm
            onAdd={(vars) => setVars(vars)}
            varsList={varsList}
            initialValues={initialValues?.vars as Record<string, string>}
          />
          {/* Assertions Section with Generate Button */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Assertions</h3>
              {hasPrompts && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setGenerateAssertionsOpen(true)}
                    >
                      <Sparkles className="size-4 mr-2 text-primary" />
                      Generate with AI
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Generate assertions based on your prompts</TooltipContent>
                </Tooltip>
              )}
            </div>
            <AssertsForm
              key={assertsFormKey}
              onAdd={(newAsserts) => setAsserts(newAsserts)}
              initialValues={
                ((initialValues?.assert || []).filter(
                  (item) => item.type !== 'assert-set',
                ) as Assertion[]) || []
              }
            />
          </div>
        </div>

        <DialogFooter data-testid="test-case-dialog-footer" className="shrink-0 gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          {!initialValues && (
            <Button variant="secondary" onClick={() => handleAdd(false)}>
              Add Another
            </Button>
          )}
          <Button onClick={() => handleAdd(true)}>
            {initialValues ? 'Update Test Case' : 'Add Test Case'}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Generate Assertions Dialog */}
      <GenerateAssertionsDialog
        open={generateAssertionsOpen}
        onClose={() => setGenerateAssertionsOpen(false)}
        onGenerated={handleGeneratedAssertions}
        prompts={prompts}
        existingTests={existingTests}
      />
    </Dialog>
  );
};

export default TestCaseForm;
