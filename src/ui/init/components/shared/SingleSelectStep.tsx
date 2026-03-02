/**
 * Generic single-select step component for init wizards.
 *
 * Provides keyboard navigation (j/k, arrows), selection (Enter),
 * and back/cancel (Escape) for a list of options.
 */

import { useState } from 'react';

import { Box, Text, useInput } from 'ink';
import { NavigationBar } from './NavigationBar';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  description: string;
  icon: string;
}

export interface SingleSelectStepProps<T extends string> {
  /** Question/title displayed above the options */
  title: string;
  /** Optional subtitle displayed below the title */
  subtitle?: string;
  /** Available options to select from */
  options: ReadonlyArray<SelectOption<T>>;
  /** Callback when an option is selected */
  onSelect: (value: T) => void;
  /** Callback when going back (Escape) */
  onBack: () => void;
  /** Whether the component is focused */
  isFocused?: boolean;
  /** Whether back navigation is available */
  canGoBack?: boolean;
  /** Indicator character for highlighted item */
  indicator?: string;
}

/**
 * Reusable single-select step with vim-style keyboard navigation.
 */
export function SingleSelectStep<T extends string>({
  title,
  subtitle,
  options,
  onSelect,
  onBack,
  isFocused = true,
  canGoBack = true,
  indicator = '▸',
}: SingleSelectStepProps<T>) {
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  useInput(
    (input, key) => {
      if (!isFocused) {
        return;
      }

      if (key.upArrow || input === 'k') {
        setHighlightedIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow || input === 'j') {
        setHighlightedIndex((i) => Math.min(options.length - 1, i + 1));
        return;
      }

      if (key.return) {
        onSelect(options[highlightedIndex].value);
        return;
      }

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
        <Text bold>{title}</Text>
      </Box>

      {subtitle && (
        <Box marginBottom={1}>
          <Text dimColor>{subtitle}</Text>
        </Box>
      )}

      <Box flexDirection="column" marginBottom={1}>
        {options.map((option, index) => {
          const isHighlighted = index === highlightedIndex;

          return (
            <Box key={option.value} flexDirection="row">
              <Text color={isHighlighted ? 'cyan' : undefined}>
                {isHighlighted ? `${indicator} ` : '  '}
              </Text>
              <Text color={isHighlighted ? 'cyan' : undefined} bold={isHighlighted}>
                {option.icon} {option.label}
              </Text>
            </Box>
          );
        })}
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>{options[highlightedIndex].description}</Text>
      </Box>

      <NavigationBar canGoBack={canGoBack} showNext={true} nextLabel="Select" showHelp={false} />
    </Box>
  );
}
