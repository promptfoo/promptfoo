/**
 * PathStep - First step to choose init path.
 *
 * User chooses between:
 * - Start from an example
 * - Create a new project
 */

import { useState } from 'react';

import { Box, Text, useInput } from 'ink';
import { NavigationBar } from '../shared/NavigationBar';

import type { InitPath } from '../../machines/initMachine.types';

export interface PathStepProps {
  /** Callback when path is selected */
  onSelect: (path: InitPath) => void;
  /** Callback when cancelled */
  onCancel: () => void;
  /** Whether the component is focused */
  isFocused?: boolean;
}

interface PathOption {
  value: InitPath;
  label: string;
  description: string;
  icon: string;
}

const PATH_OPTIONS: PathOption[] = [
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

/**
 * PathStep component for choosing init path.
 */
export function PathStep({ onSelect, onCancel, isFocused = true }: PathStepProps) {
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
        setHighlightedIndex((i) => Math.min(PATH_OPTIONS.length - 1, i + 1));
        return;
      }

      // Selection
      if (key.return) {
        onSelect(PATH_OPTIONS[highlightedIndex].value);
        return;
      }

      // Cancel
      if (key.escape) {
        onCancel();
        return;
      }

      // Quick select by number
      if (input === '1') {
        onSelect(PATH_OPTIONS[0].value);
        return;
      }
      if (input === '2' && PATH_OPTIONS.length > 1) {
        onSelect(PATH_OPTIONS[1].value);
        return;
      }
    },
    { isActive: isFocused },
  );

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>How would you like to get started?</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        {PATH_OPTIONS.map((option, index) => {
          const isHighlighted = index === highlightedIndex;

          return (
            <Box key={option.value} flexDirection="row" marginY={0}>
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
        <Text dimColor>{PATH_OPTIONS[highlightedIndex].description}</Text>
      </Box>

      <NavigationBar canGoBack={false} showNext={true} nextLabel="Select" showHelp={false} />
    </Box>
  );
}
