import { Button } from '@app/components/ui/button';
import { StrategyItem } from './StrategyItem';

import type { StrategyCardData } from './types';

interface AgenticStrategiesGroupProps {
  singleTurnStrategies: StrategyCardData[];
  multiTurnStrategies: StrategyCardData[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onConfigClick: (id: string) => void;
  onSelectNone: (strategyIds: string[]) => void;
  isStrategyDisabled: (strategyId: string) => boolean;
  isRemoteGenerationDisabled: boolean;
  isStrategyConfigured?: (strategyId: string) => boolean;
}

export function AgenticStrategiesGroup({
  singleTurnStrategies,
  multiTurnStrategies,
  selectedIds,
  onToggle,
  onConfigClick,
  onSelectNone,
  isStrategyDisabled,
  isRemoteGenerationDisabled,
  isStrategyConfigured,
}: AgenticStrategiesGroupProps) {
  // Calculate selected strategies across both subsections
  const allAgenticStrategies = [
    ...singleTurnStrategies.map((s) => s.id),
    ...multiTurnStrategies.map((s) => s.id),
  ];
  const selectedAgenticStrategies = allAgenticStrategies.filter((id) => selectedIds.includes(id));

  const handleResetAll = () => {
    if (onSelectNone) {
      onSelectNone(selectedAgenticStrategies);
    }
  };

  return (
    <div className="mb-8">
      {/* Parent header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Agentic Strategies</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Advanced AI-powered strategies that dynamically adapt their attack patterns
          </p>
        </div>
        {(singleTurnStrategies.length > 0 || multiTurnStrategies.length > 0) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetAll}
            disabled={selectedAgenticStrategies.length === 0}
            className="px-0 font-normal hover:bg-transparent"
          >
            Reset All
          </Button>
        )}
      </div>

      {/* Container with subtle border/background */}
      <div className="rounded-lg border border-border bg-background/50 p-4">
        {/* Single-turn only subsection */}
        {singleTurnStrategies.length > 0 && (
          <div className="mb-6">
            <h4 className="mb-2 font-semibold">Single-turn Only</h4>
            <p className="mb-4 text-sm text-muted-foreground">
              These strategies work only for single-turn evaluations
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {singleTurnStrategies.map((strategy) => (
                <StrategyItem
                  key={strategy.id}
                  strategy={strategy}
                  isSelected={selectedIds.includes(strategy.id)}
                  onToggle={onToggle}
                  onConfigClick={onConfigClick}
                  isDisabled={isStrategyDisabled(strategy.id)}
                  isRemoteGenerationDisabled={isRemoteGenerationDisabled}
                  isConfigured={isStrategyConfigured ? isStrategyConfigured(strategy.id) : true}
                />
              ))}
            </div>
          </div>
        )}

        {/* Single and multi-turn subsection */}
        {multiTurnStrategies.length > 0 && (
          <div>
            <h4 className="mb-2 font-semibold">Single and Multi-turn</h4>
            <p className="mb-4 text-sm text-muted-foreground">
              These strategies can be used for both single and multi-turn evaluations
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {multiTurnStrategies.map((strategy) => (
                <StrategyItem
                  key={strategy.id}
                  strategy={strategy}
                  isSelected={selectedIds.includes(strategy.id)}
                  onToggle={onToggle}
                  onConfigClick={onConfigClick}
                  isDisabled={isStrategyDisabled(strategy.id)}
                  isRemoteGenerationDisabled={isRemoteGenerationDisabled}
                  isConfigured={isStrategyConfigured ? isStrategyConfigured(strategy.id) : true}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
