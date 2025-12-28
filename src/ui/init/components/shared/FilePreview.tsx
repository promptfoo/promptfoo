/**
 * FilePreview - Preview files before writing.
 *
 * Shows a tabbed interface to preview all files that will be created,
 * with syntax highlighting and scroll support.
 */

import { useMemo, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import type { FileToWrite } from '../../machines/initMachine.types';

export interface FilePreviewProps {
  /** Files to preview */
  files: FileToWrite[];
  /** Callback when overwrite toggle is changed */
  onToggleOverwrite?: (path: string) => void;
  /** Whether the component is focused */
  isFocused?: boolean;
  /** Maximum visible lines */
  maxLines?: number;
}

/**
 * FilePreview component for previewing files before writing.
 */
export function FilePreview({
  files,
  onToggleOverwrite,
  isFocused = true,
  maxLines = 15,
}: FilePreviewProps) {
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  const activeFile = files[activeFileIndex];
  const lines = useMemo(() => (activeFile?.content || '').split('\n'), [activeFile?.content]);

  // Calculate visible lines
  const visibleLines = lines.slice(scrollOffset, scrollOffset + maxLines);
  const canScrollUp = scrollOffset > 0;
  const canScrollDown = scrollOffset + maxLines < lines.length;

  // Handle keyboard input
  useInput(
    (input, key) => {
      if (!isFocused) {
        return;
      }

      // Tab switching
      if (key.tab || (key.shift && key.tab)) {
        if (key.shift) {
          setActiveFileIndex((i) => (i > 0 ? i - 1 : files.length - 1));
        } else {
          setActiveFileIndex((i) => (i < files.length - 1 ? i + 1 : 0));
        }
        setScrollOffset(0);
        return;
      }

      // Number keys for quick tab switch
      const num = parseInt(input, 10);
      if (num >= 1 && num <= files.length) {
        setActiveFileIndex(num - 1);
        setScrollOffset(0);
        return;
      }

      // Scrolling
      if (key.upArrow || input === 'k') {
        setScrollOffset((o) => Math.max(0, o - 1));
        return;
      }
      if (key.downArrow || input === 'j') {
        setScrollOffset((o) => Math.min(lines.length - maxLines, o + 1));
        return;
      }
      if (key.pageUp) {
        setScrollOffset((o) => Math.max(0, o - maxLines));
        return;
      }
      if (key.pageDown) {
        setScrollOffset((o) => Math.min(lines.length - maxLines, o + maxLines));
        return;
      }

      // Home/End
      if (input === 'g') {
        setScrollOffset(0);
        return;
      }
      if (input === 'G') {
        setScrollOffset(Math.max(0, lines.length - maxLines));
        return;
      }

      // Toggle overwrite with 'o'
      if (input === 'o' && activeFile?.exists && onToggleOverwrite) {
        onToggleOverwrite(activeFile.path);
        return;
      }
    },
    { isActive: isFocused },
  );

  if (files.length === 0) {
    return (
      <Box>
        <Text dimColor>No files to preview</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {/* Tab bar */}
      <Box flexDirection="row" marginBottom={1}>
        {files.map((file, index) => {
          const isActive = index === activeFileIndex;
          const hasWarning = file.exists && !file.overwrite;

          return (
            <Box key={file.path} marginRight={1}>
              <Text
                color={isActive ? 'cyan' : undefined}
                bold={isActive}
                backgroundColor={isActive ? 'gray' : undefined}
              >
                {' '}
                {index + 1}:{file.relativePath}
                {file.exists && (
                  <Text color={hasWarning ? 'yellow' : 'red'}>{hasWarning ? ' ⚠' : ' !'}</Text>
                )}{' '}
              </Text>
            </Box>
          );
        })}
      </Box>

      {/* File info */}
      <Box marginBottom={1}>
        {activeFile.exists ? (
          <Box>
            <Text color="yellow">⚠ File exists: </Text>
            <Text>{activeFile.overwrite ? 'Will overwrite' : 'Will skip'}</Text>
            {onToggleOverwrite && <Text dimColor> (press 'o' to toggle)</Text>}
          </Box>
        ) : (
          <Text color="green">✓ New file</Text>
        )}
      </Box>

      {/* Content preview */}
      <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
        {/* Scroll indicator (top) */}
        {canScrollUp && <Text dimColor>↑ {scrollOffset} lines above</Text>}

        {/* Content lines */}
        {visibleLines.map((line, index) => {
          const lineNumber = scrollOffset + index + 1;
          const lineNumStr = String(lineNumber).padStart(3, ' ');

          return (
            <Box key={index}>
              <Text dimColor>{lineNumStr} │ </Text>
              <Text>{highlightLine(line, activeFile.relativePath)}</Text>
            </Box>
          );
        })}

        {/* Scroll indicator (bottom) */}
        {canScrollDown && (
          <Text dimColor>↓ {lines.length - scrollOffset - maxLines} lines below</Text>
        )}
      </Box>

      {/* Navigation hints */}
      <Box marginTop={1}>
        <Text dimColor>[Tab] switch file [↑↓/jk] scroll [g/G] top/bottom</Text>
      </Box>
    </Box>
  );
}

/**
 * Simple syntax highlighting for common file types.
 */
function highlightLine(line: string, filename: string): React.ReactNode {
  // Detect file type
  const isYaml = filename.endsWith('.yaml') || filename.endsWith('.yml');
  const isJs = filename.endsWith('.js') || filename.endsWith('.ts');
  const isPython = filename.endsWith('.py');
  const isMd = filename.endsWith('.md');

  // Very basic highlighting - just return the line for now
  // In a real implementation, we'd parse and color keywords

  if (isYaml) {
    // Highlight YAML keys
    const match = line.match(/^(\s*)([a-zA-Z_][a-zA-Z0-9_-]*):(.*)$/);
    if (match) {
      return (
        <>
          <Text>{match[1]}</Text>
          <Text color="cyan">{match[2]}</Text>
          <Text>:</Text>
          <Text>{match[3]}</Text>
        </>
      );
    }
    // Highlight comments
    if (line.trim().startsWith('#')) {
      return <Text dimColor>{line}</Text>;
    }
  }

  if (isJs || isPython) {
    // Highlight comments
    if (line.trim().startsWith('//') || line.trim().startsWith('#')) {
      return <Text dimColor>{line}</Text>;
    }
  }

  if (isMd) {
    // Highlight headers
    if (line.startsWith('#')) {
      return <Text bold>{line}</Text>;
    }
    // Highlight code blocks
    if (line.startsWith('```')) {
      return <Text color="cyan">{line}</Text>;
    }
  }

  return line;
}
