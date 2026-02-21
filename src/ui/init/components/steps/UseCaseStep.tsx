/**
 * UseCaseStep - Select the type of evaluation to create.
 */

import { SingleSelectStep } from '../shared/SingleSelectStep';

import type { UseCase } from '../../machines/initMachine.types';
import type { SelectOption } from '../shared/SingleSelectStep';

export interface UseCaseStepProps {
  onSelect: (useCase: UseCase) => void;
  onBack: () => void;
  onCancel: () => void;
  isFocused?: boolean;
}

const USE_CASE_OPTIONS: ReadonlyArray<SelectOption<UseCase>> = [
  {
    value: 'compare',
    label: 'Improve prompt and model performance',
    description: 'Compare different prompts and models to find the best combination',
    icon: '📊',
  },
  {
    value: 'rag',
    label: 'Improve RAG performance',
    description: 'Evaluate retrieval-augmented generation with context injection',
    icon: '🔍',
  },
  {
    value: 'agent',
    label: 'Improve agent/chain of thought performance',
    description: 'Test agents with tool use and multi-step reasoning',
    icon: '🤖',
  },
  {
    value: 'redteam',
    label: 'Run a red team evaluation',
    description: 'Security testing to identify vulnerabilities',
    icon: '🔴',
  },
];

export function UseCaseStep({ onSelect, onBack, isFocused = true }: UseCaseStepProps) {
  return (
    <SingleSelectStep
      title="What would you like to do?"
      options={USE_CASE_OPTIONS}
      onSelect={onSelect}
      onBack={onBack}
      isFocused={isFocused}
    />
  );
}
