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
import {
  getMissingAssertionVariables,
  getRequiredAssertionVariables,
} from './assertionPrerequisites';
import VarsForm from './VarsForm';
import type { Assertion, AssertionOrSet, TestCase } from '@promptfoo/types';

interface TestCaseFormProps {
  open: boolean;
  onAdd: (testCase: TestCase, shouldClose: boolean) => void;
  varsList: string[];
  inheritedAssertions?: AssertionOrSet[];
  inheritedVars?: Record<string, unknown>;
  initialValues?: TestCase;
  onCancel: () => void;
}

const getTestCaseVars = (
  varsList: string[],
  initialVars: Record<string, string> | undefined,
): Record<string, string> => ({
  ...(initialVars || {}),
  ...Object.fromEntries(varsList.map((variable) => [variable, initialVars?.[variable] ?? ''])),
});

const getPersistedVars = (
  vars: Record<string, string>,
  initialVars: Record<string, string>,
  touchedVars: Set<string>,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(vars).filter(
      ([variable, value]) => value !== '' || variable in initialVars || touchedVars.has(variable),
    ),
  );

const TestCaseForm = ({
  open,
  onAdd,
  varsList,
  inheritedAssertions = [],
  inheritedVars = {},
  initialValues,
  onCancel,
}: TestCaseFormProps) => {
  const initialValuesVars = (initialValues?.vars || {}) as Record<string, string>;
  const [description, setDescription] = useState(initialValues?.description || '');
  const [vars, setVars] = useState<Record<string, string>>(initialValuesVars);
  const [touchedVars, setTouchedVars] = useState<Set<string>>(() => new Set());
  const [asserts, setAsserts] = useState<AssertionOrSet[]>(initialValues?.assert || []);
  const [assertsFormKey, setAssertsFormKey] = useState(0);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [addAnotherStatus, setAddAnotherStatus] = useState<string | null>(null);
  const [assertsValid, setAssertsValid] = useState(true);
  const effectiveInheritedAssertions =
    initialValues?.options?.disableDefaultAsserts === true ? [] : inheritedAssertions;
  const effectiveAssertions = [...effectiveInheritedAssertions, ...asserts];
  const assertionVariables = getRequiredAssertionVariables(effectiveAssertions);
  const editableVarsList = Array.from(new Set([...varsList, ...assertionVariables]));
  const persistedVars = getPersistedVars(vars, initialValuesVars, touchedVars);
  const missingAssertionVariables = getMissingAssertionVariables(effectiveAssertions, {
    ...inheritedVars,
    ...persistedVars,
  });
  const canSave = assertsValid && missingAssertionVariables.length === 0;
  const saveHelpIds = [
    assertsValid ? undefined : 'test-case-assertion-error',
    missingAssertionVariables.length > 0 ? 'test-case-assertion-variable-error' : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  React.useEffect(() => {
    if (!open) {
      return;
    }

    const nextInitialVars = (initialValues?.vars || {}) as Record<string, string>;
    if (initialValues) {
      setDescription(initialValues.description || '');
      setVars(nextInitialVars);
      setAsserts(initialValues.assert || []);
    } else {
      setDescription('');
      setVars({});
      setAsserts([]);
    }
    setTouchedVars(new Set());
    setDiscardDialogOpen(false);
    setAddAnotherStatus(null);
    setAssertsValid(true);
  }, [initialValues, open]);

  const initialDescription = initialValues?.description || '';
  const initialAsserts = initialValues?.assert || [];
  const isDirty =
    description !== initialDescription ||
    JSON.stringify(persistedVars) !== JSON.stringify(initialValuesVars) ||
    JSON.stringify(asserts) !== JSON.stringify(initialAsserts);

  const requestCancel = () => {
    if (isDirty) {
      setDiscardDialogOpen(true);
      return;
    }
    onCancel();
  };

  const handleAdd = (close: boolean) => {
    if (!canSave) {
      return;
    }

    onAdd(
      {
        // Preserve fields the dialog does not edit (options, metadata, threshold, …).
        ...(initialValues ?? {}),
        description,
        vars: persistedVars,
        assert: asserts,
      },
      close,
    );
    if (close) {
      onCancel();
      setAddAnotherStatus(null);
    } else {
      setAddAnotherStatus(
        'Test case added. By default it runs across every prompt and provider; YAML routing can narrow that set. Enter values for the next test case.',
      );
    }
    setDescription('');
    setVars({});
    setTouchedVars(new Set());
    setAsserts([]);
    setAssertsFormKey((prevKey) => prevKey + 1);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && requestCancel()}>
        <DialogContent
          className="flex max-h-[85vh] max-w-4xl flex-col overflow-hidden"
          hideDescription={false}
        >
          <DialogHeader>
            <DialogTitle>{initialValues ? 'Edit Test Case' : 'Add Test Case'}</DialogTitle>
            <DialogDescription>
              Set inputs for one evaluation example, then add optional pass or fail checks. By
              default, a test case runs against every configured prompt and provider; YAML routing
              can narrow that set.
            </DialogDescription>
          </DialogHeader>

          <div
            data-testid="test-case-dialog-scroll-body"
            className="min-h-0 flex-1 space-y-6 overflow-y-auto py-4"
          >
            {addAnotherStatus && (
              <p
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className="rounded-md bg-muted p-3 text-sm"
              >
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
              onAdd={(nextVars, updatedVariable) => {
                setVars(nextVars);
                if (updatedVariable) {
                  setTouchedVars((current) => new Set(current).add(updatedVariable));
                }
                setAddAnotherStatus(null);
              }}
              varsList={editableVarsList}
              initialValues={getTestCaseVars(editableVarsList, vars)}
            />
            <AssertsForm
              key={assertsFormKey}
              onAdd={(asserts) => {
                setAsserts(asserts);
                setAddAnotherStatus(null);
              }}
              onValidityChange={setAssertsValid}
              initialValues={
                ((initialValues?.assert || []).filter(
                  (item) => item.type !== 'assert-set',
                ) as Assertion[]) || []
              }
            />
          </div>

          <DialogFooter
            data-testid="test-case-dialog-footer"
            className="shrink-0 flex-wrap gap-2 sm:gap-0"
          >
            {!assertsValid && (
              <p
                id="test-case-assertion-error"
                role="alert"
                className="mr-auto text-left text-sm text-destructive"
              >
                Complete the highlighted assertion values before saving.
              </p>
            )}
            {missingAssertionVariables.length > 0 && (
              <p
                id="test-case-assertion-variable-error"
                role="alert"
                className="mr-auto text-left text-sm text-destructive"
              >
                Context assertions require values for: {missingAssertionVariables.join(', ')}.
              </p>
            )}
            <Button variant="outline" onClick={requestCancel}>
              Cancel
            </Button>
            {!initialValues && (
              <Button
                variant="secondary"
                disabled={!canSave}
                aria-describedby={saveHelpIds || undefined}
                onClick={() => handleAdd(false)}
              >
                Add and create another
              </Button>
            )}
            <Button
              disabled={!canSave}
              aria-describedby={saveHelpIds || undefined}
              onClick={() => handleAdd(true)}
            >
              {initialValues ? 'Update Test Case' : 'Add Test Case'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={discardDialogOpen}
        onOpenChange={(isOpen) => !isOpen && setDiscardDialogOpen(false)}
      >
        <DialogContent hideDescription={false}>
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
