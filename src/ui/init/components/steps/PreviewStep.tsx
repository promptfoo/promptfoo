/**
 * PreviewStep - Show generated config preview before writing files.
 */

import { useMemo, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import type { FileToCreate } from '../../types';

export interface PreviewStepProps {
  /** Generated config YAML */
  config: string;
  /** Files to be created */
  files: FileToCreate[];
  /** Called when user confirms */
  onConfirm: () => void;
  /** Called when user goes back */
  onBack: () => void;
  /** Whether the component is focused */
  isFocused?: boolean;
  /** Files that already exist and will be overwritten */
  existingFiles?: string[];
  /** Whether overwrite confirmation is pending */
  confirmOverwrite?: boolean;
  /** Whether files are currently being written */
  isWriting?: boolean;
}

/**
 * Simple YAML syntax highlighting.
 */
function highlightYaml(yaml: string): React.ReactNode[] {
  const lines = yaml.split('\n');
  return lines.map((line, index) => {
    // Comment
    if (line.trim().startsWith('#')) {
      return (
        <Text key={index} dimColor>
          {line}
        </Text>
      );
    }

    // Key-value pair
    const keyMatch = line.match(/^(\s*)([a-zA-Z_-]+)(:)(.*)/);
    if (keyMatch) {
      const [, indent, key, colon, rest] = keyMatch;
      return (
        <Text key={index}>
          {indent}
          <Text color="cyan">{key}</Text>
          {colon}
          <Text color="green">{rest}</Text>
        </Text>
      );
    }

    // List item
    const listMatch = line.match(/^(\s*)(- )(.*)/);
    if (listMatch) {
      const [, indent, dash, content] = listMatch;
      return (
        <Text key={index}>
          {indent}
          <Text color="yellow">{dash}</Text>
          <Text color="green">{content}</Text>
        </Text>
      );
    }

    // Default
    return <Text key={index}>{line}</Text>;
  });
}

export function PreviewStep({
  config,
  files,
  onConfirm,
  onBack,
  isFocused = true,
  existingFiles = [],
  confirmOverwrite = false,
  isWriting = false,
}: PreviewStepProps) {
  const [scrollOffset, setScrollOffset] = useState(0);
  const maxVisible = Math.max(10, (process.stdout.rows || 24) - 15);

  const configLines = useMemo(() => config.split('\n'), [config]);
  const highlightedLines = useMemo(() => highlightYaml(config), [config]);
  // Clamp maxScroll to >= 0 to prevent negative scroll when config is short
  const maxScroll = Math.max(0, configLines.length - maxVisible);

  const visibleLines = useMemo(() => {
    return highlightedLines.slice(scrollOffset, scrollOffset + maxVisible);
  }, [highlightedLines, scrollOffset, maxVisible]);

  // Disable input while writing
  const isActive = isFocused && !isWriting;

  useInput(
    (input, key) => {
      if (!isActive) {
        return;
      }

      // Scroll (using clamped maxScroll to prevent negative values)
      if (key.upArrow || input === 'k') {
        setScrollOffset((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow || input === 'j') {
        setScrollOffset((prev) => Math.min(maxScroll, prev + 1));
      } else if (key.pageUp || (key.ctrl && input === 'b')) {
        setScrollOffset((prev) => Math.max(0, prev - maxVisible));
      } else if (key.pageDown || (key.ctrl && input === 'f')) {
        setScrollOffset((prev) => Math.min(maxScroll, prev + maxVisible));
      } else if (input === 'g') {
        setScrollOffset(0);
      } else if (input === 'G') {
        setScrollOffset(maxScroll);
      }

      // Actions
      if (key.return) {
        onConfirm();
      } else if (key.backspace || key.escape) {
        onBack();
      }
    },
    { isActive },
  );

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Review Configuration</Text>
      </Box>

      {/* Files to create */}
      <Box marginBottom={1} flexDirection="column">
        <Text dimColor>Files to create:</Text>
        {files.map((file) => (
          <Box key={file.path} marginLeft={2}>
            <Text color={file.required ? 'white' : 'gray'}>
              {file.required ? '●' : '○'} {file.path}
              {file.required ? '' : ' (optional)'}
            </Text>
          </Box>
        ))}
      </Box>

      {/* Config preview */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        height={maxVisible + 2}
      >
        <Box flexDirection="column">{visibleLines}</Box>
      </Box>

      {/* Scroll indicator */}
      {configLines.length > maxVisible && (
        <Box marginTop={1}>
          <Text dimColor>
            Lines {scrollOffset + 1}-{Math.min(scrollOffset + maxVisible, configLines.length)} of{' '}
            {configLines.length}
          </Text>
        </Box>
      )}

      {/* Overwrite warning */}
      {existingFiles.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow" bold>
            ⚠ The following files already exist and will be overwritten:
          </Text>
          {existingFiles.map((file) => (
            <Box key={file} marginLeft={2}>
              <Text color="yellow">• {file}</Text>
            </Box>
          ))}
          {confirmOverwrite && (
            <Text color="red" bold>
              Press Enter again to confirm overwrite, or Backspace to go back.
            </Text>
          )}
        </Box>
      )}

      {/* Actions */}
      <Box marginTop={1}>
        {isWriting ? (
          <Text color="cyan">Writing files...</Text>
        ) : (
          <Text dimColor>
            ↑↓/jk: scroll | Enter: {confirmOverwrite ? 'confirm overwrite' : 'create files'} |
            Backspace: go back
          </Text>
        )}
      </Box>
    </Box>
  );
}
