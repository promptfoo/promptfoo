import { useState } from 'react';

import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { DeleteIcon } from '@app/components/ui/icons';
import { Label } from '@app/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { requiresLlm } from '@app/utils/assertionRegistry';
import { Sparkles } from 'lucide-react';
import { AssertionConfigForm } from './AssertionConfigForm';
import { AssertionTypePicker } from './AssertionTypePicker';
import SuggestAssertionsDialog from './SuggestAssertionsDialog';
import type { Assertion, AssertionType, TestCase } from '@promptfoo/types';

interface AssertsFormProps {
  onAdd: (asserts: Assertion[]) => void;
  initialValues: Assertion[];
  prompts?: string[];
  existingTests?: TestCase[];
}

const AssertsForm = ({
  onAdd,
  initialValues,
  prompts = [],
  existingTests = [],
}: AssertsFormProps) => {
  const [asserts, setAsserts] = useState<Assertion[]>(initialValues || []);
  const [suggestDialogOpen, setSuggestDialogOpen] = useState(false);

  const handleAdd = () => {
    const newAsserts = [...asserts, { type: 'equals' as AssertionType, value: '' }];
    setAsserts(newAsserts);
    onAdd(newAsserts);
  };

  const handleAddSuggested = (newAsserts: Assertion[]) => {
    const combined = [...asserts, ...newAsserts];
    setAsserts(combined);
    onAdd(combined);
  };

  const handleRemoveAssert = (indexToRemove: number) => {
    const newAsserts = asserts.filter((_, index) => index !== indexToRemove);
    setAsserts(newAsserts);
    onAdd(newAsserts);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Assertions</h3>

      {asserts.length > 0 && (
        <div className="space-y-3">
          {asserts.map((assert, index) => (
            <Card key={index} className="p-4">
              <div className="space-y-3">
                {/* Header: Type selector and delete button */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`assert-type-${index}`} className="text-sm font-medium">
                      Type
                    </Label>
                    {requiresLlm(assert.type) && (
                      <Badge variant="secondary" className="text-xs">
                        LLM
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveAssert(index)}
                    className="shrink-0"
                    aria-label="Remove assertion"
                  >
                    <DeleteIcon className="h-4 w-4" />
                  </Button>
                </div>

                {/* Type selector with search */}
                <AssertionTypePicker
                  id={`assert-type-${index}`}
                  value={assert.type}
                  onValueChange={(newValue) => {
                    const newAsserts = asserts.map((a, i) =>
                      i === index ? { ...a, type: newValue as AssertionType } : a,
                    );
                    setAsserts(newAsserts);
                    onAdd(newAsserts);
                  }}
                />

                {/* Type-specific configuration fields */}
                <AssertionConfigForm
                  assertion={assert}
                  onChange={(updatedAssertion) => {
                    const newAsserts = asserts.map((a, i) => (i === index ? updatedAssertion : a));
                    setAsserts(newAsserts);
                    onAdd(newAsserts);
                  }}
                />
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={handleAdd}>
          Add Assertion
        </Button>
        {prompts.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" onClick={() => setSuggestDialogOpen(true)}>
                <Sparkles className="mr-2 h-4 w-4" />
                Suggest with AI
              </Button>
            </TooltipTrigger>
            <TooltipContent>Generate assertions using AI</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Suggest Assertions Dialog */}
      <SuggestAssertionsDialog
        open={suggestDialogOpen}
        onOpenChange={setSuggestDialogOpen}
        prompts={prompts}
        existingTests={existingTests}
        onAdd={handleAddSuggested}
      />
    </div>
  );
};

export default AssertsForm;
