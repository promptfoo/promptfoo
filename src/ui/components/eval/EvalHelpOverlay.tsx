/**
 * EvalHelpOverlay - Full-screen help overlay for evaluation screen.
 *
 * Displays all available keyboard shortcuts during evaluation.
 * Press any key to dismiss.
 */

import React from 'react';

import { Box, Text, useInput } from 'ink';

/**
 * Definition of a keyboard shortcut for display.
 */
interface ShortcutDefinition {
  /** Keys that trigger this shortcut */
  keys: string[];
  /** Description of what the shortcut does */
  description: string;
}

/**
 * A category grouping related shortcuts.
 */
interface ShortcutCategory {
  /** Category name */
  name: string;
  /** Shortcuts in this category */
  shortcuts: ShortcutDefinition[];
}

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
  const shortcuts: ShortcutCategory[] = [
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

  return shortcuts;
}

/**
 * Renders a single shortcut row.
 */
function ShortcutRow({ shortcut }: { shortcut: ShortcutDefinition }): React.ReactElement {
  const keyDisplay = shortcut.keys.join(' / ');
  return (
    <Box>
      <Box width={12}>
        <Text color="cyan" bold>
          {keyDisplay}
        </Text>
      </Box>
      <Text color="white">{shortcut.description}</Text>
    </Box>
  );
}

/**
 * Renders a category of shortcuts.
 */
function CategorySection({ category }: { category: ShortcutCategory }): React.ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="yellow" bold underline>
        {category.name.toUpperCase()}
      </Text>
      <Box flexDirection="column">
        {category.shortcuts.map((shortcut, index) => (
          <ShortcutRow key={index} shortcut={shortcut} />
        ))}
      </Box>
    </Box>
  );
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
          <CategorySection key={index} category={category} />
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
