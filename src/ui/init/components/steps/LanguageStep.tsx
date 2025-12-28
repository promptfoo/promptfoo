/**
 * LanguageStep - Select programming language for RAG/agent apps.
 *
 * This step is shown for RAG and agent use cases to determine
 * which language to use for context/provider scripts.
 */

import { useState } from 'react';

import { Box, Text, useInput } from 'ink';
import { NavigationBar } from '../shared/NavigationBar';

import type { Language } from '../../machines/initMachine.types';

export interface LanguageStepProps {
  /** Callback when language is selected */
  onSelect: (language: Language) => void;
  /** Callback when going back */
  onBack: () => void;
  /** Callback when cancelled */
  onCancel: () => void;
  /** Whether the component is focused */
  isFocused?: boolean;
}

interface LanguageOption {
  value: Language;
  label: string;
  description: string;
  icon: string;
}

const LANGUAGE_OPTIONS: LanguageOption[] = [
  {
    value: 'not_sure',
    label: 'Not sure yet',
    description: "We'll create Python examples that you can adapt",
    icon: '🤔',
  },
  {
    value: 'python',
    label: 'Python',
    description: 'Create Python scripts for context retrieval',
    icon: '🐍',
  },
  {
    value: 'javascript',
    label: 'JavaScript/TypeScript',
    description: 'Create JavaScript modules for context retrieval',
    icon: '📜',
  },
];

/**
 * LanguageStep component for selecting programming language.
 */
export function LanguageStep({
  onSelect,
  onBack,
  onCancel: _onCancel,
  isFocused = true,
}: LanguageStepProps) {
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
        setHighlightedIndex((i) => Math.min(LANGUAGE_OPTIONS.length - 1, i + 1));
        return;
      }

      // Selection
      if (key.return) {
        onSelect(LANGUAGE_OPTIONS[highlightedIndex].value);
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
        <Text bold>What programming language is your app written in?</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        {LANGUAGE_OPTIONS.map((option, index) => {
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
        <Text dimColor>{LANGUAGE_OPTIONS[highlightedIndex].description}</Text>
      </Box>

      <NavigationBar canGoBack={true} showNext={true} nextLabel="Select" showHelp={false} />
    </Box>
  );
}
