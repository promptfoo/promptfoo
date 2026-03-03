import { useCallback, useEffect, useMemo, useState } from 'react';

import { Alert, AlertContent, AlertDescription, AlertTitle } from '@app/components/ui/alert';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@app/components/ui/collapsible';
import { useApiHealth } from '@app/hooks/useApiHealth';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { useToast } from '@app/hooks/useToast';
import {
  AGENTIC_STRATEGIES_SET,
  ALL_STRATEGIES,
  DEFAULT_STRATEGIES_SET,
  MULTI_MODAL_STRATEGIES_SET,
  MULTI_TURN_STRATEGIES,
  MULTI_TURN_STRATEGY_SET,
  STRATEGIES_REQUIRING_REMOTE_SET,
  strategyDescriptions,
  strategyDisplayNames,
} from '@promptfoo/redteam/constants';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';
import EstimationsDisplay from './EstimationsDisplay';
import PageWrapper from './PageWrapper';
import StrategyConfigDialog from './StrategyConfigDialog';
import { AgenticStrategiesGroup } from './strategies/AgenticStrategiesGroup';
import { HERO_STRATEGY_IDS, HeroStrategiesSection } from './strategies/HeroStrategiesSection';
import { StrategySection } from './strategies/StrategySection';
import { SystemConfiguration } from './strategies/SystemConfiguration';
import {
  getStrategyId,
  isStrategyConfigured,
  STRATEGIES_REQUIRING_CONFIG,
} from './strategies/utils';
import { TestCaseGenerationProvider } from './TestCaseGenerationProvider';
import type { RedteamStrategyObject, StrategyConfig } from '@promptfoo/redteam/types';

import type { ConfigDialogState, StrategyCardData } from './strategies/types';

// Set of hero strategy IDs for filtering
const HERO_STRATEGY_IDS_SET: ReadonlySet<string> = new Set(HERO_STRATEGY_IDS);

// ------------------------------------------------------------------
// Types & Interfaces
// ------------------------------------------------------------------

interface StrategiesProps {
  onNext: () => void;
  onBack: () => void;
}

// UI-friendly description overrides
const UI_STRATEGY_DESCRIPTIONS: Record<string, string> = {
  basic:
    'Standard testing without additional attack strategies. Tests prompts as-is to establish baseline behavior.',
  layer:
    'Applies multiple transformation strategies sequentially, where each step modifies test cases before passing to the next step.',
};

const availableStrategies: StrategyCardData[] = ALL_STRATEGIES.filter(
  (id) => id !== 'default' && id !== 'multilingual',
).map((id) => ({
  id,
  name: strategyDisplayNames[id] || id,
  description: UI_STRATEGY_DESCRIPTIONS[id] || strategyDescriptions[id],
}));

export default function Strategies({ onNext, onBack }: StrategiesProps) {
  const { config, updateConfig } = useRedTeamConfig();
  const { recordEvent } = useTelemetry();
  const toast = useToast();
  const {
    data: { status: apiHealthStatus },
  } = useApiHealth();

  const [isStatefulValue, setIsStatefulValue] = useState(config.target?.config?.stateful === true);

  const [configDialog, setConfigDialog] = useState<ConfigDialogState>({
    isOpen: false,
    selectedStrategy: null,
  });

  useEffect(() => {
    recordEvent('webui_page_view', { page: 'redteam_config_strategies' });
  }, [recordEvent]);

  const isRemoteGenerationDisabled = apiHealthStatus === 'disabled';

  const isStrategyDisabled = useCallback(
    (strategyId: string) => {
      return isRemoteGenerationDisabled && STRATEGIES_REQUIRING_REMOTE_SET.has(strategyId);
    },
    [isRemoteGenerationDisabled],
  );

  const selectedStrategyIds = useMemo(() => {
    return config.strategies
      .filter((s) => {
        const id = getStrategyId(s);
        // Special handling for 'basic' strategy - only consider it selected if enabled !== false
        if (id === 'basic' && typeof s === 'object' && s.config?.enabled === false) {
          return false;
        }
        return true;
      })
      .map((s) => getStrategyId(s));
  }, [config.strategies]);

  // Categorize strategies by type, excluding hero strategies (handled separately)
  const categorizedStrategies = useMemo(() => {
    // Filter out hero strategies - they're shown in the hero section
    const nonHeroStrategies = availableStrategies.filter((s) => !HERO_STRATEGY_IDS_SET.has(s.id));

    const allAgentic = nonHeroStrategies.filter((s) => AGENTIC_STRATEGIES_SET.has(s.id));
    const agenticSingleTurn = allAgentic.filter((s) => !MULTI_TURN_STRATEGY_SET.has(s.id));

    // Preserve the order from MULTI_TURN_STRATEGIES for agentic multi-turn strategies
    const agenticMultiTurn = MULTI_TURN_STRATEGIES.filter(
      (strategyId) => !HERO_STRATEGY_IDS_SET.has(strategyId),
    )
      .map((strategyId) =>
        nonHeroStrategies.find((s) => s.id === strategyId && AGENTIC_STRATEGIES_SET.has(s.id)),
      )
      .filter(Boolean) as StrategyCardData[];

    const multiModal = nonHeroStrategies.filter((s) => MULTI_MODAL_STRATEGIES_SET.has(s.id));

    // Strategies not in any special category
    const other = nonHeroStrategies.filter(
      (s) =>
        !DEFAULT_STRATEGIES_SET.has(s.id) &&
        !AGENTIC_STRATEGIES_SET.has(s.id) &&
        !MULTI_MODAL_STRATEGIES_SET.has(s.id),
    );

    return { agenticSingleTurn, agenticMultiTurn, multiModal, other };
  }, []);

  // ----------------------------------------------
  // Handlers
  // ----------------------------------------------

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  const handleStrategyToggle = useCallback(
    (strategyId: string) => {
      if (isStrategyDisabled(strategyId)) {
        toast.showToast(
          'This strategy requires remote generation to be enabled. Unset PROMPTFOO_DISABLE_REMOTE_GENERATION or PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION.',
          'error',
        );
        return;
      }

      // Check if strategy is selected (for 'basic', only if enabled !== false)
      const isSelected = selectedStrategyIds.includes(strategyId);

      if (!isSelected) {
        recordEvent('feature_used', {
          feature: 'redteam_config_strategy_selected',
          strategy: strategyId,
        });
      }

      if (isSelected) {
        // Special handling for 'basic' strategy
        // When unchecking, set enabled: false instead of removing it
        if (strategyId === 'basic') {
          const updated = config.strategies.map((s) => {
            if (getStrategyId(s) === 'basic') {
              return {
                id: 'basic',
                config: { ...(typeof s === 'object' ? s.config : {}), enabled: false },
              };
            }
            return s;
          });
          updateConfig('strategies', updated);
        } else {
          // Remove strategy
          updateConfig(
            'strategies',
            config.strategies.filter((s) => getStrategyId(s) !== strategyId),
          );
        }
      } else {
        // Special handling for 'basic' strategy when enabling
        if (strategyId === 'basic') {
          const existingBasic = config.strategies.find((s) => getStrategyId(s) === 'basic');

          if (existingBasic) {
            // Re-enable existing basic strategy by removing enabled: false or setting enabled: true
            const updated = config.strategies.map((s) => {
              if (getStrategyId(s) === 'basic') {
                // Remove the enabled: false config to return to default enabled state
                const config = typeof s === 'object' && s.config ? { ...s.config } : {};
                delete config.enabled;
                // If config is now empty, just return the id
                return Object.keys(config).length === 0 ? { id: 'basic' } : { id: 'basic', config };
              }
              return s;
            });
            updateConfig('strategies', updated);
          } else {
            // Add basic strategy if it doesn't exist
            updateConfig('strategies', [...config.strategies, { id: 'basic' }]);
          }
        } else {
          // Add strategy with stateful config if it's multi-turn
          const newStrategy: RedteamStrategyObject = {
            id: strategyId,
            config: {},
          };

          if (MULTI_TURN_STRATEGY_SET.has(strategyId)) {
            newStrategy.config = { ...newStrategy.config, stateful: isStatefulValue };
          }

          updateConfig('strategies', [...config.strategies, newStrategy]);

          // Auto-open config dialog for strategies that require configuration
          if (STRATEGIES_REQUIRING_CONFIG.includes(strategyId)) {
            setConfigDialog({
              isOpen: true,
              selectedStrategy: strategyId,
            });
          }
        }
      }
    },
    [
      config.strategies,
      recordEvent,
      updateConfig,
      isStatefulValue,
      isStrategyDisabled,
      toast,
      setConfigDialog,
    ],
  );

  const handleSelectNoneInSection = useCallback(
    (strategyIds: string[]) => {
      // Check if 'basic' is in the section being deselected
      const hasBasic = strategyIds.includes('basic');

      if (hasBasic) {
        // Special handling for basic strategy - set enabled: false instead of removing
        const updated = config.strategies.map((s) => {
          const id = getStrategyId(s);
          if (id === 'basic') {
            return {
              id: 'basic',
              config: { ...(typeof s === 'object' ? s.config : {}), enabled: false },
            };
          }
          return s;
        });

        // Remove all other strategies in the section (except basic)
        const filtered = updated.filter(
          (s) => !strategyIds.includes(getStrategyId(s)) || getStrategyId(s) === 'basic',
        );

        updateConfig('strategies', filtered);
      } else {
        // Remove all strategies in the given section
        updateConfig(
          'strategies',
          config.strategies.filter((s) => !strategyIds.includes(getStrategyId(s))),
        );
      }
    },
    [config.strategies, updateConfig],
  );

  const handleStatefulChange = useCallback(
    (isStateful: boolean) => {
      setIsStatefulValue(isStateful);

      // Update the target config
      updateConfig('target', {
        ...config.target,
        config: {
          ...config.target.config,
          stateful: isStateful,
        },
      });

      // Update existing multi-turn strategies with new stateful value
      const updated = config.strategies.map((s) => {
        const id = getStrategyId(s);
        if (MULTI_TURN_STRATEGY_SET.has(id)) {
          return {
            id,
            config: { ...(typeof s === 'object' ? s.config : {}), stateful: isStateful },
          };
        }
        return s;
      });

      updateConfig('strategies', updated);
    },
    [config.target, config.strategies, updateConfig],
  );

  const handleConfigClick = useCallback((strategyId: string) => {
    setConfigDialog({
      isOpen: true,
      selectedStrategy: strategyId,
    });
  }, []);

  const updateStrategyConfig = useCallback(
    (strategyId: string, newConfig: Partial<StrategyConfig>) => {
      const updated = config.strategies.map((s) => {
        if (getStrategyId(s) === strategyId) {
          return {
            id: strategyId,
            config: { ...(typeof s === 'object' ? s.config : {}), ...newConfig },
          };
        }
        return s;
      });
      updateConfig('strategies', updated);
    },
    [config.strategies, updateConfig],
  );

  // Check if a specific strategy is configured
  const isStrategyConfiguredById = useCallback(
    (strategyId: string): boolean => {
      const strategy = config.strategies.find((s) => getStrategyId(s) === strategyId);
      return strategy ? isStrategyConfigured(strategyId, strategy) : true;
    },
    [config.strategies],
  );

  // Validation function to check if all selected strategies are properly configured
  const isStrategyConfigValid = useCallback(() => {
    return config.strategies.every((strategy) =>
      isStrategyConfigured(getStrategyId(strategy), strategy),
    );
  }, [config.strategies]);

  const getNextButtonTooltip = useCallback(() => {
    if (!isStrategyConfigValid()) {
      const unconfiguredStrategies = config.strategies
        .filter((strategy) => {
          const strategyId = getStrategyId(strategy);
          return !isStrategyConfigured(strategyId, strategy);
        })
        .map((s) => getStrategyId(s));

      if (unconfiguredStrategies.length > 0) {
        return `Please configure the following ${unconfiguredStrategies.length === 1 ? 'strategy' : 'strategies'}: ${unconfiguredStrategies.join(', ')}`;
      }
    }
    return '';
  }, [config.strategies, isStrategyConfigValid]);

  // ----------------------------------------------
  // Derived states
  // ----------------------------------------------

  // Show warning if more than 80% of strategies are selected
  const hasSelectedMostStrategies = useMemo(() => {
    return selectedStrategyIds.length >= availableStrategies.length * 0.8;
  }, [selectedStrategyIds]);

  const showSystemConfig = config.strategies.some((s) =>
    ['goat', 'crescendo'].includes(getStrategyId(s)),
  );

  // Calculate count of selected advanced strategies (excludes hero strategies)
  const selectedAdvancedStrategiesCount = useMemo(() => {
    const advancedStrategyIds: Set<string> = new Set(
      [
        ...categorizedStrategies.agenticSingleTurn,
        ...categorizedStrategies.agenticMultiTurn,
        ...categorizedStrategies.multiModal,
        ...categorizedStrategies.other,
      ].map((s) => s.id),
    );

    return selectedStrategyIds.filter((id) => advancedStrategyIds.has(id)).length;
  }, [categorizedStrategies, selectedStrategyIds]);

  // State for advanced strategies collapsible
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  // ----------------------------------------------
  // Render
  // ----------------------------------------------

  return (
    <PageWrapper
      title="Strategies"
      description={
        <div className="max-w-[1200px]">
          <p className="mb-4">
            Strategies are attack techniques that systematically probe LLM applications for
            vulnerabilities. While plugins generate adversarial inputs, strategies determine how
            these inputs are delivered to maximize attack success rates.{' '}
            <RouterLink
              className="underline"
              to="https://www.promptfoo.dev/docs/red-team/strategies/"
              target="_blank"
            >
              Learn More
            </RouterLink>
          </p>
          <p>Choose the red team strategies to guide how attacks are generated and executed.</p>
        </div>
      }
      onNext={onNext}
      onBack={onBack}
      nextDisabled={!isStrategyConfigValid()}
      warningMessage={getNextButtonTooltip()}
    >
      {/* Warning banner when remote generation is disabled - full width sticky */}
      {isRemoteGenerationDisabled && (
        <Alert variant="warning" className="sticky top-0 z-10 -mx-3 mb-3 rounded-none shadow-sm">
          <AlertTriangle className="size-4" />
          <AlertContent>
            <AlertTitle>Remote Generation Disabled</AlertTitle>
            <AlertDescription>
              Some strategies require remote generation and are currently unavailable. These
              strategies include GOAT, GCG, audio, video, and other advanced attack techniques. To
              enable them, unset the <code>PROMPTFOO_DISABLE_REMOTE_GENERATION</code> or{' '}
              <code>PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION</code> environment variables.
            </AlertDescription>
          </AlertContent>
        </Alert>
      )}

      {/* Warning banner when all/most strategies are selected - full width sticky */}
      {hasSelectedMostStrategies && (
        <Alert variant="warning" className="sticky top-0 z-[9] -mx-3 mb-3 rounded-none shadow-sm">
          <AlertTriangle className="size-4" />
          <AlertContent>
            <AlertTitle>Performance Warning: Too Many Strategies Selected</AlertTitle>
            <AlertDescription>
              Selecting many strategies is usually not efficient and will significantly increase
              evaluation time and cost. It's recommended to use the preset configurations or select
              only the strategies specifically needed for your use case.
            </AlertDescription>
          </AlertContent>
        </Alert>
      )}

      <TestCaseGenerationProvider redTeamConfig={config} allowPluginChange>
        <div>
          <EstimationsDisplay config={config} />

          {/* Hero Section - Recommended Strategies (Meta + Hydra) */}
          <HeroStrategiesSection
            selectedIds={selectedStrategyIds}
            onToggle={handleStrategyToggle}
            onConfigClick={handleConfigClick}
            isStrategyDisabled={isStrategyDisabled}
            isRemoteGenerationDisabled={isRemoteGenerationDisabled}
            isStrategyConfigured={isStrategyConfiguredById}
          />

          {/* Advanced Strategies - Collapsed by default */}
          <Collapsible open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
            <CollapsibleTrigger className="mb-4 flex w-full cursor-pointer items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3 text-left transition-colors hover:bg-muted/50">
              <ChevronRight
                className={`size-4 text-muted-foreground transition-transform duration-200 ${
                  isAdvancedOpen ? 'rotate-90' : ''
                }`}
              />
              <span className="font-medium">Show Advanced Strategies</span>
              <span className="text-sm text-muted-foreground">
                ({selectedAdvancedStrategiesCount} selected)
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              {/* Agentic strategies grouped */}
              {(categorizedStrategies.agenticSingleTurn.length > 0 ||
                categorizedStrategies.agenticMultiTurn.length > 0) && (
                <AgenticStrategiesGroup
                  singleTurnStrategies={categorizedStrategies.agenticSingleTurn}
                  multiTurnStrategies={categorizedStrategies.agenticMultiTurn}
                  selectedIds={selectedStrategyIds}
                  onToggle={handleStrategyToggle}
                  onConfigClick={handleConfigClick}
                  onSelectNone={handleSelectNoneInSection}
                  isStrategyDisabled={isStrategyDisabled}
                  isRemoteGenerationDisabled={isRemoteGenerationDisabled}
                  isStrategyConfigured={isStrategyConfiguredById}
                />
              )}

              {/* Multi-modal strategies */}
              {categorizedStrategies.multiModal.length > 0 && (
                <StrategySection
                  title="Multi-modal Strategies"
                  description="Test handling of non-text content including audio, video, and images"
                  strategies={categorizedStrategies.multiModal}
                  selectedIds={selectedStrategyIds}
                  onToggle={handleStrategyToggle}
                  onConfigClick={handleConfigClick}
                  onSelectNone={handleSelectNoneInSection}
                  isStrategyDisabled={isStrategyDisabled}
                  isRemoteGenerationDisabled={isRemoteGenerationDisabled}
                  isStrategyConfigured={isStrategyConfiguredById}
                />
              )}

              {/* Other strategies */}
              {categorizedStrategies.other.length > 0 && (
                <StrategySection
                  title="Other Strategies"
                  description="Additional specialized strategies for specific attack vectors and edge cases"
                  strategies={categorizedStrategies.other}
                  selectedIds={selectedStrategyIds}
                  onToggle={handleStrategyToggle}
                  onConfigClick={handleConfigClick}
                  onSelectNone={handleSelectNoneInSection}
                  isStrategyDisabled={isStrategyDisabled}
                  isRemoteGenerationDisabled={isRemoteGenerationDisabled}
                  isStrategyConfigured={isStrategyConfiguredById}
                />
              )}

              {/* Additional system config section, if needed */}
              {showSystemConfig && (
                <SystemConfiguration
                  isStatefulValue={isStatefulValue}
                  onStatefulChange={handleStatefulChange}
                />
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* Config Dialog */}
          <StrategyConfigDialog
            open={configDialog.isOpen}
            strategy={configDialog.selectedStrategy}
            config={
              configDialog.selectedStrategy
                ? ((
                    config.strategies.find(
                      (s) => getStrategyId(s) === configDialog.selectedStrategy,
                    ) as RedteamStrategyObject
                  )?.config ?? {})
                : {}
            }
            onClose={() =>
              setConfigDialog({
                isOpen: false,
                selectedStrategy: null,
              })
            }
            onSave={updateStrategyConfig}
            strategyData={
              availableStrategies.find((s) => s.id === configDialog.selectedStrategy) ?? null
            }
            selectedPlugins={config.plugins?.map((p) => (typeof p === 'string' ? p : p.id)) ?? []}
            allStrategies={config.strategies}
          />
        </div>
      </TestCaseGenerationProvider>
    </PageWrapper>
  );
}
