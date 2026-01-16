/**
 * UseCaseStep - First step to select the use case.
 *
 * Options: compare, rag, agent, redteam
 */

import { Box, Text } from 'ink';

import type { SelectItem, UseCase } from '../../types';
import { SelectInput } from '../shared/SelectInput';

export interface UseCaseStepProps {
  /** Current selection */
  value: UseCase | null;
  /** Called when selection changes */
  onChange: (value: UseCase) => void;
  /** Called when user confirms selection */
  onSubmit: (value: UseCase) => void;
  /** Whether the component is focused */
  isFocused?: boolean;
}

const USE_CASE_ITEMS: SelectItem<UseCase>[] = [
  {
    value: 'compare',
    label: 'Compare prompts and models',
    description: 'Start here if not sure - compare different prompts and models',
  },
  {
    value: 'rag',
    label: 'Improve RAG performance',
    description: 'Test retrieval-augmented generation',
  },
  {
    value: 'agent',
    label: 'Improve agent/chain of thought performance',
    description: 'Test AI agents with function calling',
  },
  {
    value: 'redteam',
    label: 'Run a red team evaluation',
    description: 'Security and safety testing',
  },
];

export function UseCaseStep({ value, onChange, onSubmit, isFocused = true }: UseCaseStepProps) {
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text>What would you like to do?</Text>
      </Box>

      <SelectInput<UseCase>
        items={USE_CASE_ITEMS}
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        isFocused={isFocused}
        maxVisible={6}
      />
    </Box>
  );
}
