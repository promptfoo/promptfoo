import { useEffect, useState } from 'react';

import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { HelperText } from '@app/components/ui/helper-text';
import { DeleteIcon } from '@app/components/ui/icons';
import { Input } from '@app/components/ui/input';
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
import {
  ARRAY_VALUE_ASSERTION_TYPES,
  COMMA_SEPARATED_VALUE_ASSERTION_TYPES,
  getAssertionValueError,
  REQUIRED_THRESHOLD_ASSERTION_TYPES,
  STRUCTURED_VALUE_ASSERTION_TYPES,
  THRESHOLD_ASSERTION_TYPES,
  WORD_COUNT_ASSERTION_TYPES,
} from './assertionValueValidation';
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
      'word-count',
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
  'not-similar': 'Not semantically similar',
  latency: 'Latency threshold',
  cost: 'Cost threshold',
  'word-count': 'Word count limits',
};

const ASSERTION_HELP: Partial<Record<AssertionType, string>> = {
  contains: 'Passes when the response includes the text you enter below.',
  equals: 'Passes only when the response exactly matches the value below.',
  'is-json': 'Passes when the response is valid JSON. No value is needed.',
  'llm-rubric':
    'A model judges the response. Add criteria to tailor the judge, or leave blank for the default rubric. This can add cost.',
  similar: 'A model checks semantic similarity to your expected answer. This can add cost.',
  'not-similar':
    'Fails when a model finds semantic similarity to your expected answer. This can add cost.',
  latency: 'Fails when a response takes longer than your maximum duration.',
  cost: 'Fails when one provider response costs more than your maximum amount.',
  'word-count': 'Checks response length without model grading or additional cost.',
  perplexity: 'Reports perplexity when supported; add a threshold only to make it pass or fail.',
  'perplexity-score':
    'Reports normalized perplexity when supported; add a threshold only to make it pass or fail.',
};

const getAssertionLabel = (type: AssertionType): string => {
  const label = ASSERTION_LABELS[type];
  return label ? `${label} (${type})` : type;
};

const OPTIONAL_JSON_SCHEMA_ASSERTION_TYPES = new Set<AssertionType>([
  'is-json',
  'contains-json',
  'not-is-json',
  'not-contains-json',
]);

const OPTIONAL_XML_ELEMENT_ASSERTION_TYPES = new Set<AssertionType>([
  'is-xml',
  'contains-xml',
  'not-is-xml',
  'not-contains-xml',
]);

const NO_VALUE_ASSERTION_TYPES = new Set<AssertionType>([
  'is-valid-function-call',
  'is-valid-openai-function-call',
  'is-valid-openai-tools-call',
  'not-is-valid-function-call',
  'not-is-valid-openai-function-call',
  'not-is-valid-openai-tools-call',
  'answer-relevance',
  'not-answer-relevance',
  'context-faithfulness',
  'not-context-faithfulness',
  'context-relevance',
  'not-context-relevance',
]);

// Assertion types that require an LLM
const LLM_ASSERTION_TYPES = new Set<AssertionType>([
  'similar',
  'not-similar',
  'llm-rubric',
  'not-llm-rubric',
  'factuality',
  'not-factuality',
  'model-graded-closedqa',
  'not-model-graded-closedqa',
  'answer-relevance',
  'not-answer-relevance',
  'context-faithfulness',
  'not-context-faithfulness',
  'context-recall',
  'not-context-recall',
  'context-relevance',
  'not-context-relevance',
  'g-eval',
  'not-g-eval',
  'moderation',
  'not-moderation',
  'pi',
  'not-pi',
  'select-best',
  'trajectory:goal-success',
  'not-trajectory:goal-success',
]);

const formatAssertionValue = (assert: Assertion): string => {
  if (COMMA_SEPARATED_VALUE_ASSERTION_TYPES.has(assert.type) && Array.isArray(assert.value)) {
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
  if (COMMA_SEPARATED_VALUE_ASSERTION_TYPES.has(type)) {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return value;
};

const formatAssertionThreshold = (assert: Assertion): string =>
  typeof assert.threshold === 'number' ? String(assert.threshold) : '';

const parseAssertionThreshold = (value: string): number | undefined =>
  value.trim() === '' ? undefined : Number(value);

const formatWordCountExact = (assert: Assertion): string =>
  typeof assert.value === 'number' || typeof assert.value === 'string' ? String(assert.value) : '';

const formatWordCountLimit = (assert: Assertion, limit: 'min' | 'max'): string =>
  assert.value &&
  typeof assert.value === 'object' &&
  !Array.isArray(assert.value) &&
  typeof assert.value[limit] === 'number'
    ? String(assert.value[limit])
    : '';

const updateWordCountLimit = (
  value: Assertion['value'],
  limit: 'min' | 'max',
  inputValue: string,
): Assertion['value'] => {
  const nextLimits =
    value && typeof value === 'object' && !Array.isArray(value)
      ? { ...value }
      : ({} as Record<string, number>);
  const parsedValue = parseAssertionThreshold(inputValue);
  if (parsedValue === undefined) {
    delete nextLimits[limit];
  } else {
    nextLimits[limit] = parsedValue;
  }
  return Object.keys(nextLimits).length > 0 ? nextLimits : undefined;
};

const formatStructuredValue = (assert: Assertion): string => {
  if (typeof assert.value === 'string') {
    return assert.value;
  }

  return assert.value === undefined ? '' : JSON.stringify(assert.value, null, 2);
};

const parseStructuredValue = (value: string): Assertion['value'] => {
  if (value.trim() === '') {
    return undefined;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

interface ThresholdFieldProps {
  assertion: Assertion;
  error?: string;
  index: number;
  onChange: (threshold: number | undefined) => void;
}

const ThresholdField = ({ assertion, error, index, onChange }: ThresholdFieldProps) => {
  const isLatency = assertion.type === 'latency' || assertion.type === 'not-latency';
  const isCost = assertion.type === 'cost' || assertion.type === 'not-cost';
  const descriptionId = error ? `assert-value-error-${index}` : `assert-threshold-help-${index}`;

  return (
    <div className="space-y-2">
      <Label htmlFor={`assert-threshold-${index}`} className="text-sm font-medium">
        Threshold
        {REQUIRED_THRESHOLD_ASSERTION_TYPES.has(assertion.type) && ' (required)'}
      </Label>
      <Input
        id={`assert-threshold-${index}`}
        type="number"
        min="0"
        step={isLatency ? '1' : 'any'}
        placeholder={isLatency ? '1000' : '0.01'}
        value={formatAssertionThreshold(assertion)}
        onChange={(event) => onChange(parseAssertionThreshold(event.target.value))}
        aria-invalid={Boolean(error)}
        aria-describedby={descriptionId}
      />
      {error ? (
        <HelperText id={`assert-value-error-${index}`} error>
          {error}
        </HelperText>
      ) : (
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {isLatency
            ? 'Maximum duration for each provider response, in milliseconds.'
            : isCost
              ? 'Maximum estimated cost for each provider response.'
              : 'Optional. Without a threshold, this check reports a metric only.'}
        </p>
      )}
    </div>
  );
};

interface WordCountFieldProps {
  assertion: Assertion;
  error?: string;
  index: number;
  onChange: (value: Assertion['value']) => void;
}

const WordCountField = ({ assertion, error, index, onChange }: WordCountFieldProps) => {
  const descriptionId = error ? `assert-value-error-${index}` : `assert-word-count-help-${index}`;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor={`assert-word-count-exact-${index}`} className="text-sm font-medium">
          Exact word count
        </Label>
        <Input
          id={`assert-word-count-exact-${index}`}
          type="number"
          min="0"
          step="1"
          value={formatWordCountExact(assertion)}
          onChange={(event) => onChange(parseAssertionThreshold(event.target.value))}
          aria-invalid={Boolean(error)}
          aria-describedby={descriptionId}
        />
      </div>
      <p className="text-xs text-muted-foreground">Or set an inclusive range:</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {(['min', 'max'] as const).map((limit) => (
          <div key={limit} className="space-y-2">
            <Label htmlFor={`assert-word-count-${limit}-${index}`} className="text-sm font-medium">
              {limit === 'min' ? 'Minimum words' : 'Maximum words'}
            </Label>
            <Input
              id={`assert-word-count-${limit}-${index}`}
              type="number"
              min="0"
              step="1"
              value={formatWordCountLimit(assertion, limit)}
              onChange={(event) =>
                onChange(updateWordCountLimit(assertion.value, limit, event.target.value))
              }
              aria-invalid={Boolean(error)}
              aria-describedby={descriptionId}
            />
          </div>
        ))}
      </div>
      {error ? (
        <HelperText id={`assert-value-error-${index}`} error>
          {error}
        </HelperText>
      ) : (
        <p id={descriptionId} className="text-xs text-muted-foreground">
          Enter an exact count, or a minimum and/or maximum. Editing a range clears an exact count.
        </p>
      )}
    </div>
  );
};

interface StructuredValueFieldProps {
  assertion: Assertion;
  error?: string;
  index: number;
  onChange: (value: Assertion['value']) => void;
}

const StructuredValueField = ({ assertion, error, index, onChange }: StructuredValueFieldProps) => {
  const isSql = assertion.type.includes('sql');
  const label = isSql ? 'SQL validation settings (JSON, optional)' : 'Expected trace data (JSON)';
  const descriptionId = error ? `assert-value-error-${index}` : `assert-structured-help-${index}`;

  return (
    <div className="space-y-2">
      <Label htmlFor={`assert-value-${index}`} className="text-sm font-medium">
        {label}
      </Label>
      <Textarea
        id={`assert-value-${index}`}
        value={formatStructuredValue(assertion)}
        onChange={(event) => onChange(parseStructuredValue(event.target.value))}
        placeholder={isSql ? '{\n  "databaseType": "PostgreSQL"\n}' : '{\n  "name": "search"\n}'}
        aria-invalid={Boolean(error)}
        aria-describedby={descriptionId}
        className="min-h-24 resize-y font-mono"
      />
      {error ? (
        <HelperText id={`assert-value-error-${index}`} error>
          {error}
        </HelperText>
      ) : (
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {isSql
            ? 'Optional. Leave blank to validate SQL syntax using the default database parser.'
            : 'Required. Enter valid JSON describing the expected tool activity.'}
        </p>
      )}
    </div>
  );
};

const NoValueField = ({ type }: { type: AssertionType }) => {
  const explanation =
    type === 'answer-relevance' || type === 'not-answer-relevance'
      ? 'This check uses the prompt or query variable and the generated response. No value is needed.'
      : type === 'context-faithfulness' ||
          type === 'not-context-faithfulness' ||
          type === 'context-relevance' ||
          type === 'not-context-relevance'
        ? 'This check uses your query and context variables. No value is needed.'
        : 'This check validates function or tool calls returned by the provider. No value is needed.';

  return (
    <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
      {explanation}
    </p>
  );
};

interface OptionalXmlFieldProps {
  assertion: Assertion;
  index: number;
  onChange: (assertion: Assertion) => void;
}

const OptionalXmlField = ({ assertion, index, onChange }: OptionalXmlFieldProps) => {
  if (assertion.value === undefined) {
    return (
      <div className="space-y-2 rounded-md border border-dashed border-border p-3">
        <p className="text-xs text-muted-foreground">
          This check validates XML without requiring particular elements. Add elements only when the
          response must include them.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange({ ...assertion, value: '' })}
        >
          Add required XML elements
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={`assert-value-${index}`} className="text-sm font-medium">
          Required elements (optional)
        </Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            const { value: _value, ...assertWithoutValue } = assertion;
            onChange(assertWithoutValue);
          }}
        >
          Remove elements
        </Button>
      </div>
      <Textarea
        id={`assert-value-${index}`}
        aria-describedby={`assert-xml-help-${index}`}
        value={formatAssertionValue(assertion)}
        onChange={(event) => onChange({ ...assertion, value: event.target.value })}
        placeholder="answer, confidence"
        className="min-h-20 resize-y"
      />
      <p id={`assert-xml-help-${index}`} className="text-xs text-muted-foreground">
        Optional. Separate required XML element names with commas.
      </p>
    </div>
  );
};

interface AssertionValueFieldsProps {
  arrayValueDraft?: string;
  assertion: Assertion;
  error?: string;
  index: number;
  onArrayDraftChange: (draft: string) => void;
  onChange: (assertion: Assertion) => void;
}

const AssertionValueFields = ({
  arrayValueDraft,
  assertion,
  error,
  index,
  onArrayDraftChange,
  onChange,
}: AssertionValueFieldsProps) => {
  if (THRESHOLD_ASSERTION_TYPES.has(assertion.type)) {
    return (
      <ThresholdField
        assertion={assertion}
        error={error}
        index={index}
        onChange={(threshold) => onChange({ ...assertion, threshold })}
      />
    );
  }

  if (WORD_COUNT_ASSERTION_TYPES.has(assertion.type)) {
    return (
      <WordCountField
        assertion={assertion}
        error={error}
        index={index}
        onChange={(value) => onChange({ ...assertion, value })}
      />
    );
  }

  if (STRUCTURED_VALUE_ASSERTION_TYPES.has(assertion.type)) {
    return (
      <StructuredValueField
        assertion={assertion}
        error={error}
        index={index}
        onChange={(value) => onChange({ ...assertion, value })}
      />
    );
  }

  if (NO_VALUE_ASSERTION_TYPES.has(assertion.type)) {
    return <NoValueField type={assertion.type} />;
  }

  if (OPTIONAL_XML_ELEMENT_ASSERTION_TYPES.has(assertion.type)) {
    return <OptionalXmlField assertion={assertion} index={index} onChange={onChange} />;
  }

  if (OPTIONAL_JSON_SCHEMA_ASSERTION_TYPES.has(assertion.type) && assertion.value === undefined) {
    return (
      <div className="space-y-2 rounded-md border border-dashed border-border p-3">
        <p className="text-xs text-muted-foreground">
          This check validates JSON without requiring a schema. Add one only when you need specific
          fields or types.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange({ ...assertion, value: '' })}
        >
          Add optional JSON schema
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={`assert-value-${index}`} className="text-sm font-medium">
          {assertion.type === 'moderation' || assertion.type === 'not-moderation'
            ? 'Categories (optional)'
            : OPTIONAL_JSON_SCHEMA_ASSERTION_TYPES.has(assertion.type)
              ? 'JSON schema (optional)'
              : 'Value'}
        </Label>
        {OPTIONAL_JSON_SCHEMA_ASSERTION_TYPES.has(assertion.type) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              const { value: _value, ...assertWithoutValue } = assertion;
              onChange(assertWithoutValue);
            }}
          >
            Remove schema
          </Button>
        )}
      </div>
      <Textarea
        id={`assert-value-${index}`}
        aria-invalid={Boolean(error)}
        aria-describedby={
          error
            ? `assert-value-error-${index}`
            : assertion.type === 'moderation' || assertion.type === 'not-moderation'
              ? `assert-moderation-help-${index}`
              : undefined
        }
        placeholder={
          OPTIONAL_JSON_SCHEMA_ASSERTION_TYPES.has(assertion.type)
            ? 'type: object\nrequired: [answer]'
            : 'Enter expected value or criteria...'
        }
        value={
          COMMA_SEPARATED_VALUE_ASSERTION_TYPES.has(assertion.type)
            ? (arrayValueDraft ?? formatAssertionValue(assertion))
            : formatAssertionValue(assertion)
        }
        onChange={(event) => {
          if (COMMA_SEPARATED_VALUE_ASSERTION_TYPES.has(assertion.type)) {
            onArrayDraftChange(event.target.value);
          }
          onChange({
            ...assertion,
            value: parseAssertionValue(assertion.type, event.target.value),
          });
        }}
        className="min-h-20 resize-y"
      />
      {error && (
        <HelperText id={`assert-value-error-${index}`} error>
          {error}
        </HelperText>
      )}
      {OPTIONAL_JSON_SCHEMA_ASSERTION_TYPES.has(assertion.type) && (
        <p className="text-xs text-muted-foreground">Enter a JSON Schema in YAML or JSON format.</p>
      )}
      {ARRAY_VALUE_ASSERTION_TYPES.has(assertion.type) && (
        <p className="text-xs text-muted-foreground">
          Separate values with commas, e.g.{' '}
          <code className="rounded bg-muted px-1 py-0.5 font-mono">hello, world</code>
        </p>
      )}
      {(assertion.type === 'moderation' || assertion.type === 'not-moderation') && (
        <p id={`assert-moderation-help-${index}`} className="text-xs text-muted-foreground">
          Optional. Limit moderation to comma-separated categories, or leave blank to check all
          categories.
        </p>
      )}
      {(assertion.type === 'regex' || assertion.type === 'not-regex') && (
        <p className="text-xs text-muted-foreground">
          Enter a regular expression pattern, e.g.{' '}
          <code className="rounded bg-muted px-1 py-0.5 font-mono">hello.*world</code>
        </p>
      )}
    </div>
  );
};

function getSimpleTypeChange(assertion: Assertion, nextType: AssertionType): Assertion | undefined {
  if (
    OPTIONAL_JSON_SCHEMA_ASSERTION_TYPES.has(nextType) ||
    OPTIONAL_XML_ELEMENT_ASSERTION_TYPES.has(nextType) ||
    NO_VALUE_ASSERTION_TYPES.has(nextType) ||
    THRESHOLD_ASSERTION_TYPES.has(nextType) ||
    WORD_COUNT_ASSERTION_TYPES.has(nextType) ||
    STRUCTURED_VALUE_ASSERTION_TYPES.has(nextType)
  ) {
    const { threshold: _threshold, value: _value, ...withoutStoredValue } = assertion;
    return { ...withoutStoredValue, type: nextType };
  }

  if (
    THRESHOLD_ASSERTION_TYPES.has(assertion.type) ||
    WORD_COUNT_ASSERTION_TYPES.has(assertion.type) ||
    STRUCTURED_VALUE_ASSERTION_TYPES.has(assertion.type) ||
    OPTIONAL_XML_ELEMENT_ASSERTION_TYPES.has(assertion.type) ||
    NO_VALUE_ASSERTION_TYPES.has(assertion.type)
  ) {
    const { threshold: _threshold, value: _value, ...withoutStoredValue } = assertion;
    return { ...withoutStoredValue, type: nextType, value: '' };
  }

  return undefined;
}

interface AssertionTypeChange {
  arrayDraft?: string;
  assertion: Assertion;
}

function getAssertionTypeChange(
  assertion: Assertion,
  nextType: AssertionType,
): AssertionTypeChange {
  const simpleTypeChange = getSimpleTypeChange(assertion, nextType);
  if (simpleTypeChange) {
    return { assertion: simpleTypeChange };
  }

  if (COMMA_SEPARATED_VALUE_ASSERTION_TYPES.has(nextType)) {
    const valueText = formatAssertionValue(assertion);
    return {
      arrayDraft: valueText,
      assertion: {
        ...assertion,
        type: nextType,
        value: parseAssertionValue(nextType, valueText),
      },
    };
  }

  if (COMMA_SEPARATED_VALUE_ASSERTION_TYPES.has(assertion.type)) {
    return {
      assertion: { ...assertion, type: nextType, value: formatAssertionValue(assertion) },
    };
  }

  return { assertion: { ...assertion, type: nextType } };
}

function setArrayDraftAtIndex(
  drafts: Record<number, string>,
  index: number,
  arrayDraft: string | undefined,
): Record<number, string> {
  if (arrayDraft !== undefined) {
    return { ...drafts, [index]: arrayDraft };
  }

  const { [index]: _removed, ...nextDrafts } = drafts;
  return nextDrafts;
}

const ModelGradedBadge = ({ type }: { type: AssertionType }) =>
  LLM_ASSERTION_TYPES.has(type) ? (
    <Badge variant="secondary" className="text-xs">
      Model-graded: may add cost
    </Badge>
  ) : null;

const AssertsForm = ({ onAdd, initialValues, onValidityChange }: AssertsFormProps) => {
  const [asserts, setAsserts] = useState<Assertion[]>(initialValues || []);
  const [arrayValueDrafts, setArrayValueDrafts] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      (initialValues || []).flatMap((assert, index) =>
        COMMA_SEPARATED_VALUE_ASSERTION_TYPES.has(assert.type)
          ? [[index, formatAssertionValue(assert)]]
          : [],
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

  const handleUpdateAssert = (index: number, nextAssert: Assertion) => {
    const newAsserts = asserts.map((assert, currentIndex) =>
      currentIndex === index ? nextAssert : assert,
    );
    setAsserts(newAsserts);
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
                    <ModelGradedBadge type={assert.type} />
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
                    const typeChange = getAssertionTypeChange(assert, nextType);
                    const newAsserts = asserts.map((a, i) =>
                      i === index ? typeChange.assertion : a,
                    );
                    setArrayValueDrafts((drafts) =>
                      setArrayDraftAtIndex(drafts, index, typeChange.arrayDraft),
                    );
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

                <AssertionValueFields
                  arrayValueDraft={arrayValueDrafts[index]}
                  assertion={assert}
                  error={assertionErrors[index]}
                  index={index}
                  onArrayDraftChange={(draft) =>
                    setArrayValueDrafts((drafts) => ({ ...drafts, [index]: draft }))
                  }
                  onChange={(nextAssert) => handleUpdateAssert(index, nextAssert)}
                />
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
