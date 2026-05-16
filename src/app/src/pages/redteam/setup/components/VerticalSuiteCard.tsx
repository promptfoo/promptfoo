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

function getSuiteCardClassName(
  isLocked: boolean,
  allSelected: boolean,
  someSelected: boolean,
): string {
  return cn(
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
  );
}

function getSuiteHeaderClassName(isLocked: boolean, expanded: boolean): string {
  return cn(
    'p-6',
    isLocked ? 'bg-amber-500/[0.04]' : 'bg-primary/[0.02]',
    expanded && 'border-b border-border',
  );
}

function SeveritySummary({ severityCounts }: { severityCounts: Record<Severity, number> }) {
  const entries = [
    {
      severity: Severity.Critical,
      label: 'Critical',
      dot: 'bg-red-500',
      tooltip: 'Critical severity',
    },
    { severity: Severity.High, label: 'High', dot: 'bg-amber-500', tooltip: 'High severity' },
    { severity: Severity.Medium, label: 'Medium', dot: 'bg-blue-500', tooltip: 'Medium severity' },
    { severity: Severity.Low, label: 'Low', dot: 'bg-green-500', tooltip: 'Low severity' },
    {
      severity: Severity.Informational,
      label: 'Info',
      dot: 'bg-blue-400',
      tooltip: 'Informational',
    },
  ] as const;

  return (
    <div className="mb-5 flex gap-5">
      {entries.map(({ severity, label, dot, tooltip }) =>
        severityCounts[severity] > 0 ? (
          <Tooltip key={severity}>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5">
                <div className={cn('size-1.5 rounded-full', dot)} />
                <span className="text-xs font-medium">
                  {severityCounts[severity]} {label}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        ) : null,
      )}
    </div>
  );
}

function SuiteActions({
  isLocked,
  expanded,
  allSelected,
  pluginCount,
  onUpgradeClick,
  onToggleAll,
  onExpandClick,
}: {
  isLocked: boolean;
  expanded: boolean;
  allSelected: boolean;
  pluginCount: number;
  onUpgradeClick: (event: React.MouseEvent) => void;
  onToggleAll: (event: React.MouseEvent) => void;
  onExpandClick: () => void;
}) {
  if (isLocked) {
    return (
      <div className="flex gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={onUpgradeClick}
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
          onClick={onExpandClick}
          className="gap-1 font-medium text-muted-foreground"
        >
          {expanded ? 'Collapse' : 'View Details'}
          <ChevronDown className={cn('size-5 transition-transform', expanded && 'rotate-180')} />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <Button
        variant={allSelected ? 'outline' : 'default'}
        size="sm"
        onClick={onToggleAll}
        className="px-4 font-medium"
      >
        {allSelected ? 'Deselect All' : `Select All ${pluginCount} Tests`}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onExpandClick}
        className="gap-1 font-medium text-muted-foreground"
      >
        {expanded ? 'Collapse' : 'Expand'}
        <ChevronDown className={cn('size-5 transition-transform', expanded && 'rotate-180')} />
      </Button>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: Severity }) {
  return (
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
  );
}

function PluginRow({
  plugin,
  isSelected,
  pluginDisabled,
  isLocked,
  apiHealthStatus,
  generatingTestCase,
  generatingPlugin,
  onPluginToggle,
  onConfigClick,
  onGenerateTestCase,
  isPluginConfigured,
}: {
  plugin: Plugin;
  isSelected: boolean;
  pluginDisabled: boolean;
  isLocked: boolean;
  apiHealthStatus: string;
  generatingTestCase: boolean;
  generatingPlugin: Plugin | null;
  onPluginToggle: (plugin: Plugin) => void;
  onConfigClick: (plugin: Plugin) => void;
  onGenerateTestCase: (plugin: Plugin) => void;
  isPluginConfigured: (plugin: Plugin) => boolean;
}) {
  const requiresConfig = requiresPluginConfig(plugin);
  const hasError = requiresConfig && !isPluginConfigured(plugin);
  const severity = riskCategorySeverityMap[plugin];
  const displayName = displayNameOverrides[plugin] || plugin;
  const generateDisabled =
    pluginDisabled ||
    isLocked ||
    apiHealthStatus !== 'connected' ||
    (generatingTestCase && generatingPlugin === plugin);

  const getGenerateTooltip = () => {
    if (isLocked) {
      return 'This feature requires Promptfoo Enterprise';
    }
    if (pluginDisabled) {
      return 'This plugin requires remote generation';
    }
    if (apiHealthStatus !== 'connected') {
      return 'Promptfoo Cloud connection is required for test generation';
    }
    return `Generate a test case for ${displayName}`;
  };

  return (
    <Card
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
          onClick={(event) => event.stopPropagation()}
          onCheckedChange={() => onPluginToggle(plugin)}
          className={hasError ? 'border-destructive data-[state=checked]:bg-destructive' : ''}
        />
        <TestCaseGenerateButton
          onClick={() => onGenerateTestCase(plugin)}
          disabled={generateDisabled}
          isGenerating={generatingTestCase && generatingPlugin === plugin}
          tooltipTitle={getGenerateTooltip()}
        />
        {isSelected && !isLocked && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Configure ${displayName}`}
                className={cn('size-8', hasError ? 'text-destructive' : 'text-muted-foreground')}
                onClick={(event) => {
                  event.stopPropagation();
                  onConfigClick(plugin);
                }}
              >
                <Settings className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Configure {displayName}</TooltipContent>
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
              {displayName}
            </span>
            {severity && <SeverityBadge severity={severity} />}
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
                aria-label={`View documentation for ${displayName}`}
                className="size-8 text-muted-foreground"
                onClick={(event) => {
                  event.stopPropagation();
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
    <Card className={getSuiteCardClassName(Boolean(isLocked), allSelected, someSelected)}>
      {/* Header */}
      <div className={getSuiteHeaderClassName(Boolean(isLocked), expanded)}>
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

            <SeveritySummary severityCounts={severityCounts} />
            <SuiteActions
              isLocked={Boolean(isLocked)}
              expanded={expanded}
              allSelected={allSelected}
              pluginCount={suite.plugins.length}
              onUpgradeClick={handleUpgradeClick}
              onToggleAll={handleToggleAll}
              onExpandClick={handleExpandClick}
            />
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
                    {group.plugins.map((plugin) => (
                      <PluginRow
                        key={plugin}
                        plugin={plugin}
                        isSelected={selectedPlugins.has(plugin)}
                        pluginDisabled={isPluginDisabled(plugin)}
                        isLocked={Boolean(isLocked)}
                        apiHealthStatus={apiHealthStatus}
                        generatingTestCase={generatingTestCase}
                        generatingPlugin={generatingPlugin}
                        onPluginToggle={onPluginToggle}
                        onConfigClick={onConfigClick}
                        onGenerateTestCase={onGenerateTestCase}
                        isPluginConfigured={isPluginConfigured}
                      />
                    ))}
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
