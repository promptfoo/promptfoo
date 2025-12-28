/**
 * UseCaseStep - Select the type of evaluation to create.
 *
 * Options:
 * - Compare prompts/models
 * - RAG evaluation
 * - Agent evaluation
 * - Red team security testing
 */

import { useState } from 'react';

import { Box, Text, useInput } from 'ink';
import { NavigationBar } from '../shared/NavigationBar';

import type { UseCase } from '../../machines/initMachine.types';

export interface UseCaseStepProps {
  /** Callback when use case is selected */
  onSelect: (useCase: UseCase) => void;
  /** Callback when going back */
  onBack: () => void;
  /** Callback when cancelled */
  onCancel: () => void;
  /** Whether the component is focused */
  isFocused?: boolean;
}

interface UseCaseOption {
  value: UseCase;
  label: string;
  description: string;
  icon: string;
}

const USE_CASE_OPTIONS: UseCaseOption[] = [
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

/**
 * UseCaseStep component for selecting evaluation type.
 */
export function UseCaseStep({
  onSelect,
  onBack,
  onCancel: _onCancel,
  isFocused = true,
}: UseCaseStepProps) {
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  useInput(
    (input, key) => {
      if (!isFocused) {
        return;
      }

      // Navigation
      if (key.upArrow || input === 'k') {
        setHighlightedIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow || input === 'j') {
        setHighlightedIndex((i) => Math.min(USE_CASE_OPTIONS.length - 1, i + 1));
        return;
      }

      // Selection
      if (key.return) {
        onSelect(USE_CASE_OPTIONS[highlightedIndex].value);
        return;
      }

      // Back
      if (key.escape) {
        onBack();
        return;
      }
    },
    { isActive: isFocused },
  );

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>What would you like to do?</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        {USE_CASE_OPTIONS.map((option, index) => {
          const isHighlighted = index === highlightedIndex;

          return (
            <Box key={option.value} flexDirection="row">
              <Text color={isHighlighted ? 'cyan' : undefined}>{isHighlighted ? '▸ ' : '  '}</Text>
              <Text color={isHighlighted ? 'cyan' : undefined} bold={isHighlighted}>
                {option.icon} {option.label}
              </Text>
            </Box>
          );
        })}
      </Box>

      {/* Description for highlighted option */}
      <Box marginBottom={1}>
        <Text dimColor>{USE_CASE_OPTIONS[highlightedIndex].description}</Text>
      </Box>

      <NavigationBar canGoBack={true} showNext={true} nextLabel="Select" showHelp={false} />
    </Box>
  );
}
