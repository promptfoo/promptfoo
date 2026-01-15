import { useState } from 'react';

import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@app/components/ui/collapsible';
import { DeleteIcon } from '@app/components/ui/icons';
import { Input } from '@app/components/ui/input';
import { JsonTextarea } from '@app/components/ui/json-textarea';
import { Label } from '@app/components/ui/label';
import { NumberInput } from '@app/components/ui/number-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import { Textarea } from '@app/components/ui/textarea';
import { ChevronDown } from 'lucide-react';
import type { Assertion, AssertionType } from '@promptfoo/types';

interface PosthocAssertionsFormProps {
  assertions: Assertion[];
  onChange: (assertions: Assertion[]) => void;
}

// Most common assertion types first, then alphabetically by category
const ASSERT_TYPES: AssertionType[] = [
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
]);

export default function PosthocAssertionsForm({ assertions, onChange }: PosthocAssertionsFormProps) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const handleAdd = () => {
    const next = [...assertions, { type: 'equals' as AssertionType, value: '' }];
    onChange(next);
  };

  const handleRemove = (indexToRemove: number) => {
    const next = assertions.filter((_, index) => index !== indexToRemove);
    onChange(next);
  };

  const updateAssertion = (index: number, updates: Partial<Assertion>) => {
    const next = assertions.map((assertion, i) =>
      i === index ? { ...assertion, ...updates } : assertion,
    );
    onChange(next);
  };

  return (
    <div className="space-y-4">
      {assertions.length > 0 && (
        <div className="space-y-3">
          {assertions.map((assertion, index) => (
            <Card key={index} className="p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`assert-type-${index}`} className="text-sm font-medium">
                      Type
                    </Label>
                    {LLM_ASSERTION_TYPES.has(assertion.type) && (
                      <Badge variant="secondary" className="text-xs">
                        LLM
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemove(index)}
                    className="shrink-0"
                    aria-label="Remove assertion"
                  >
                    <DeleteIcon className="size-4" />
                  </Button>
                </div>

                <Select
                  value={assertion.type}
                  onValueChange={(newValue) =>
                    updateAssertion(index, { type: newValue as AssertionType })
                  }
                >
                  <SelectTrigger id={`assert-type-${index}`}>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {ASSERT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                        {LLM_ASSERTION_TYPES.has(type) && ' (LLM)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="space-y-2">
                  <Label htmlFor={`assert-value-${index}`} className="text-sm font-medium">
                    Value
                  </Label>
                  <Textarea
                    id={`assert-value-${index}`}
                    placeholder="Enter expected value or criteria..."
                    value={
                      typeof assertion.value === 'string'
                        ? assertion.value
                        : typeof assertion.value === 'number'
                          ? String(assertion.value)
                          : ''
                    }
                    onChange={(e) => updateAssertion(index, { value: e.target.value })}
                    className="min-h-20 resize-y"
                  />
                </div>

                <Collapsible
                  open={expanded[index] || false}
                  onOpenChange={(isOpen) =>
                    setExpanded((prev) => ({ ...prev, [index]: isOpen }))
                  }
                >
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2 px-2">
                      Advanced options
                      <ChevronDown
                        className={`size-4 transition-transform ${expanded[index] ? 'rotate-180' : ''}`}
                      />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <NumberInput
                        label="Threshold"
                        value={assertion.threshold}
                        allowDecimals
                        onChange={(value) => updateAssertion(index, { threshold: value })}
                      />
                      <NumberInput
                        label="Weight"
                        value={assertion.weight}
                        allowDecimals
                        onChange={(value) => updateAssertion(index, { weight: value })}
                      />
                      <div className="sm:col-span-2">
                        <Label htmlFor={`assert-metric-${index}`}>Metric name</Label>
                        <Input
                          id={`assert-metric-${index}`}
                          value={assertion.metric || ''}
                          onChange={(e) => updateAssertion(index, { metric: e.target.value })}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label htmlFor={`assert-transform-${index}`}>Transform</Label>
                        <Textarea
                          id={`assert-transform-${index}`}
                          value={assertion.transform || ''}
                          onChange={(e) => updateAssertion(index, { transform: e.target.value })}
                          placeholder="Optional transform expression"
                          className="min-h-16"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label htmlFor={`assert-context-transform-${index}`}>
                          Context transform
                        </Label>
                        <Textarea
                          id={`assert-context-transform-${index}`}
                          value={assertion.contextTransform || ''}
                          onChange={(e) =>
                            updateAssertion(index, { contextTransform: e.target.value })
                          }
                          placeholder="Optional context transform expression"
                          className="min-h-16"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <JsonTextarea
                          label="Config (JSON)"
                          defaultValue={
                            assertion.config ? JSON.stringify(assertion.config, null, 2) : ''
                          }
                          onChange={(value) => updateAssertion(index, { config: value as any })}
                        />
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
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
}
