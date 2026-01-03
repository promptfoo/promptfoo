import React from 'react';

import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@app/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@app/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import {
  categoryAliases,
  displayNameOverrides,
  type Strategy,
  strategyDescriptions,
} from '@promptfoo/redteam/constants';
import { Lightbulb } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import EvalOutputPromptDialog from '../../../eval/components/EvalOutputPromptDialog';
import PluginStrategyFlow from './PluginStrategyFlow';
import SuggestionsDialog from './SuggestionsDialog';
import { getStrategyIdFromTest } from './shared';
import type { EvaluateResult, GradingResult } from '@promptfoo/types';

interface RiskCategoryDrawerProps {
  open: boolean;
  onClose: () => void;
  category: string;
  failures: {
    prompt: string;
    output: string;
    gradingResult?: GradingResult;
    result?: EvaluateResult;
  }[];
  passes: {
    prompt: string;
    output: string;
    gradingResult?: GradingResult;
    result?: EvaluateResult;
  }[];
  evalId: string;
  numPassed: number;
  numFailed: number;
}

const PRIORITY_STRATEGIES = ['jailbreak:composite', 'pliny', 'prompt-injections'];

// Sort function for prioritizing specific strategies
function sortByPriorityStrategies(
  a: { gradingResult?: GradingResult; metadata?: Record<string, any> },
  b: { gradingResult?: GradingResult; metadata?: Record<string, any> },
): number {
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

function getOutputDisplay(output: string | object) {
  if (typeof output === 'string') {
    return output;
  }
  if (Array.isArray(output)) {
    const items = output.filter((item) => item.type === 'function');
    if (items.length > 0) {
      return (
        <>
          {items.map((item) => (
            <div key={item.id}>
              <strong>Used tool {item.function?.name}</strong>: ({item.function?.arguments})
            </div>
          ))}
        </>
      );
    }
  }
  return JSON.stringify(output);
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
  const [selectedTest, setSelectedTest] = React.useState<{
    prompt: string;
    output: string;
    gradingResult?: GradingResult;
    result?: EvaluateResult;
  } | null>(null);

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
  const renderTestItem = (
    test: {
      prompt: string;
      output: string;
      gradingResult?: GradingResult;
      result?: EvaluateResult;
    },
    index: number,
  ) => {
    const strategyId = getStrategyIdFromTest(test);
    const hasSuggestions = test.gradingResult?.componentResults?.some(
      (result) => (result.suggestions?.length || 0) > 0,
    );

    return (
      <div
        key={index}
        className="failure-item group relative cursor-pointer border-b border-border py-3 transition-colors hover:bg-muted/50"
        onClick={() => {
          setSelectedTest(test);
          setDetailsDialogOpen(true);
        }}
      >
        <div className="flex w-full items-start">
          <div className="min-w-0 flex-1">
            <p className="prompt text-sm font-medium">{getPromptDisplayString(test.prompt)}</p>
            <p className="output mt-1 text-sm text-muted-foreground">
              {getOutputDisplay(test.output)}
            </p>
            {test.gradingResult && strategyId && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="mt-2 inline-block">
                    <Badge variant="secondary">
                      {displayNameOverrides[strategyId as keyof typeof displayNameOverrides] ||
                        strategyId}
                    </Badge>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {strategyDescriptions[strategyId as Strategy] || ''}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          {hasSuggestions && (
            <button
              className="ml-2 rounded-md p-1.5 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                setCurrentGradingResult(test.gradingResult);
                setSuggestionsDialogOpen(true);
              }}
            >
              <Lightbulb className="size-4 text-primary" />
            </button>
          )}
        </div>
      </div>
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
              <p
                className={cn(
                  'text-3xl font-bold',
                  passPercentage >= 70
                    ? 'text-emerald-600 dark:text-emerald-500'
                    : 'text-destructive',
                )}
              >
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
                Flagged Tests ({failures.length})
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
                <div className="mt-2">
                  {sortedFailures.map((failure, i) => renderTestItem(failure, i))}
                </div>
              ) : (
                <p className="mt-4 text-center text-muted-foreground">No failed tests</p>
              )}
            </TabsContent>

            <TabsContent value="passed">
              {passes.length > 0 ? (
                <div className="mt-2">{passes.map((pass, i) => renderTestItem(pass, i))}</div>
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
        />
      </SheetContent>
    </Sheet>
  );
};

export default RiskCategoryDrawer;
