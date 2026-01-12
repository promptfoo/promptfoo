import React from 'react';

import { Box, Text, useInput } from 'ink';
import { LIMITS } from '../../constants';

/**
 * Definition of a keyboard shortcut for display in the help overlay.
 */
export interface ShortcutDefinition {
  /** Keys that trigger this shortcut (e.g., ['↑', 'k']) */
  keys: string[];
  /** Human-readable description of what the shortcut does */
  description: string;
}

/**
 * A category grouping related shortcuts together.
 */
export interface ShortcutCategory {
  /** Category name (e.g., 'Navigation', 'Actions') */
  name: string;
  /** Shortcuts in this category */
  shortcuts: ShortcutDefinition[];
}

export interface HelpOverlayProps {
  /** Callback when user dismisses the help overlay */
  onClose: () => void;
  /** Whether history browser is available */
  historyAvailable?: boolean;
  /** Width of the terminal */
  terminalWidth?: number;
}

/**
 * Get all available shortcuts organized by category.
 */
function getShortcutCategories(historyAvailable: boolean): ShortcutCategory[] {
  const categories: ShortcutCategory[] = [
    {
      name: 'Navigation',
      shortcuts: [
        { keys: ['↑', 'k'], description: 'Move up' },
        { keys: ['↓', 'j'], description: 'Move down' },
        { keys: ['←', 'h'], description: 'Move left' },
        { keys: ['→', 'l'], description: 'Move right' },
        { keys: ['g'], description: 'Jump to top' },
        { keys: ['G'], description: 'Jump to bottom' },
        { keys: ['0'], description: 'First column' },
        { keys: ['$'], description: 'Last column' },
        { keys: ['PgUp'], description: 'Page up' },
        { keys: ['PgDn'], description: 'Page down' },
        { keys: ['Home'], description: 'Start of row' },
        { keys: ['End'], description: 'End of row' },
      ],
    },
    {
      name: 'Actions',
      shortcuts: [
        { keys: ['x'], description: 'Export to file' },
        { keys: ['y'], description: 'Copy to clipboard' },
      ],
    },
    {
      name: 'Views',
      shortcuts: [
        ...(historyAvailable ? [{ keys: ['H'], description: 'History browser' }] : []),
        { keys: ['?'], description: 'Show this help' },
      ],
    },
    {
      name: 'General',
      shortcuts: [
        { keys: ['Esc'], description: 'Close overlay' },
        { keys: ['q'], description: 'Quit' },
      ],
    },
  ];

  return categories;
}

/**
 * Renders a single shortcut row with keys and description.
 */
function ShortcutRow({ shortcut }: { shortcut: ShortcutDefinition }): React.ReactElement {
  const keyDisplay = shortcut.keys.join(' ');
  return (
    <Box>
      <Box width={10}>
        <Text color="cyan" bold>
          {keyDisplay}
        </Text>
      </Box>
      <Text color="white">{shortcut.description}</Text>
    </Box>
  );
}

/**
 * Renders a category of shortcuts with a header.
 */
function CategorySection({ category }: { category: ShortcutCategory }): React.ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="yellow" bold underline>
        {category.name.toUpperCase()}
      </Text>
      <Box flexDirection="column" marginTop={0}>
        {category.shortcuts.map((shortcut, index) => (
          <ShortcutRow key={index} shortcut={shortcut} />
        ))}
      </Box>
    </Box>
  );
}

/**
 * Full-screen help overlay showing all keyboard shortcuts.
 *
 * Displays shortcuts organized by category in a two-column layout.
 * Press any key to dismiss.
 */
export function HelpOverlay({
  onClose,
  historyAvailable = false,
  terminalWidth = 80,
}: HelpOverlayProps): React.ReactElement {
  // Close on any key press
  useInput(() => {
    onClose();
  });

  const categories = getShortcutCategories(historyAvailable);

  // Split categories into two columns for wider display
  const useWideLayout = terminalWidth >= LIMITS.WIDE_LAYOUT_MIN_WIDTH;
  const leftCategories = useWideLayout ? categories.slice(0, 1) : categories;
  const rightCategories = useWideLayout ? categories.slice(1) : [];

  const boxWidth = Math.min(terminalWidth - 4, 72);
  const columnWidth = useWideLayout ? Math.floor((boxWidth - 6) / 2) : boxWidth - 4;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="blue"
      paddingX={2}
      paddingY={1}
      width={boxWidth}
    >
      {/* Header */}
      <Box justifyContent="center" marginBottom={1}>
        <Text color="blue" bold>
          Keyboard Shortcuts
        </Text>
      </Box>

      {/* Content */}
      {useWideLayout ? (
        <Box flexDirection="row">
          {/* Left column */}
          <Box flexDirection="column" width={columnWidth}>
            {leftCategories.map((category, index) => (
              <CategorySection key={index} category={category} />
            ))}
          </Box>

          {/* Spacer */}
          <Box width={4} />

          {/* Right column */}
          <Box flexDirection="column" width={columnWidth}>
            {rightCategories.map((category, index) => (
              <CategorySection key={index} category={category} />
            ))}
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column">
          {categories.map((category, index) => (
            <CategorySection key={index} category={category} />
          ))}
        </Box>
      )}

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
