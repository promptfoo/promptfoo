import { useCallback, useMemo } from 'react';

import { Badge } from '@app/components/ui/badge';
import { Card, CardContent } from '@app/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import {
  ALIASED_PLUGIN_MAPPINGS,
  FRAMEWORK_NAMES,
  OWASP_API_TOP_10_NAMES,
  OWASP_LLM_TOP_10_NAMES,
  riskCategorySeverityMap,
  Severity,
  severityDisplayNames,
} from '@promptfoo/redteam/constants';
import { calculateAttackSuccessRate } from '@promptfoo/redteam/metrics';
import { CheckCircle, Info } from 'lucide-react';
import { compareByASRDescending } from '../utils/utils';
import {
  type CategoryStats,
  categorizePlugins,
  expandPluginCollections,
  FRAMEWORK_DESCRIPTIONS,
} from './FrameworkComplianceUtils';
import FrameworkPluginResult from './FrameworkPluginResult';

// Maps severity to badge variants and styling
const severityBadgeVariants: Record<
  Severity,
  { variant: 'critical' | 'high' | 'medium' | 'low' | 'info'; tooltip: string }
> = {
  [Severity.Critical]: {
    variant: 'critical',
    tooltip: 'Critical: Requires immediate attention - high risk security vulnerabilities',
  },
  [Severity.High]: {
    variant: 'high',
    tooltip: 'High: Serious security issues that should be prioritized',
  },
  [Severity.Medium]: {
    variant: 'medium',
    tooltip: 'Medium: Moderate security concerns that should be addressed',
  },
  [Severity.Low]: {
    variant: 'low',
    tooltip: 'Low: Minor issues with limited security impact',
  },
  [Severity.Informational]: {
    variant: 'info',
    tooltip: 'Informational: Findings for awareness with no direct security impact',
  },
};

interface FrameworkCardProps {
  evalId: string;
  framework: string;
  isCompliant: boolean;
  frameworkSeverity: Severity;
  categoryStats: CategoryStats;
  pluginPassRateThreshold: number;
  nonCompliantPlugins: string[];
  idx: number;
}

const FrameworkCard = ({
  evalId,
  framework,
  isCompliant,
  frameworkSeverity,
  categoryStats,
  pluginPassRateThreshold,
  nonCompliantPlugins,
  idx,
}: FrameworkCardProps) => {
  /**
   * Gets the Attack Success Rate (ASR) for a given plugin.
   * @param plugin - The plugin to get the ASR for.
   * @returns The ASR for the given plugin.
   */
  const getPluginASR = useCallback(
    (plugin: string): { asr: number; total: number; failCount: number } => {
      const stats = categoryStats[plugin];
      return {
        asr: stats ? calculateAttackSuccessRate(stats.total, stats.failCount) : 0,
        total: stats ? stats.total : 0,
        failCount: stats ? stats.failCount : 0,
      };
    },
    [categoryStats],
  );

  /**
   * Given a list of plugins, returns the plugins sorted by ASR (highest first).
   * @param plugins - The list of plugins to sort.
   * @returns The sorted list of plugins.
   */
  const sortPluginsByASR = useCallback(
    (plugins: string[]): string[] => {
      return [...plugins].sort((a, b) => {
        return compareByASRDescending(getPluginASR(a), getPluginASR(b));
      });
    },
    [getPluginASR],
  );

  const sortedPlugins = useMemo(
    () => sortPluginsByASR(nonCompliantPlugins),
    [nonCompliantPlugins, sortPluginsByASR],
  );

  return (
    <Card
      className={cn(
        'framework-item',
        isCompliant ? 'compliant' : 'non-compliant',
        isCompliant ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : 'bg-red-50/50 dark:bg-red-950/20',
        idx !== 0 && 'break-inside-avoid print:break-inside-avoid',
      )}
    >
      <CardContent className="pt-6">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">{FRAMEWORK_NAMES[framework]}</h3>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="size-4 text-muted-foreground opacity-70" />
              </TooltipTrigger>
              <TooltipContent>{FRAMEWORK_DESCRIPTIONS[framework] || ''}</TooltipContent>
            </Tooltip>
          </div>
          <div className="flex items-center">
            {isCompliant ? (
              <CheckCircle className="icon-compliant size-5 text-emerald-600 dark:text-emerald-500" />
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span aria-label={severityBadgeVariants[frameworkSeverity].tooltip}>
                    <Badge
                      variant={severityBadgeVariants[frameworkSeverity].variant}
                      className="font-bold"
                    >
                      {severityDisplayNames[frameworkSeverity]}
                    </Badge>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{severityBadgeVariants[frameworkSeverity].tooltip}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
        {/* Always expanded */}
        <div className="mt-4">
          {(framework === 'owasp:api' || framework === 'owasp:llm') &&
          Object.keys(ALIASED_PLUGIN_MAPPINGS[framework]).length > 0 ? (
            // Show categorized plugins for OWASP frameworks
            <div className="space-y-4">
              {Object.entries(ALIASED_PLUGIN_MAPPINGS[framework]).map(
                ([categoryId, { plugins: categoryPlugins }]) => {
                  const categoryNumber = categoryId.split(':').pop();
                  const categoryName =
                    categoryNumber && framework === 'owasp:llm'
                      ? OWASP_LLM_TOP_10_NAMES[Number.parseInt(categoryNumber) - 1]
                      : categoryNumber && framework === 'owasp:api'
                        ? OWASP_API_TOP_10_NAMES[Number.parseInt(categoryNumber) - 1]
                        : `Category ${categoryNumber}`;

                  // Expand harmful if present
                  const expandedPlugins = expandPluginCollections(categoryPlugins, categoryStats);

                  // Categorize all plugins: tested-compliant, tested-non-compliant, and not-tested
                  const {
                    compliant: compliantCategoryPlugins,
                    nonCompliant: nonCompliantCategoryPlugins,
                    untested: untestedPlugins,
                  } = categorizePlugins(expandedPlugins, categoryStats, pluginPassRateThreshold);

                  // Sort all sets appropriately
                  const sortedNonCompliantItems = sortPluginsByASR(nonCompliantCategoryPlugins);
                  const sortedCompliantItems = sortPluginsByASR(compliantCategoryPlugins);
                  const sortedUntestedItems = [...untestedPlugins].sort((a, b) => {
                    // Sort untested plugins by severity since they have no pass rates
                    const severityA =
                      riskCategorySeverityMap[a as keyof typeof riskCategorySeverityMap] ||
                      Severity.Low;
                    const severityB =
                      riskCategorySeverityMap[b as keyof typeof riskCategorySeverityMap] ||
                      Severity.Low;

                    const severityOrder: Record<Severity, number> = {
                      [Severity.Critical]: 0,
                      [Severity.High]: 1,
                      [Severity.Medium]: 2,
                      [Severity.Low]: 3,
                      [Severity.Informational]: 4,
                    };

                    return severityOrder[severityA] - severityOrder[severityB];
                  });

                  // Get all tested plugins
                  const testedPlugins = [
                    ...compliantCategoryPlugins,
                    ...nonCompliantCategoryPlugins,
                  ];

                  // Are all plugins compliant or are there no tested plugins?
                  const allCompliant =
                    testedPlugins.length > 0 && nonCompliantCategoryPlugins.length === 0;
                  const noTestedPlugins = testedPlugins.length === 0;

                  return (
                    <div key={categoryId} className="overflow-hidden rounded border border-border">
                      <div
                        className={cn(
                          'flex items-center justify-between bg-black/5 p-2 dark:bg-white/5',
                          !(allCompliant || noTestedPlugins) && 'border-b border-border',
                        )}
                      >
                        <span className="text-sm font-medium">
                          {categoryNumber}. {categoryName}
                        </span>
                        {testedPlugins.length === 0 && untestedPlugins.length === 0 ? (
                          <Badge
                            variant={
                              nonCompliantCategoryPlugins.length === 0 ? 'success' : 'secondary'
                            }
                            className="h-5 whitespace-nowrap text-[0.7rem]"
                          >
                            No Plugins
                          </Badge>
                        ) : testedPlugins.length > 0 ? (
                          <Badge
                            variant={
                              nonCompliantCategoryPlugins.length === 0 ? 'success' : 'destructive'
                            }
                            className="h-5 whitespace-nowrap text-[0.7rem]"
                          >
                            {nonCompliantCategoryPlugins.length} / {testedPlugins.length} plugins
                            failed
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="h-5 whitespace-nowrap text-[0.7rem]"
                          >
                            {untestedPlugins.length} Untested
                          </Badge>
                        )}
                      </div>

                      <div>
                        {/* Failed plugins first */}
                        {sortedNonCompliantItems.length > 0 && (
                          <div className="bg-red-50/50 px-2 py-1 dark:bg-red-950/20">
                            <span className="text-xs font-bold text-destructive">Failed:</span>
                          </div>
                        )}
                        {sortedNonCompliantItems.map((plugin, index) => (
                          <FrameworkPluginResult
                            key={`${plugin}-${framework}-${categoryId}-${index}`}
                            evalId={evalId}
                            plugin={plugin}
                            getPluginASR={getPluginASR}
                            type="failed"
                          />
                        ))}

                        {/* Passing plugins */}
                        {sortedCompliantItems.length > 0 && (
                          <div className="mt-2 bg-emerald-50/50 px-2 py-1 dark:bg-emerald-950/20">
                            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-500">
                              Passed:
                            </span>
                          </div>
                        )}
                        {sortedCompliantItems.map((plugin, index) => (
                          <FrameworkPluginResult
                            key={`${plugin}-${framework}-${categoryId}-${index}`}
                            evalId={evalId}
                            plugin={plugin}
                            getPluginASR={getPluginASR}
                            type="passed"
                          />
                        ))}

                        {/* Untested plugins */}
                        {sortedUntestedItems.length > 0 && (
                          <>
                            <div className="mt-2 bg-gray-100/50 px-2 py-1 dark:bg-gray-800/20">
                              <span className="text-xs font-bold text-muted-foreground">
                                Not Tested:
                              </span>
                            </div>
                            {sortedUntestedItems.map((plugin, index) => (
                              <FrameworkPluginResult
                                key={`${plugin}-${framework}-${categoryId}-${index}`}
                                evalId={evalId}
                                plugin={plugin}
                                getPluginASR={getPluginASR}
                                type="untested"
                              />
                            ))}
                          </>
                        )}
                      </div>
                    </div>
                  );
                },
              )}
            </div>
          ) : (
            // Standard list view for other frameworks but with same format
            <div className="overflow-hidden rounded border border-border">
              <div className="flex items-center justify-between border-b border-border bg-black/5 p-2 dark:bg-white/5">
                <span className="text-sm font-medium">Framework Results</span>
                <Badge
                  variant={nonCompliantPlugins.length === 0 ? 'success' : 'destructive'}
                  className="h-5 whitespace-nowrap text-[0.7rem]"
                >
                  {nonCompliantPlugins.length} /{' '}
                  {
                    Object.keys(categoryStats).filter((plugin) => categoryStats[plugin].total > 0)
                      .length
                  }{' '}
                  failed
                </Badge>
              </div>
              <div>
                {/* Failed plugins first */}
                {nonCompliantPlugins.length > 0 && (
                  <div className="bg-red-50/50 px-2 py-1 dark:bg-red-950/20">
                    <span className="text-xs font-bold text-destructive">Failed:</span>
                  </div>
                )}
                {sortedPlugins.map((plugin, index) => (
                  <FrameworkPluginResult
                    key={`${plugin}-${framework}-${index}`}
                    evalId={evalId}
                    plugin={plugin}
                    getPluginASR={getPluginASR}
                    type="failed"
                  />
                ))}

                {/* Passing plugins */}
                {(() => {
                  const compliantPlugins = Object.keys(categoryStats).filter(
                    (plugin) =>
                      categoryStats[plugin].total > 0 &&
                      categoryStats[plugin].pass / categoryStats[plugin].total >=
                        pluginPassRateThreshold,
                  );
                  return compliantPlugins.length > 0 ? (
                    <div className="mt-2 bg-emerald-50/50 px-2 py-1 dark:bg-emerald-950/20">
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-500">
                        Passed:
                      </span>
                    </div>
                  ) : null;
                })()}
                {(() => {
                  const compliantPlugins = Object.keys(categoryStats).filter(
                    (plugin) =>
                      categoryStats[plugin].total > 0 &&
                      categoryStats[plugin].pass / categoryStats[plugin].total >=
                        pluginPassRateThreshold,
                  );
                  return sortPluginsByASR(compliantPlugins);
                })().map((plugin, index) => (
                  <FrameworkPluginResult
                    key={`${plugin}-${framework}-${index}`}
                    evalId={evalId}
                    plugin={plugin}
                    getPluginASR={getPluginASR}
                    type="passed"
                  />
                ))}

                {/* Untested plugins for this framework */}
                {Object.keys(ALIASED_PLUGIN_MAPPINGS[framework] || {})
                  .flatMap((categoryId) => {
                    // Get all plugins from this category
                    const categoryPlugins =
                      ALIASED_PLUGIN_MAPPINGS[framework]?.[categoryId]?.plugins || [];
                    // Expand plugins using the utility function
                    return Array.from(expandPluginCollections(categoryPlugins, categoryStats));
                  })
                  .filter((plugin) => !categoryStats[plugin] || categoryStats[plugin].total === 0)
                  .sort((a, b) => {
                    // Sort by severity first
                    const severityA =
                      riskCategorySeverityMap[a as keyof typeof riskCategorySeverityMap] ||
                      Severity.Low;
                    const severityB =
                      riskCategorySeverityMap[b as keyof typeof riskCategorySeverityMap] ||
                      Severity.Low;

                    const severityOrder: Record<Severity, number> = {
                      [Severity.Critical]: 0,
                      [Severity.High]: 1,
                      [Severity.Medium]: 2,
                      [Severity.Low]: 3,
                      [Severity.Informational]: 4,
                    };

                    return severityOrder[severityA] - severityOrder[severityB];
                  })
                  .map((plugin, index) => (
                    <FrameworkPluginResult
                      key={`${plugin}-${framework}-${index}`}
                      evalId={evalId}
                      plugin={plugin}
                      getPluginASR={getPluginASR}
                      type="untested"
                    />
                  ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default FrameworkCard;
