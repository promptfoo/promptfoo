import { useCallback, useMemo } from 'react';

import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { Checkbox } from '@app/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import { CONFIGURABLE_STRATEGIES_SET, type Plugin } from '@promptfoo/redteam/constants';
import { type RedteamStrategyObject, type StrategyConfig } from '@promptfoo/redteam/types';
import { Settings } from 'lucide-react';
import { useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import { TestCaseGenerateButton } from '../TestCaseDialog';
import { useTestCaseGeneration } from '../TestCaseGenerationProvider';

const DEFAULT_TEST_GENERATION_PLUGIN = 'harmful:hate';

export const HERO_STRATEGY_IDS = ['jailbreak:meta', 'jailbreak:hydra'] as const;
export type HeroStrategyId = (typeof HERO_STRATEGY_IDS)[number];

interface HeroStrategyData {
  id: HeroStrategyId;
  name: string;
  subtitle: string;
  description: string;
}

const HERO_STRATEGIES: HeroStrategyData[] = [
  {
    id: 'jailbreak:meta',
    name: 'Meta Agent',
    subtitle: 'Best for single-turn',
    description:
      'Dynamically builds an attack taxonomy and learns from attack history to optimize bypass attempts.',
  },
  {
    id: 'jailbreak:hydra',
    name: 'Hydra Multi-Turn',
    subtitle: 'Best for multi-turn',
    description:
      'Conversational attacks with meta-learning that adapts strategy based on full conversation history.',
  },
];

interface HeroStrategiesSectionProps {
  selectedIds: string[];
  onToggle: (id: string) => void;
  onConfigClick: (id: string) => void;
  isStrategyDisabled: (id: string) => boolean;
  isRemoteGenerationDisabled: boolean;
  isStrategyConfigured: (id: string) => boolean;
}

interface HeroStrategyCardProps {
  strategy: HeroStrategyData;
  isSelected: boolean;
  onToggle: (id: string) => void;
  onConfigClick: (id: string) => void;
  isDisabled: boolean;
  isRemoteGenerationDisabled: boolean;
  isConfigured: boolean;
}

function HeroStrategyCard({
  strategy,
  isSelected,
  onToggle,
  onConfigClick,
  isDisabled,
  isRemoteGenerationDisabled,
  isConfigured,
}: HeroStrategyCardProps) {
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

  const { tooltipTitle, settingsTooltipTitle } = useMemo(() => {
    if (requiresConfig) {
      const configRequiredTooltip = 'Configuration required. Click the settings icon to configure.';

      return {
        tooltipTitle: configRequiredTooltip,
        settingsTooltipTitle: configRequiredTooltip,
      };
    }

    return {
      tooltipTitle: `Generate an example test case using the ${strategy.name} Strategy.`,
      settingsTooltipTitle: 'Configure strategy settings',
    };
  }, [requiresConfig, strategy.name]);

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
        'relative flex cursor-pointer select-none flex-col gap-3 p-4 transition-all',
        isDisabled && 'cursor-not-allowed opacity-50',
        isSelected &&
          !requiresConfig &&
          'border-primary bg-primary/[0.04] ring-1 ring-primary/20 hover:bg-primary/[0.08]',
        isSelected &&
          requiresConfig &&
          'border-destructive bg-destructive/[0.04] ring-1 ring-destructive/20 hover:bg-destructive/[0.08]',
        !isSelected && !isDisabled && 'hover:border-primary/50 hover:bg-muted/50',
      )}
    >
      {/* Header with checkbox and name */}
      <div className="flex items-start gap-3">
        <Checkbox
          checked={isSelected}
          disabled={isDisabled}
          onCheckedChange={handleToggle}
          onClick={(e) => e.stopPropagation()}
          className="mt-1"
        />
        <div className="min-w-0 flex-1">
          <span className="text-base font-semibold">{strategy.name}</span>
          <p className="mt-0.5 text-sm font-medium text-muted-foreground">{strategy.subtitle}</p>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground">{strategy.description}</p>

      {/* Remote generation warning */}
      {isDisabled && isRemoteGenerationDisabled && (
        <div className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          Requires remote generation. Unset PROMPTFOO_DISABLE_REMOTE_GENERATION to enable.
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <TestCaseGenerateButton
          onClick={handleTestCaseGeneration}
          disabled={isDisabled || generatingTestCase || requiresConfig}
          isGenerating={generatingTestCase && currentStrategy === strategy.id}
          size="small"
          tooltipTitle={tooltipTitle}
        />

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

export function HeroStrategiesSection({
  selectedIds,
  onToggle,
  onConfigClick,
  isStrategyDisabled,
  isRemoteGenerationDisabled,
  isStrategyConfigured,
}: HeroStrategiesSectionProps) {
  return (
    <div className="mb-8">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Recommended Strategies</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          These agentic methods provide the highest attack success rates for most use cases. Most
          users only need these two strategies for comprehensive coverage.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {HERO_STRATEGIES.map((strategy) => (
          <HeroStrategyCard
            key={strategy.id}
            strategy={strategy}
            isSelected={selectedIds.includes(strategy.id)}
            onToggle={onToggle}
            onConfigClick={onConfigClick}
            isDisabled={isStrategyDisabled(strategy.id)}
            isRemoteGenerationDisabled={isRemoteGenerationDisabled}
            isConfigured={isStrategyConfigured(strategy.id)}
          />
        ))}
      </div>
    </div>
  );
}
