import { useState } from 'react';

import { JsonDiffView } from '@app/components/JsonDiffView';
import { Button } from '@app/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@app/components/ui/collapsible';
import { cn } from '@app/lib/utils';
import { isJsonAssertion, tryParseJson } from '@app/utils/jsonDiff';
import { Check, ChevronDown, CircleCheck, CircleX, Copy } from 'lucide-react';
import { ellipsize } from '../../../../../util/text';
import type { GradingResult } from '@promptfoo/types';

const COPY_FEEDBACK_DURATION_MS = 2000;

function getValue(result: GradingResult): string {
  // For context-related assertions, read the context value from metadata, if it exists
  // These assertions require special handling and should always use metadata.context
  if (
    result.assertion?.type &&
    ['context-faithfulness', 'context-recall', 'context-relevance'].includes(
      result.assertion.type,
    ) &&
    result.metadata?.context
  ) {
    const context = result.metadata.context;
    return Array.isArray(context) ? context.join('\n') : context;
  }

  // Prefer rendered assertion value with substituted variables over raw template
  if (result.metadata?.renderedAssertionValue !== undefined) {
    return result.metadata.renderedAssertionValue;
  }

  // Otherwise, return the assertion value
  return result.assertion?.value
    ? typeof result.assertion.value === 'object'
      ? JSON.stringify(result.assertion.value, null, 2)
      : String(result.assertion.value)
    : '-';
}

function AssertionResults({
  gradingResults,
  actualOutput,
}: {
  gradingResults?: GradingResult[];
  actualOutput?: string;
}) {
  const [expandedValues, setExpandedValues] = useState<{ [key: number]: boolean }>({});
  const [copiedAssertions, setCopiedAssertions] = useState<{ [key: string]: boolean }>({});
  const [hoveredAssertion, setHoveredAssertion] = useState<string | null>(null);

  if (!gradingResults) {
    return null;
  }

  // Parse actual output once for JSON diff comparisons
  const parsedActualOutput = tryParseJson(actualOutput);

  const hasMetrics = gradingResults.some((result) => result?.assertion?.metric);

  const toggleExpand = (index: number) => {
    setExpandedValues((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const copyAssertionToClipboard = async (key: string, text: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopiedAssertions((prev) => ({ ...prev, [key]: true }));

    setTimeout(() => {
      setCopiedAssertions((prev) => ({ ...prev, [key]: false }));
    }, COPY_FEEDBACK_DURATION_MS);
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {hasMetrics && <th className="px-4 py-3 text-left font-semibold">Metric</th>}
            <th className="px-4 py-3 text-left font-semibold">Pass</th>
            <th className="px-4 py-3 text-left font-semibold">Score</th>
            <th className="px-4 py-3 text-left font-semibold">Type</th>
            <th className="px-4 py-3 text-left font-semibold">Value</th>
            <th className="px-4 py-3 text-left font-semibold">Reason</th>
          </tr>
        </thead>
        <tbody>
          {gradingResults.map((result, i) => {
            if (!result) {
              return null;
            }

            const value = getValue(result);
            const truncatedValue = ellipsize(value, 300);
            const isExpanded = expandedValues[i] || false;
            const valueKey = `value-${i}`;

            return (
              <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                {hasMetrics && <td className="px-4 py-3">{result.assertion?.metric || ''}</td>}
                <td className="px-4 py-3">
                  {result.pass ? (
                    <CircleCheck className="size-5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <CircleX className="size-5 text-red-600 dark:text-red-400" />
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums">{result.score?.toFixed(2)}</td>
                <td className="px-4 py-3 font-mono text-xs">{result.assertion?.type || ''}</td>
                <td
                  className="relative px-4 py-3 whitespace-pre-wrap cursor-pointer max-w-md"
                  onClick={() => toggleExpand(i)}
                  onMouseEnter={() => setHoveredAssertion(valueKey)}
                  onMouseLeave={() => setHoveredAssertion(null)}
                >
                  <span className="break-words">{isExpanded ? value : truncatedValue}</span>
                  {(hoveredAssertion === valueKey || copiedAssertions[valueKey]) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => copyAssertionToClipboard(valueKey, value, e)}
                      className="absolute right-2 top-2 size-7 bg-background shadow-sm hover:shadow"
                      aria-label={`Copy assertion value ${i}`}
                    >
                      {copiedAssertions[valueKey] ? (
                        <Check className="size-3.5" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </Button>
                  )}
                </td>
                <td
                  className="relative px-4 py-3 whitespace-pre-wrap max-w-md"
                  onMouseEnter={() => setHoveredAssertion(`reason-${i}`)}
                  onMouseLeave={() => setHoveredAssertion(null)}
                >
                  <span className="break-words">{result.reason}</span>
                  {result.reason &&
                    (hoveredAssertion === `reason-${i}` || copiedAssertions[`reason-${i}`]) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyAssertionToClipboard(`reason-${i}`, result.reason || '', e);
                        }}
                        className="absolute right-2 top-2 size-7 bg-background shadow-sm hover:shadow"
                        aria-label={`Copy assertion reason ${i}`}
                      >
                        {copiedAssertions[`reason-${i}`] ? (
                          <Check className="size-3.5" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                      </Button>
                    )}
                  {/* JSON diff view for failed JSON assertions */}
                  {!result.pass &&
                    isJsonAssertion(result) &&
                    parsedActualOutput !== null &&
                    result.assertion?.value !== undefined && (
                      <JsonDiffView
                        expected={result.assertion.value}
                        actual={parsedActualOutput}
                        className="mt-2"
                      />
                    )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatGradingPrompt(prompt: string): string {
  try {
    const parsed = JSON.parse(prompt);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return prompt;
  }
}

function GradingPromptSection({ gradingResults }: { gradingResults?: GradingResult[] }) {
  const promptsWithData = gradingResults?.filter((r) => r.metadata?.renderedGradingPrompt) || [];
  const [openItems, setOpenItems] = useState<{ [key: number]: boolean }>({});

  if (promptsWithData.length === 0) {
    return null;
  }

  const toggleItem = (index: number) => {
    setOpenItems((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  return (
    <div className="mt-4">
      <h4 className="mb-2 text-sm font-medium">Grading Prompts</h4>
      <div className="space-y-2">
        {promptsWithData.map((result, i) => (
          <Collapsible key={i} open={openItems[i]} onOpenChange={() => toggleItem(i)}>
            <div className="rounded-lg border border-border">
              <CollapsibleTrigger asChild>
                <button className="flex w-full items-center justify-between px-4 py-3 text-sm hover:bg-muted/50 transition-colors">
                  <span>{result.assertion?.type || 'Assertion'} - Full Grading Prompt</span>
                  <ChevronDown
                    className={cn(
                      'size-4 text-muted-foreground transition-transform',
                      openItems[i] && 'rotate-180',
                    )}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="border-t border-border">
                  <pre className="whitespace-pre-wrap break-words text-xs max-h-[400px] overflow-auto bg-muted/30 p-4 m-0">
                    {formatGradingPrompt(result.metadata?.renderedGradingPrompt || '')}
                  </pre>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        ))}
      </div>
    </div>
  );
}

interface EvaluationPanelProps {
  gradingResults?: GradingResult[];
  actualOutput?: string;
}

export function EvaluationPanel({ gradingResults, actualOutput }: EvaluationPanelProps) {
  return (
    <div>
      <AssertionResults gradingResults={gradingResults} actualOutput={actualOutput} />
      <GradingPromptSection gradingResults={gradingResults} />
    </div>
  );
}
