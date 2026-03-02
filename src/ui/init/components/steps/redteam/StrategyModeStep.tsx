/**
 * StrategyModeStep - Choose between default and manual strategy selection.
 */

import { SingleSelectStep } from '../../shared/SingleSelectStep';

import type { SelectOption } from '../../shared/SingleSelectStep';

export interface StrategyModeStepProps {
  onSelect: (mode: 'default' | 'manual') => void;
  onBack: () => void;
  onCancel: () => void;
  isFocused?: boolean;
}

const MODE_OPTIONS: ReadonlyArray<SelectOption<'default' | 'manual'>> = [
  {
    value: 'default',
    label: 'Use recommended strategies',
    description: 'Start with our curated set of attack strategies (jailbreaks, encoding, etc.)',
    icon: '*',
  },
  {
    value: 'manual',
    label: 'Manually select strategies',
    description: 'Choose exactly which attack techniques to use',
    icon: '>',
  },
];

export function StrategyModeStep({ onSelect, onBack, isFocused = true }: StrategyModeStepProps) {
  return (
    <SingleSelectStep
      title="How would you like to configure strategies?"
      subtitle="Strategies define attack techniques to transform test cases."
      options={MODE_OPTIONS}
      onSelect={onSelect}
      onBack={onBack}
      isFocused={isFocused}
      indicator=">"
    />
  );
}
