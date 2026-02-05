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

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialValues ? 'Edit Test Case' : 'Add Test Case'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="test-case-description">Description</Label>
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
          <AssertsForm
            key={assertsFormKey}
            onAdd={(asserts) => setAsserts(asserts)}
            initialValues={
              ((initialValues?.assert || []).filter(
                (item) => item.type !== 'assert-set',
              ) as Assertion[]) || []
            }
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
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
    </Dialog>
  );
};

export default TestCaseForm;
