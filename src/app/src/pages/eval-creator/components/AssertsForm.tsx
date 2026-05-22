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
  MODEL_JUDGE_SCORE_ASSERTION_TYPES,
  NAMED_MATCHER_ASSERTION_TYPES,
  PI_SCORE_ASSERTION_TYPES,
  RAG_SCORE_ASSERTION_TYPES,
  REQUIRED_THRESHOLD_ASSERTION_TYPES,
  STRUCTURED_VALUE_ASSERTION_TYPES,
  TEXT_SCORE_ASSERTION_TYPES,
  THRESHOLD_ASSERTION_TYPES,
  TRAJECTORY_GOAL_SUCCESS_ASSERTION_TYPES,
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
    types: [
      'contains-json',
      'is-html',
      'contains-html',
      'is-xml',
      'contains-xml',
      'is-sql',
      'contains-sql',
    ],
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
    ],
  },
  {
    label: 'Compare outputs',
    types: ['select-best', 'max-score'],
  },
  {
    label: 'Tools and agent behavior',
    types: [
      'is-valid-function-call',
      'is-valid-openai-function-call',
      'is-valid-openai-tools-call',
      'is-refusal',
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
      'not-contains-html',
      'not-equals',
      'not-icontains',
      'not-is-html',
      'not-is-json',
      'not-is-refusal',
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
  'is-html': 'Valid HTML document',
  'contains-html': 'Contains HTML',
  'is-refusal': 'Detect refusal',
  'not-is-html': 'Not valid HTML',
  'not-contains-html': 'Does not contain HTML',
  'not-is-refusal': 'Does not refuse',
  'llm-rubric': 'LLM rubric',
  similar: 'Semantically similar',
  factuality: 'Factuality',
  'model-graded-closedqa': 'Closed QA grading',
  'not-similar': 'Not semantically similar',
  'select-best': 'Choose best output',
  'max-score': 'Choose highest score',
  'finish-reason': 'Finish reason',
  webhook: 'Webhook validation',
  bleu: 'BLEU precision score',
  'rouge-n': 'ROUGE-N coverage score',
  latency: 'Latency threshold',
  cost: 'Cost threshold',
  'word-count': 'Word count limits',
  pi: 'Pi Labs scoring',
  'answer-relevance': 'Answer relevance',
  'context-faithfulness': 'Context faithfulness',
  'context-recall': 'Context recall',
  'context-relevance': 'Context relevance',
  'g-eval': 'G-Eval criteria scoring',
  'trajectory:goal-success': 'Agent goal achieved',
  'is-valid-function-call': 'Valid function call',
  'is-valid-openai-function-call': 'Valid legacy OpenAI function call',
  'is-valid-openai-tools-call': 'Valid OpenAI tool calls',
  'skill-used': 'Skill used',
  'trajectory:tool-used': 'Tool used in trace',
  'trajectory:tool-args-match': 'Tool arguments match',
  'trajectory:tool-sequence': 'Tool order in trace',
  'trajectory:step-count': 'Trace step count',
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
  'select-best':
    'Compares outputs for this test case. Add at least two prompts or providers; a model judges the winner and this can add cost.',
  'max-score':
    'Selects the highest-scoring output from your other checks. Add at least two prompts or providers and one other assertion; this check does not add model-grading cost itself.',
  'finish-reason':
    'Checks why generation stopped using normalized provider finish reasons, such as natural completion or tool calls.',
  webhook:
    'Sends each generated response and its test-case variables to the URL below for validation. Use only an endpoint you trust.',
  bleu: 'Measures precision against a reference answer without model grading or additional cost.',
  'rouge-n': 'Measures coverage of a reference answer without model grading or additional cost.',
  latency: 'Fails when a response takes longer than your maximum duration.',
  cost: 'Fails when one provider response costs more than your maximum amount.',
  'word-count': 'Checks response length without model grading or additional cost.',
  pi: 'Uses the external Pi Labs scorer. This requires WITHPI_API_KEY and may add service cost.',
  'answer-relevance':
    'Scores how well the response answers the prompt or query. This uses grading and embedding providers and can add cost.',
  factuality:
    'A grading model checks the response against a factual reference statement. Configure category scoring or custom graders in YAML.',
  'model-graded-closedqa':
    'A grading model answers yes or no about whether the response meets your criterion.',
  'context-faithfulness':
    'Scores whether the response is supported by retrieved context. This uses a grading provider and can add cost.',
  'context-recall':
    'Scores whether retrieved context supports an expected answer. This uses a grading provider and can add cost.',
  'context-relevance':
    'Scores whether retrieved context is useful for the query. This uses a grading provider and can add cost.',
  'g-eval':
    'Scores the response against your criteria in multiple grading steps. This can add cost.',
  'trajectory:goal-success':
    'Judges whether a traced agent run achieved your goal. This requires trace data and a grading model, which can add cost.',
  'skill-used':
    'Checks provider-reported skill metadata rather than response text. Configure patterns or count bounds in YAML.',
  'trajectory:tool-used':
    'Checks whether a captured agent trace includes a tool call. This requires trace data.',
  'trajectory:tool-args-match':
    'Checks the arguments sent to a traced tool call. This requires trace data.',
  'trajectory:tool-sequence':
    'Checks whether traced tool calls occurred in the expected order. This requires trace data.',
  'trajectory:step-count':
    'Counts matching steps in a captured agent trace. This requires trace data.',
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

const GUIDED_FINISH_REASON_TYPES = new Set<AssertionType>(['finish-reason', 'not-finish-reason']);
const DISCLOSED_WEBHOOK_ASSERTION_TYPES = new Set<AssertionType>(['webhook', 'not-webhook']);

const RAG_SCORE_REFERENCE_ASSERTION_TYPES = new Set<AssertionType>([
  'context-recall',
  'not-context-recall',
]);

const NO_VALUE_ASSERTION_TYPES = new Set<AssertionType>([
  'is-html',
  'contains-html',
  'is-refusal',
  'not-is-html',
  'not-contains-html',
  'not-is-refusal',
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
  'max-score',
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

function getStructuredFieldCopy(type: AssertionType): {
  description: string;
  label: string;
  placeholder: string;
} {
  if (type.includes('sql')) {
    return {
      label: 'SQL validation settings (JSON, optional)',
      placeholder: '{\n  "databaseType": "PostgreSQL"\n}',
      description:
        'Optional. Leave blank to validate SQL syntax using the default database parser.',
    };
  }
  if (type.includes('tool-args-match')) {
    return {
      label: 'Expected tool call (JSON, required)',
      placeholder: '{\n  "name": "search_orders",\n  "args": { "order_id": "123" }\n}',
      description: 'Requires trace data. Enter a tool name or pattern and the expected arguments.',
    };
  }
  if (type.includes('tool-sequence')) {
    return {
      label: 'Expected tool sequence (JSON, required)',
      placeholder: '{\n  "steps": ["search_orders", "compose_reply"]\n}',
      description: 'Requires trace data. Enter tools in the order they must appear.',
    };
  }

  return {
    label: 'Expected step count (JSON, required)',
    placeholder: '{\n  "type": "tool",\n  "min": 1\n}',
    description: 'Requires trace data. Enter minimum or maximum matching step counts.',
  };
}

const StructuredValueField = ({ assertion, error, index, onChange }: StructuredValueFieldProps) => {
  const copy = getStructuredFieldCopy(assertion.type);
  const errorId = `assert-value-error-${index}`;
  const helpId = `assert-structured-help-${index}`;

  return (
    <div className="space-y-2">
      <Label htmlFor={`assert-value-${index}`} className="text-sm font-medium">
        {copy.label}
      </Label>
      <Textarea
        id={`assert-value-${index}`}
        value={formatStructuredValue(assertion)}
        onChange={(event) => onChange(parseStructuredValue(event.target.value))}
        placeholder={copy.placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${errorId} ${helpId}` : helpId}
        className="min-h-24 resize-y font-mono"
      />
      {error && (
        <HelperText id={errorId} error>
          {error}
        </HelperText>
      )}
      <p id={helpId} className="text-xs text-muted-foreground">
        {copy.description}
      </p>
    </div>
  );
};

const NoValueField = ({ type }: { type: AssertionType }) => {
  const explanation =
    type === 'is-html' || type === 'not-is-html'
      ? 'This check validates whether the full response is HTML. No value is needed.'
      : type === 'contains-html' || type === 'not-contains-html'
        ? 'This check detects HTML content within the response. No value is needed.'
        : type === 'is-refusal' || type === 'not-is-refusal'
          ? 'This check detects whether the response is a refusal. No value is needed.'
          : type === 'answer-relevance' || type === 'not-answer-relevance'
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

const MaxScoreField = ({ assertion }: { assertion: Assertion }) => (
  <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
    <p>This check uses scores from your other assertions. No expected value is needed.</p>
    <p className="mt-2">
      {assertion.value === undefined
        ? 'For weights, aggregation method, or a minimum score, configure advanced settings in the YAML editor.'
        : 'Advanced scoring settings are configured. Use the YAML editor to change weights, aggregation method, or a minimum score.'}
    </p>
  </div>
);

const STANDARD_FINISH_REASONS = [
  { value: 'stop', label: 'Natural completion (stop)' },
  { value: 'length', label: 'Token limit reached (length)' },
  { value: 'content_filter', label: 'Content filtering (content_filter)' },
  { value: 'tool_calls', label: 'Tool called (tool_calls)' },
] as const;

const STANDARD_FINISH_REASON_VALUES = new Set<string>(
  STANDARD_FINISH_REASONS.map((reason) => reason.value),
);

interface SpecializedValueFieldProps {
  assertion: Assertion;
  error?: string;
  index: number;
  onChange: (assertion: Assertion) => void;
}

const FinishReasonField = ({ assertion, error, index, onChange }: SpecializedValueFieldProps) => {
  const value = typeof assertion.value === 'string' ? assertion.value : '';
  const hasCustomValue = value !== '' && !STANDARD_FINISH_REASON_VALUES.has(value);
  const [isEnteringCustomValue, setIsEnteringCustomValue] = useState(hasCustomValue);
  const showCustomValue = hasCustomValue || isEnteringCustomValue;
  const descriptionId = error
    ? `assert-value-error-${index}`
    : `assert-finish-reason-help-${index}`;

  if (showCustomValue) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`assert-finish-reason-custom-${index}`} className="text-sm font-medium">
            Provider-specific finish reason (required)
          </Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setIsEnteringCustomValue(false);
              onChange({ ...assertion, value: undefined });
            }}
          >
            Choose a standard reason
          </Button>
        </div>
        <Input
          id={`assert-finish-reason-custom-${index}`}
          value={value}
          onChange={(event) => onChange({ ...assertion, value: event.target.value })}
          placeholder="pause_turn or {{expected_reason}}"
          aria-invalid={Boolean(error)}
          aria-describedby={descriptionId}
        />
        {error ? (
          <HelperText id={`assert-value-error-${index}`} error>
            {error}
          </HelperText>
        ) : (
          <p id={descriptionId} className="text-xs text-muted-foreground">
            Use this only when your provider returns another reason or when the value comes from a
            variable.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={`assert-finish-reason-${index}`} className="text-sm font-medium">
        Expected finish reason (required)
      </Label>
      <Select
        value={STANDARD_FINISH_REASON_VALUES.has(value) ? value : undefined}
        onValueChange={(nextValue) => onChange({ ...assertion, value: nextValue })}
      >
        <SelectTrigger
          id={`assert-finish-reason-${index}`}
          aria-invalid={Boolean(error)}
          aria-describedby={descriptionId}
        >
          <SelectValue placeholder="Select why generation should stop" />
        </SelectTrigger>
        <SelectContent>
          {STANDARD_FINISH_REASONS.map((reason) => (
            <SelectItem key={reason.value} value={reason.value}>
              {reason.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setIsEnteringCustomValue(true);
          onChange({ ...assertion, value: '' });
        }}
      >
        Use provider-specific reason
      </Button>
      {error ? (
        <HelperText id={`assert-value-error-${index}`} error>
          {error}
        </HelperText>
      ) : (
        <p id={descriptionId} className="text-xs text-muted-foreground">
          Promptfoo normalizes common provider stop reasons into these standard values.
        </p>
      )}
    </div>
  );
};

const WebhookField = ({ assertion, error, index, onChange }: SpecializedValueFieldProps) => {
  const errorId = `assert-value-error-${index}`;
  const helpId = `assert-webhook-help-${index}`;

  return (
    <div className="space-y-2">
      <Label htmlFor={`assert-webhook-${index}`} className="text-sm font-medium">
        Webhook URL (required)
      </Label>
      <Input
        id={`assert-webhook-${index}`}
        type="url"
        value={formatAssertionValue(assertion)}
        onChange={(event) => onChange({ ...assertion, value: event.target.value })}
        placeholder="https://example.com/validate"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${errorId} ${helpId}` : helpId}
      />
      {error && (
        <HelperText id={errorId} error>
          {error}
        </HelperText>
      )}
      <p id={helpId} className="text-xs text-muted-foreground">
        This sends generated output and test-case variables to the endpoint. It must return JSON
        with a <code className="rounded bg-muted px-1 py-0.5 font-mono">pass</code> result.
      </p>
    </div>
  );
};

const TextScoreField = ({ assertion, error, index, onChange }: SpecializedValueFieldProps) => {
  const isRouge = assertion.type === 'rouge-n' || assertion.type === 'not-rouge-n';
  const isSimilarity = assertion.type === 'similar' || assertion.type === 'not-similar';
  const defaultThreshold = isRouge || isSimilarity ? '0.75' : '0.5';
  const metricDescription = isSimilarity
    ? 'Semantic similarity uses embeddings and may add cost.'
    : isRouge
      ? 'ROUGE-N rewards coverage of the reference answer.'
      : 'BLEU rewards precision against the reference answer.';
  const helpId = `assert-text-score-help-${index}`;
  const errorId = `assert-value-error-${index}`;
  const thresholdError = error === 'Enter a score threshold from 0 to 1.' ? error : undefined;
  const referenceError = thresholdError ? undefined : error;
  const referenceDescriptionIds = referenceError ? `${errorId} ${helpId}` : helpId;
  const thresholdDescriptionIds = thresholdError ? `${errorId} ${helpId}` : helpId;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor={`assert-reference-${index}`} className="text-sm font-medium">
          Reference answer (required)
        </Label>
        <Textarea
          id={`assert-reference-${index}`}
          value={formatAssertionValue(assertion)}
          onChange={(event) => onChange({ ...assertion, value: event.target.value })}
          placeholder="Enter an expected response to compare against..."
          aria-invalid={Boolean(referenceError)}
          aria-describedby={referenceDescriptionIds}
          className="min-h-20 resize-y"
        />
      </div>
      {referenceError && (
        <HelperText id={errorId} error>
          {referenceError}
        </HelperText>
      )}
      <div className="space-y-2">
        <Label htmlFor={`assert-text-score-threshold-${index}`} className="text-sm font-medium">
          Score threshold (optional)
        </Label>
        <Input
          id={`assert-text-score-threshold-${index}`}
          type="number"
          min="0"
          max="1"
          step="0.01"
          value={formatAssertionThreshold(assertion)}
          onChange={(event) =>
            onChange({ ...assertion, threshold: parseAssertionThreshold(event.target.value) })
          }
          aria-invalid={Boolean(thresholdError)}
          aria-describedby={thresholdDescriptionIds}
        />
      </div>
      {thresholdError && (
        <HelperText id={errorId} error>
          {thresholdError}
        </HelperText>
      )}
      <p id={helpId} className="text-xs text-muted-foreground">
        Scores range from 0 to 1 and default to {defaultThreshold}. {metricDescription} Configure
        multiple references in YAML.
      </p>
    </div>
  );
};

const PiScoreField = ({ assertion, error, index, onChange }: SpecializedValueFieldProps) => {
  const helpId = `assert-pi-score-help-${index}`;
  const errorId = `assert-value-error-${index}`;
  const criteriaError = error === 'Enter criteria for Pi Labs scoring.' ? error : undefined;
  const thresholdError = criteriaError ? undefined : error;
  const criteriaDescriptionIds = criteriaError ? `${errorId} ${helpId}` : helpId;
  const thresholdDescriptionIds = thresholdError ? `${errorId} ${helpId}` : helpId;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor={`assert-pi-criteria-${index}`} className="text-sm font-medium">
          Scoring criteria (required)
        </Label>
        <Textarea
          id={`assert-pi-criteria-${index}`}
          value={formatAssertionValue(assertion)}
          onChange={(event) => onChange({ ...assertion, value: event.target.value })}
          placeholder="Is the response accurate and concise?"
          aria-invalid={Boolean(criteriaError)}
          aria-describedby={criteriaDescriptionIds}
          className="min-h-20 resize-y"
        />
      </div>
      {criteriaError && (
        <HelperText id={errorId} error>
          {criteriaError}
        </HelperText>
      )}
      <div className="space-y-2">
        <Label htmlFor={`assert-pi-threshold-${index}`} className="text-sm font-medium">
          Passing score threshold (optional)
        </Label>
        <Input
          id={`assert-pi-threshold-${index}`}
          type="number"
          min="0"
          step="0.01"
          value={formatAssertionThreshold(assertion)}
          onChange={(event) =>
            onChange({ ...assertion, threshold: parseAssertionThreshold(event.target.value) })
          }
          aria-invalid={Boolean(thresholdError)}
          aria-describedby={thresholdDescriptionIds}
        />
      </div>
      {thresholdError && (
        <HelperText id={errorId} error>
          {thresholdError}
        </HelperText>
      )}
      <p id={helpId} className="text-xs text-muted-foreground">
        Pi Labs receives the prompt and generated output to score these criteria. Requires{' '}
        <code className="rounded bg-muted px-1 py-0.5 font-mono">WITHPI_API_KEY</code>. The passing
        threshold defaults to 0.5.
      </p>
    </div>
  );
};

const RagScoreField = ({ assertion, error, index, onChange }: SpecializedValueFieldProps) => {
  const needsGroundTruth = RAG_SCORE_REFERENCE_ASSERTION_TYPES.has(assertion.type);
  const usesContext = assertion.type.includes('context-');
  const helpId = `assert-rag-score-help-${index}`;
  const errorId = `assert-value-error-${index}`;
  const groundTruthError =
    needsGroundTruth && error !== 'Enter a score threshold from 0 to 1.' ? error : undefined;
  const thresholdError = groundTruthError ? undefined : error;
  const groundTruthDescriptionIds = groundTruthError ? `${errorId} ${helpId}` : helpId;
  const thresholdDescriptionIds = thresholdError ? `${errorId} ${helpId}` : helpId;

  return (
    <div className="space-y-3">
      {needsGroundTruth && (
        <div className="space-y-2">
          <Label htmlFor={`assert-rag-ground-truth-${index}`} className="text-sm font-medium">
            Ground truth answer (required)
          </Label>
          <Textarea
            id={`assert-rag-ground-truth-${index}`}
            value={formatAssertionValue(assertion)}
            onChange={(event) => onChange({ ...assertion, value: event.target.value })}
            placeholder="Enter the answer that retrieved context should support..."
            aria-invalid={Boolean(groundTruthError)}
            aria-describedby={groundTruthDescriptionIds}
            className="min-h-20 resize-y"
          />
        </div>
      )}
      {groundTruthError && (
        <HelperText id={errorId} error>
          {groundTruthError}
        </HelperText>
      )}
      <div className="space-y-2">
        <Label htmlFor={`assert-rag-threshold-${index}`} className="text-sm font-medium">
          Minimum score threshold (optional)
        </Label>
        <Input
          id={`assert-rag-threshold-${index}`}
          type="number"
          min="0"
          max="1"
          step="0.01"
          value={formatAssertionThreshold(assertion)}
          onChange={(event) =>
            onChange({ ...assertion, threshold: parseAssertionThreshold(event.target.value) })
          }
          aria-invalid={Boolean(thresholdError)}
          aria-describedby={thresholdDescriptionIds}
        />
      </div>
      {thresholdError && (
        <HelperText id={errorId} error>
          {thresholdError}
        </HelperText>
      )}
      <p id={helpId} className="text-xs text-muted-foreground">
        Scores range from 0 to 1. Without a threshold, the runtime default is 0 and this check is
        permissive.{' '}
        {needsGroundTruth
          ? 'Provide retrieved context as a context variable, extract it in advanced YAML settings, or use prompt content as the fallback.'
          : usesContext
            ? 'Provide query and context variables, or extract context in advanced YAML settings.'
            : 'This compares the response with the prompt or a query variable.'}
      </p>
    </div>
  );
};

const ModelJudgeScoreField = ({
  assertion,
  error,
  index,
  onChange,
}: SpecializedValueFieldProps) => {
  const isGEval = assertion.type === 'g-eval' || assertion.type === 'not-g-eval';
  const hasAdvancedValue =
    (isGEval && Array.isArray(assertion.value)) ||
    (!isGEval &&
      assertion.value !== undefined &&
      typeof assertion.value === 'object' &&
      !Array.isArray(assertion.value));
  const helpId = `assert-model-judge-help-${index}`;
  const errorId = `assert-value-error-${index}`;
  const criteriaError =
    isGEval && error === 'Enter at least one grading criterion for G-Eval.' ? error : undefined;
  const thresholdError = criteriaError ? undefined : error;
  const criteriaDescriptionIds = criteriaError ? `${errorId} ${helpId}` : helpId;
  const thresholdDescriptionIds = thresholdError ? `${errorId} ${helpId}` : helpId;

  return (
    <div className="space-y-3">
      {hasAdvancedValue ? (
        <div className="space-y-2 rounded-md border border-dashed border-border p-3">
          <p className="text-xs text-muted-foreground">
            {isGEval
              ? 'Multiple G-Eval criteria are configured. Edit them in YAML or replace them with one visual criterion.'
              : 'A structured rubric is configured. Edit it in YAML or replace it with text criteria.'}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange({ ...assertion, value: '' })}
          >
            Replace with text criteria
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor={`assert-model-judge-criteria-${index}`} className="text-sm font-medium">
            {isGEval ? 'Evaluation criterion (required)' : 'Rubric criteria (optional)'}
          </Label>
          <Textarea
            id={`assert-model-judge-criteria-${index}`}
            value={formatAssertionValue(assertion)}
            onChange={(event) => onChange({ ...assertion, value: event.target.value })}
            placeholder={
              isGEval
                ? 'Example: The response is accurate, concise, and well structured.'
                : 'Example: The response is helpful and accurate.'
            }
            aria-invalid={Boolean(criteriaError)}
            aria-describedby={criteriaDescriptionIds}
            className="min-h-20 resize-y"
          />
        </div>
      )}
      {criteriaError && (
        <HelperText id={errorId} error>
          {criteriaError}
        </HelperText>
      )}
      <div className="space-y-2">
        <Label htmlFor={`assert-model-judge-threshold-${index}`} className="text-sm font-medium">
          Minimum score threshold (optional)
        </Label>
        <Input
          id={`assert-model-judge-threshold-${index}`}
          type="number"
          min="0"
          max="1"
          step="0.01"
          value={formatAssertionThreshold(assertion)}
          onChange={(event) =>
            onChange({ ...assertion, threshold: parseAssertionThreshold(event.target.value) })
          }
          aria-invalid={Boolean(thresholdError)}
          aria-describedby={thresholdDescriptionIds}
        />
      </div>
      {thresholdError && (
        <HelperText id={errorId} error>
          {thresholdError}
        </HelperText>
      )}
      <p id={helpId} className="text-xs text-muted-foreground">
        {isGEval
          ? 'Scores range from 0 to 1 and the default threshold is 0.7. Configure multiple criteria or custom grading prompts in YAML.'
          : "Scores range from 0 to 1. Without a threshold, the grader's pass result decides; a numeric score alone does not fail the check."}
      </p>
    </div>
  );
};

const TrajectoryGoalSuccessField = ({
  assertion,
  error,
  index,
  onChange,
}: SpecializedValueFieldProps) => {
  const hasAdvancedValue =
    assertion.value !== undefined &&
    typeof assertion.value === 'object' &&
    !Array.isArray(assertion.value);
  const helpId = `assert-trajectory-goal-help-${index}`;
  const errorId = `assert-value-error-${index}`;
  const goalError = error === 'Enter the goal that the agent should achieve.' ? error : undefined;
  const thresholdError = goalError ? undefined : error;
  const goalDescriptionIds = goalError ? `${errorId} ${helpId}` : helpId;
  const thresholdDescriptionIds = thresholdError ? `${errorId} ${helpId}` : helpId;

  return (
    <div className="space-y-3">
      {hasAdvancedValue ? (
        <div className="space-y-2 rounded-md border border-dashed border-border p-3">
          <p className="text-xs text-muted-foreground">
            An object-shaped goal is configured. Edit it in YAML or replace it with a visual goal.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange({ ...assertion, value: '' })}
          >
            Replace with text goal
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor={`assert-trajectory-goal-${index}`} className="text-sm font-medium">
            Goal to achieve (required)
          </Label>
          <Textarea
            id={`assert-trajectory-goal-${index}`}
            value={formatAssertionValue(assertion)}
            onChange={(event) => onChange({ ...assertion, value: event.target.value })}
            placeholder="Example: Find the shipping status and tell the user whether it has shipped."
            aria-invalid={Boolean(goalError)}
            aria-describedby={goalDescriptionIds}
            className="min-h-20 resize-y"
          />
        </div>
      )}
      {goalError && (
        <HelperText id={errorId} error>
          {goalError}
        </HelperText>
      )}
      <div className="space-y-2">
        <Label htmlFor={`assert-trajectory-threshold-${index}`} className="text-sm font-medium">
          Minimum score threshold (optional)
        </Label>
        <Input
          id={`assert-trajectory-threshold-${index}`}
          type="number"
          min="0"
          max="1"
          step="0.01"
          value={formatAssertionThreshold(assertion)}
          onChange={(event) =>
            onChange({ ...assertion, threshold: parseAssertionThreshold(event.target.value) })
          }
          aria-invalid={Boolean(thresholdError)}
          aria-describedby={thresholdDescriptionIds}
        />
      </div>
      {thresholdError && (
        <HelperText id={errorId} error>
          {thresholdError}
        </HelperText>
      )}
      <p id={helpId} className="text-xs text-muted-foreground">
        Requires trace data. The grading model receives a summarized trajectory and final response.
        Without a threshold, the grader&apos;s pass result decides. Set provider or rubric prompt
        options in YAML.
      </p>
    </div>
  );
};

const NamedMatcherField = ({ assertion, error, index, onChange }: SpecializedValueFieldProps) => {
  const isSkill = assertion.type.includes('skill');
  const hasAdvancedValue =
    assertion.value !== undefined &&
    typeof assertion.value === 'object' &&
    (Array.isArray(assertion.value) || assertion.value !== null);
  const errorId = `assert-value-error-${index}`;
  const helpId = `assert-matcher-help-${index}`;
  const noun = isSkill ? 'skill' : 'tool';

  if (hasAdvancedValue) {
    return (
      <div className="space-y-2 rounded-md border border-dashed border-border p-3">
        <p className="text-xs text-muted-foreground">
          An advanced {noun} matcher is configured. Edit it in YAML or replace it with one {noun}{' '}
          name.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange({ ...assertion, value: '' })}
        >
          Replace with one {noun} name
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={`assert-matcher-name-${index}`} className="text-sm font-medium">
        Expected {noun} name (required)
      </Label>
      <Input
        id={`assert-matcher-name-${index}`}
        value={formatAssertionValue(assertion)}
        onChange={(event) => onChange({ ...assertion, value: event.target.value })}
        placeholder={isSkill ? 'research' : 'search_orders'}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${errorId} ${helpId}` : helpId}
      />
      {error && (
        <HelperText id={errorId} error>
          {error}
        </HelperText>
      )}
      <p id={helpId} className="text-xs text-muted-foreground">
        {isSkill
          ? 'Checks provider skill metadata. Use YAML for multiple skills, patterns, or count bounds.'
          : 'Requires trace data. Use YAML for multiple tools, patterns, or count bounds.'}
      </p>
    </div>
  );
};

const SpecializedValueField = ({
  assertion,
  error,
  index,
  onChange,
}: SpecializedValueFieldProps) => {
  if (assertion.type === 'max-score') {
    return <MaxScoreField assertion={assertion} />;
  }

  if (GUIDED_FINISH_REASON_TYPES.has(assertion.type)) {
    return (
      <FinishReasonField assertion={assertion} error={error} index={index} onChange={onChange} />
    );
  }

  if (DISCLOSED_WEBHOOK_ASSERTION_TYPES.has(assertion.type)) {
    return <WebhookField assertion={assertion} error={error} index={index} onChange={onChange} />;
  }

  if (TEXT_SCORE_ASSERTION_TYPES.has(assertion.type)) {
    return <TextScoreField assertion={assertion} error={error} index={index} onChange={onChange} />;
  }

  if (PI_SCORE_ASSERTION_TYPES.has(assertion.type)) {
    return <PiScoreField assertion={assertion} error={error} index={index} onChange={onChange} />;
  }

  if (RAG_SCORE_ASSERTION_TYPES.has(assertion.type)) {
    return <RagScoreField assertion={assertion} error={error} index={index} onChange={onChange} />;
  }

  if (MODEL_JUDGE_SCORE_ASSERTION_TYPES.has(assertion.type)) {
    return (
      <ModelJudgeScoreField assertion={assertion} error={error} index={index} onChange={onChange} />
    );
  }

  if (TRAJECTORY_GOAL_SUCCESS_ASSERTION_TYPES.has(assertion.type)) {
    return (
      <TrajectoryGoalSuccessField
        assertion={assertion}
        error={error}
        index={index}
        onChange={onChange}
      />
    );
  }

  if (NAMED_MATCHER_ASSERTION_TYPES.has(assertion.type)) {
    return (
      <NamedMatcherField assertion={assertion} error={error} index={index} onChange={onChange} />
    );
  }

  return <NoValueField type={assertion.type} />;
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

function getValueFieldLabel(type: AssertionType): string {
  if (type === 'moderation' || type === 'not-moderation') {
    return 'Categories (optional)';
  }
  if (type === 'select-best') {
    return 'Selection criteria (required)';
  }
  if (type === 'factuality' || type === 'not-factuality') {
    return 'Reference statement (required)';
  }
  if (type === 'model-graded-closedqa' || type === 'not-model-graded-closedqa') {
    return 'Evaluation criterion (required)';
  }
  if (OPTIONAL_JSON_SCHEMA_ASSERTION_TYPES.has(type)) {
    return 'JSON schema (optional)';
  }

  return 'Value';
}

function getValueFieldPlaceholder(type: AssertionType): string {
  if (OPTIONAL_JSON_SCHEMA_ASSERTION_TYPES.has(type)) {
    return 'type: object\nrequired: [answer]';
  }
  if (type === 'factuality' || type === 'not-factuality') {
    return 'Example: Sacramento is the capital of California.';
  }
  if (type === 'model-graded-closedqa' || type === 'not-model-graded-closedqa') {
    return 'Example: Explains the concept without unnecessary jargon.';
  }

  return 'Enter expected value or criteria...';
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

  if (
    NO_VALUE_ASSERTION_TYPES.has(assertion.type) ||
    GUIDED_FINISH_REASON_TYPES.has(assertion.type) ||
    DISCLOSED_WEBHOOK_ASSERTION_TYPES.has(assertion.type) ||
    TEXT_SCORE_ASSERTION_TYPES.has(assertion.type) ||
    PI_SCORE_ASSERTION_TYPES.has(assertion.type) ||
    RAG_SCORE_ASSERTION_TYPES.has(assertion.type) ||
    MODEL_JUDGE_SCORE_ASSERTION_TYPES.has(assertion.type) ||
    TRAJECTORY_GOAL_SUCCESS_ASSERTION_TYPES.has(assertion.type) ||
    NAMED_MATCHER_ASSERTION_TYPES.has(assertion.type)
  ) {
    return (
      <SpecializedValueField
        assertion={assertion}
        error={error}
        index={index}
        onChange={onChange}
      />
    );
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
          {getValueFieldLabel(assertion.type)}
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
        placeholder={getValueFieldPlaceholder(assertion.type)}
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
    GUIDED_FINISH_REASON_TYPES.has(nextType) ||
    DISCLOSED_WEBHOOK_ASSERTION_TYPES.has(nextType) ||
    PI_SCORE_ASSERTION_TYPES.has(nextType) ||
    RAG_SCORE_ASSERTION_TYPES.has(nextType) ||
    MODEL_JUDGE_SCORE_ASSERTION_TYPES.has(nextType) ||
    TRAJECTORY_GOAL_SUCCESS_ASSERTION_TYPES.has(nextType) ||
    NAMED_MATCHER_ASSERTION_TYPES.has(nextType) ||
    NO_VALUE_ASSERTION_TYPES.has(nextType) ||
    THRESHOLD_ASSERTION_TYPES.has(nextType) ||
    WORD_COUNT_ASSERTION_TYPES.has(nextType) ||
    STRUCTURED_VALUE_ASSERTION_TYPES.has(nextType)
  ) {
    const { threshold: _threshold, value: _value, ...withoutStoredValue } = assertion;
    return { ...withoutStoredValue, type: nextType };
  }

  if (TEXT_SCORE_ASSERTION_TYPES.has(assertion.type) && !TEXT_SCORE_ASSERTION_TYPES.has(nextType)) {
    const { threshold: _threshold, ...withoutThreshold } = assertion;
    return { ...withoutThreshold, type: nextType };
  }

  if (PI_SCORE_ASSERTION_TYPES.has(assertion.type) && !PI_SCORE_ASSERTION_TYPES.has(nextType)) {
    const { threshold: _threshold, value: _value, ...withoutStoredValue } = assertion;
    return { ...withoutStoredValue, type: nextType, value: '' };
  }

  if (RAG_SCORE_ASSERTION_TYPES.has(assertion.type) && !RAG_SCORE_ASSERTION_TYPES.has(nextType)) {
    const { threshold: _threshold, value: _value, ...withoutStoredValue } = assertion;
    return { ...withoutStoredValue, type: nextType, value: '' };
  }

  if (
    MODEL_JUDGE_SCORE_ASSERTION_TYPES.has(assertion.type) &&
    !MODEL_JUDGE_SCORE_ASSERTION_TYPES.has(nextType)
  ) {
    const { threshold: _threshold, value: _value, ...withoutStoredValue } = assertion;
    return { ...withoutStoredValue, type: nextType, value: '' };
  }

  if (
    TRAJECTORY_GOAL_SUCCESS_ASSERTION_TYPES.has(assertion.type) &&
    !TRAJECTORY_GOAL_SUCCESS_ASSERTION_TYPES.has(nextType)
  ) {
    const { threshold: _threshold, value: _value, ...withoutStoredValue } = assertion;
    return { ...withoutStoredValue, type: nextType, value: '' };
  }

  if (
    NAMED_MATCHER_ASSERTION_TYPES.has(assertion.type) &&
    !NAMED_MATCHER_ASSERTION_TYPES.has(nextType)
  ) {
    const { value: _value, ...withoutStoredValue } = assertion;
    return { ...withoutStoredValue, type: nextType, value: '' };
  }

  if (
    THRESHOLD_ASSERTION_TYPES.has(assertion.type) ||
    WORD_COUNT_ASSERTION_TYPES.has(assertion.type) ||
    STRUCTURED_VALUE_ASSERTION_TYPES.has(assertion.type) ||
    OPTIONAL_XML_ELEMENT_ASSERTION_TYPES.has(assertion.type) ||
    GUIDED_FINISH_REASON_TYPES.has(assertion.type) ||
    DISCLOSED_WEBHOOK_ASSERTION_TYPES.has(assertion.type) ||
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
