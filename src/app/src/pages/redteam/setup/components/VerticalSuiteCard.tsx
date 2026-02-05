import React, { useCallback, useMemo, useState } from 'react';

import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { Checkbox } from '@app/components/ui/checkbox';
import { Collapsible, CollapsibleContent } from '@app/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { useApiHealth } from '@app/hooks/useApiHealth';
import { cn } from '@app/lib/utils';
import {
  displayNameOverrides,
  riskCategorySeverityMap,
  Severity,
  subCategoryDescriptions,
} from '@promptfoo/redteam/constants';
import { ChevronDown, HelpCircle, Lock, Settings } from 'lucide-react';
import { requiresPluginConfig } from '../constants';
import {
  getPluginDocumentationUrl,
  hasSpecificPluginDocumentation,
} from './pluginDocumentationMap';
import { TestCaseGenerateButton } from './TestCaseDialog';
import { useTestCaseGeneration } from './TestCaseGenerationProvider';
import type { Plugin } from '@promptfoo/redteam/constants';

interface PluginGroup {
  name: string;
  plugins: Plugin[];
}

export interface VerticalSuite {
  id: string;
  name: string;
  icon: React.ReactElement;
  description: string;
  longDescription: string;
  plugins: Plugin[];
  pluginGroups: PluginGroup[];
  complianceFrameworks?: string[];
  color: string;
  requiresEnterprise?: boolean;
}

interface VerticalSuiteCardProps {
  suite: VerticalSuite;
  selectedPlugins: Set<Plugin>;
  onPluginToggle: (plugin: Plugin) => void;
  setSelectedPlugins: (plugins: Set<Plugin>) => void;
  onConfigClick: (plugin: Plugin) => void;
  onGenerateTestCase: (plugin: Plugin) => void;
  isPluginConfigured: (plugin: Plugin) => boolean;
  isPluginDisabled: (plugin: Plugin) => boolean;
  hasEnterpriseAccess: boolean;
  onUpgradeClick?: () => void;
}

export default function VerticalSuiteCard({
  suite,
  selectedPlugins,
  onPluginToggle,
  setSelectedPlugins,
  onConfigClick,
  onGenerateTestCase,
  isPluginConfigured,
  isPluginDisabled,
  hasEnterpriseAccess,
  onUpgradeClick,
}: VerticalSuiteCardProps) {
  const [expanded, setExpanded] = useState(false);
  const {
    data: { status: apiHealthStatus },
  } = useApiHealth();
  const { isGenerating: generatingTestCase, plugin: generatingPlugin } = useTestCaseGeneration();

  // Check if this suite is locked (requires enterprise but user doesn't have access)
  const isLocked = suite.requiresEnterprise && !hasEnterpriseAccess;

  // Calculate stats
  const selectedCount = useMemo(
    () => suite.plugins.filter((p) => selectedPlugins.has(p)).length,
    [suite.plugins, selectedPlugins],
  );

  const allSelected = selectedCount === suite.plugins.length;
  const someSelected = selectedCount > 0 && !allSelected;

  const severityCounts = useMemo(() => {
    const counts: Record<Severity, number> = {
      [Severity.Critical]: 0,
      [Severity.High]: 0,
      [Severity.Medium]: 0,
      [Severity.Low]: 0,
      [Severity.Informational]: 0,
    };
    suite.plugins.forEach((plugin) => {
      const severity = riskCategorySeverityMap[plugin];
      if (severity) {
        counts[severity]++;
      }
    });
    return counts;
  }, [suite.plugins]);

  const handleToggleAll = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isLocked) {
        return;
      }
      // Batch update: toggle all suite plugins in a single state update
      // This prevents infinite render loops caused by calling onPluginToggle in a forEach loop
      const newSelection = new Set(selectedPlugins);
      if (allSelected) {
        // Remove all suite plugins from selection
        suite.plugins.forEach((plugin) => newSelection.delete(plugin));
      } else {
        // Add all suite plugins to selection
        suite.plugins.forEach((plugin) => newSelection.add(plugin));
      }
      setSelectedPlugins(newSelection);
    },
    [suite.plugins, allSelected, selectedPlugins, setSelectedPlugins, isLocked],
  );

  const handleExpandClick = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const handleUpgradeClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onUpgradeClick) {
        onUpgradeClick();
      } else {
        window.open('https://www.promptfoo.dev/pricing/', '_blank');
      }
    },
    [onUpgradeClick],
  );

  return (
    <Card
      className={cn(
        'overflow-hidden rounded-lg border-2 transition-all',
        isLocked
          ? 'border-amber-500/30 hover:border-amber-500/50'
          : allSelected
            ? 'border-primary hover:border-primary'
            : someSelected
              ? 'border-primary/30 hover:border-primary/50'
              : 'border-border hover:border-primary/20',
        isLocked ? 'bg-gradient-to-br from-amber-500/[0.03] to-transparent' : 'bg-background',
        isLocked
          ? 'hover:shadow-amber-500/15'
          : allSelected
            ? 'hover:shadow-primary/15'
            : 'hover:shadow-sm',
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'p-6',
          isLocked ? 'bg-amber-500/[0.04]' : 'bg-primary/[0.02]',
          expanded && 'border-b border-border',
        )}
      >
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className="mt-0.5 flex items-center justify-center text-3xl text-primary opacity-85">
            {suite.icon}
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-center gap-2">
              <h3 className="text-lg font-semibold">{suite.name}</h3>
              {isLocked && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge className="h-6 gap-1 bg-gradient-to-r from-amber-500 to-amber-600 text-[0.65rem] font-bold tracking-wider text-white shadow-md">
                      <Lock className="size-3" />
                      ENTERPRISE
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    This feature is only available in Promptfoo Enterprise
                  </TooltipContent>
                </Tooltip>
              )}
              <Badge
                variant="outline"
                className="h-5 border-primary/10 bg-primary/[0.08] text-[0.7rem] font-semibold text-muted-foreground"
              >
                {suite.plugins.length} tests
              </Badge>
            </div>

            <p className="mb-4 leading-relaxed text-sm text-muted-foreground">
              {suite.description}
            </p>

            {/* Compliance frameworks */}
            {suite.complianceFrameworks && suite.complianceFrameworks.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-1.5">
                {suite.complianceFrameworks.map((framework) => (
                  <Badge
                    key={framework}
                    variant="outline"
                    className="h-5.5 border-border bg-background text-[0.7rem] font-medium text-muted-foreground"
                  >
                    {framework}
                  </Badge>
                ))}
              </div>
            )}

            {/* Severity distribution */}
            <div className="mb-5 flex gap-5">
              {severityCounts[Severity.Critical] > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5">
                      <div className="size-1.5 rounded-full bg-red-500" />
                      <span className="text-xs font-medium">
                        {severityCounts[Severity.Critical]} Critical
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Critical severity</TooltipContent>
                </Tooltip>
              )}
              {severityCounts[Severity.High] > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5">
                      <div className="size-1.5 rounded-full bg-amber-500" />
                      <span className="text-xs font-medium">
                        {severityCounts[Severity.High]} High
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>High severity</TooltipContent>
                </Tooltip>
              )}
              {severityCounts[Severity.Medium] > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5">
                      <div className="size-1.5 rounded-full bg-blue-500" />
                      <span className="text-xs font-medium">
                        {severityCounts[Severity.Medium]} Medium
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Medium severity</TooltipContent>
                </Tooltip>
              )}
              {severityCounts[Severity.Low] > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5">
                      <div className="size-1.5 rounded-full bg-green-500" />
                      <span className="text-xs font-medium">
                        {severityCounts[Severity.Low]} Low
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Low severity</TooltipContent>
                </Tooltip>
              )}
              {severityCounts[Severity.Informational] > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5">
                      <div className="size-1.5 rounded-full bg-blue-400" />
                      <span className="text-xs font-medium">
                        {severityCounts[Severity.Informational]} Info
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Informational</TooltipContent>
                </Tooltip>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              {isLocked ? (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={handleUpgradeClick}
                        className="gap-2 bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2 font-semibold text-white shadow-md hover:from-amber-600 hover:to-amber-700 hover:shadow-lg"
                      >
                        <Lock className="size-4" />
                        Upgrade to Enterprise
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>View pricing and features</TooltipContent>
                  </Tooltip>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleExpandClick}
                    className="gap-1 font-medium text-muted-foreground"
                  >
                    {expanded ? 'Collapse' : 'View Details'}
                    <ChevronDown
                      className={cn('size-5 transition-transform', expanded && 'rotate-180')}
                    />
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant={allSelected ? 'outline' : 'default'}
                    size="sm"
                    onClick={handleToggleAll}
                    className="px-4 font-medium"
                  >
                    {allSelected ? 'Deselect All' : `Select All ${suite.plugins.length} Tests`}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleExpandClick}
                    className="gap-1 font-medium text-muted-foreground"
                  >
                    {expanded ? 'Collapse' : 'Expand'}
                    <ChevronDown
                      className={cn('size-5 transition-transform', expanded && 'rotate-180')}
                    />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Expanded content */}
      <Collapsible open={expanded}>
        <CollapsibleContent>
          <div className="bg-background p-6">
            <p className="mb-6 leading-relaxed text-sm text-muted-foreground">
              {suite.longDescription}
            </p>

            <div className="space-y-6">
              {suite.pluginGroups.map((group) => (
                <div key={group.name}>
                  <h4 className="mb-3 text-[0.8125rem] font-semibold tracking-[0.01em] text-foreground">
                    {group.name}
                  </h4>
                  <div className="space-y-2">
                    {group.plugins.map((plugin) => {
                      const isSelected = selectedPlugins.has(plugin);
                      const pluginDisabled = isPluginDisabled(plugin);
                      const requiresConfig = requiresPluginConfig(plugin);
                      const hasError = requiresConfig && !isPluginConfigured(plugin);
                      const severity = riskCategorySeverityMap[plugin];

                      return (
                        <Card
                          key={plugin}
                          onClick={() => {
                            if (!pluginDisabled && !isLocked) {
                              onPluginToggle(plugin);
                            }
                          }}
                          className={cn(
                            'cursor-pointer border p-3 transition-all',
                            pluginDisabled || isLocked ? 'cursor-not-allowed' : 'hover:bg-muted/30',
                            pluginDisabled && 'opacity-50',
                            isLocked && 'opacity-85',
                            isSelected
                              ? hasError
                                ? 'border-destructive bg-destructive/[0.04] hover:bg-destructive/[0.06]'
                                : 'border-primary bg-primary/[0.04] hover:bg-primary/[0.06]'
                              : 'border-border',
                            isLocked && 'hover:border-amber-500/20 hover:bg-amber-500/[0.04]',
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={isSelected}
                              disabled={pluginDisabled || isLocked}
                              onClick={(e) => e.stopPropagation()}
                              onCheckedChange={() => onPluginToggle(plugin)}
                              className={
                                hasError
                                  ? 'border-destructive data-[state=checked]:bg-destructive'
                                  : ''
                              }
                            />

                            <TestCaseGenerateButton
                              onClick={() => onGenerateTestCase(plugin)}
                              disabled={
                                pluginDisabled ||
                                isLocked ||
                                apiHealthStatus !== 'connected' ||
                                (generatingTestCase && generatingPlugin === plugin)
                              }
                              isGenerating={generatingTestCase && generatingPlugin === plugin}
                              tooltipTitle={
                                isLocked
                                  ? 'This feature requires Promptfoo Enterprise'
                                  : pluginDisabled
                                    ? 'This plugin requires remote generation'
                                    : apiHealthStatus === 'connected'
                                      ? `Generate a test case for ${displayNameOverrides[plugin] || plugin}`
                                      : 'Promptfoo Cloud connection is required for test generation'
                              }
                            />

                            {isSelected && !isLocked && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className={cn(
                                      'size-8',
                                      requiresConfig && !isPluginConfigured(plugin)
                                        ? 'text-destructive'
                                        : 'text-muted-foreground',
                                    )}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onConfigClick(plugin);
                                    }}
                                  >
                                    <Settings className="size-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Configure {displayNameOverrides[plugin] || plugin}
                                </TooltipContent>
                              </Tooltip>
                            )}

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span
                                  className={cn(
                                    'text-sm font-medium',
                                    hasError ? 'text-destructive' : 'text-foreground',
                                  )}
                                >
                                  {displayNameOverrides[plugin] || plugin}
                                </span>
                                {severity && (
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      'h-4.5 text-[0.65rem] font-semibold capitalize',
                                      severity === Severity.Critical &&
                                        'border-red-200 bg-red-500/10 text-red-600 dark:border-red-800 dark:text-red-400',
                                      severity === Severity.High &&
                                        'border-amber-200 bg-amber-500/10 text-amber-600 dark:border-amber-800 dark:text-amber-400',
                                      severity === Severity.Medium &&
                                        'border-blue-200 bg-blue-500/10 text-blue-600 dark:border-blue-800 dark:text-blue-400',
                                      severity === Severity.Low &&
                                        'border-green-200 bg-green-500/10 text-green-600 dark:border-green-800 dark:text-green-400',
                                      severity === Severity.Informational &&
                                        'border-sky-200 bg-sky-500/10 text-sky-600 dark:border-sky-800 dark:text-sky-400',
                                    )}
                                  >
                                    {severity}
                                  </Badge>
                                )}
                              </div>
                              {subCategoryDescriptions[plugin] && (
                                <p className="mt-1 text-xs leading-snug text-muted-foreground">
                                  {subCategoryDescriptions[plugin]}
                                </p>
                              )}
                            </div>

                            {hasSpecificPluginDocumentation(plugin) && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8 text-muted-foreground"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      window.open(getPluginDocumentationUrl(plugin), '_blank');
                                    }}
                                  >
                                    <HelpCircle className="size-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>View documentation</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
