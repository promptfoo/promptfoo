import { useEffect, useRef, useState } from 'react';

import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@app/components/ui/collapsible';
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
import { cn } from '@app/lib/utils';
import { Braces, ChevronDown, Equal, MoveRight, Search, Sparkles } from 'lucide-react';
import type { Assertion, AssertionType } from '@promptfoo/types';

interface PosthocAssertionsFormProps {
  assertions: Assertion[];
  onChange: (assertions: Assertion[]) => void;
}

// Quick actions - the most common assertion patterns
interface QuickAction {
  type: AssertionType;
  label: string;
  description: string;
  icon: React.ReactNode;
  placeholder?: string;
  isLLM?: boolean;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    type: 'icontains',
    label: 'Contains text',
    description: 'Check if output contains a substring',
    icon: <Search className="size-4" />,
    placeholder: 'Text to search for...',
  },
  {
    type: 'equals',
    label: 'Equals exactly',
    description: 'Output must match exactly',
    icon: <Equal className="size-4" />,
    placeholder: 'Expected exact output...',
  },
  {
    type: 'starts-with',
    label: 'Starts with',
    description: 'Output begins with this text',
    icon: <MoveRight className="size-4" />,
    placeholder: 'Text the output should start with...',
  },
  {
    type: 'is-json',
    label: 'Is valid JSON',
    description: 'Validate JSON format',
    icon: <Braces className="size-4" />,
  },
  {
    type: 'llm-rubric',
    label: 'LLM evaluates',
    description: 'AI grades against your criteria',
    icon: <Sparkles className="size-4" />,
    placeholder: 'Describe what makes a good response...',
    isLLM: true,
  },
  {
    type: 'similar',
    label: 'Semantically similar',
    description: 'Compare meaning using embeddings',
    icon: <Sparkles className="size-4" />,
    placeholder: 'Expected output to compare against...',
    isLLM: true,
  },
];

// Full assertion type definitions
interface AssertionTypeInfo {
  type: AssertionType;
  description: string;
}

const ASSERT_TYPE_INFO: AssertionTypeInfo[] = [
  // Most common LLM-based assertions
  { type: 'similar', description: 'Semantic similarity using embeddings (threshold 0-1)' },
  { type: 'llm-rubric', description: 'LLM grades output against custom criteria' },
  { type: 'factuality', description: 'Checks factual accuracy against reference' },
  { type: 'model-graded-closedqa', description: 'LLM evaluates closed Q&A correctness' },

  // Common string matching
  { type: 'contains', description: 'Output contains exact substring (case-sensitive)' },
  { type: 'icontains', description: 'Output contains substring (case-insensitive)' },
  { type: 'equals', description: 'Output exactly matches value' },
  { type: 'starts-with', description: 'Output starts with value' },
  { type: 'regex', description: 'Output matches regular expression pattern' },

  // Multiple value matching
  { type: 'contains-all', description: 'Output contains all specified substrings' },
  { type: 'contains-any', description: 'Output contains at least one substring' },

  // Format validation
  { type: 'is-json', description: 'Output is valid JSON' },
  { type: 'contains-json', description: 'Output contains valid JSON somewhere' },
  { type: 'is-xml', description: 'Output is valid XML' },
  { type: 'contains-xml', description: 'Output contains valid XML somewhere' },
  { type: 'is-sql', description: 'Output is valid SQL syntax' },
  { type: 'contains-sql', description: 'Output contains valid SQL somewhere' },

  // Other LLM-based
  { type: 'answer-relevance', description: 'LLM checks if answer is relevant to query' },
  { type: 'context-faithfulness', description: 'LLM checks if output is faithful to context' },
  { type: 'context-recall', description: 'LLM checks if output covers context info' },
  { type: 'context-relevance', description: 'LLM checks if context is relevant to query' },
  { type: 'g-eval', description: 'Google-style LLM evaluation with custom dimensions' },
  { type: 'moderation', description: 'Checks output for harmful/inappropriate content' },
  { type: 'pi', description: 'Checks for personal information disclosure' },

  // Function call validation
  { type: 'is-valid-function-call', description: 'Output is a valid function call' },
  { type: 'is-valid-openai-function-call', description: 'Valid OpenAI function call format' },
  { type: 'is-valid-openai-tools-call', description: 'Valid OpenAI tools call format' },

  // Metrics
  { type: 'bleu', description: 'BLEU score for translation quality (0-1)' },
  { type: 'cost', description: 'API cost is within threshold' },
  { type: 'finish-reason', description: 'Response has expected finish reason' },
  { type: 'latency', description: 'Response time is within threshold (ms)' },
  { type: 'perplexity', description: 'Model perplexity is within threshold' },
  { type: 'perplexity-score', description: 'Normalized perplexity score (0-1)' },
  { type: 'rouge-n', description: 'ROUGE-N score for summarization quality' },
  { type: 'webhook', description: 'Custom webhook returns pass/fail' },

  // Negations
  { type: 'not-contains', description: 'Output does NOT contain substring' },
  { type: 'not-contains-all', description: 'Output does NOT contain all substrings' },
  { type: 'not-contains-any', description: 'Output does NOT contain any substring' },
  { type: 'not-contains-json', description: 'Output does NOT contain JSON' },
  { type: 'not-equals', description: 'Output does NOT equal value' },
  { type: 'not-icontains', description: 'Output does NOT contain (case-insensitive)' },
  { type: 'not-is-json', description: 'Output is NOT valid JSON' },
  { type: 'not-regex', description: 'Output does NOT match regex pattern' },
  { type: 'not-rouge-n', description: 'ROUGE-N score is below threshold' },
  { type: 'not-similar', description: 'Output is NOT semantically similar' },
  { type: 'not-starts-with', description: 'Output does NOT start with value' },
  { type: 'not-webhook', description: 'Webhook returns fail (inverted)' },
];

const ASSERT_TYPES = ASSERT_TYPE_INFO.map((info) => info.type);
const ASSERT_TYPE_DESCRIPTIONS = new Map(
  ASSERT_TYPE_INFO.map((info) => [info.type, info.description]),
);

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

// Assertion types that don't require a value
const NO_VALUE_REQUIRED = new Set<AssertionType>([
  'is-json',
  'is-xml',
  'is-sql',
  'not-is-json',
  'is-valid-function-call',
  'is-valid-openai-function-call',
  'is-valid-openai-tools-call',
  'moderation',
  'pi',
]);

// Get placeholder text based on assertion type
function getPlaceholder(type: AssertionType): string {
  const quickAction = QUICK_ACTIONS.find((a) => a.type === type);
  if (quickAction?.placeholder) {
    return quickAction.placeholder;
  }

  if (LLM_ASSERTION_TYPES.has(type)) {
    return 'Describe your evaluation criteria...';
  }

  if (NO_VALUE_REQUIRED.has(type)) {
    return 'Optional - leave empty for default behavior';
  }

  return 'Enter expected value...';
}

export default function PosthocAssertionsForm({
  assertions,
  onChange,
}: PosthocAssertionsFormProps) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const textareaRefs = useRef<Record<number, HTMLTextAreaElement | null>>({});

  // Focus the textarea when a new assertion is added
  useEffect(() => {
    if (focusIndex !== null && textareaRefs.current[focusIndex]) {
      textareaRefs.current[focusIndex]?.focus();
      setFocusIndex(null);
    }
  }, [focusIndex]);

  const handleQuickAction = (action: QuickAction) => {
    const newIndex = assertions.length;
    const next = [...assertions, { type: action.type, value: '' }];
    onChange(next);

    // Focus textarea for types that need a value
    if (!NO_VALUE_REQUIRED.has(action.type)) {
      setFocusIndex(newIndex);
    }
  };

  const handleCustomAssertion = () => {
    const newIndex = assertions.length;
    const next = [...assertions, { type: 'contains' as AssertionType, value: '' }];
    onChange(next);
    setFocusIndex(newIndex);
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
      {/* Existing assertions */}
      {assertions.length > 0 && (
        <div className="space-y-3">
          {assertions.map((assertion, index) => (
            <Card key={index} className="p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor={`assert-type-${index}`} className="text-sm font-medium">
                    Type
                  </Label>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemove(index)}
                    className="shrink-0 h-8 w-8"
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
                      <SelectItem key={type} value={type} textValue={type}>
                        <span className="font-medium">{type}</span>
                        {LLM_ASSERTION_TYPES.has(type) && (
                          <span className="ml-1 text-xs text-muted-foreground">(LLM)</span>
                        )}
                        <span className="ml-2 text-muted-foreground">
                          {ASSERT_TYPE_DESCRIPTIONS.get(type)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {LLM_ASSERTION_TYPES.has(assertion.type) && (
                  <p className="text-xs text-muted-foreground">
                    This assertion makes API calls per result
                  </p>
                )}

                {(() => {
                  const valueRequired = !NO_VALUE_REQUIRED.has(assertion.type);
                  const currentValue =
                    typeof assertion.value === 'string'
                      ? assertion.value
                      : typeof assertion.value === 'number'
                        ? String(assertion.value)
                        : '';
                  const isEmpty = currentValue.trim() === '';
                  const showWarning = valueRequired && isEmpty;

                  return (
                    <div className="space-y-2">
                      <Label htmlFor={`assert-value-${index}`} className="text-sm font-medium">
                        Value
                        {!valueRequired && (
                          <span className="ml-1.5 text-xs text-muted-foreground">(optional)</span>
                        )}
                      </Label>
                      <Textarea
                        ref={(el) => {
                          textareaRefs.current[index] = el;
                        }}
                        id={`assert-value-${index}`}
                        placeholder={getPlaceholder(assertion.type)}
                        value={currentValue}
                        onChange={(e) => updateAssertion(index, { value: e.target.value })}
                        className="min-h-20 resize-y"
                      />
                      {showWarning && (
                        <p className="text-xs text-muted-foreground">Value required</p>
                      )}
                    </div>
                  );
                })()}

                <Collapsible
                  open={expanded[index] || false}
                  onOpenChange={(isOpen) => setExpanded((prev) => ({ ...prev, [index]: isOpen }))}
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
                    <div className="grid gap-3 sm:grid-cols-2 pt-3">
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

      {/* Quick Action Picker */}
      <div className="space-y-3">
        <span className="text-sm text-muted-foreground">Add assertion</span>

        <div className="grid gap-2 sm:grid-cols-2">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.type}
              type="button"
              onClick={() => handleQuickAction(action)}
              className={cn(
                'flex items-center gap-3 rounded-md border border-border px-3 py-2.5 text-left',
                'transition-all hover:bg-muted hover:border-muted-foreground/25',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
              )}
            >
              <span className="text-foreground/70">{action.icon}</span>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium">{action.label}</span>
                {action.isLLM && (
                  <span className="ml-1.5 text-xs text-muted-foreground">(LLM)</span>
                )}
              </div>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleCustomAssertion}
          className="w-full text-left text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
        >
          Browse all 40+ assertion types →
        </button>
      </div>
    </div>
  );
}
