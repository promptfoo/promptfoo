import { useState } from 'react';

import { Button } from '@app/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@app/components/ui/collapsible';
import { cn } from '@app/lib/utils';
import { Check, ChevronDown, CircleCheck, CircleX, Copy, CornerDownRight } from 'lucide-react';
import { ellipsize } from '../../../../../util/text';
import type { Assertion, GradingResult } from '@promptfoo/types';

const COPY_FEEDBACK_DURATION_MS = 2000;
const ASSERTION_VALUE_PREVIEW_LENGTH = 300;
const ASSERTION_ROW_INDENT_PX = 24;

interface AssertionResultRow {
  depth: number;
  result: GradingResult;
  rowId: string;
}

interface AssertionSetMetadata {
  type: 'assert-set';
  assertionCount?: number;
  assert?: Assertion[];
  metric?: string;
  threshold?: number;
  weight?: number;
}

function getChildResults(result: GradingResult): GradingResult[] {
  return (
    result.componentResults?.filter((childResult): childResult is GradingResult =>
      Boolean(childResult),
    ) ?? []
  );
}

function isAssertionSetMetadata(value: unknown): value is AssertionSetMetadata {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const metadata = value as Record<string, unknown>;
  const assertionCount = metadata.assertionCount;

  return (
    metadata.type === 'assert-set' &&
    (assertionCount === undefined ||
      (typeof assertionCount === 'number' &&
        Number.isInteger(assertionCount) &&
        assertionCount >= 0)) &&
    (metadata.assert === undefined || Array.isArray(metadata.assert)) &&
    (metadata.metric === undefined || typeof metadata.metric === 'string') &&
    (metadata.threshold === undefined || typeof metadata.threshold === 'number') &&
    (metadata.weight === undefined || typeof metadata.weight === 'number')
  );
}

function getAssertionSet(result: GradingResult): AssertionSetMetadata | undefined {
  const assertionSet = result.metadata?.assertionSet;
  return isAssertionSetMetadata(assertionSet) ? assertionSet : undefined;
}

function getAssertionSetCount(result: GradingResult): number | undefined {
  const assertionSet = getAssertionSet(result);
  if (!assertionSet) {
    return undefined;
  }

  return assertionSet.assertionCount ?? assertionSet.assert?.length;
}

function getMetric(result: GradingResult): string {
  return result.assertion?.metric || getAssertionSet(result)?.metric || '';
}

function getAssertionType(result: GradingResult): string {
  return (
    result.assertion?.type ||
    getAssertionSet(result)?.type ||
    (getChildResults(result).length > 0 ? 'assert-set' : '-')
  );
}

function isMatchingAssertion(
  expected: Assertion | undefined,
  actual: Assertion | undefined,
): boolean {
  return JSON.stringify(actual ?? null) === JSON.stringify(expected ?? null);
}

function isMatchingResultTree(
  expected: GradingResult,
  actual: GradingResult | undefined,
  inheritedAssertion?: Assertion,
): boolean {
  if (!actual) {
    return false;
  }

  const expectedAssertion = expected.assertion ?? inheritedAssertion;
  const actualAssertion = actual.assertion ?? inheritedAssertion;
  const expectedChildren = getChildResults(expected);
  const actualChildren = getChildResults(actual);

  return (
    expected.pass === actual.pass &&
    expected.score === actual.score &&
    expected.reason === actual.reason &&
    isMatchingAssertion(expectedAssertion, actualAssertion) &&
    expectedChildren.length === actualChildren.length &&
    expectedChildren.every((childResult, childIndex) =>
      isMatchingResultTree(childResult, actualChildren[childIndex], expectedAssertion),
    )
  );
}

function normalizeAssertionResults(gradingResults: GradingResult[]): GradingResult[] {
  const normalizedResults: GradingResult[] = [];
  let index = 0;

  while (index < gradingResults.length) {
    const result = gradingResults[index];
    if (!result) {
      index += 1;
      continue;
    }

    normalizedResults.push(result);

    const childResults = getChildResults(result);
    const hasFlattenedDuplicates =
      childResults.length > 0 &&
      childResults.every((childResult, childIndex) =>
        isMatchingResultTree(childResult, gradingResults[index + childIndex + 1], result.assertion),
      );

    index += hasFlattenedDuplicates ? childResults.length + 1 : 1;
  }

  return normalizedResults;
}

function buildAssertionRows(
  gradingResults: GradingResult[],
  depth = 0,
  parentRowId = '',
): AssertionResultRow[] {
  const rows: AssertionResultRow[] = [];
  const normalizedResults = normalizeAssertionResults(gradingResults);

  for (let index = 0; index < normalizedResults.length; index++) {
    const result = normalizedResults[index];
    if (!result) {
      continue;
    }

    const rowId = parentRowId ? `${parentRowId}-${index}` : `${index}`;
    rows.push({ depth, result, rowId });

    const childResults = getChildResults(result);
    if (childResults.length > 0) {
      rows.push(...buildAssertionRows(childResults, depth + 1, rowId));
    }
  }

  return rows;
}

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

  if (result.assertion?.value !== undefined) {
    return typeof result.assertion.value === 'object'
      ? JSON.stringify(result.assertion.value, null, 2)
      : String(result.assertion.value);
  }

  const assertionSet = getAssertionSet(result);
  if (assertionSet) {
    const assertionCount = getAssertionSetCount(result) ?? getChildResults(result).length;
    return `${assertionCount} nested assertion${assertionCount === 1 ? '' : 's'}`;
  }

  const childResultCount = getChildResults(result).length;
  if (childResultCount > 0) {
    return `${childResultCount} nested assertion${childResultCount === 1 ? '' : 's'}`;
  }

  return '-';
}

function AssertionResults({ gradingResults }: { gradingResults?: GradingResult[] }) {
  const [expandedValues, setExpandedValues] = useState<{ [key: string]: boolean }>({});
  const [copiedAssertions, setCopiedAssertions] = useState<{ [key: string]: boolean }>({});
  const [hoveredAssertion, setHoveredAssertion] = useState<string | null>(null);

  if (!gradingResults) {
    return null;
  }

  const assertionRows = buildAssertionRows(gradingResults);
  const hasMetrics = assertionRows.some(({ result }) => getMetric(result));

  const toggleExpand = (rowId: string) => {
    setExpandedValues((prev) => ({ ...prev, [rowId]: !prev[rowId] }));
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
          {assertionRows.map(({ depth, result, rowId }) => {
            const value = getValue(result);
            const truncatedValue = ellipsize(value, ASSERTION_VALUE_PREVIEW_LENGTH);
            const isExpanded = expandedValues[rowId] || false;
            const valueKey = `value-${rowId}`;
            const reasonKey = `reason-${rowId}`;
            const hasChildren = getChildResults(result).length > 0;
            const assertionType = getAssertionType(result);
            const metric = getMetric(result);
            const indentationStyle = { paddingLeft: depth * ASSERTION_ROW_INDENT_PX };

            return (
              <tr
                key={rowId}
                className={cn(
                  'border-b border-border last:border-0 hover:bg-muted/30',
                  hasChildren && 'bg-muted/20',
                )}
              >
                {hasMetrics && <td className="px-4 py-3">{metric}</td>}
                <td className="px-4 py-3">
                  {result.pass ? (
                    <CircleCheck className="size-5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <CircleX className="size-5 text-red-600 dark:text-red-400" />
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums">{result.score?.toFixed(2)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2" style={indentationStyle}>
                    {depth > 0 && (
                      <CornerDownRight className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span
                      className={cn(
                        'rounded-md border border-border bg-background px-2 py-1 font-mono text-xs text-foreground',
                        hasChildren && 'bg-muted/60 font-semibold',
                      )}
                    >
                      {assertionType}
                    </span>
                  </div>
                </td>
                <td
                  className="relative px-4 py-3 whitespace-pre-wrap cursor-pointer max-w-md"
                  onClick={() => toggleExpand(rowId)}
                  onMouseEnter={() => setHoveredAssertion(valueKey)}
                  onMouseLeave={() => setHoveredAssertion(null)}
                >
                  <div className="flex items-start gap-2" style={indentationStyle}>
                    {depth > 0 && <span className="mt-2 h-px w-4 shrink-0 bg-border" />}
                    <span className="break-words">{isExpanded ? value : truncatedValue}</span>
                  </div>
                  {(hoveredAssertion === valueKey || copiedAssertions[valueKey]) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => copyAssertionToClipboard(valueKey, value, e)}
                      className="absolute right-2 top-2 size-7 bg-background shadow-sm hover:shadow"
                      aria-label={`Copy assertion value ${rowId}`}
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
                  onMouseEnter={() => setHoveredAssertion(reasonKey)}
                  onMouseLeave={() => setHoveredAssertion(null)}
                >
                  <span className="break-words">{result.reason}</span>
                  {result.reason &&
                    (hoveredAssertion === reasonKey || copiedAssertions[reasonKey]) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyAssertionToClipboard(reasonKey, result.reason || '', e);
                        }}
                        className="absolute right-2 top-2 size-7 bg-background shadow-sm hover:shadow"
                        aria-label={`Copy assertion reason ${rowId}`}
                      >
                        {copiedAssertions[reasonKey] ? (
                          <Check className="size-3.5" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                      </Button>
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
          <Collapsible key={i} open={Boolean(openItems[i])} onOpenChange={() => toggleItem(i)}>
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
}

export function EvaluationPanel({ gradingResults }: EvaluationPanelProps) {
  return (
    <div>
      <AssertionResults gradingResults={gradingResults} />
      <GradingPromptSection gradingResults={gradingResults} />
    </div>
  );
}
