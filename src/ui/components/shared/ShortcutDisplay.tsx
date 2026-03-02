/**
 * Shared components for displaying keyboard shortcut help overlays.
 */

import React from 'react';

import { Box, Text } from 'ink';

export interface ShortcutDefinition {
  /** Keys that trigger this shortcut (e.g., ['↑', 'k']) */
  keys: string[];
  /** Human-readable description of what the shortcut does */
  description: string;
}

export interface ShortcutCategory {
  /** Category name (e.g., 'Navigation', 'Actions') */
  name: string;
  /** Shortcuts in this category */
  shortcuts: ShortcutDefinition[];
}

export interface ShortcutRowProps {
  shortcut: ShortcutDefinition;
  /** Separator between keys (default: ' ') */
  keySeparator?: string;
  /** Width of the key display column (default: 10) */
  keyWidth?: number;
}

/**
 * Renders a single shortcut row with keys and description.
 */
export function ShortcutRow({
  shortcut,
  keySeparator = ' ',
  keyWidth = 10,
}: ShortcutRowProps): React.ReactElement {
  const keyDisplay = shortcut.keys.join(keySeparator);
  return (
    <Box>
      <Box width={keyWidth}>
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
export function CategorySection({
  category,
  keySeparator,
  keyWidth,
}: {
  category: ShortcutCategory;
  keySeparator?: string;
  keyWidth?: number;
}): React.ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="yellow" bold underline>
        {category.name.toUpperCase()}
      </Text>
      <Box flexDirection="column" marginTop={0}>
        {category.shortcuts.map((shortcut, index) => (
          <ShortcutRow
            key={index}
            shortcut={shortcut}
            keySeparator={keySeparator}
            keyWidth={keyWidth}
          />
        ))}
      </Box>
    </Box>
  );
}
