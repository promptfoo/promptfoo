import { useEffect, useMemo, useRef, useState } from 'react';

import { Badge } from '@app/components/ui/badge';
import { Card, CardContent } from '@app/components/ui/card';
import { Sheet, SheetContent, SheetTitle } from '@app/components/ui/sheet';
import { Spinner } from '@app/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@app/components/ui/tabs';
import { useCustomPoliciesMap } from '@app/hooks/useCustomPoliciesMap';
import { cn } from '@app/lib/utils';
import { formatASRForDisplay } from '@app/utils/redteam';
import { displayNameOverrides, subCategoryDescriptions } from '@promptfoo/redteam/constants';
import { calculateAttackSuccessRate } from '@promptfoo/redteam/metrics';
import { type RedteamPluginObject } from '@promptfoo/redteam/types';
import { compareByASRDescending } from '../utils/utils';
import { type CategoryStats, type TestResultStats } from './FrameworkComplianceUtils';
import { getPluginIdFromResult, getStrategyIdFromTest, type TestWithMetadata } from './shared';

/**
 * Gets the progress bar color based on ASR percentage.
 * All colors are red-toned since attacks succeeding is always bad.
 */
const getProgressBarColor = (asr: number): string => {
  if (asr >= 75) {
    return 'bg-red-700';
  }
  if (asr >= 50) {
    return 'bg-red-600';
  }
  if (asr >= 25) {
    return 'bg-red-500';
  }
  return 'bg-red-400';
};

const DrawerContent = ({
  selectedStrategy,
  tabValue,
  onTabChange,
  succeededAttacksByPlugin,
  failedAttacksByPlugin,
  selectedStrategyStats,
  plugins,
}: {
  selectedStrategy: string;
  tabValue: string;
  onTabChange: (value: string) => void;
  succeededAttacksByPlugin: Record<string, TestWithMetadata[]>;
  failedAttacksByPlugin: Record<string, TestWithMetadata[]>;
  selectedStrategyStats: TestResultStats;
  plugins: RedteamPluginObject[];
}) => {
  const customPoliciesById = useCustomPoliciesMap(plugins);

  const pluginStats = useMemo(() => {
    const pluginStats: Record<string, { successfulAttacks: number; total: number }> = {};

    Object.entries(failedAttacksByPlugin).forEach(([plugin, tests]) => {
      tests.forEach((test) => {
        const testStrategy = getStrategyIdFromTest(test);
        if (testStrategy === selectedStrategy) {
          if (!pluginStats[plugin]) {
            pluginStats[plugin] = { successfulAttacks: 0, total: 0 };
          }
          pluginStats[plugin].total++;
        }
      });
    });

    Object.entries(succeededAttacksByPlugin).forEach(([plugin, tests]) => {
      tests.forEach((test) => {
        const testStrategy = getStrategyIdFromTest(test);
        if (testStrategy === selectedStrategy) {
          if (!pluginStats[plugin]) {
            pluginStats[plugin] = { successfulAttacks: 0, total: 0 };
          }
          pluginStats[plugin].successfulAttacks++;
          pluginStats[plugin].total++;
        }
      });
    });

    return Object.entries(pluginStats)
      .map(([plugin, stats]) => ({
        plugin,
        ...stats,
        asr: calculateAttackSuccessRate(stats.total, stats.successfulAttacks),
      }))
      .sort(compareByASRDescending);
  }, [succeededAttacksByPlugin, failedAttacksByPlugin, selectedStrategy]);

  const examplesByStrategy = useMemo(() => {
    const failures: (typeof succeededAttacksByPlugin)[string] = [];
    const passes: (typeof failedAttacksByPlugin)[string] = [];

    Object.values(succeededAttacksByPlugin).forEach((tests) => {
      tests.forEach((test) => {
        const testStrategy = getStrategyIdFromTest(test);
        if (testStrategy === selectedStrategy) {
          failures.push(test);
        }
      });
    });

    Object.values(failedAttacksByPlugin).forEach((tests) => {
      tests.forEach((test) => {
        const testStrategy = getStrategyIdFromTest(test);
        if (testStrategy === selectedStrategy) {
          passes.push(test);
        }
      });
    });

    return { failures, passes };
  }, [succeededAttacksByPlugin, failedAttacksByPlugin, selectedStrategy]);

  const getPromptDisplayString = (prompt: string): string => {
    try {
      const parsedPrompt = JSON.parse(prompt);
      if (Array.isArray(parsedPrompt)) {
        const lastPrompt = parsedPrompt[parsedPrompt.length - 1];
        if (lastPrompt?.content) {
          return lastPrompt.content || '-';
        }
      }
    } catch {
      console.debug('Failed to parse prompt as JSON, using raw string');
    }
    return prompt;
  };

  const getOutputDisplay = (output: string | object) => {
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
  };

  const renderTestItem = (test: TestWithMetadata, idx: number, _type: 'flagged' | 'successful') => (
    <div
      key={`${test.prompt}-${test.result}-${idx}`}
      className="mb-4 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex flex-col gap-4">
        {/* Prompt */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-muted-foreground">Prompt:</span>
            {test.result && (
              <Badge variant="secondary" className="ml-2">
                {displayNameOverrides[
                  getPluginIdFromResult(test.result) as keyof typeof displayNameOverrides
                ] || 'Unknown Plugin'}
              </Badge>
            )}
          </div>
          <div className="rounded border border-border bg-muted/50 p-3 font-mono text-sm whitespace-pre-wrap break-words">
            {getPromptDisplayString(test.prompt)}
          </div>
        </div>

        {/* Response */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-muted-foreground">Response:</span>
          </div>
          <div className="rounded border border-border bg-muted/50 p-3 font-mono text-sm whitespace-pre-wrap break-words">
            {getOutputDisplay(test.output)}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-6">
      <h2 className="mb-2 text-xl font-semibold">
        {displayNameOverrides[selectedStrategy as keyof typeof displayNameOverrides] ||
          selectedStrategy}
      </h2>
      <p className="mb-6 text-sm text-muted-foreground">
        {subCategoryDescriptions[selectedStrategy as keyof typeof subCategoryDescriptions] || ''}
      </p>

      {/* Stats Grid */}
      <div className="mb-6 rounded-lg border border-border bg-muted/30 p-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">{selectedStrategyStats.total}</p>
            <p className="text-sm text-muted-foreground">Total Attempts</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-destructive">{selectedStrategyStats.pass}</p>
            <p className="text-sm text-muted-foreground">Flagged Attempts</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">
              {formatASRForDisplay(
                calculateAttackSuccessRate(
                  selectedStrategyStats.total,
                  selectedStrategyStats.failCount,
                ),
              )}
              %
            </p>
            <p className="text-sm text-muted-foreground">Success Rate</p>
          </div>
        </div>
      </div>

      {/* Plugin Performance Table */}
      <h3 className="mb-3 text-lg font-semibold">Attack Performance by Plugin</h3>
      <div className="mb-6 overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Plugin</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                Attack Success Rate
              </th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                # Flagged Attempts
              </th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground"># Attempts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pluginStats.map((stat) => {
              const customPolicy = customPoliciesById[stat.plugin];
              return (
                <tr key={stat.plugin} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">
                    {customPolicy?.name ??
                      (displayNameOverrides[stat.plugin as keyof typeof displayNameOverrides] ||
                        stat.plugin)}
                  </td>
                  <td className="px-4 py-3 text-right">{formatASRForDisplay(stat.asr)}%</td>
                  <td className="px-4 py-3 text-right">{stat.total - stat.successfulAttacks}</td>
                  <td className="px-4 py-3 text-right">{stat.total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Tabs */}
      <Tabs value={tabValue} onValueChange={onTabChange} className="mt-4">
        <TabsList className="w-full">
          <TabsTrigger value="flagged" className="flex-1">
            Flagged Attempts ({selectedStrategyStats.pass})
          </TabsTrigger>
          <TabsTrigger value="successful" className="flex-1">
            Successful Attacks ({selectedStrategyStats.failCount})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="flagged" className="mt-4">
          {examplesByStrategy.passes.length > 0 ? (
            <div>
              {examplesByStrategy.passes
                .slice(0, 5)
                .map((test, idx) => renderTestItem(test, idx, 'flagged'))}
            </div>
          ) : (
            <p className="py-8 text-center text-muted-foreground">No flagged attempts</p>
          )}
        </TabsContent>

        <TabsContent value="successful" className="mt-4">
          {examplesByStrategy.failures.length > 0 ? (
            <div>
              {examplesByStrategy.failures
                .slice(0, 5)
                .map((test, idx) => renderTestItem(test, idx, 'successful'))}
            </div>
          ) : (
            <p className="py-8 text-center text-muted-foreground">No successful attacks</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

/**
 * Separate component for the strategy sheet to handle scroll reset
 */
const StrategySheet = ({
  selectedStrategy,
  isOpen,
  onClose,
  tabValue,
  onTabChange,
  failuresByPlugin,
  passesByPlugin,
  strategyStats,
  plugins,
}: {
  selectedStrategy: string | null;
  isOpen: boolean;
  onClose: () => void;
  tabValue: string;
  onTabChange: (value: string) => void;
  failuresByPlugin: Record<string, TestWithMetadata[]>;
  passesByPlugin: Record<string, TestWithMetadata[]>;
  strategyStats: TestResultStats | null;
  plugins: RedteamPluginObject[];
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Reset scroll position when sheet opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = 0;
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="flex w-[750px] flex-col p-0 sm:max-w-[750px]"
        aria-describedby={undefined}
      >
        <SheetTitle className="sr-only">
          {selectedStrategy
            ? displayNameOverrides[selectedStrategy as keyof typeof displayNameOverrides] ||
              selectedStrategy
            : 'Strategy'}{' '}
          Details
        </SheetTitle>
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
          {selectedStrategy && strategyStats && (
            <DrawerContent
              selectedStrategy={selectedStrategy}
              tabValue={tabValue}
              onTabChange={onTabChange}
              succeededAttacksByPlugin={failuresByPlugin}
              failedAttacksByPlugin={passesByPlugin}
              selectedStrategyStats={strategyStats}
              plugins={plugins}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

const StrategyStats = ({
  strategyStats,
  failuresByPlugin,
  passesByPlugin,
  plugins,
}: {
  strategyStats: CategoryStats;
  failuresByPlugin: Record<string, TestWithMetadata[]>;
  passesByPlugin: Record<string, TestWithMetadata[]>;
  plugins: RedteamPluginObject[];
}) => {
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Sort strategies by ASR (highest first)
   */
  const strategies = Object.entries(strategyStats).sort((a, b) => {
    const asrA = calculateAttackSuccessRate(a[1].total, a[1].failCount);
    const asrB = calculateAttackSuccessRate(b[1].total, b[1].failCount);
    return compareByASRDescending({ asr: asrA }, { asr: asrB });
  });

  const handleStrategyClick = async (strategy: string) => {
    try {
      setIsLoading(true);
      setSelectedStrategy(strategy);
      // ... any async operations
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrawerClose = () => {
    setSelectedStrategy(null);
  };

  const [tabValue, setTabValue] = useState('flagged');

  if (error) {
    return (
      <div className="p-4">
        <p className="text-destructive">Error loading strategy stats: {error.message}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <Card
        role="region"
        aria-label="Attack Methods Statistics"
        className="break-inside-avoid print:break-inside-avoid print:break-after-page"
      >
        <CardContent className="p-6">
          <h2 className="mb-4 text-xl font-semibold">Attack Methods</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
            {strategies.map(([strategy, { total, failCount }]) => {
              const asr = calculateAttackSuccessRate(total, failCount);
              return (
                <div
                  key={strategy}
                  role="button"
                  tabIndex={0}
                  aria-label={`View details for ${strategy} attack method`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      handleStrategyClick(strategy);
                    }
                  }}
                  onClick={() => handleStrategyClick(strategy)}
                  className={cn(
                    'cursor-pointer rounded-lg p-4 transition-all',
                    'hover:bg-muted/50',
                  )}
                >
                  <p className="mb-2 font-semibold">
                    {displayNameOverrides[strategy as keyof typeof displayNameOverrides] ||
                      strategy}
                  </p>
                  <p className="mb-4 min-h-10 text-sm text-muted-foreground">
                    {subCategoryDescriptions[strategy as keyof typeof subCategoryDescriptions] ||
                      ''}
                  </p>
                  {/* Progress bar */}
                  <div className="mb-2 flex items-center">
                    <div className="mr-2 h-2.5 w-full overflow-hidden rounded-full bg-zinc-300 dark:bg-zinc-600">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          getProgressBarColor(asr),
                        )}
                        style={{ width: `${asr}%` }}
                      />
                    </div>
                    <span className="min-w-[45px] text-right text-sm text-muted-foreground">
                      {formatASRForDisplay(asr)}%
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {failCount} / {total} attacks succeeded
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <StrategySheet
        selectedStrategy={selectedStrategy}
        isOpen={!!selectedStrategy}
        onClose={handleDrawerClose}
        tabValue={tabValue}
        onTabChange={(newValue) => setTabValue(newValue)}
        failuresByPlugin={failuresByPlugin}
        passesByPlugin={passesByPlugin}
        strategyStats={selectedStrategy ? strategyStats[selectedStrategy] : null}
        plugins={plugins}
      />
    </>
  );
};

export default StrategyStats;
