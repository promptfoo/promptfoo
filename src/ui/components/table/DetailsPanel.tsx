/**
 * DetailsPanel - Full-screen overlay showing comprehensive cell details.
 *
 * Features:
 * - Full prompt display
 * - Complete response content
 * - Assertion breakdown with pass/fail details
 * - Metadata (provider, latency, cost, tokens)
 * - Variables display
 * - Navigation between results and failures
 * - Section-based scrolling
 * - Copy functionality
 */

import { Box, Text, useInput } from 'ink';
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useTerminalSize } from '../../hooks/useTerminalSize';
import { copyToClipboard } from '../../utils/clipboard';
import { formatCost, formatLatency } from '../../utils/format';
import { StatusBadge } from './StatusBadge';
import type { TableCellData, TableColumn, TableRowData } from './types';

/**
 * Section identifiers for navigation.
 */
type SectionId = 'prompt' | 'response' | 'assertions' | 'metadata' | 'variables';

/**
 * Props for the DetailsPanel component.
 */
export interface DetailsPanelProps {
  /** Cell data to display */
  cellData: TableCellData;
  /** Column definition */
  column: TableColumn;
  /** Row data containing the cell */
  rowData: TableRowData;
  /** All rows for navigation context */
  allRows: TableRowData[];
  /** Variable names from table head */
  varNames: string[];
  /** Index of current row in allRows */
  currentRowIndex: number;
  /** Index of current column */
  currentColIndex: number;
  /** Index of current cell in the row's cells array (output cells only) */
  outputCellIndex: number;
  /** Handler for navigating to a different cell */
  onNavigate: (rowIndex: number, colIndex: number) => void;
  /** Handler to close the panel */
  onClose: () => void;
}

/**
 * Section header with collapse indicator.
 */
function SectionHeader({
  title,
  isActive,
  width,
  badge,
}: {
  title: string;
  isActive: boolean;
  width: number;
  badge?: React.ReactNode;
}) {
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={isActive ? 'cyan' : 'white'} bold>
          {isActive ? '▼ ' : '▸ '}
          {title}
        </Text>
        {badge && (
          <>
            <Text> </Text>
            {badge}
          </>
        )}
      </Box>
      {isActive && (
        <Box marginLeft={2}>
          <Text dimColor>{'─'.repeat(Math.min(width - 6, 60))}</Text>
        </Box>
      )}
    </Box>
  );
}

/**
 * Content box for scrollable sections.
 */
function ContentBox({
  content,
  maxLines,
  scrollOffset,
  width,
}: {
  content: string;
  maxLines: number;
  scrollOffset: number;
  width: number;
}) {
  const lines = content.split('\n');
  const totalLines = lines.length;
  const visibleLines = lines.slice(scrollOffset, scrollOffset + maxLines);
  const hasMoreAbove = scrollOffset > 0;
  const hasMoreBelow = scrollOffset + maxLines < totalLines;

  return (
    <Box flexDirection="column" marginLeft={2}>
      <Box
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        width={Math.min(width - 6, 80)}
        flexDirection="column"
      >
        {visibleLines.length === 0 ? (
          <Text dimColor>(empty)</Text>
        ) : (
          visibleLines.map((line, idx) => (
            <Text key={idx} wrap="wrap">
              {line || ' '}
            </Text>
          ))
        )}
      </Box>
      {(hasMoreAbove || hasMoreBelow) && (
        <Box marginTop={0}>
          <Text dimColor>
            {hasMoreAbove && '↑ '}
            {totalLines > maxLines &&
              `${scrollOffset + 1}-${Math.min(scrollOffset + maxLines, totalLines)} of ${totalLines} lines`}
            {hasMoreBelow && ' ↓'}
          </Text>
        </Box>
      )}
    </Box>
  );
}

/**
 * Metadata row display.
 */
function MetadataItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box marginLeft={2}>
      <Text dimColor>{label}: </Text>
      {typeof value === 'string' ? <Text>{value}</Text> : value}
    </Box>
  );
}

/**
 * Assertion result row.
 */
function AssertionRow({
  pass,
  type,
  value,
  reason,
  score,
}: {
  pass: boolean;
  type: string;
  value?: string;
  reason?: string;
  score?: number;
}) {
  const icon = pass ? '✓' : '✗';
  const color = pass ? 'green' : 'red';

  // Format assertion description
  let description = type;
  if (value) {
    const truncatedValue = value.length > 40 ? value.slice(0, 40) + '…' : value;
    description += `: ${truncatedValue}`;
  }

  return (
    <Box flexDirection="column" marginLeft={2} marginBottom={1}>
      <Box>
        <Text color={color} bold>
          {icon}
        </Text>
        <Text> {description}</Text>
      </Box>
      {!pass && reason && (
        <Box marginLeft={2}>
          <Text color="red" dimColor wrap="wrap">
            {reason}
          </Text>
        </Box>
      )}
      {score !== undefined && score !== 0 && score !== 1 && (
        <Box marginLeft={2}>
          <Text dimColor>Score: {(score * 100).toFixed(1)}%</Text>
        </Box>
      )}
    </Box>
  );
}

/**
 * Format assertion type for display.
 */
function formatAssertionDisplay(assertion: any): { type: string; value?: string } {
  if (!assertion) {
    return { type: 'assertion' };
  }

  const type = assertion.type || 'assertion';
  let value: string | undefined;

  if (assertion.value !== undefined) {
    value = typeof assertion.value === 'string' ? assertion.value : JSON.stringify(assertion.value);
  }

  return { type, value };
}

/**
 * Assertions section content.
 */
function AssertionsContent({ gradingResult }: { gradingResult: any }) {
  if (!gradingResult) {
    return (
      <Box marginLeft={2}>
        <Text dimColor>No assertion details available</Text>
      </Box>
    );
  }

  // Handle componentResults (multiple assertions)
  if (gradingResult.componentResults && Array.isArray(gradingResult.componentResults)) {
    const results = gradingResult.componentResults;
    const passCount = results.filter((r: any) => r.pass).length;

    return (
      <Box flexDirection="column">
        <Box marginLeft={2} marginBottom={1}>
          <Text dimColor>
            {passCount}/{results.length} passed
          </Text>
        </Box>
        {results.map((result: any, idx: number) => {
          const { type, value } = formatAssertionDisplay(result.assertion);
          return (
            <AssertionRow
              key={idx}
              pass={result.pass}
              type={type}
              value={value}
              reason={result.reason}
              score={result.score}
            />
          );
        })}
      </Box>
    );
  }

  // Single assertion result
  if (typeof gradingResult.pass === 'boolean') {
    const { type, value } = formatAssertionDisplay(gradingResult.assertion);
    return (
      <AssertionRow
        pass={gradingResult.pass}
        type={type}
        value={value}
        reason={gradingResult.reason}
        score={gradingResult.score}
      />
    );
  }

  // Fallback
  return (
    <Box marginLeft={2}>
      <Text dimColor wrap="wrap">
        {JSON.stringify(gradingResult, null, 2)}
      </Text>
    </Box>
  );
}

/**
 * Get assertion pass/fail counts.
 */
function getAssertionCounts(gradingResult: any): { pass: number; total: number } {
  if (!gradingResult) {
    return { pass: 0, total: 0 };
  }

  if (gradingResult.componentResults && Array.isArray(gradingResult.componentResults)) {
    const results = gradingResult.componentResults;
    return {
      pass: results.filter((r: any) => r.pass).length,
      total: results.length,
    };
  }

  if (typeof gradingResult.pass === 'boolean') {
    return { pass: gradingResult.pass ? 1 : 0, total: 1 };
  }

  return { pass: 0, total: 0 };
}

/**
 * Find the next/previous row with a failure.
 */
function findFailureIndex(
  rows: TableRowData[],
  startIndex: number,
  direction: 'next' | 'prev',
  outputCellIndex: number,
): number | null {
  const step = direction === 'next' ? 1 : -1;
  let index = startIndex + step;

  while (index >= 0 && index < rows.length) {
    const row = rows[index];
    const cell = row.cells[outputCellIndex];
    if (cell && (cell.status === 'fail' || cell.status === 'error')) {
      return index;
    }
    index += step;
  }

  return null;
}

/**
 * Main DetailsPanel component.
 */
export function DetailsPanel({
  cellData,
  column,
  rowData,
  allRows,
  varNames,
  currentRowIndex,
  currentColIndex,
  outputCellIndex,
  onNavigate,
  onClose,
}: DetailsPanelProps): React.ReactElement {
  const { width, height } = useTerminalSize();
  const output = cellData.output;

  // Section state
  const [activeSection, setActiveSection] = useState<SectionId>('prompt');
  const [scrollOffsets, setScrollOffsets] = useState<Record<SectionId, number>>({
    prompt: 0,
    response: 0,
    assertions: 0,
    metadata: 0,
    variables: 0,
  });

  // Notification state for copy feedback
  const [notification, setNotification] = useState<string | null>(null);

  // Calculate available space
  const boxWidth = Math.min(width - 4, 100);
  const contentWidth = boxWidth - 4;
  const maxContentLines = Math.max(3, Math.floor((height - 20) / 3));

  // Sections to display
  const sections: SectionId[] = useMemo(() => {
    const result: SectionId[] = ['prompt', 'response'];
    if (output?.gradingResult) {
      result.push('assertions');
    }
    result.push('metadata');
    if (rowData.originalRow.vars.length > 0) {
      result.push('variables');
    }
    return result;
  }, [output?.gradingResult, rowData.originalRow.vars.length]);

  // Reset state when navigating to a different cell
  useEffect(() => {
    // Reset scroll offsets
    setScrollOffsets({
      prompt: 0,
      response: 0,
      assertions: 0,
      metadata: 0,
      variables: 0,
    });
    // Validate active section is still valid, reset to prompt if not
    if (!sections.includes(activeSection)) {
      setActiveSection('prompt');
    }
  }, [currentRowIndex, currentColIndex, sections, activeSection]);

  // Get content for active section (for scrolling/copying)
  const getSectionContent = useCallback(
    (section: SectionId): string => {
      switch (section) {
        case 'prompt':
          return output?.prompt || '';
        case 'response':
          return cellData.content || '';
        case 'assertions':
          return output?.gradingResult ? JSON.stringify(output.gradingResult, null, 2) : '';
        case 'metadata':
          return [
            output?.provider && `Provider: ${output.provider}`,
            output?.latencyMs && `Latency: ${formatLatency(output.latencyMs)}`,
            output?.cost && `Cost: ${formatCost(output.cost)}`,
            output?.tokenUsage &&
              `Tokens: ${output.tokenUsage.prompt || 0} in / ${output.tokenUsage.completion || 0} out`,
          ]
            .filter(Boolean)
            .join('\n');
        case 'variables':
          return rowData.originalRow.vars
            .map((v, i) => `${varNames[i] || `var${i + 1}`}: ${v}`)
            .join('\n');
        default:
          return '';
      }
    },
    [output, cellData.content, rowData.originalRow.vars, varNames],
  );

  // Handle section scrolling
  const scrollSection = useCallback(
    (direction: 'up' | 'down') => {
      const content = getSectionContent(activeSection);
      const lineCount = content.split('\n').length;
      const maxOffset = Math.max(0, lineCount - maxContentLines);

      setScrollOffsets((prev) => {
        const currentOffset = prev[activeSection];
        const newOffset =
          direction === 'up'
            ? Math.max(0, currentOffset - 1)
            : Math.min(maxOffset, currentOffset + 1);
        return { ...prev, [activeSection]: newOffset };
      });
    },
    [activeSection, getSectionContent, maxContentLines],
  );

  // Handle copying
  const handleCopy = useCallback(() => {
    const content = getSectionContent(activeSection);
    const result = copyToClipboard(content);
    if (result.success) {
      setNotification(`Copied ${activeSection}`);
      setTimeout(() => setNotification(null), 2000);
    }
  }, [activeSection, getSectionContent]);

  // Handle navigation between results
  const navigateResult = useCallback(
    (direction: 'prev' | 'next') => {
      const newRowIndex =
        direction === 'prev'
          ? Math.max(0, currentRowIndex - 1)
          : Math.min(allRows.length - 1, currentRowIndex + 1);
      if (newRowIndex !== currentRowIndex) {
        onNavigate(newRowIndex, currentColIndex);
      }
    },
    [currentRowIndex, currentColIndex, allRows.length, onNavigate],
  );

  // Handle navigation to next/prev failure
  const navigateFailure = useCallback(
    (direction: 'prev' | 'next') => {
      const failureIndex = findFailureIndex(allRows, currentRowIndex, direction, outputCellIndex);
      if (failureIndex !== null) {
        onNavigate(failureIndex, currentColIndex);
      } else {
        // Provide feedback when no failure found
        setNotification(`No ${direction} failure found`);
        setTimeout(() => setNotification(null), 2000);
      }
    },
    [allRows, currentRowIndex, currentColIndex, outputCellIndex, onNavigate],
  );

  // Cycle through sections
  const cycleSection = useCallback(
    (reverse: boolean = false) => {
      const currentIdx = sections.indexOf(activeSection);
      const nextIdx = reverse
        ? (currentIdx - 1 + sections.length) % sections.length
        : (currentIdx + 1) % sections.length;
      setActiveSection(sections[nextIdx]);
    },
    [sections, activeSection],
  );

  // Keyboard input handling
  useInput((input, key) => {
    // Close
    if (input === 'q' || key.escape) {
      onClose();
      return;
    }

    // Section cycling
    if (key.tab) {
      cycleSection(key.shift);
      return;
    }

    // Scroll within section
    if (input === 'j' || key.downArrow) {
      scrollSection('down');
      return;
    }
    if (input === 'k' || key.upArrow) {
      scrollSection('up');
      return;
    }

    // Navigate between results
    if (input === '[') {
      navigateResult('prev');
      return;
    }
    if (input === ']') {
      navigateResult('next');
      return;
    }

    // Navigate between failures
    if (input === '{') {
      navigateFailure('prev');
      return;
    }
    if (input === '}') {
      navigateFailure('next');
      return;
    }

    // Copy
    if (input === 'y') {
      handleCopy();
      return;
    }
  });

  // Get assertion counts for badge
  const assertionCounts = useMemo(
    () => getAssertionCounts(output?.gradingResult),
    [output?.gradingResult],
  );

  // Format token usage
  const tokenUsage = output?.tokenUsage;
  const tokenDisplay =
    tokenUsage && (tokenUsage.prompt || tokenUsage.completion)
      ? `${tokenUsage.prompt || 0} in / ${tokenUsage.completion || 0} out`
      : null;

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="cyan"
      paddingX={1}
      paddingY={1}
      width={boxWidth}
    >
      {/* Header */}
      <Box justifyContent="space-between">
        <Box>
          <Text bold>Details</Text>
          <Text dimColor> │ </Text>
          <Text>{output?.provider || column.header}</Text>
          <Text dimColor> │ </Text>
          <StatusBadge status={cellData.status} />
        </Box>
        <Text dimColor>
          Row {currentRowIndex + 1}/{allRows.length}
        </Text>
      </Box>

      {/* Notification */}
      {notification && (
        <Box marginTop={1}>
          <Text color="green">✓ {notification}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>{'═'.repeat(contentWidth)}</Text>
      </Box>

      {/* Prompt Section */}
      <Box flexDirection="column" marginTop={1}>
        <SectionHeader title="PROMPT" isActive={activeSection === 'prompt'} width={contentWidth} />
        {activeSection === 'prompt' && (
          <ContentBox
            content={output?.prompt || '(no prompt available)'}
            maxLines={maxContentLines}
            scrollOffset={scrollOffsets.prompt}
            width={contentWidth}
          />
        )}
      </Box>

      {/* Response Section */}
      <Box flexDirection="column" marginTop={1}>
        <SectionHeader
          title="RESPONSE"
          isActive={activeSection === 'response'}
          width={contentWidth}
        />
        {activeSection === 'response' && (
          <ContentBox
            content={cellData.content || '(empty response)'}
            maxLines={maxContentLines}
            scrollOffset={scrollOffsets.response}
            width={contentWidth}
          />
        )}
      </Box>

      {/* Assertions Section */}
      {output?.gradingResult && (
        <Box flexDirection="column" marginTop={1}>
          <SectionHeader
            title="ASSERTIONS"
            isActive={activeSection === 'assertions'}
            width={contentWidth}
            badge={
              <Text
                color={
                  assertionCounts.pass === assertionCounts.total
                    ? 'green'
                    : assertionCounts.pass > 0
                      ? 'yellow'
                      : 'red'
                }
              >
                {assertionCounts.pass}/{assertionCounts.total} passed
              </Text>
            }
          />
          {activeSection === 'assertions' && (
            <AssertionsContent gradingResult={output.gradingResult} />
          )}
        </Box>
      )}

      {/* Metadata Section */}
      <Box flexDirection="column" marginTop={1}>
        <SectionHeader
          title="METADATA"
          isActive={activeSection === 'metadata'}
          width={contentWidth}
        />
        {activeSection === 'metadata' && (
          <Box flexDirection="column">
            {output?.provider && <MetadataItem label="Provider" value={output.provider} />}
            {output?.latencyMs !== undefined && output.latencyMs > 0 && (
              <MetadataItem label="Latency" value={formatLatency(output.latencyMs)} />
            )}
            {output?.cost !== undefined && output.cost > 0 && (
              <MetadataItem label="Cost" value={formatCost(output.cost)} />
            )}
            {tokenDisplay && <MetadataItem label="Tokens" value={tokenDisplay} />}
            {output?.score !== undefined && (
              <MetadataItem
                label="Score"
                value={
                  <Text color={output.score >= 0.5 ? 'green' : 'red'}>
                    {(output.score * 100).toFixed(1)}%
                  </Text>
                }
              />
            )}
            {output?.error && (
              <MetadataItem label="Error" value={<Text color="red">{output.error}</Text>} />
            )}
            {/* Empty state when no metadata available */}
            {!output?.provider &&
              !(output?.latencyMs !== undefined && output.latencyMs > 0) &&
              !(output?.cost !== undefined && output.cost > 0) &&
              !tokenDisplay &&
              output?.score === undefined &&
              !output?.error && (
                <Box marginLeft={2}>
                  <Text dimColor>(no metadata available)</Text>
                </Box>
              )}
          </Box>
        )}
      </Box>

      {/* Variables Section */}
      {rowData.originalRow.vars.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <SectionHeader
            title="VARIABLES"
            isActive={activeSection === 'variables'}
            width={contentWidth}
          />
          {activeSection === 'variables' && (
            <Box flexDirection="column">
              {rowData.originalRow.vars.map((varValue, idx) => {
                const varName = varNames[idx] || `var${idx + 1}`;
                const truncated = varValue.length > 100 ? varValue.slice(0, 100) + '…' : varValue;
                return <MetadataItem key={idx} label={varName} value={truncated || '(empty)'} />;
              })}
            </Box>
          )}
        </Box>
      )}

      {/* Footer with keyboard shortcuts */}
      <Box
        marginTop={1}
        borderStyle="single"
        borderTop
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        borderColor="gray"
        paddingTop={1}
      >
        <Text dimColor>
          <Text color="cyan">[j/k]</Text> scroll <Text color="cyan">[Tab]</Text> section{' '}
          <Text color="cyan">[[/]]</Text> prev/next <Text color="cyan">[{'{/}'}]</Text> prev/next
          fail <Text color="cyan">[y]</Text> copy <Text color="cyan">[q]</Text> close
        </Text>
      </Box>
    </Box>
  );
}

export default DetailsPanel;
