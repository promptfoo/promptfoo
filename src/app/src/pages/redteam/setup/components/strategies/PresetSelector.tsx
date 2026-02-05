import PresetCard from '../PresetCard';
import { STRATEGY_PRESETS } from './types';

import type { PresetId, StrategyPreset } from './types';

interface PresetSelectorProps {
  presets: StrategyPreset[];
  selectedPreset: PresetId | 'Custom';
  onSelect: (preset: StrategyPreset | { name: 'Custom' }) => void;
}

export function PresetSelector({ presets, selectedPreset, onSelect }: PresetSelectorProps) {
  return (
    <div className="mb-8">
      <div className="flex flex-wrap justify-center gap-4 sm:justify-start">
        {presets.map((preset) => (
          <div key={preset.name} className="w-full min-w-[280px] max-w-[280px] sm:w-auto">
            <PresetCard
              name={preset.name}
              description={preset.description}
              isSelected={
                selectedPreset ===
                Object.entries(STRATEGY_PRESETS).find(
                  ([_, p]) => (p as StrategyPreset).name === preset.name,
                )?.[0]
              }
              onClick={() => onSelect(preset)}
            />
          </div>
        ))}
        <div className="w-full min-w-[280px] max-w-[280px] sm:w-auto">
          <PresetCard
            name="Custom"
            description="Configure your own set of strategies"
            isSelected={selectedPreset === 'Custom'}
            onClick={() => onSelect({ name: 'Custom' })}
          />
        </div>
      </div>
    </div>
  );
}
