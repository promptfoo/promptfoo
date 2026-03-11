import React from 'react';

import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@app/components/ui/collapsible';
import { Sheet, SheetContent, SheetTitle } from '@app/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@app/components/ui/tabs';
import { cn } from '@app/lib/utils';
import { getActualPrompt } from '@app/utils/providerResponse';
import { categoryAliases, displayNameOverrides } from '@promptfoo/redteam/constants';
import { ChevronDown, Lightbulb } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ChatMessages, { type Message } from '../../../eval/components/ChatMessages';
import EvalOutputPromptDialog from '../../../eval/components/EvalOutputPromptDialog';
import PluginStrategyFlow from './PluginStrategyFlow';
import SuggestionsDialog from './SuggestionsDialog';
import { getPassRateStyles, getStrategyIdFromTest, type TestWithMetadata } from './shared';
import type { GradingResult } from '@promptfoo/types';

interface RiskCategoryDrawerProps {
  open: boolean;
  onClose: () => void;
  category: string;
  failures: TestWithMetadata[];
  passes: TestWithMetadata[];
  evalId: string;
  numPassed: number;
  numFailed: number;
}

const PRIORITY_STRATEGIES = ['jailbreak:composite', 'pliny', 'prompt-injections'];

// Sort function for prioritizing specific strategies
function sortByPriorityStrategies(a: TestWithMetadata, b: TestWithMetadata): number {
  const strategyA = getStrategyIdFromTest(a);
  const strategyB = getStrategyIdFromTest(b);

  const priorityA = PRIORITY_STRATEGIES.indexOf(strategyA || '');
  const priorityB = PRIORITY_STRATEGIES.indexOf(strategyB || '');

  // If both have priority, sort by priority index
  if (priorityA !== -1 && priorityB !== -1) {
    return priorityA - priorityB;
  }
  // If only one has priority, it should come first
  if (priorityA !== -1) {
    return -1;
  }
  if (priorityB !== -1) {
    return 1;
  }
  // If neither has priority, maintain original order
  return 0;
}

function getPromptDisplayString(prompt: string): string {
  try {
    const parsedPrompt = JSON.parse(prompt);
    if (Array.isArray(parsedPrompt)) {
      const lastPrompt = parsedPrompt[parsedPrompt.length - 1];
      if (lastPrompt.content) {
        return lastPrompt.content || '-';
      }
    }
  } catch {
    // Ignore error
  }
  return prompt;
}

function getOutputDisplay(output: string | object): string {
  if (typeof output === 'string') {
    return output;
  }
  if (Array.isArray(output)) {
    const items = output.filter((item) => item.type === 'function');
    if (items.length > 0) {
      return items
        .map((item) => `Used tool ${item.function?.name}: (${item.function?.arguments})`)
        .join('\n');
    }
  }
  return JSON.stringify(output);
}

interface RedteamHistoryEntry {
  prompt?: string;
  promptAudio?: { data?: string; format?: string };
  promptImage?: { data?: string; format?: string };
  output?: string;
  outputAudio?: { data?: string; format?: string };
  outputImage?: { data?: string; format?: string };
}

function buildChatMessages(test: TestWithMetadata): Message[] {
  const metadata = test.result?.metadata;
  const redteamHistoryRaw = (metadata?.redteamHistory || metadata?.redteamTreeHistory || []) as
    | RedteamHistoryEntry[]
    | unknown[];

  const historyMessages = (Array.isArray(redteamHistoryRaw) ? redteamHistoryRaw : [])
    .filter((entry): entry is RedteamHistoryEntry => {
      const e = entry as RedteamHistoryEntry;
      return Boolean(e?.prompt && e?.output);
    })
    .flatMap((entry: RedteamHistoryEntry): Message[] => [
      {
        role: 'user' as const,
        content: entry.prompt!,
        audio: entry.promptAudio,
        image: entry.promptImage,
      },
      {
        role: 'assistant' as const,
        content: entry.output!,
        audio: entry.outputAudio,
        image: entry.outputImage,
      },
    ]);

  if (historyMessages.length > 0) {
    return historyMessages;
  }

  // Fallback to last turn
  return [
    { role: 'user' as const, content: getPromptDisplayString(test.prompt) },
    { role: 'assistant' as const, content: getOutputDisplay(test.output) },
  ];
}

const RiskCategoryDrawer = ({
  open,
  onClose,
  category,
  failures,
  passes,
  evalId,
  numPassed,
  numFailed,
}: RiskCategoryDrawerProps) => {
  // Validate category BEFORE any hooks to comply with Rules of Hooks
  const categoryName = categoryAliases[category as keyof typeof categoryAliases];
  if (!categoryName) {
    console.error('[RiskCategoryDrawer] Could not load category', category);
    return null;
  }

  // All hooks must be called unconditionally after early returns
  const navigate = useNavigate();
  const [suggestionsDialogOpen, setSuggestionsDialogOpen] = React.useState(false);
  const [currentGradingResult, setCurrentGradingResult] = React.useState<GradingResult | undefined>(
    undefined,
  );
  const [activeTab, setActiveTab] = React.useState(0);
  const [detailsDialogOpen, setDetailsDialogOpen] = React.useState(false);
  const [selectedTest, setSelectedTest] = React.useState<TestWithMetadata | null>(null);

  const sortedFailures = React.useMemo(() => {
    return [...failures].sort(sortByPriorityStrategies);
  }, [failures]);

  const displayName =
    displayNameOverrides[category as keyof typeof displayNameOverrides] || categoryName;

  const totalTests = numPassed + numFailed;
  const passPercentage = totalTests > 0 ? Math.round((numPassed / totalTests) * 100) : 0;

  if (totalTests === 0) {
    return (
      <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <SheetContent
          side="right"
          className="w-[500px] overflow-y-auto sm:max-w-[500px]"
          aria-describedby={undefined}
        >
          <SheetTitle className="sr-only">{displayName}</SheetTitle>
          <div className="risk-category-drawer">
            <h2 className="mb-4 text-lg font-semibold">{displayName}</h2>
            <p className="mt-4 text-center">No tests have been run for this category.</p>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // Helper to render a test item (used for both failures and passes)
  const renderTestItem = (test: TestWithMetadata, index: number, isFailed: boolean) => {
    const strategyId = getStrategyIdFromTest(test);
    const hasSuggestions = test.gradingResult?.componentResults?.some(
      (result) => (result.suggestions?.length || 0) > 0,
    );
    const chatMessages = buildChatMessages(test);
    const maxTurns = Math.ceil(chatMessages.length / 2);
    const strategyLabel = strategyId
      ? displayNameOverrides[strategyId as keyof typeof displayNameOverrides] || strategyId
      : undefined;

    return (
      <Collapsible key={index} defaultOpen={index === 0}>
        <div className="group rounded-lg border border-border bg-card overflow-hidden transition-colors hover:border-primary/30 hover:shadow-sm">
          {/* Header */}
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full flex-col gap-1 p-3 text-left cursor-pointer hover:bg-muted/50"
            >
              <div className="flex w-full items-center gap-3">
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform [[data-state=closed]_&]:-rotate-90" />
                <span className="text-sm font-medium text-muted-foreground">#{index + 1}</span>
                {strategyLabel && (
                  <Badge variant="secondary" className="text-xs">
                    {strategyLabel}
                  </Badge>
                )}
                {maxTurns > 1 && (
                  <span className="text-xs text-muted-foreground">{maxTurns} turns</span>
                )}
                <div className="flex-1" />
                <div className="flex items-center gap-2 shrink-0">
                  {hasSuggestions && (
                    <button
                      className="rounded-md p-1 hover:bg-muted"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentGradingResult(test.gradingResult);
                        setSuggestionsDialogOpen(true);
                      }}
                    >
                      <Lightbulb className="size-3.5 text-primary" />
                    </button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedTest(test);
                      setDetailsDialogOpen(true);
                    }}
                  >
                    Details
                  </Button>
                </div>
              </div>
              {isFailed && test.gradingResult?.reason && (
                <div className="ml-7">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
                    Failure Reason
                  </div>
                  <p className="text-xs text-red-600 dark:text-red-400">
                    {test.gradingResult.reason}
                  </p>
                </div>
              )}
            </button>
          </CollapsibleTrigger>

          {/* Collapsible content */}
          <CollapsibleContent>
            {/* Chat conversation */}
            <ChatMessages
              messages={chatMessages}
              displayTurnCount={maxTurns > 1}
              maxTurns={maxTurns}
            />
          </CollapsibleContent>
        </div>
      </Collapsible>
    );
  };

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent
        side="right"
        className="w-[750px] overflow-y-auto sm:max-w-[750px]"
        aria-describedby={undefined}
      >
        <SheetTitle className="sr-only">{displayName}</SheetTitle>
        <div className="risk-category-drawer p-2">
          <h2 className="mb-4 text-lg font-semibold">{displayName}</h2>

          {/* Stats row */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex-1 text-center">
              <p className="text-3xl font-bold text-primary">{numPassed}</p>
              <p className="text-sm text-muted-foreground">Passed</p>
            </div>
            <div className="flex-1 text-center">
              <p className="text-3xl font-bold">{totalTests}</p>
              <p className="text-sm text-muted-foreground">Total</p>
            </div>
            <div className="flex-1 text-center">
              <p className={cn('text-3xl font-bold', getPassRateStyles(passPercentage / 100).text)}>
                {passPercentage}%
              </p>
              <p className="text-sm text-muted-foreground">Pass Rate</p>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={(event) => {
              const firstFailure = failures.length > 0 ? failures[0] : null;
              const firstPass = passes.length > 0 ? passes[0] : null;
              const testWithPluginId = firstFailure || firstPass;
              const pluginId = testWithPluginId?.result?.metadata?.pluginId;

              const filterParam = encodeURIComponent(
                JSON.stringify([
                  {
                    type: 'plugin',
                    operator: 'equals',
                    value: pluginId,
                  },
                ]),
              );

              const url = pluginId ? `/eval/${evalId}?filter=${filterParam}` : `/eval/${evalId}`;
              if (event.ctrlKey || event.metaKey) {
                window.open(url, '_blank');
              } else {
                navigate(url);
              }
            }}
          >
            View All Logs
          </Button>

          <Tabs
            defaultValue="flagged"
            value={activeTab === 0 ? 'flagged' : activeTab === 1 ? 'passed' : 'flow'}
            onValueChange={(value) =>
              setActiveTab(value === 'flagged' ? 0 : value === 'passed' ? 1 : 2)
            }
            className="mt-4"
          >
            <TabsList className="w-full">
              <TabsTrigger value="flagged" className="flex-1">
                Failed Tests ({failures.length})
              </TabsTrigger>
              <TabsTrigger value="passed" className="flex-1">
                Passed Tests ({passes.length})
              </TabsTrigger>
              <TabsTrigger value="flow" className="flex-1">
                Flow Diagram
              </TabsTrigger>
            </TabsList>

            <TabsContent value="flagged">
              {failures.length > 0 ? (
                <div className="mt-3 space-y-3">
                  {sortedFailures.map((failure, i) => renderTestItem(failure, i, true))}
                </div>
              ) : (
                <p className="mt-4 text-center text-muted-foreground">No failed tests</p>
              )}
            </TabsContent>

            <TabsContent value="passed">
              {passes.length > 0 ? (
                <div className="mt-3 space-y-3">
                  {passes.map((pass, i) => renderTestItem(pass, i, false))}
                </div>
              ) : (
                <p className="mt-4 text-center text-muted-foreground">No passed tests</p>
              )}
            </TabsContent>

            <TabsContent value="flow">
              <div className="mt-4">
                <h3 className="mb-3 text-center text-lg font-semibold">
                  Simulated User - Attack Performance
                </h3>
                <PluginStrategyFlow failuresByPlugin={failures} passesByPlugin={passes} />
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <SuggestionsDialog
          open={suggestionsDialogOpen}
          onClose={() => setSuggestionsDialogOpen(false)}
          gradingResult={currentGradingResult}
        />
        <EvalOutputPromptDialog
          open={detailsDialogOpen}
          onClose={() => setDetailsDialogOpen(false)}
          prompt={selectedTest?.result?.prompt.raw || 'Unknown'}
          output={
            typeof selectedTest?.result?.response?.output === 'object'
              ? JSON.stringify(selectedTest?.result?.response?.output)
              : selectedTest?.result?.response?.output
          }
          gradingResults={selectedTest?.gradingResult ? [selectedTest.gradingResult] : undefined}
          metadata={selectedTest?.result?.metadata}
          providerPrompt={getActualPrompt(selectedTest?.result?.response, { formatted: true })}
        />
      </SheetContent>
    </Sheet>
  );
};

export default RiskCategoryDrawer;
