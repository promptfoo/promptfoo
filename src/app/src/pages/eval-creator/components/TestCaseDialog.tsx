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
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import AssertsForm from './AssertsForm';
import VarsForm from './VarsForm';
import type { Assertion, TestCase } from '@promptfoo/types';

interface TestCaseFormProps {
  open: boolean;
  onAdd: (testCase: TestCase, shouldClose: boolean) => void;
  varsList: string[];
  initialValues?: TestCase;
  onCancel: () => void;
}

const TestCaseForm = ({ open, onAdd, varsList, initialValues, onCancel }: TestCaseFormProps) => {
  const [description, setDescription] = useState(initialValues?.description || '');
  const [vars, setVars] = useState(initialValues?.vars || {});
  const [asserts, setAsserts] = useState(initialValues?.assert || []);
  const [assertsFormKey, setAssertsFormKey] = useState(0);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [addAnotherStatus, setAddAnotherStatus] = useState<string | null>(null);

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
    setDiscardDialogOpen(false);
    setAddAnotherStatus(null);
  }, [initialValues]);

  const initialDescription = initialValues?.description || '';
  const initialVars = initialValues?.vars || {};
  const initialAsserts = initialValues?.assert || [];
  const isDirty =
    description !== initialDescription ||
    JSON.stringify(vars) !== JSON.stringify(initialVars) ||
    JSON.stringify(asserts) !== JSON.stringify(initialAsserts);

  const requestCancel = () => {
    if (isDirty) {
      setDiscardDialogOpen(true);
      return;
    }
    onCancel();
  };

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
      setAddAnotherStatus(null);
    } else {
      setAddAnotherStatus('Test case added. Enter values for the next test case.');
    }
    setDescription('');
    setVars({});
    setAsserts([]);
    setAssertsFormKey((prevKey) => prevKey + 1);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && requestCancel()}>
        <DialogContent className="flex max-h-[85vh] max-w-4xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{initialValues ? 'Edit Test Case' : 'Add Test Case'}</DialogTitle>
            <DialogDescription>
              Set inputs for one evaluation example, then add optional pass or fail checks. Each
              test case runs against every configured prompt and provider.
            </DialogDescription>
          </DialogHeader>

          <div
            data-testid="test-case-dialog-scroll-body"
            className="min-h-0 flex-1 space-y-6 overflow-y-auto py-4"
          >
            {addAnotherStatus && (
              <p role="status" className="rounded-md bg-muted p-3 text-sm">
                {addAnotherStatus}
              </p>
            )}
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
                onChange={(e) => {
                  setDescription(e.target.value);
                  setAddAnotherStatus(null);
                }}
              />
            </div>
            <VarsForm
              onAdd={(vars) => {
                setVars(vars);
                setAddAnotherStatus(null);
              }}
              varsList={varsList}
              initialValues={initialValues?.vars as Record<string, string>}
            />
            <AssertsForm
              key={assertsFormKey}
              onAdd={(asserts) => {
                setAsserts(asserts);
                setAddAnotherStatus(null);
              }}
              initialValues={
                ((initialValues?.assert || []).filter(
                  (item) => item.type !== 'assert-set',
                ) as Assertion[]) || []
              }
            />
          </div>

          <DialogFooter data-testid="test-case-dialog-footer" className="shrink-0 gap-2 sm:gap-0">
            <Button variant="outline" onClick={requestCancel}>
              Cancel
            </Button>
            {!initialValues && (
              <Button variant="secondary" onClick={() => handleAdd(false)}>
                Add and create another
              </Button>
            )}
            <Button onClick={() => handleAdd(true)}>
              {initialValues ? 'Update Test Case' : 'Add Test Case'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={discardDialogOpen}
        onOpenChange={(isOpen) => !isOpen && setDiscardDialogOpen(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard test case changes?</DialogTitle>
            <DialogDescription>Your unsaved inputs and assertions will be lost.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscardDialogOpen(false)}>
              Continue editing
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setDiscardDialogOpen(false);
                onCancel();
              }}
            >
              Discard changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TestCaseForm;
