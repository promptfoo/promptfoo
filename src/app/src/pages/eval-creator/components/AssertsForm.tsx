import { useState } from 'react';

import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { DeleteIcon } from '@app/components/ui/icons';
import { Label } from '@app/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import { Textarea } from '@app/components/ui/textarea';
import type { Assertion, AssertionType } from '@promptfoo/types';

interface AssertsFormProps {
  onAdd: (asserts: Assertion[]) => void;
  initialValues: Assertion[];
}

// Assertion type metadata with descriptions
interface AssertionTypeInfo {
  type: AssertionType;
  description: string;
  requiresLlm?: boolean;
}

// Organized assertion types by category with descriptions
const ASSERTION_CATEGORIES: Record<string, AssertionTypeInfo[]> = {
  'AI Evaluation': [
    {
      type: 'llm-rubric',
      description: 'AI evaluates output against custom criteria',
      requiresLlm: true,
    },
    {
      type: 'factuality',
      description: 'Checks if output is factually consistent with context',
      requiresLlm: true,
    },
    {
      type: 'answer-relevance',
      description: 'Evaluates if the answer is relevant to the question',
      requiresLlm: true,
    },
    {
      type: 'model-graded-closedqa',
      description: 'Grades answer correctness for closed-domain questions',
      requiresLlm: true,
    },
    {
      type: 'context-faithfulness',
      description: 'Checks if output is faithful to the provided context',
      requiresLlm: true,
    },
    {
      type: 'context-recall',
      description: 'Measures how much context is captured in the output',
      requiresLlm: true,
    },
    {
      type: 'context-relevance',
      description: 'Evaluates relevance of retrieved context',
      requiresLlm: true,
    },
    { type: 'g-eval', description: 'G-Eval framework for LLM-based evaluation', requiresLlm: true },
    {
      type: 'moderation',
      description: 'Checks output against content moderation policies',
      requiresLlm: true,
    },
    {
      type: 'select-best',
      description: 'Selects the best output from multiple options',
      requiresLlm: true,
    },
  ],
  'Text Matching': [
    { type: 'contains', description: 'Output contains the specified text (case-sensitive)' },
    { type: 'icontains', description: 'Output contains the specified text (case-insensitive)' },
    { type: 'equals', description: 'Output exactly matches the expected text' },
    { type: 'starts-with', description: 'Output starts with the specified text' },
    { type: 'regex', description: 'Output matches a regular expression pattern' },
    { type: 'contains-all', description: 'Output contains all specified strings' },
    { type: 'contains-any', description: 'Output contains at least one of the specified strings' },
  ],
  Similarity: [
    {
      type: 'similar',
      description: 'Output is semantically similar to expected text',
      requiresLlm: true,
    },
    { type: 'levenshtein', description: 'Edit distance between output and expected text' },
    { type: 'rouge-n', description: 'ROUGE-N score for text overlap measurement' },
    { type: 'bleu', description: 'BLEU score for translation/generation quality' },
    { type: 'classifier', description: 'Output matches a classification label' },
  ],
  'Format Validation': [
    { type: 'is-json', description: 'Output is valid JSON' },
    { type: 'contains-json', description: 'Output contains valid JSON somewhere' },
    { type: 'is-xml', description: 'Output is valid XML' },
    { type: 'contains-xml', description: 'Output contains valid XML somewhere' },
    { type: 'is-sql', description: 'Output is valid SQL' },
    { type: 'contains-sql', description: 'Output contains valid SQL somewhere' },
    { type: 'is-valid-function-call', description: 'Output is a valid function call format' },
    {
      type: 'is-valid-openai-function-call',
      description: 'Output is a valid OpenAI function call',
    },
    { type: 'is-valid-openai-tools-call', description: 'Output is a valid OpenAI tools call' },
  ],
  'Safety & Security': [
    { type: 'pi', description: 'Prompt injection detection', requiresLlm: true },
  ],
  Performance: [
    { type: 'cost', description: 'API call cost is below threshold' },
    { type: 'latency', description: 'Response time is below threshold' },
    { type: 'perplexity', description: 'Model perplexity is below threshold' },
    { type: 'perplexity-score', description: 'Normalized perplexity score check' },
    { type: 'finish-reason', description: 'Checks the model finish reason (stop, length, etc.)' },
  ],
  Custom: [
    { type: 'javascript', description: 'Custom JavaScript assertion function' },
    { type: 'python', description: 'Custom Python assertion function' },
    { type: 'webhook', description: 'External webhook validates the output' },
  ],
  Negations: [
    { type: 'not-contains', description: 'Output does NOT contain the specified text' },
    { type: 'not-icontains', description: 'Output does NOT contain text (case-insensitive)' },
    { type: 'not-equals', description: 'Output does NOT exactly match the text' },
    { type: 'not-starts-with', description: 'Output does NOT start with the text' },
    { type: 'not-regex', description: 'Output does NOT match the regex pattern' },
    { type: 'not-contains-all', description: 'Output does NOT contain all specified strings' },
    { type: 'not-contains-any', description: 'Output does NOT contain any of the strings' },
    { type: 'not-contains-json', description: 'Output does NOT contain valid JSON' },
    { type: 'not-is-json', description: 'Output is NOT valid JSON' },
    { type: 'not-similar', description: 'Output is NOT semantically similar' },
    { type: 'not-rouge-n', description: 'ROUGE-N score is below threshold' },
    { type: 'not-webhook', description: 'Webhook returns failure' },
  ],
};

// Flatten for lookup
const ASSERTION_TYPE_INFO: Record<string, AssertionTypeInfo> = {};
for (const types of Object.values(ASSERTION_CATEGORIES)) {
  for (const info of types) {
    ASSERTION_TYPE_INFO[info.type] = info;
  }
}

// Helper to check if type requires LLM
const requiresLlm = (type: string): boolean => {
  return ASSERTION_TYPE_INFO[type]?.requiresLlm ?? false;
};

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
                  <SelectContent className="max-h-[400px]">
                    {Object.entries(ASSERTION_CATEGORIES).map(([category, types]) => (
                      <SelectGroup key={category}>
                        <SelectLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1.5">
                          {category}
                        </SelectLabel>
                        {types.map(({ type, description, requiresLlm: isLlm }) => (
                          <SelectItem key={type} value={type} className="py-2">
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{type}</span>
                                {isLlm && (
                                  <Badge variant="secondary" className="text-[10px] px-1 py-0">
                                    LLM
                                  </Badge>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground">{description}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectGroup>
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
                    className="min-h-[80px] resize-y"
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
