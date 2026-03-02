/**
 * EvalHelpOverlay - Full-screen help overlay for evaluation screen.
 *
 * Displays all available keyboard shortcuts during evaluation.
 * Press any key to dismiss.
 */

import React from 'react';

import { Box, Text, useInput } from 'ink';
import { CategorySection, type ShortcutCategory } from '../shared/ShortcutDisplay';

export interface EvalHelpOverlayProps {
  /** Callback when user dismisses the overlay */
  onClose: () => void;
  /** Whether there are errors to display */
  hasErrors?: boolean;
}

/**
 * Get all available shortcuts for the eval screen.
 */
function getShortcutCategories(hasErrors: boolean): ShortcutCategory[] {
  return [
    {
      name: 'Display',
      shortcuts: [
        { keys: ['v'], description: 'Toggle verbose mode (show logs)' },
        ...(hasErrors ? [{ keys: ['e'], description: 'Toggle error details' }] : []),
        { keys: ['?'], description: 'Show this help' },
      ],
    },
    {
      name: 'General',
      shortcuts: [{ keys: ['q', 'Esc'], description: 'Cancel evaluation and exit' }],
    },
  ];
}

/**
 * Full-screen help overlay for the evaluation screen.
 *
 * Shows available keyboard shortcuts during evaluation.
 * Press any key to close.
 */
export function EvalHelpOverlay({
  onClose,
  hasErrors = false,
}: EvalHelpOverlayProps): React.ReactElement {
  // Close on any key press
  useInput(() => {
    onClose();
  });

  const categories = getShortcutCategories(hasErrors);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="blue"
      paddingX={2}
      paddingY={1}
      marginTop={1}
    >
      {/* Header */}
      <Box justifyContent="center" marginBottom={1}>
        <Text color="blue" bold>
          Keyboard Shortcuts
        </Text>
      </Box>

      {/* Content */}
      <Box flexDirection="column">
        {categories.map((category, index) => (
          <CategorySection key={index} category={category} keySeparator=" / " keyWidth={12} />
        ))}
      </Box>

      {/* Additional info */}
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>During evaluation, results are shown in real-time.</Text>
        <Text dimColor>After completion, you can browse the results table.</Text>
      </Box>

      {/* Footer */}
      <Box
        justifyContent="center"
        marginTop={1}
        borderStyle="single"
        borderTop
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        borderColor="gray"
        paddingTop={1}
      >
        <Text color="gray">Press any key to close</Text>
      </Box>
    </Box>
  );
}
