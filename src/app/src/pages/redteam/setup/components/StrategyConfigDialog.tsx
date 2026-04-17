import React from 'react';

import { Alert, AlertContent, AlertDescription, AlertTitle } from '@app/components/ui/alert';
import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import { Switch } from '@app/components/ui/switch';
import { Textarea } from '@app/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import {
  ADDITIONAL_STRATEGIES,
  AGENTIC_STRATEGIES,
  MULTI_MODAL_STRATEGIES,
  MULTI_TURN_STRATEGIES,
  type MultiTurnStrategy,
} from '@promptfoo/redteam/constants/strategies';
import { AlertTriangle, ArrowDown, ArrowUp, Info, Trash2, X } from 'lucide-react';
import { STRATEGIES_REQUIRING_CONFIG } from './strategies/utils';
import type { StrategyConfig } from '@promptfoo/redteam/types';

import type { StrategyCardData } from './strategies/types';

// ADDITIONAL_STRATEGIES contains transformation strategies (base64, jailbreak, etc.) that modify test cases.
// We use ADDITIONAL_STRATEGIES (not ALL_STRATEGIES) because ALL_STRATEGIES includes preset strategies
// like 'default', 'multilingual' which aren't meant to be composed as layer steps.
// We exclude 'layer' itself to prevent infinite recursion.
const LAYER_TRANSFORMABLE_STRATEGIES = ADDITIONAL_STRATEGIES.filter((s) => s !== 'layer').sort();

// Type for layer strategy steps (can be strings or objects with nested config)
type StepType = string | { id: string; config?: Partial<StrategyConfig> };

// Helper to extract step ID from either format
const getStepId = (step: StepType): string => {
  return typeof step === 'string' ? step : step.id;
};

// Stable empty arrays to avoid infinite loops in useEffect dependencies
const EMPTY_PLUGINS_ARRAY: string[] = [];
const EMPTY_STRATEGIES_ARRAY: Array<string | { id: string; config?: Partial<StrategyConfig> }> = [];

interface StrategyConfigDialogProps {
  open: boolean;
  strategy: string | null;
  config: Partial<StrategyConfig>;
  onClose: () => void;
  onSave: (strategy: string, config: Partial<StrategyConfig>) => void;
  strategyData: StrategyCardData | null;
  selectedPlugins?: string[];
  allStrategies?: Array<string | { id: string; config?: Partial<StrategyConfig> }>;
}

export default function StrategyConfigDialog({
  open,
  strategy,
  config,
  onClose,
  onSave,
  strategyData,
  selectedPlugins = EMPTY_PLUGINS_ARRAY,
  allStrategies = EMPTY_STRATEGIES_ARRAY,
}: StrategyConfigDialogProps) {
  const [localConfig, setLocalConfig] = React.useState<Partial<StrategyConfig>>(config || {});
  const [enabled, setEnabled] = React.useState<boolean>(
    config.enabled === undefined ? true : config.enabled,
  );
  const [numTests, setNumTests] = React.useState<string>(config.numTests?.toString() || '10');
  const [error, setError] = React.useState<string>('');

  const [steps, setSteps] = React.useState<StepType[]>((config.steps as StepType[]) || []);
  const [newStep, setNewStep] = React.useState<string>('');
  const [layerPlugins, setLayerPlugins] = React.useState<string[]>(config.plugins || []);
  // Plugin targeting: 'all' or 'specific'
  const [pluginTargeting, setPluginTargeting] = React.useState<'all' | 'specific'>(
    config.plugins && config.plugins.length > 0 ? 'specific' : 'all',
  );

  const availablePlugins = selectedPlugins;

  // Helper functions to check strategy types
  const isAgenticStrategy = React.useCallback((step: StepType): boolean => {
    const strategyId = getStepId(step);
    return (AGENTIC_STRATEGIES as readonly string[]).includes(strategyId);
  }, []);

  const isMultiModalStrategy = React.useCallback((step: StepType): boolean => {
    const strategyId = getStepId(step);
    return (MULTI_MODAL_STRATEGIES as readonly string[]).includes(strategyId);
  }, []);

  // Compute available strategies based on current steps
  const availableStrategies = React.useMemo(() => {
    const hasAgenticStrategy = steps.some(isAgenticStrategy);
    const hasMultiModalStrategy = steps.some(isMultiModalStrategy);
    const lastStepIsMultiModal = steps.length > 0 && isMultiModalStrategy(steps[steps.length - 1]);

    // If last step is multi-modal, no more steps can be added
    if (lastStepIsMultiModal) {
      return [];
    }

    const stepIds = new Set(steps.map(getStepId));

    // Create a Map for O(1) lookup instead of O(n) find
    const strategyConfigMap = new Map(
      allStrategies.map((s) => {
        const id = typeof s === 'string' ? s : s.id;
        return [id, s];
      }),
    );

    return LAYER_TRANSFORMABLE_STRATEGIES.filter((strategy) => {
      // Cannot add duplicates
      if (stepIds.has(strategy)) {
        return false;
      }

      // Cannot add multiple agentic strategies
      if (hasAgenticStrategy && isAgenticStrategy(strategy)) {
        return false;
      }

      // Cannot add multiple multi-modal strategies
      if (hasMultiModalStrategy && isMultiModalStrategy(strategy)) {
        return false;
      }

      // Only include strategies that don't require config, or if they do, they must be configured
      if (STRATEGIES_REQUIRING_CONFIG.includes(strategy)) {
        const strategyConfig = strategyConfigMap.get(strategy);

        if (!strategyConfig) {
          return false; // Not configured, don't show
        }

        const config = typeof strategyConfig === 'object' ? strategyConfig.config : undefined;

        if (strategy === 'custom') {
          // Custom strategy needs strategyText
          const strategyText = config?.strategyText;
          return !!(strategyText && typeof strategyText === 'string' && strategyText.trim());
        }
      }

      return true;
    });
  }, [steps, allStrategies, isAgenticStrategy, isMultiModalStrategy]);

  // Get validation message for why strategies might be disabled
  const getValidationMessage = (): string | null => {
    const lastStepIsMultiModal = steps.length > 0 && isMultiModalStrategy(steps[steps.length - 1]);

    if (lastStepIsMultiModal) {
      return 'Multi-modal strategies must be the last step. Remove the current multi-modal step to add more strategies.';
    }

    const hasAgenticStrategy = steps.some(isAgenticStrategy);
    const hasMultiModalStrategy = steps.some(isMultiModalStrategy);

    const messages: string[] = [];
    if (hasAgenticStrategy) {
      messages.push('Only one agentic strategy allowed');
    }
    if (hasMultiModalStrategy) {
      messages.push('Only one multi-modal strategy allowed (must be last)');
    }

    return messages.length > 0 ? messages.join('. ') : null;
  };

  // Check for ordering warnings (not blocking, just advisory)
  const getOrderingWarnings = (): string[] => {
    const warnings: string[] = [];
    const agenticIndex = steps.findIndex(isAgenticStrategy);
    const multiModalIndex = steps.findIndex(isMultiModalStrategy);

    // Warning: Agentic strategy should be first
    if (agenticIndex > 0) {
      warnings.push(
        'Agentic strategies work best as the first step. Transforms before an agentic strategy will modify the attack goal, not each turn.',
      );
    }

    // Warning: Transform between agentic and multi-modal
    if (agenticIndex !== -1 && multiModalIndex !== -1 && multiModalIndex - agenticIndex > 1) {
      warnings.push(
        'Transforms between agentic and multi-modal will encode the attack text. The audio/image will contain the encoded text, not the original attack.',
      );
    }

    return warnings;
  };

  // Get contextual help based on current configuration
  const getLayerModeDescription = (): { title: string; description: string } => {
    const hasAgentic = steps.some(isAgenticStrategy);
    const hasMultiModal = steps.some(isMultiModalStrategy);

    if (hasAgentic && hasMultiModal) {
      return {
        title: 'Multi-Turn + Multi-Modal Attack',
        description:
          'The agentic strategy will orchestrate the attack, and each turn will be converted to audio/image before sending to the target.',
      };
    }
    if (hasAgentic) {
      return {
        title: 'Multi-Turn Agentic Attack',
        description:
          'The agentic strategy will orchestrate a multi-turn conversation to achieve the attack goal.',
      };
    }
    if (hasMultiModal) {
      return {
        title: 'Multi-Modal Transform',
        description: 'Test cases will be converted to audio/image format before evaluation.',
      };
    }
    if (steps.length > 0) {
      return {
        title: 'Transform Chain',
        description: `Test cases will be transformed through ${steps.length} step${steps.length > 1 ? 's' : ''} sequentially before evaluation.`,
      };
    }
    return {
      title: 'Configure Layer Strategy',
      description:
        'Add steps to create transform chains or combine agentic strategies with multi-modal output.',
    };
  };

  React.useEffect(() => {
    if (!open || !strategy) {
      return;
    }

    const nextConfig = config || {};

    setLocalConfig({ ...nextConfig });
    setEnabled(nextConfig.enabled === undefined ? true : nextConfig.enabled);
    setNumTests(nextConfig.numTests !== undefined ? String(nextConfig.numTests) : '10');
    setError('');

    if (strategy === 'layer') {
      // Keep steps as-is (can be strings or objects with {id, config})
      const rawSteps = (nextConfig.steps as StepType[]) || [];
      setSteps(rawSteps);

      // Filter layerPlugins to only include plugins that are in availablePlugins
      const configPlugins = nextConfig.plugins || [];
      const filteredPlugins =
        selectedPlugins.length > 0
          ? configPlugins.filter((p: string) => selectedPlugins.includes(p))
          : configPlugins;
      setLayerPlugins(filteredPlugins);
      setPluginTargeting(filteredPlugins.length > 0 ? 'specific' : 'all');
    } else {
      setSteps([]);
      setLayerPlugins([]);
    }
    setNewStep('');
  }, [open, strategy, config, selectedPlugins]);

  const handlePluginTargetingChange = (newTargeting: 'all' | 'specific') => {
    setPluginTargeting(newTargeting);
    if (newTargeting === 'all') {
      // Clear plugin selection when switching to "all"
      setLayerPlugins([]);
    }
  };

  const handleAddStep = React.useCallback(
    (value: string | null) => {
      if (value && value.trim()) {
        const trimmedValue = value.trim();
        const isFilePath = trimmedValue.startsWith('file://');

        // For file paths, allow them without additional validation
        if (isFilePath) {
          // Still check if last step is multi-modal
          setSteps((prev) => {
            const lastStepIsMultiModal =
              prev.length > 0 && isMultiModalStrategy(prev[prev.length - 1]);
            if (lastStepIsMultiModal) {
              return prev; // Don't add if last step is multi-modal
            }
            return [...prev, trimmedValue];
          });
          setNewStep('');
          return;
        }

        // For predefined strategies, check if it's in the available list
        const isValidStrategy = (availableStrategies as string[]).includes(trimmedValue);

        if (isValidStrategy) {
          // If strategy requires config, get its config from allStrategies
          if (STRATEGIES_REQUIRING_CONFIG.includes(trimmedValue)) {
            const strategyConfig = allStrategies.find((s) => {
              const id = typeof s === 'string' ? s : s.id;
              return id === trimmedValue;
            });

            if (strategyConfig && typeof strategyConfig === 'object' && strategyConfig.config) {
              // Add step with its config
              setSteps((prev) => [...prev, { id: trimmedValue, config: strategyConfig.config }]);
            } else {
              // Shouldn't reach here due to filtering, but add as string fallback
              setSteps((prev) => [...prev, trimmedValue]);
            }
          } else {
            // Regular strategy without config requirements
            setSteps((prev) => [...prev, trimmedValue]);
          }
          setNewStep('');
        }
      }
    },
    [availableStrategies, allStrategies, isMultiModalStrategy],
  );

  const handleRemoveStep = (index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMoveStepUp = (index: number) => {
    if (index > 0) {
      setSteps((prev) => {
        const newSteps = [...prev];
        const stepToMove = newSteps[index];

        // Prevent moving a multi-modal strategy up (it must stay at the end)
        if (isMultiModalStrategy(stepToMove) && index === prev.length - 1) {
          return prev;
        }

        // Prevent moving up if the step below is multi-modal
        if (index < prev.length - 1 && isMultiModalStrategy(prev[index + 1])) {
          return prev;
        }

        [newSteps[index - 1], newSteps[index]] = [newSteps[index], newSteps[index - 1]];
        return newSteps;
      });
    }
  };

  const handleMoveStepDown = (index: number) => {
    setSteps((prev) => {
      if (index < prev.length - 1) {
        // Prevent moving down if the next step is multi-modal (multi-modal must stay last)
        if (isMultiModalStrategy(prev[index + 1])) {
          return prev;
        }

        const newSteps = [...prev];
        [newSteps[index], newSteps[index + 1]] = [newSteps[index + 1], newSteps[index]];
        return newSteps;
      }
      return prev;
    });
  };

  const handleNumTestsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const num = Number.parseInt(value, 10);

    if (num < 1) {
      setError('Must be at least 1');
    } else {
      setError('');
    }

    setNumTests(value);
  };

  const isCustomStrategyValid = () => {
    if (strategy === 'custom') {
      const strategyText = localConfig.strategyText;
      return !!strategyText && typeof strategyText === 'string' && strategyText.trim().length > 0;
    }
    return true;
  };

  const handleSave = () => {
    if (!strategy) {
      return;
    }

    if (strategy === 'basic') {
      onSave(strategy, {
        ...config,
        enabled,
      });
    } else if (
      strategy === 'jailbreak' ||
      strategy === 'jailbreak:hydra' ||
      strategy === 'jailbreak:meta' ||
      strategy === 'jailbreak:tree' ||
      strategy === 'best-of-n' ||
      strategy === 'goat' ||
      strategy === 'crescendo' ||
      strategy === 'custom' ||
      strategy === 'gcg' ||
      strategy === 'citation' ||
      strategy === 'mischievous-user'
    ) {
      if (!isCustomStrategyValid()) {
        return;
      }
      onSave(strategy, localConfig);
    } else if (strategy === 'layer') {
      const layerConfig: Partial<StrategyConfig> = {
        ...localConfig,
      };
      // Add plugins first, then steps to maintain order in YAML output
      // Only include plugins if specific targeting is selected and plugins are chosen
      if (pluginTargeting === 'specific' && layerPlugins.length > 0) {
        layerConfig.plugins = layerPlugins;
      } else {
        delete layerConfig.plugins;
      }
      layerConfig.steps = steps;
      onSave(strategy, layerConfig);
    } else if (strategy === 'retry') {
      const num = Number.parseInt(numTests, 10);
      if (num >= 1) {
        onSave(strategy, {
          ...config,
          numTests: num,
        });
      }
    }

    onClose();
  };

  const handleRemovePlugin = (pluginToRemove: string) => {
    setLayerPlugins((prev) => prev.filter((p) => p !== pluginToRemove));
  };

  const renderStrategyConfig = () => {
    if (strategy === 'basic') {
      return (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            The basic strategy determines whether to include the original plugin-generated test
            cases in your evaluation. These are the default test cases created by each plugin before
            any strategies are applied.
          </p>
          <div className="flex items-start gap-3">
            <Switch
              id="basic-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
              className="mt-0.5"
            />
            <div className="space-y-1">
              <Label htmlFor="basic-enabled" className="text-sm font-normal">
                Include plugin-generated test cases
              </Label>
              <p className="text-sm text-muted-foreground">
                Turn off to run only strategy-modified tests
              </p>
            </div>
          </div>
        </>
      );
    } else if (strategy === 'jailbreak') {
      return (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Configure the Iterative Jailbreak strategy parameters.
          </p>

          <div className="space-y-2">
            <Label htmlFor="num-iterations">Number of Iterations</Label>
            <Input
              id="num-iterations"
              type="number"
              value={
                localConfig.numIterations !== undefined ? Number(localConfig.numIterations) : 10
              }
              onChange={(e) => {
                const value = e.target.value ? Number.parseInt(e.target.value, 10) : 10;
                setLocalConfig({ ...localConfig, numIterations: value });
              }}
              placeholder="Number of iterations (default: 10)"
              min={3}
              max={50}
            />
            <p className="text-xs text-muted-foreground">
              Number of iterations to try (more iterations increase chance of success)
            </p>
          </div>
        </div>
      );
    } else if (strategy === 'retry') {
      return (
        <>
          <p className="mb-2 text-sm text-muted-foreground">
            Automatically reuse previously failed test cases to identify additional vulnerabilities
            and identify regressions.
          </p>
          <div className="mt-1 space-y-2">
            <Label htmlFor="max-tests">Maximum Tests Per Plugin</Label>
            <Input
              id="max-tests"
              type="number"
              value={numTests}
              onChange={handleNumTestsChange}
              min={1}
              max={100}
              className={error ? 'border-destructive' : ''}
            />
            <p className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>
              {error || 'Default: 10'}
            </p>
          </div>
        </>
      );
    } else if (strategy === 'best-of-n') {
      return (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Configure the Best-of-N strategy parameters. This strategy tries multiple variations of
            the input prompt.
          </p>

          <div className="space-y-2">
            <Label htmlFor="max-concurrency">Max Concurrency</Label>
            <Input
              id="max-concurrency"
              type="number"
              value={
                localConfig.maxConcurrency !== undefined ? Number(localConfig.maxConcurrency) : 3
              }
              onChange={(e) =>
                setLocalConfig({
                  ...localConfig,
                  maxConcurrency: Number.parseInt(e.target.value, 10),
                })
              }
              placeholder="Maximum number of concurrent requests (default: 3)"
              min={1}
            />
            <p className="text-xs text-muted-foreground">
              Maximum number of concurrent prompt variations to try
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="n-steps">Number of Steps</Label>
            <Input
              id="n-steps"
              type="number"
              value={localConfig.nSteps !== undefined ? Number(localConfig.nSteps) : ''}
              onChange={(e) => {
                const value = e.target.value ? Number.parseInt(e.target.value, 10) : undefined;
                setLocalConfig({ ...localConfig, nSteps: value });
              }}
              placeholder="Number of steps (optional)"
              min={1}
            />
            <p className="text-xs text-muted-foreground">
              Number of steps to explore in the best-of-N search (optional)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="max-candidates">Max Candidates Per Step</Label>
            <Input
              id="max-candidates"
              type="number"
              value={
                localConfig.maxCandidatesPerStep !== undefined
                  ? Number(localConfig.maxCandidatesPerStep)
                  : ''
              }
              onChange={(e) => {
                const value = e.target.value ? Number.parseInt(e.target.value, 10) : undefined;
                setLocalConfig({ ...localConfig, maxCandidatesPerStep: value });
              }}
              placeholder="Maximum candidates per step (optional)"
              min={1}
            />
            <p className="text-xs text-muted-foreground">
              Maximum number of candidate prompts to generate in each step (optional)
            </p>
          </div>
        </div>
      );
    } else if (strategy === 'custom') {
      const strategyText = String(localConfig.strategyText || '');
      const isStrategyTextEmpty = strategyText.trim().length === 0;
      return (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Define your custom multi-turn strategy with specific instructions for the AI agent.
          </p>

          <div className="space-y-2">
            <Label htmlFor="strategy-text">Strategy Text</Label>
            <Textarea
              id="strategy-text"
              rows={6}
              value={localConfig.strategyText !== undefined ? String(localConfig.strategyText) : ''}
              onChange={(e) => {
                setLocalConfig({ ...localConfig, strategyText: e.target.value });
              }}
              placeholder="For turns 0-3: Try to establish trust and gather information about {{conversationObjective}}. For turns 4-{{maxTurns}}: Use gathered info to achieve the objective. Analyze {{lastResponse}} for signs of resistance or cooperation to adapt your next message."
              className={isStrategyTextEmpty ? 'border-destructive' : ''}
            />
            <p
              className={cn(
                'text-xs',
                isStrategyTextEmpty ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {isStrategyTextEmpty
                ? 'Strategy text is required for custom strategy'
                : 'Define how the AI should behave across conversation turns. You can reference variables like conversationObjective, currentRound, maxTurns, lastResponse, application purpose, etc.'}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="max-turns">Max Turns</Label>
            <Input
              id="max-turns"
              type="number"
              value={localConfig.maxTurns !== undefined ? Number(localConfig.maxTurns) : 10}
              onChange={(e) => {
                const value = e.target.value ? Number.parseInt(e.target.value, 10) : 10;
                setLocalConfig({ ...localConfig, maxTurns: value });
              }}
              placeholder="Maximum number of conversation turns (default: 10)"
              min={1}
              max={20}
            />
            <p className="text-xs text-muted-foreground">
              Maximum number of back-and-forth exchanges with the model
            </p>
          </div>

          <div className="flex items-start gap-3">
            <Switch
              id="custom-stateful"
              checked={localConfig.stateful !== false}
              onCheckedChange={(checked) => setLocalConfig({ ...localConfig, stateful: checked })}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label htmlFor="custom-stateful" className="text-sm font-normal">
                Stateful
              </Label>
              <span className="ml-1 text-sm text-muted-foreground">
                - Enable to maintain conversation history (recommended)
              </span>
            </div>
          </div>
        </div>
      );
    } else if (strategy === 'jailbreak:hydra') {
      return (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Configure the Hydra multi-turn jailbreak. Hydra branches across multiple conversations,
            reuses what it learns during the scan, and automatically aligns with target session
            settings.
          </p>

          <div className="space-y-2">
            <Label htmlFor="hydra-max-turns">Max Turns</Label>
            <Input
              id="hydra-max-turns"
              type="number"
              value={localConfig.maxTurns !== undefined ? Number(localConfig.maxTurns) : 10}
              onChange={(e) => {
                const parsedValue = Number.parseInt(e.target.value, 10);
                setLocalConfig({
                  ...localConfig,
                  maxTurns: Number.isNaN(parsedValue) ? undefined : parsedValue,
                });
              }}
              placeholder="Maximum conversation turns (default: 10)"
              min={1}
              max={30}
            />
            <p className="text-xs text-muted-foreground">
              Maximum number of back-and-forth exchanges with the target model.
            </p>
          </div>

          <div className="flex items-start gap-3">
            <Switch
              id="hydra-stateful"
              checked={localConfig.stateful === true}
              onCheckedChange={(checked) => setLocalConfig({ ...localConfig, stateful: checked })}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label htmlFor="hydra-stateful" className="text-sm font-normal">
                Stateful
              </Label>
              <span className="ml-1 text-sm text-muted-foreground">
                - Enable when your target maintains server-side sessions and expects a session ID
                per turn.
              </span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Hydra requires Promptfoo Cloud remote generation.
          </p>
        </div>
      );
    } else if (strategy && MULTI_TURN_STRATEGIES.includes(strategy as MultiTurnStrategy)) {
      return (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Configure the multi-turn strategy parameters.
          </p>

          <div className="space-y-2">
            <Label htmlFor="multi-turn-max-turns">Max Turns</Label>
            <Input
              id="multi-turn-max-turns"
              type="number"
              value={localConfig.maxTurns !== undefined ? Number(localConfig.maxTurns) : 5}
              onChange={(e) => {
                const value = e.target.value ? Number.parseInt(e.target.value, 10) : undefined;
                setLocalConfig({ ...localConfig, maxTurns: value });
              }}
              onBlur={(e) => {
                if (!e.target.value || Number.parseInt(e.target.value, 10) < 1) {
                  setLocalConfig({ ...localConfig, maxTurns: 5 });
                }
              }}
              placeholder="5"
              min={1}
              max={20}
            />
            <p className="text-xs text-muted-foreground">
              Maximum number of back-and-forth exchanges with the model (default: 5)
            </p>
          </div>

          <div className="flex items-start gap-3">
            <Switch
              id="multi-turn-stateful"
              checked={localConfig.stateful !== false}
              onCheckedChange={(checked) => setLocalConfig({ ...localConfig, stateful: checked })}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label htmlFor="multi-turn-stateful" className="text-sm font-normal">
                Stateful
              </Label>
              <span className="ml-1 text-sm text-muted-foreground">
                - Enable to maintain conversation history (recommended)
              </span>
            </div>
          </div>
        </div>
      );
    } else if (strategy === 'jailbreak:meta') {
      return (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Configure the Meta-Agent Jailbreak strategy parameters.
          </p>

          <div className="space-y-2">
            <Label htmlFor="meta-num-iterations">Number of Iterations</Label>
            <Input
              id="meta-num-iterations"
              type="number"
              value={
                localConfig.numIterations !== undefined ? Number(localConfig.numIterations) : 10
              }
              onChange={(e) => {
                const value = e.target.value ? Number.parseInt(e.target.value, 10) : 10;
                setLocalConfig({ ...localConfig, numIterations: value });
              }}
              placeholder="Number of iterations (default: 10)"
              min={3}
              max={50}
            />
            <p className="text-xs text-muted-foreground">
              Number of iterations for the meta-agent to attempt. Agent builds attack taxonomy and
              makes strategic decisions.
            </p>
          </div>
        </div>
      );
    } else if (strategy === 'jailbreak:tree') {
      return (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Configure the Tree-based Jailbreak strategy parameters.
          </p>

          <div className="space-y-2">
            <Label htmlFor="tree-max-depth">Maximum Depth</Label>
            <Input
              id="tree-max-depth"
              type="number"
              value={localConfig.maxDepth !== undefined ? Number(localConfig.maxDepth) : 25}
              onChange={(e) => {
                const value = e.target.value ? Number.parseInt(e.target.value, 10) : 25;
                setLocalConfig({ ...localConfig, maxDepth: value });
              }}
              placeholder="Maximum tree depth (default: 25)"
              min={3}
              max={50}
            />
            <p className="text-xs text-muted-foreground">Maximum depth of the search tree</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tree-max-attempts">Maximum Attempts</Label>
            <Input
              id="tree-max-attempts"
              type="number"
              value={localConfig.maxAttempts !== undefined ? Number(localConfig.maxAttempts) : 250}
              onChange={(e) => {
                const value = e.target.value ? Number.parseInt(e.target.value, 10) : 250;
                setLocalConfig({ ...localConfig, maxAttempts: value });
              }}
              placeholder="Maximum attempts (default: 250)"
              min={50}
              max={500}
            />
            <p className="text-xs text-muted-foreground">
              Maximum number of attempts to try (note: higher values are more expensive)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tree-max-width">Max Width</Label>
            <Input
              id="tree-max-width"
              type="number"
              value={localConfig.maxWidth !== undefined ? Number(localConfig.maxWidth) : 10}
              onChange={(e) => {
                const value = e.target.value ? Number.parseInt(e.target.value, 10) : 10;
                setLocalConfig({ ...localConfig, maxWidth: value });
              }}
              placeholder="Maximum width (default: 10)"
              min={3}
              max={20}
            />
            <p className="text-xs text-muted-foreground">
              Number of top-scoring nodes to keep during tree pruning
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tree-branching">Branching Factor</Label>
            <Input
              id="tree-branching"
              type="number"
              value={
                localConfig.branchingFactor !== undefined ? Number(localConfig.branchingFactor) : 4
              }
              onChange={(e) => {
                const value = e.target.value ? Number.parseInt(e.target.value, 10) : 4;
                setLocalConfig({ ...localConfig, branchingFactor: value });
              }}
              placeholder="Branching factor (default: 4)"
              min={2}
              max={10}
            />
            <p className="text-xs text-muted-foreground">
              Number of child nodes to generate at each step
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tree-no-improvement">Max No Improvement</Label>
            <Input
              id="tree-no-improvement"
              type="number"
              value={
                localConfig.maxNoImprovement !== undefined
                  ? Number(localConfig.maxNoImprovement)
                  : 25
              }
              onChange={(e) => {
                const value = e.target.value ? Number.parseInt(e.target.value, 10) : 25;
                setLocalConfig({ ...localConfig, maxNoImprovement: value });
              }}
              placeholder="Max consecutive iterations without improvement (default: 25)"
              min={5}
              max={50}
            />
            <p className="text-xs text-muted-foreground">
              Stop after this many consecutive iterations without score improvement
            </p>
          </div>
        </div>
      );
    } else if (strategy === 'gcg') {
      return (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Configure the Greedy Coordinate Gradient (GCG) attack parameters.
          </p>

          <div className="space-y-2">
            <Label htmlFor="gcg-n">Number of Outputs (n)</Label>
            <Input
              id="gcg-n"
              type="number"
              value={localConfig.n !== undefined ? Number(localConfig.n) : 5}
              onChange={(e) => {
                const value = e.target.value ? Number.parseInt(e.target.value, 10) : 5;
                setLocalConfig({ ...localConfig, n: value });
              }}
              placeholder="Number of adversarial outputs to generate (default: 5)"
              min={1}
              max={20}
            />
            <p className="text-xs text-muted-foreground">
              More outputs increase chance of success but cost more
            </p>
          </div>
        </div>
      );
    } else if (strategy === 'citation') {
      return (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Configure the Citation-based attack parameters.
          </p>

          <div className="flex items-start gap-3">
            <Switch
              id="citation-academic"
              checked={localConfig.useAcademic !== false}
              onCheckedChange={(checked) =>
                setLocalConfig({ ...localConfig, useAcademic: checked })
              }
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label htmlFor="citation-academic" className="text-sm font-normal">
                Use Academic Citations
              </Label>
              <span className="ml-1 text-sm text-muted-foreground">
                - Generate academic-style citations (recommended)
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Switch
              id="citation-journals"
              checked={localConfig.useJournals !== false}
              onCheckedChange={(checked) =>
                setLocalConfig({ ...localConfig, useJournals: checked })
              }
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label htmlFor="citation-journals" className="text-sm font-normal">
                Include Journal Citations
              </Label>
              <span className="ml-1 text-sm text-muted-foreground">
                - Include journal articles in citation types
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Switch
              id="citation-books"
              checked={localConfig.useBooks !== false}
              onCheckedChange={(checked) => setLocalConfig({ ...localConfig, useBooks: checked })}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label htmlFor="citation-books" className="text-sm font-normal">
                Include Book Citations
              </Label>
              <span className="ml-1 text-sm text-muted-foreground">
                - Include books in citation types
              </span>
            </div>
          </div>
        </div>
      );
    } else if (strategy === 'layer') {
      const modeInfo = getLayerModeDescription();
      const orderingWarnings = getOrderingWarnings();

      return (
        <div className="flex flex-col gap-4">
          {/* Mode description */}
          <Alert variant="info" className="py-2">
            <Info className="size-4" />
            <AlertContent>
              <AlertTitle className="text-sm font-semibold">{modeInfo.title}</AlertTitle>
              <AlertDescription className="text-sm text-muted-foreground">
                {modeInfo.description}
              </AlertDescription>
            </AlertContent>
          </Alert>

          {/* Ordering warnings */}
          {orderingWarnings.map((warning, idx) => (
            <Alert key={idx} variant="warning" className="py-2">
              <AlertTriangle className="size-4" />
              <AlertContent>
                <AlertDescription className="text-sm">{warning}</AlertDescription>
              </AlertContent>
            </Alert>
          ))}

          <div>
            <Label className="mb-1.5 block font-semibold">Target Plugins</Label>
            <div
              className={cn(
                'mb-2 grid grid-cols-2 gap-1',
                pluginTargeting === 'specific' && 'mb-4',
              )}
            >
              <Button
                type="button"
                variant={pluginTargeting === 'all' ? 'default' : 'outline'}
                onClick={() => handlePluginTargetingChange('all')}
                className="w-full"
              >
                All plugins
              </Button>
              <Button
                type="button"
                variant={pluginTargeting === 'specific' ? 'default' : 'outline'}
                onClick={() => handlePluginTargetingChange('specific')}
                className="w-full"
              >
                Specific plugins only
              </Button>
            </div>

            {pluginTargeting === 'specific' && (
              <div className="space-y-2">
                <Select
                  value=""
                  onValueChange={(value) => {
                    if (value && !layerPlugins.includes(value)) {
                      setLayerPlugins([...layerPlugins, value]);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select plugins" />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePlugins
                      .filter((p) => !layerPlugins.includes(p))
                      .map((plugin) => (
                        <SelectItem key={plugin} value={plugin}>
                          {plugin}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {layerPlugins.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {layerPlugins.map((plugin) => (
                      <Badge key={plugin} variant="secondary" className="gap-1 pr-1">
                        {plugin}
                        <button
                          type="button"
                          onClick={() => handleRemovePlugin(plugin)}
                          className="rounded-full p-0.5 hover:bg-muted"
                        >
                          <X className="size-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <Label className="mb-1 block font-semibold">Steps (in order)</Label>
            <p className="mb-2 text-sm text-muted-foreground">
              Select strategies from the dropdown or enter custom file:// paths
            </p>

            <div className="flex gap-2">
              <Select
                value=""
                onValueChange={(value) => {
                  if (value) {
                    handleAddStep(value);
                  }
                }}
                disabled={availableStrategies.length === 0 && !newStep.startsWith('file://')}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue
                    placeholder={
                      availableStrategies.length === 0
                        ? 'No more strategies available'
                        : 'Select a strategy'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableStrategies.map((strat) => (
                    <SelectItem key={strat} value={strat}>
                      {strat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Custom file:// input */}
            <div className="mt-2 flex gap-2">
              <Input
                value={newStep}
                onChange={(e) => setNewStep(e.target.value)}
                placeholder="Or type file://path/to/custom.js"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newStep.trim()) {
                    e.preventDefault();
                    handleAddStep(newStep);
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => handleAddStep(newStep)}
                disabled={!newStep.trim()}
              >
                Add
              </Button>
            </div>

            <p
              className={cn(
                'mt-1 text-xs',
                steps.length === 0 ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {steps.length === 0
                ? 'Add at least one strategy step (required)'
                : getValidationMessage() || 'Add steps to build your transform chain'}
            </p>

            {steps.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                {steps.map((step, index) => {
                  const stepId = getStepId(step);
                  const hasConfig = typeof step === 'object' && step.config;
                  const isAgentic = isAgenticStrategy(step);
                  const isMultiModal = isMultiModalStrategy(step);

                  const canMoveUp =
                    index > 0 &&
                    !(isMultiModal && index === steps.length - 1) &&
                    !(index < steps.length - 1 && isMultiModalStrategy(steps[index + 1]));

                  const canMoveDown =
                    index < steps.length - 1 &&
                    !(index < steps.length - 1 && isMultiModalStrategy(steps[index + 1]));

                  return (
                    <div
                      key={`${stepId}-${index}`}
                      className="flex items-center rounded border border-border bg-background p-3 transition-colors hover:bg-muted/50"
                    >
                      <div className="flex flex-1 items-center gap-2 font-mono text-sm">
                        <span>{index + 1}.</span>
                        <span>{stepId}</span>
                        {hasConfig && (
                          <Badge className="h-5 bg-emerald-600 text-[0.7rem] text-white">
                            configured
                          </Badge>
                        )}
                        {isAgentic && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge className="h-5 bg-primary text-[0.7rem] text-primary-foreground">
                                agentic
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              Orchestrates multi-turn or multi-attempt attacks. Should be first
                              step.
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {isMultiModal && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="secondary" className="h-5 text-[0.7rem]">
                                multi-modal
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              Converts text to audio or image. Must be last step.
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      <div className="flex gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleMoveStepUp(index)}
                          disabled={!canMoveUp}
                          aria-label="move step up"
                          className={cn('size-8', !canMoveUp && 'opacity-30')}
                        >
                          <ArrowUp className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleMoveStepDown(index)}
                          disabled={!canMoveDown}
                          aria-label="move step down"
                          className={cn('size-8', !canMoveDown && 'opacity-30')}
                        >
                          <ArrowDown className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveStep(index)}
                          aria-label="delete step"
                          className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      );
    } else {
      return (
        <p className="text-muted-foreground">
          No configuration options available for this strategy.
        </p>
      );
    }
  };

  if (!strategy) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col">
        <DialogHeader>
          <DialogTitle>Configure {strategyData?.name ?? strategy}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto py-4">{renderStrategyConfig()}</div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              (strategy === 'retry' && (!!error || !numTests)) ||
              !isCustomStrategyValid() ||
              (strategy === 'layer' && steps.length === 0)
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
