/**
 * PathStep - First step to choose init path.
 */

import { SingleSelectStep } from '../shared/SingleSelectStep';

import type { InitPath } from '../../machines/initMachine.types';
import type { SelectOption } from '../shared/SingleSelectStep';

export interface PathStepProps {
  onSelect: (path: InitPath) => void;
  onCancel: () => void;
  isFocused?: boolean;
}

const PATH_OPTIONS: ReadonlyArray<SelectOption<InitPath>> = [
  {
    value: 'new',
    label: 'Create a new project',
    description: 'Configure prompts, providers, and test cases',
    icon: '📝',
  },
  {
    value: 'example',
    label: 'Start from an example',
    description: 'Download a ready-to-run example from GitHub',
    icon: '📦',
  },
];

export function PathStep({ onSelect, onCancel, isFocused = true }: PathStepProps) {
  return (
    <SingleSelectStep
      title="How would you like to get started?"
      options={PATH_OPTIONS}
      onSelect={onSelect}
      onBack={onCancel}
      isFocused={isFocused}
      canGoBack={false}
    />
  );
}
