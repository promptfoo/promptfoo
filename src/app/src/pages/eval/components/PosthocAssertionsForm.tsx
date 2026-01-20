import { useEffect, useMemo, useRef, useState } from 'react';

import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@app/components/ui/collapsible';
import { Input } from '@app/components/ui/input';
import { JsonTextarea } from '@app/components/ui/json-textarea';
import { Label } from '@app/components/ui/label';
import { NumberInput } from '@app/components/ui/number-input';
import { Popover, PopoverContent, PopoverTrigger } from '@app/components/ui/popover';
import { Textarea } from '@app/components/ui/textarea';
import { cn } from '@app/lib/utils';
import {
  Braces,
  ChevronDown,
  Equal,
  HelpCircle,
  MoveRight,
  Search,
  Settings2,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import type { Assertion, AssertionType } from '@promptfoo/types';

interface PosthocAssertionsFormProps {
  assertions: Assertion[];
  onChange: (assertions: Assertion[]) => void;
  targetCount?: number;
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
    type: 'llm-rubric',
    label: 'LLM evaluates',
    description: 'AI grades output against your criteria',
    icon: <Sparkles className="size-4" />,
    placeholder: 'Describe what makes a good response...',
    isLLM: true,
  },
  {
    type: 'icontains',
    label: 'Contains text',
    description: 'Check for substring (case-insensitive)',
    icon: <Search className="size-4" />,
    placeholder: 'Text to search for...',
  },
  {
    type: 'is-json',
    label: 'Is valid JSON',
    description: 'Validates JSON structure',
    icon: <Braces className="size-4" />,
  },
  {
    type: 'equals',
    label: 'Equals exactly',
    description: 'Exact string match',
    icon: <Equal className="size-4" />,
    placeholder: 'Expected exact output...',
  },
  {
    type: 'starts-with',
    label: 'Starts with',
    description: 'Check output prefix',
    icon: <MoveRight className="size-4" />,
    placeholder: 'Text the output should start with...',
  },
  {
    type: 'similar',
    label: 'Semantically similar',
    description: 'Compare meaning via embeddings',
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

// Assertion types that don't require a value (they check format/structure only)
// or where a value is optional (contains-* assertions can work without a schema to validate against)
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
  // These assertions can work without a value (they just check format presence)
  'contains-json',
  'contains-xml',
  'contains-sql',
  'not-contains-json',
]);

// Assertion types that benefit from advanced options being auto-expanded
// These types often need threshold, config, or other settings to work properly
const AUTO_EXPAND_ADVANCED = new Set<AssertionType>([
  'similar', // Needs threshold for similarity score
  'latency', // Needs threshold for max latency in ms
  'cost', // Needs threshold for max cost
  'webhook', // Needs config for webhook URL
  'bleu', // Often needs threshold
  'rouge-n', // Often needs threshold
  'perplexity', // Needs threshold
  'perplexity-score', // Needs threshold
  'g-eval', // Needs config for evaluation dimensions
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
  targetCount,
}: PosthocAssertionsFormProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllTypes, setShowAllTypes] = useState(false);
  const [expandedAdvanced, setExpandedAdvanced] = useState<Record<number, boolean>>({});
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const inputRefs = useRef<Record<number, HTMLTextAreaElement | HTMLInputElement | null>>({});

  // Focus the input when a new assertion is added
  useEffect(() => {
    if (focusIndex !== null && inputRefs.current[focusIndex]) {
      inputRefs.current[focusIndex]?.focus();
      setFocusIndex(null);
    }
  }, [focusIndex]);

  // Calculate LLM assertion count for warning
  const llmAssertionCount = useMemo(
    () => assertions.filter((a) => LLM_ASSERTION_TYPES.has(a.type)).length,
    [assertions],
  );

  const totalApiCalls = llmAssertionCount * (targetCount || 0);

  // Filter assertion types based on search
  const filteredTypes = useMemo(() => {
    if (!searchQuery.trim()) {
      return ASSERT_TYPE_INFO;
    }
    const query = searchQuery.toLowerCase();
    return ASSERT_TYPE_INFO.filter(
      (info) =>
        info.type.toLowerCase().includes(query) || info.description.toLowerCase().includes(query),
    );
  }, [searchQuery]);

  const handleQuickAction = (action: QuickAction) => {
    const newIndex = assertions.length;
    const next = [...assertions, { type: action.type, value: '' }];
    onChange(next);

    // Auto-expand advanced options for types that need configuration
    if (AUTO_EXPAND_ADVANCED.has(action.type)) {
      setExpandedAdvanced((prev) => ({ ...prev, [newIndex]: true }));
    }

    // Focus input for types that need a value
    if (!NO_VALUE_REQUIRED.has(action.type)) {
      setFocusIndex(newIndex);
    }
  };

  const handleSelectType = (type: AssertionType) => {
    const newIndex = assertions.length;
    const next = [...assertions, { type, value: '' }];
    onChange(next);
    setShowAllTypes(false);
    setSearchQuery('');

    // Auto-expand advanced options for types that need configuration
    if (AUTO_EXPAND_ADVANCED.has(type)) {
      setExpandedAdvanced((prev) => ({ ...prev, [newIndex]: true }));
    }

    if (!NO_VALUE_REQUIRED.has(type)) {
      setFocusIndex(newIndex);
    }
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
      {/* Quick Action Picker - Always at top */}
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          {QUICK_ACTIONS.map((action, index) => (
            <button
              key={action.type}
              type="button"
              onClick={() => handleQuickAction(action)}
              className={cn(
                'flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left',
                'transition-all',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
                index === 0
                  ? 'border-primary/30 bg-primary/5 hover:border-primary/50 hover:bg-primary/10'
                  : 'border-border hover:bg-muted hover:border-muted-foreground/25',
              )}
            >
              <span className={cn('text-muted-foreground mt-0.5', index === 0 && 'text-primary')}>
                {action.icon}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{action.label}</span>
                  {action.isLLM && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      LLM
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{action.description}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Browse all types */}
        <Popover open={showAllTypes} onOpenChange={setShowAllTypes}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Browse all {ASSERT_TYPE_INFO.length}+ assertion types →
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <div className="p-2 border-b border-border">
              <Input
                placeholder="Search assertion types..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8"
              />
            </div>
            <div className="max-h-64 overflow-y-auto p-1">
              {filteredTypes.map((info) => (
                <button
                  key={info.type}
                  type="button"
                  onClick={() => handleSelectType(info.type)}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{info.type}</span>
                    {LLM_ASSERTION_TYPES.has(info.type) && (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0">
                        LLM
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{info.description}</p>
                </button>
              ))}
              {filteredTypes.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No matching assertion types
                </p>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Empty state guidance */}
      {assertions.length === 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-4">
          <HelpCircle className="size-5 text-muted-foreground mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              Select an assertion type above to validate outputs against your criteria.
            </p>
            <p className="text-xs text-muted-foreground/70">
              LLM assertions use AI to evaluate quality. String assertions check exact patterns.
            </p>
          </div>
        </div>
      )}

      {/* Configured assertions - Inline rows */}
      {assertions.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Your assertions ({assertions.length})
            </span>
          </div>

          <div className="rounded-lg border border-border divide-y divide-border">
            {assertions.map((assertion, index) => {
              const valueRequired = !NO_VALUE_REQUIRED.has(assertion.type);
              const currentValue =
                typeof assertion.value === 'string'
                  ? assertion.value
                  : typeof assertion.value === 'number'
                    ? String(assertion.value)
                    : '';
              const hasAdvancedSettings =
                assertion.threshold != null ||
                assertion.weight != null ||
                assertion.metric ||
                assertion.transform ||
                assertion.contextTransform ||
                assertion.config;

              return (
                <div key={index} className="p-3 space-y-2">
                  {/* Row 1: Type badge + delete */}
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={LLM_ASSERTION_TYPES.has(assertion.type) ? 'default' : 'secondary'}
                      className="font-mono text-xs"
                    >
                      {assertion.type}
                      {LLM_ASSERTION_TYPES.has(assertion.type) && <Zap className="size-3 ml-1" />}
                    </Badge>
                    <span className="text-xs text-muted-foreground flex-1 truncate">
                      {ASSERT_TYPE_DESCRIPTIONS.get(assertion.type)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemove(index)}
                      className="size-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      aria-label="Remove assertion"
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>

                  {/* Row 2: Value input (if needed) */}
                  {valueRequired && (
                    <Textarea
                      ref={(el) => {
                        inputRefs.current[index] = el;
                      }}
                      placeholder={getPlaceholder(assertion.type)}
                      value={currentValue}
                      onChange={(e) => updateAssertion(index, { value: e.target.value })}
                      className="min-h-16 resize-y text-sm"
                    />
                  )}

                  {/* Row 3: Advanced options (collapsible) */}
                  <Collapsible
                    open={expandedAdvanced[index] || false}
                    onOpenChange={(isOpen) =>
                      setExpandedAdvanced((prev) => ({ ...prev, [index]: isOpen }))
                    }
                  >
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          'flex items-center gap-1 text-xs transition-colors',
                          hasAdvancedSettings
                            ? 'text-foreground'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <Settings2 className="size-3" />
                        <span>Advanced</span>
                        {hasAdvancedSettings && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0 ml-1">
                            configured
                          </Badge>
                        )}
                        <ChevronDown
                          className={cn(
                            'size-3 transition-transform ml-0.5',
                            expandedAdvanced[index] && 'rotate-180',
                          )}
                        />
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="grid gap-3 sm:grid-cols-2 pt-3 mt-2 border-t border-border">
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
                          <Label htmlFor={`assert-metric-${index}`} className="text-xs">
                            Metric name
                          </Label>
                          <Input
                            id={`assert-metric-${index}`}
                            value={assertion.metric || ''}
                            onChange={(e) => updateAssertion(index, { metric: e.target.value })}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Label htmlFor={`assert-transform-${index}`} className="text-xs">
                            Transform
                          </Label>
                          <Textarea
                            id={`assert-transform-${index}`}
                            value={assertion.transform || ''}
                            onChange={(e) => updateAssertion(index, { transform: e.target.value })}
                            placeholder="Optional transform expression"
                            className="min-h-12 text-sm"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Label htmlFor={`assert-context-transform-${index}`} className="text-xs">
                            Context transform
                          </Label>
                          <Textarea
                            id={`assert-context-transform-${index}`}
                            value={assertion.contextTransform || ''}
                            onChange={(e) =>
                              updateAssertion(index, { contextTransform: e.target.value })
                            }
                            placeholder="Optional context transform expression"
                            className="min-h-12 text-sm"
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
              );
            })}
          </div>
        </div>
      )}

      {/* LLM Cost Warning - Single consolidated line */}
      {llmAssertionCount > 0 && targetCount && targetCount > 0 && (
        <div
          className={cn(
            'flex items-center gap-2 text-xs px-3 py-2 rounded-md',
            totalApiCalls > 500
              ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300'
              : 'bg-muted text-muted-foreground',
          )}
        >
          <Zap className="size-3.5" />
          <span>
            {llmAssertionCount} LLM assertion{llmAssertionCount > 1 ? 's' : ''} × {targetCount} test
            cases = <strong>{totalApiCalls.toLocaleString()} API calls</strong>
          </span>
        </div>
      )}
    </div>
  );
}
