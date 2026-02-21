import React from 'react';

import { Box, Text, useInput } from 'ink';
import { LIMITS } from '../../constants';
import { CategorySection, type ShortcutCategory } from '../shared/ShortcutDisplay';

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
