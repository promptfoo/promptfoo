import { useEffect, useRef, useState } from 'react';

import { Badge } from '@app/components/ui/badge';
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
import {
  AlertCircle,
  Braces,
  ChevronDown,
  FileCode,
  Plus,
  Regex,
  Search,
  Sparkles,
  XCircle,
} from 'lucide-react';
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
    type: 'is-json',
    label: 'Is valid JSON',
    description: 'Validate JSON format',
    icon: <Braces className="size-4" />,
  },
  {
    type: 'similar',
    label: 'Semantically similar',
    description: 'Compare meaning using embeddings',
    icon: <Sparkles className="size-4" />,
    placeholder: 'Expected output to compare against...',
    isLLM: true,
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
    type: 'regex',
    label: 'Matches pattern',
    description: 'Test against regex pattern',
    icon: <Regex className="size-4" />,
    placeholder: 'Regular expression pattern...',
  },
  {
    type: 'not-icontains',
    label: 'Does NOT contain',
    description: 'Ensure text is absent',
    icon: <XCircle className="size-4" />,
    placeholder: 'Text that should NOT appear...',
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
  const [showPicker, setShowPicker] = useState(false);
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
    setShowPicker(false);

    // Focus textarea for types that need a value
    if (!NO_VALUE_REQUIRED.has(action.type)) {
      setFocusIndex(newIndex);
    }
  };

  const handleCustomAssertion = () => {
    const newIndex = assertions.length;
    const next = [...assertions, { type: 'contains' as AssertionType, value: '' }];
    onChange(next);
    setShowPicker(false);
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
                  <SelectContent className="max-h-[300px] w-[400px]">
                    {ASSERT_TYPES.map((type) => (
                      <SelectItem key={type} value={type} textValue={type} className="py-2">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">
                            {type}
                            {LLM_ASSERTION_TYPES.has(type) && (
                              <span className="ml-1.5 text-xs text-amber-600 dark:text-amber-400">
                                LLM
                              </span>
                            )}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {ASSERT_TYPE_DESCRIPTIONS.get(type)}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {LLM_ASSERTION_TYPES.has(assertion.type) && (
                  <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 p-3 text-sm">
                    <AlertCircle className="size-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                    <div className="text-amber-700 dark:text-amber-300">
                      <span className="font-medium">LLM-based assertion:</span> This will make API
                      calls to evaluate each result, which may incur additional costs and take
                      longer to process.
                    </div>
                  </div>
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
                        className={`min-h-20 resize-y ${showWarning ? 'border-amber-500 dark:border-amber-500 ring-amber-500/20 ring-2' : ''}`}
                      />
                      {showWarning && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          This assertion type requires a value
                        </p>
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
      {showPicker ? (
        <Card className="p-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">What do you want to check?</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPicker(false)}
                className="text-muted-foreground"
              >
                Cancel
              </Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.type}
                  type="button"
                  onClick={() => handleQuickAction(action)}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border border-border p-3 text-left transition-colors',
                    'hover:bg-muted/50 hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20',
                  )}
                >
                  <div
                    className={cn(
                      'mt-0.5 rounded-md p-1.5',
                      action.isLLM
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {action.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{action.label}</span>
                      {action.isLLM && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                        >
                          LLM
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{action.description}</p>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 pt-2 border-t border-border">
              <Button variant="outline" size="sm" onClick={handleCustomAssertion} className="gap-2">
                <FileCode className="size-4" />
                All assertion types
              </Button>
              <span className="text-xs text-muted-foreground">
                40+ assertion types for advanced use cases
              </span>
            </div>
          </div>
        </Card>
      ) : (
        <Button variant="outline" onClick={() => setShowPicker(true)} className="gap-2">
          <Plus className="size-4" />
          Add Assertion
        </Button>
      )}
    </div>
  );
}
