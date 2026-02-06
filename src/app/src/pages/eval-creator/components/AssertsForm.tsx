import { useState } from 'react';

import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { DeleteIcon } from '@app/components/ui/icons';
import { Label } from '@app/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import { Textarea } from '@app/components/ui/textarea';
import type { Assertion, AssertionType } from '@promptfoo/types';

interface AssertsFormProps {
  onAdd: (asserts: Assertion[]) => void;
  initialValues: Assertion[];
}

// Most common assertion types first, then alphabetically by category
const assertTypes: AssertionType[] = [
  // Most common LLM-based assertions
  'similar',
  'llm-rubric',
  'factuality',
  'model-graded-closedqa',

  // Common string matching
  'contains',
  'icontains',
  'equals',
  'starts-with',
  'regex',

  // Multiple value matching
  'contains-all',
  'contains-any',

  // Format validation
  'is-json',
  'contains-json',
  'is-xml',
  'contains-xml',
  'is-sql',
  'contains-sql',

  // Other LLM-based
  'answer-relevance',
  'context-faithfulness',
  'context-recall',
  'context-relevance',
  'g-eval',
  'moderation',
  'pi',
  'select-best',

  // Function call validation
  'is-valid-function-call',
  'is-valid-openai-function-call',
  'is-valid-openai-tools-call',

  // Metrics
  'bleu',
  'cost',
  'finish-reason',
  'latency',
  'perplexity',
  'perplexity-score',
  'rouge-n',
  'webhook',

  // Negations
  'not-contains',
  'not-contains-all',
  'not-contains-any',
  'not-contains-json',
  'not-equals',
  'not-icontains',
  'not-is-json',
  'not-regex',
  'not-rouge-n',
  'not-similar',
  'not-starts-with',
  'not-webhook',
];

// Assertion types that require an LLM
const LLM_ASSERTION_TYPES = new Set<AssertionType>([
  'similar',
  'llm-rubric',
  'factuality',
  'model-graded-closedqa',
  'answer-relevance',
  'context-faithfulness',
  'context-recall',
  'context-relevance',
  'g-eval',
  'moderation',
  'pi',
  'select-best',
]);

const AssertsForm = ({ onAdd, initialValues }: AssertsFormProps) => {
  const [asserts, setAsserts] = useState<Assertion[]>(initialValues || []);

  const handleAdd = () => {
    const newAsserts = [...asserts, { type: 'equals' as AssertionType, value: '' }];
    setAsserts(newAsserts);
    onAdd(newAsserts);
  };

  const handleRemoveAssert = (indexToRemove: number) => {
    const newAsserts = asserts.filter((_, index) => index !== indexToRemove);
    setAsserts(newAsserts);
    onAdd(newAsserts);
  };

  return (
    <div className="space-y-4">
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
                    {LLM_ASSERTION_TYPES.has(assert.type) && (
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
                    <DeleteIcon className="size-4" />
                  </Button>
                </div>

                {/* Type selector */}
                <Select
                  value={assert.type}
                  onValueChange={(newValue) => {
                    const newAsserts = asserts.map((a, i) =>
                      i === index ? { ...a, type: newValue as AssertionType } : a,
                    );
                    setAsserts(newAsserts);
                    onAdd(newAsserts);
                  }}
                >
                  <SelectTrigger id={`assert-type-${index}`}>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {assertTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                        {LLM_ASSERTION_TYPES.has(type) && ' (LLM)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Value textarea */}
                <div className="space-y-2">
                  <Label htmlFor={`assert-value-${index}`} className="text-sm font-medium">
                    Value
                  </Label>
                  <Textarea
                    id={`assert-value-${index}`}
                    placeholder="Enter expected value or criteria..."
                    value={
                      typeof assert.value === 'string'
                        ? assert.value
                        : typeof assert.value === 'number'
                          ? String(assert.value)
                          : ''
                    }
                    onChange={(e) => {
                      const newValue = e.target.value;
                      const newAsserts = asserts.map((a, i) =>
                        i === index ? { ...a, value: newValue } : a,
                      );
                      setAsserts(newAsserts);
                      onAdd(newAsserts);
                    }}
                    className="min-h-20 resize-y"
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Button variant="outline" onClick={handleAdd}>
        Add Assertion
      </Button>
    </div>
  );
};

export default AssertsForm;
