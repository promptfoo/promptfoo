/**
 * PluginModeStep - Choose between default and manual plugin selection.
 */

import { SingleSelectStep } from '../../shared/SingleSelectStep';

import type { SelectOption } from '../../shared/SingleSelectStep';

export interface PluginModeStepProps {
  onSelect: (mode: 'default' | 'manual') => void;
  onBack: () => void;
  onCancel: () => void;
  isFocused?: boolean;
}

const MODE_OPTIONS: ReadonlyArray<SelectOption<'default' | 'manual'>> = [
  {
    value: 'default',
    label: 'Use recommended plugins',
    description: 'Start with our curated set of security and safety plugins',
    icon: '*',
  },
  {
    value: 'manual',
    label: 'Manually select plugins',
    description: 'Choose exactly which vulnerability categories to test',
    icon: '>',
  },
];

export function PluginModeStep({ onSelect, onBack, isFocused = true }: PluginModeStepProps) {
  return (
    <SingleSelectStep
      title="How would you like to configure plugins?"
      subtitle="Plugins define the types of vulnerabilities to test for."
      options={MODE_OPTIONS}
      onSelect={onSelect}
      onBack={onBack}
      isFocused={isFocused}
      indicator=">"
    />
  );
}
