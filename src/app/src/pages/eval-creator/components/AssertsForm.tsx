import { useEffect, useState } from 'react';

import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { HelperText } from '@app/components/ui/helper-text';
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
  onValidityChange?: (isValid: boolean) => void;
}

const ASSERTION_TYPE_GROUPS: { label: string; types: AssertionType[] }[] = [
  {
    label: 'Recommended starting checks',
    types: ['contains', 'equals', 'is-json', 'llm-rubric'],
  },
  {
    label: 'Text matching',
    types: ['icontains', 'starts-with', 'regex', 'contains-all', 'contains-any'],
  },
  {
    label: 'Structured output',
    types: ['contains-json', 'is-xml', 'contains-xml', 'is-sql', 'contains-sql'],
  },
  {
    label: 'Model-graded quality',
    types: [
      'similar',
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
    ],
  },
  {
    label: 'Tools and agent behavior',
    types: [
      'is-valid-function-call',
      'is-valid-openai-function-call',
      'is-valid-openai-tools-call',
      'skill-used',
      'trajectory:goal-success',
      'trajectory:tool-args-match',
      'trajectory:tool-used',
      'trajectory:tool-sequence',
      'trajectory:step-count',
    ],
  },
  {
    label: 'Metrics and integrations',
    types: [
      'bleu',
      'cost',
      'finish-reason',
      'latency',
      'perplexity',
      'perplexity-score',
      'rouge-n',
      'webhook',
    ],
  },
  {
    label: 'Negative checks',
    types: [
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
    ],
  },
];

const ASSERTION_LABELS: Partial<Record<AssertionType, string>> = {
  contains: 'Contains text',
  equals: 'Equals exactly',
  'is-json': 'Valid JSON',
  'llm-rubric': 'LLM rubric',
  similar: 'Semantically similar',
  factuality: 'Factuality',
  'model-graded-closedqa': 'Closed QA grading',
  latency: 'Latency threshold',
  cost: 'Cost threshold',
};

const ASSERTION_HELP: Partial<Record<AssertionType, string>> = {
  contains: 'Passes when the response includes the text you enter below.',
  equals: 'Passes only when the response exactly matches the value below.',
  'is-json': 'Passes when the response is valid JSON. No value is needed.',
  'llm-rubric': 'A model judges the response using your criteria. This can add cost.',
  similar: 'A model checks semantic similarity to your expected answer. This can add cost.',
};

const getAssertionLabel = (type: AssertionType): string => {
  const label = ASSERTION_LABELS[type];
  return label ? `${label} (${type})` : type;
};

// Assertion types that accept comma-separated values
const ARRAY_VALUE_ASSERTION_TYPES = new Set<AssertionType>([
  'contains-any',
  'contains-all',
  'not-contains-any',
  'not-contains-all',
]);

const OPTIONAL_JSON_SCHEMA_ASSERTION_TYPES = new Set<AssertionType>([
  'is-json',
  'contains-json',
  'not-is-json',
  'not-contains-json',
]);

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
  'trajectory:goal-success',
]);

const REQUIRED_TEXT_VALUE_ASSERTION_TYPES = new Set<AssertionType>([
  'contains',
  'icontains',
  'starts-with',
  'regex',
  'webhook',
  'not-contains',
  'not-icontains',
  'not-starts-with',
  'not-regex',
  'not-webhook',
  'llm-rubric',
  'similar',
]);

const formatAssertionValue = (assert: Assertion): string => {
  if (ARRAY_VALUE_ASSERTION_TYPES.has(assert.type) && Array.isArray(assert.value)) {
    return assert.value.map(String).join(', ');
  }

  if (typeof assert.value === 'string' || typeof assert.value === 'number') {
    return String(assert.value);
  }

  if (assert.value && typeof assert.value === 'object') {
    return JSON.stringify(assert.value, null, 2);
  }

  return '';
};

const parseAssertionValue = (type: AssertionType, value: string): Assertion['value'] => {
  if (ARRAY_VALUE_ASSERTION_TYPES.has(type)) {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return value;
};

const getAssertionValueError = (assert: Assertion): string | undefined => {
  if (
    ARRAY_VALUE_ASSERTION_TYPES.has(assert.type) &&
    (!Array.isArray(assert.value) || assert.value.length === 0)
  ) {
    return 'Enter at least one comma-separated value for this check.';
  }

  if (
    REQUIRED_TEXT_VALUE_ASSERTION_TYPES.has(assert.type) &&
    (typeof assert.value !== 'string' || assert.value.trim() === '')
  ) {
    if (assert.type === 'llm-rubric') {
      return 'Enter grading criteria before using an LLM rubric.';
    }
    if (assert.type === 'similar') {
      return 'Enter an expected answer for semantic similarity.';
    }

    return 'Enter an expected value before saving this check.';
  }

  return undefined;
};

const AssertsForm = ({ onAdd, initialValues, onValidityChange }: AssertsFormProps) => {
  const [asserts, setAsserts] = useState<Assertion[]>(initialValues || []);
  const [arrayValueDrafts, setArrayValueDrafts] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      (initialValues || []).flatMap((assert, index) =>
        ARRAY_VALUE_ASSERTION_TYPES.has(assert.type) ? [[index, formatAssertionValue(assert)]] : [],
      ),
    ),
  );
  const assertionErrors = asserts.map(getAssertionValueError);
  const isValid = assertionErrors.every((error) => error === undefined);

  useEffect(() => {
    onValidityChange?.(isValid);
  }, [isValid, onValidityChange]);

  const handleAdd = () => {
    const newAsserts = [...asserts, { type: 'contains' as AssertionType, value: '' }];
    setAsserts(newAsserts);
    onAdd(newAsserts);
  };

  const handleRemoveAssert = (indexToRemove: number) => {
    const newAsserts = asserts.filter((_, index) => index !== indexToRemove);
    setAsserts(newAsserts);
    setArrayValueDrafts((drafts) =>
      Object.fromEntries(
        Object.entries(drafts).flatMap(([indexText, draft]) => {
          const index = Number(indexText);
          if (index === indexToRemove) {
            return [];
          }
          return [[index > indexToRemove ? index - 1 : index, draft]];
        }),
      ),
    );
    onAdd(newAsserts);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Assertions</h3>
      <p className="text-sm text-muted-foreground">
        Assertions are pass or fail checks. Start with a deterministic check such as Contains text
        or Equals exactly; model-graded checks handle judgment calls but may add cost.
      </p>

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
                        Model-graded: may add cost
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
                    const nextType = newValue as AssertionType;
                    const newAsserts = asserts.map((a, i) => {
                      if (i !== index) {
                        return a;
                      }

                      if (
                        OPTIONAL_JSON_SCHEMA_ASSERTION_TYPES.has(nextType) &&
                        !OPTIONAL_JSON_SCHEMA_ASSERTION_TYPES.has(a.type)
                      ) {
                        const { value: _value, ...assertWithoutValue } = a;
                        return { ...assertWithoutValue, type: nextType };
                      }

                      if (ARRAY_VALUE_ASSERTION_TYPES.has(nextType)) {
                        const valueText = formatAssertionValue(a);
                        setArrayValueDrafts((drafts) => ({ ...drafts, [index]: valueText }));
                        return {
                          ...a,
                          type: nextType,
                          value: parseAssertionValue(nextType, valueText),
                        };
                      }

                      if (ARRAY_VALUE_ASSERTION_TYPES.has(a.type)) {
                        setArrayValueDrafts((drafts) => {
                          const { [index]: _removed, ...nextDrafts } = drafts;
                          return nextDrafts;
                        });
                        return { ...a, type: nextType, value: formatAssertionValue(a) };
                      }

                      return { ...a, type: nextType };
                    });
                    setAsserts(newAsserts);
                    onAdd(newAsserts);
                  }}
                >
                  <SelectTrigger id={`assert-type-${index}`}>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {ASSERTION_TYPE_GROUPS.map((group) => (
                      <SelectGroup key={group.label}>
                        <SelectLabel>{group.label}</SelectLabel>
                        {group.types.map((type) => (
                          <SelectItem key={type} value={type}>
                            {getAssertionLabel(type)}
                            {LLM_ASSERTION_TYPES.has(type) && ' - model-graded'}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                {ASSERTION_HELP[assert.type] && (
                  <p className="text-xs text-muted-foreground">{ASSERTION_HELP[assert.type]}</p>
                )}

                {OPTIONAL_JSON_SCHEMA_ASSERTION_TYPES.has(assert.type) &&
                assert.value === undefined ? (
                  <div className="space-y-2 rounded-md border border-dashed border-border p-3">
                    <p className="text-xs text-muted-foreground">
                      This check validates JSON without requiring a schema. Add one only when you
                      need specific fields or types.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newAsserts = asserts.map((a, i) =>
                          i === index ? { ...a, value: '' } : a,
                        );
                        setAsserts(newAsserts);
                        onAdd(newAsserts);
                      }}
                    >
                      Add optional JSON schema
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor={`assert-value-${index}`} className="text-sm font-medium">
                        {OPTIONAL_JSON_SCHEMA_ASSERTION_TYPES.has(assert.type)
                          ? 'JSON schema (optional)'
                          : 'Value'}
                      </Label>
                      {OPTIONAL_JSON_SCHEMA_ASSERTION_TYPES.has(assert.type) && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const newAsserts = asserts.map((a, i) => {
                              if (i !== index) {
                                return a;
                              }
                              const { value: _value, ...assertWithoutValue } = a;
                              return assertWithoutValue;
                            });
                            setAsserts(newAsserts);
                            onAdd(newAsserts);
                          }}
                        >
                          Remove schema
                        </Button>
                      )}
                    </div>
                    <Textarea
                      id={`assert-value-${index}`}
                      aria-invalid={Boolean(assertionErrors[index])}
                      aria-describedby={
                        assertionErrors[index] ? `assert-value-error-${index}` : undefined
                      }
                      placeholder={
                        OPTIONAL_JSON_SCHEMA_ASSERTION_TYPES.has(assert.type)
                          ? 'type: object\nrequired: [answer]'
                          : 'Enter expected value or criteria...'
                      }
                      value={
                        ARRAY_VALUE_ASSERTION_TYPES.has(assert.type)
                          ? (arrayValueDrafts[index] ?? formatAssertionValue(assert))
                          : formatAssertionValue(assert)
                      }
                      onChange={(e) => {
                        if (ARRAY_VALUE_ASSERTION_TYPES.has(assert.type)) {
                          setArrayValueDrafts((drafts) => ({
                            ...drafts,
                            [index]: e.target.value,
                          }));
                        }
                        const newValue = parseAssertionValue(assert.type, e.target.value);
                        const newAsserts = asserts.map((a, i) =>
                          i === index ? { ...a, value: newValue } : a,
                        );
                        setAsserts(newAsserts);
                        onAdd(newAsserts);
                      }}
                      className="min-h-20 resize-y"
                    />
                    {assertionErrors[index] && (
                      <HelperText id={`assert-value-error-${index}`} error>
                        {assertionErrors[index]}
                      </HelperText>
                    )}
                    {OPTIONAL_JSON_SCHEMA_ASSERTION_TYPES.has(assert.type) && (
                      <p className="text-xs text-muted-foreground">
                        Enter a JSON Schema in YAML or JSON format.
                      </p>
                    )}
                    {ARRAY_VALUE_ASSERTION_TYPES.has(assert.type) && (
                      <p className="text-xs text-muted-foreground">
                        Separate values with commas, e.g.{' '}
                        <code className="rounded bg-muted px-1 py-0.5 font-mono">hello, world</code>
                      </p>
                    )}
                    {(assert.type === 'regex' || assert.type === 'not-regex') && (
                      <p className="text-xs text-muted-foreground">
                        Enter a regular expression pattern, e.g.{' '}
                        <code className="rounded bg-muted px-1 py-0.5 font-mono">hello.*world</code>
                      </p>
                    )}
                  </div>
                )}
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
