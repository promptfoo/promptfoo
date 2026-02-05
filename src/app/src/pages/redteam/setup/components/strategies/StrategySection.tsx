import { Button } from '@app/components/ui/button';
import { cn } from '@app/lib/utils';
import { StrategyItem } from './StrategyItem';

import type { StrategyCardData } from './types';

interface StrategySectionProps {
  title: string;
  strategies: StrategyCardData[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onConfigClick: (id: string) => void;
  onSelectNone?: (strategyIds: string[]) => void;
  highlighted?: boolean;
  description?: string;
  isStrategyDisabled: (strategyId: string) => boolean;
  isRemoteGenerationDisabled: boolean;
  isStrategyConfigured?: (strategyId: string) => boolean;
}

export function StrategySection({
  title,
  strategies,
  selectedIds,
  onToggle,
  onConfigClick,
  onSelectNone,
  highlighted = false,
  description,
  isStrategyDisabled,
  isRemoteGenerationDisabled,
  isStrategyConfigured,
}: StrategySectionProps) {
  const selectedStrategiesInSection = strategies
    .map((strategy) => strategy.id)
    .filter((id) => selectedIds.includes(id));

  const handleSelectNone = () => {
    if (onSelectNone) {
      onSelectNone(selectedStrategiesInSection);
    } else {
      // Fallback to the old approach if onSelectNone not provided
      selectedStrategiesInSection.forEach((id) => onToggle(id));
    }
  };

  return (
    <div className="mb-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className={cn('text-lg font-semibold', highlighted && 'font-bold text-primary')}>
            {title}
          </h3>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {strategies.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSelectNone}
            disabled={selectedStrategiesInSection.length === 0}
            className="px-0 font-normal hover:bg-transparent"
          >
            Reset
          </Button>
        )}
      </div>
      <div
        className={cn(
          'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3',
          highlighted && 'rounded-lg border border-primary/10 bg-primary/[0.02] p-4',
        )}
      >
        {strategies.map((strategy) => (
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
  );
}
