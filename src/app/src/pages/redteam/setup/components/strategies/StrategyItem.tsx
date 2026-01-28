import { useCallback, useMemo } from 'react';

import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { Checkbox } from '@app/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import {
  AGENTIC_STRATEGIES_SET,
  CONFIGURABLE_STRATEGIES_SET,
  DEFAULT_STRATEGIES_SET,
  MULTI_MODAL_STRATEGIES_SET,
  type Plugin,
} from '@promptfoo/redteam/constants';
import { type RedteamStrategyObject, type StrategyConfig } from '@promptfoo/redteam/types';
import { Settings } from 'lucide-react';
import { useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import { TestCaseGenerateButton } from './../TestCaseDialog';
import { useTestCaseGeneration } from './../TestCaseGenerationProvider';

import type { StrategyCardData } from './types';

const DEFAULT_TEST_GENERATION_PLUGIN = 'harmful:hate';

// Strategies that do not support test case generation
// These strategies will have the test case generation button disabled in the UI
const STRATEGIES_WITHOUT_TEST_CASE_GENERATION = ['retry', 'other-encodings'] as const;
const STRATEGIES_WITHOUT_TEST_CASE_GENERATION_SET: ReadonlySet<
  (typeof STRATEGIES_WITHOUT_TEST_CASE_GENERATION)[number]
> = new Set(STRATEGIES_WITHOUT_TEST_CASE_GENERATION);

interface StrategyItemProps {
  strategy: StrategyCardData;
  isSelected: boolean;
  onToggle: (id: string) => void;
  onConfigClick: (id: string) => void;
  isDisabled: boolean;
  isRemoteGenerationDisabled: boolean;
  isConfigured?: boolean;
}

export function StrategyItem({
  strategy,
  isSelected,
  onToggle,
  onConfigClick,
  isDisabled,
  isRemoteGenerationDisabled,
  isConfigured = true,
}: StrategyItemProps) {
  const { config } = useRedTeamConfig();

  const {
    generateTestCase,
    isGenerating: generatingTestCase,
    strategy: currentStrategy,
  } = useTestCaseGeneration();

  const strategyConfig = useMemo(() => {
    return (
      (
        config.strategies.find(
          (s) => typeof s === 'object' && 'id' in s && s!.id === strategy.id,
        ) as RedteamStrategyObject
      )?.config ?? {}
    );
  }, [config, strategy.id]) as StrategyConfig;

  // Select a random plugin from the user's configured plugins, or fall back to default
  const testGenerationPlugin = useMemo(() => {
    const plugins =
      config.plugins?.map((p) => (typeof p === 'string' ? p : p.id)).filter(Boolean) ?? [];
    if (plugins.length === 0) {
      return DEFAULT_TEST_GENERATION_PLUGIN;
    }
    const randomIndex = Math.floor(Math.random() * plugins.length);
    return plugins[randomIndex] as Plugin;
  }, [config.plugins]);

  const requiresConfig = isSelected && !isConfigured;

  const hasSettingsButton =
    requiresConfig || (isSelected && CONFIGURABLE_STRATEGIES_SET.has(strategy.id));

  const isTestCaseGenerationDisabled = STRATEGIES_WITHOUT_TEST_CASE_GENERATION_SET.has(
    // biome-ignore lint/suspicious/noExplicitAny: TypeScript cannot narrow Strategy type to subset expected by Set
    strategy.id as any,
  );

  const { tooltipTitle, settingsTooltipTitle } = useMemo(() => {
    if (requiresConfig) {
      const reason =
        strategy.id === 'custom' ? 'Strategy text is required' : 'Configuration is required';
      const configRequiredTooltip = `Configuration required: ${reason}. Click the settings icon to configure.`;

      return {
        tooltipTitle: configRequiredTooltip,
        settingsTooltipTitle: configRequiredTooltip,
      };
    }

    if (isTestCaseGenerationDisabled) {
      return {
        tooltipTitle: `Test case generation is not available for ${strategy.name} strategy.`,
        settingsTooltipTitle: 'Configure strategy settings',
      };
    }

    return {
      tooltipTitle: `Generate an example test case using the ${strategy.name} Strategy.`,
      settingsTooltipTitle: 'Configure strategy settings',
    };
  }, [requiresConfig, strategy.id, strategy.name, isTestCaseGenerationDisabled]);

  const handleTestCaseGeneration = useCallback(async () => {
    await generateTestCase(
      { id: testGenerationPlugin, config: {}, isStatic: true },
      { id: strategy.id, config: strategyConfig, isStatic: false },
    );
  }, [strategyConfig, generateTestCase, strategy.id, testGenerationPlugin]);

  const handleToggle = useCallback(() => {
    onToggle(strategy.id);
  }, [strategy.id, onToggle]);

  return (
    <Card
      onClick={handleToggle}
      className={cn(
        'flex h-full cursor-pointer select-none gap-4 p-2 transition-all',
        isDisabled && 'cursor-not-allowed opacity-50',
        isSelected && !requiresConfig && 'border-primary bg-primary/[0.04] hover:bg-primary/[0.08]',
        isSelected &&
          requiresConfig &&
          'border-destructive bg-destructive/[0.04] hover:bg-destructive/[0.08]',
        !isSelected && !isDisabled && 'hover:bg-muted/50',
      )}
    >
      {/* Checkbox container */}
      <div className="flex items-center">
        <Checkbox
          checked={isSelected}
          disabled={isDisabled}
          onCheckedChange={handleToggle}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {/* Content container */}
      <div className="relative min-w-0 flex-1 py-2">
        {/* Title and badges section - add right padding when settings button is present */}
        <div className={cn('mb-2 flex flex-wrap items-center gap-2', hasSettingsButton && 'pr-10')}>
          <span className="font-medium">{strategy.name}</span>
          <div className="flex flex-wrap gap-1">
            {DEFAULT_STRATEGIES_SET.has(strategy.id) && (
              <Badge variant="secondary">Recommended</Badge>
            )}
            {AGENTIC_STRATEGIES_SET.has(strategy.id) && (
              <Badge className="border border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                Agent
              </Badge>
            )}
            {MULTI_MODAL_STRATEGIES_SET.has(strategy.id) && (
              <Badge className="border border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400">
                Multi-modal
              </Badge>
            )}
            {isDisabled && isRemoteGenerationDisabled && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="rounded border border-destructive/30 bg-destructive/10 px-1 py-0.5 text-[0.7rem] font-medium text-destructive">
                    Remote generation required
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  This strategy requires remote generation. Unset
                  PROMPTFOO_DISABLE_REMOTE_GENERATION or PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION
                  to enable.
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Description section */}
        <p className="text-sm text-muted-foreground">{strategy.description}</p>
      </div>

      {/* Secondary Actions Container */}
      <div className="flex flex-col items-center gap-1">
        <TestCaseGenerateButton
          onClick={handleTestCaseGeneration}
          disabled={
            isDisabled || generatingTestCase || requiresConfig || isTestCaseGenerationDisabled
          }
          isGenerating={generatingTestCase && currentStrategy === strategy.id}
          size="small"
          tooltipTitle={tooltipTitle}
        />

        {/* Settings button */}
        {hasSettingsButton && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'size-8',
                  requiresConfig
                    ? 'text-destructive hover:bg-destructive/10'
                    : 'opacity-60 hover:opacity-100',
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onConfigClick(strategy.id);
                }}
              >
                <Settings className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{settingsTooltipTitle}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </Card>
  );
}
