/**
 * TargetTypeStep - Select the type of target being tested.
 *
 * Options match the existing redteam init flow.
 */

import { useState } from 'react';

import { Box, Text, useInput } from 'ink';
import { NavigationBar } from '../../shared/NavigationBar';

import type { RedteamTargetType } from '../../../machines/initMachine.types';

export interface TargetTypeStepProps {
  /** Callback when target type is selected */
  onSelect: (targetType: RedteamTargetType) => void;
  /** Callback when going back */
  onBack: () => void;
  /** Callback when cancelled */
  onCancel: () => void;
  /** Whether the component is focused */
  isFocused?: boolean;
}

interface TargetTypeOption {
  value: RedteamTargetType;
  label: string;
  description: string;
  icon: string;
}

const TARGET_TYPE_OPTIONS: TargetTypeOption[] = [
  {
    value: 'not_sure',
    label: "I'm not sure",
    description: "We'll help you figure out the best configuration",
    icon: '?',
  },
  {
    value: 'http_endpoint',
    label: 'HTTP/REST API endpoint',
    description: 'Test an API endpoint that accepts prompts and returns responses',
    icon: '?',
  },
  {
    value: 'prompt_model_chatbot',
    label: 'Prompt + Model / Chatbot',
    description: 'Test a system prompt with a model or conversational chatbot',
    icon: '?',
  },
  {
    value: 'rag',
    label: 'RAG (Retrieval-Augmented Generation)',
    description: 'Test a system that retrieves context before generating responses',
    icon: '?',
  },
  {
    value: 'agent',
    label: 'Agent / Function-calling system',
    description: 'Test an agent that can execute tools and make decisions',
    icon: '?',
  },
];

/**
 * TargetTypeStep component for selecting target type.
 */
export function TargetTypeStep({
  onSelect,
  onBack,
  onCancel: _onCancel,
  isFocused = true,
}: TargetTypeStepProps) {
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
        setHighlightedIndex((i) => Math.min(TARGET_TYPE_OPTIONS.length - 1, i + 1));
        return;
      }

      // Selection
      if (key.return) {
        onSelect(TARGET_TYPE_OPTIONS[highlightedIndex].value);
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
        <Text bold>What type of target are you testing?</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        {TARGET_TYPE_OPTIONS.map((option, index) => {
          const isHighlighted = index === highlightedIndex;

          return (
            <Box key={option.value} flexDirection="row">
              <Text color={isHighlighted ? 'cyan' : undefined}>{isHighlighted ? '> ' : '  '}</Text>
              <Text color={isHighlighted ? 'cyan' : undefined} bold={isHighlighted}>
                {option.icon} {option.label}
              </Text>
            </Box>
          );
        })}
      </Box>

      {/* Description for highlighted option */}
      <Box marginBottom={1}>
        <Text dimColor>{TARGET_TYPE_OPTIONS[highlightedIndex].description}</Text>
      </Box>

      <NavigationBar canGoBack={true} showNext={true} nextLabel="Select" showHelp={false} />
    </Box>
  );
}
