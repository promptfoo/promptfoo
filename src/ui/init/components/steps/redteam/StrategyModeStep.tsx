/**
 * StrategyModeStep - Choose between default and manual strategy selection.
 *
 * Users can either use the recommended default strategies or manually
 * select which attack strategies to include in their red team evaluation.
 */

import { useState } from 'react';

import { Box, Text, useInput } from 'ink';
import { NavigationBar } from '../../shared/NavigationBar';

export interface StrategyModeStepProps {
  /** Callback when mode is selected */
  onSelect: (mode: 'default' | 'manual') => void;
  /** Callback when going back */
  onBack: () => void;
  /** Callback when cancelled */
  onCancel: () => void;
  /** Whether the component is focused */
  isFocused?: boolean;
}

interface ModeOption {
  value: 'default' | 'manual';
  label: string;
  description: string;
  icon: string;
}

const MODE_OPTIONS: ModeOption[] = [
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

/**
 * StrategyModeStep component for choosing strategy configuration mode.
 */
export function StrategyModeStep({
  onSelect,
  onBack,
  onCancel: _onCancel,
  isFocused = true,
}: StrategyModeStepProps) {
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
        setHighlightedIndex((i) => Math.min(MODE_OPTIONS.length - 1, i + 1));
        return;
      }

      // Selection
      if (key.return) {
        onSelect(MODE_OPTIONS[highlightedIndex].value);
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
        <Text bold>How would you like to configure strategies?</Text>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>Strategies define attack techniques to transform test cases.</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        {MODE_OPTIONS.map((option, index) => {
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
        <Text dimColor>{MODE_OPTIONS[highlightedIndex].description}</Text>
      </Box>

      <NavigationBar canGoBack={true} showNext={true} nextLabel="Select" showHelp={false} />
    </Box>
  );
}
