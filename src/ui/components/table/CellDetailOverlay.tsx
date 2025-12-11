/**
 * CellDetailOverlay - Full-screen overlay showing expanded cell details.
 *
 * Features:
 * - Full output content (no truncation)
 * - Metadata display (provider, latency, cost, score)
 * - Assertion results breakdown
 * - Keyboard navigation (Escape to close)
 */

import { Box, Text } from 'ink';
import React from 'react';
import { useTerminalSize } from '../../hooks/useTerminalSize';
import { formatCost, formatLatency } from '../../utils/format';
import { StatusBadge } from './StatusBadge';
import type { CellDetailOverlayProps, TableColumn } from './types';

/**
 * Divider line component.
 * Using actual Unicode characters instead of escape sequences to avoid build issues.
 */
function Divider({ width, char = '─' }: { width: number; char?: string }) {
  return <Text dimColor>{char.repeat(width)}</Text>;
}

/**
 * Metadata row component.
 */
function MetadataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box>
      <Text dimColor>{label}: </Text>
      {typeof value === 'string' ? <Text>{value}</Text> : value}
    </Box>
  );
}

/**
 * Section header component.
 */
function SectionHeader({ title, width }: { title: string; width: number }) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color="blue">
        {title}
      </Text>
      <Divider width={Math.min(width - 4, title.length + 10)} />
    </Box>
  );
}

/**
 * CellDetailOverlay shows full cell content and metadata.
 */
export function CellDetailOverlay({ cellData, column, rowData, onClose }: CellDetailOverlayProps) {
  const { width, height } = useTerminalSize();
  const output = cellData.output;

  // Calculate content area
  const boxWidth = Math.min(width - 4, 100);
  const contentWidth = boxWidth - 4; // Padding

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
        <Text bold>Cell Details</Text>
        <Text dimColor>[Esc] Close</Text>
      </Box>

      <Divider width={contentWidth} char="═" />

      {/* Metadata Section */}
      <Box flexDirection="column" marginTop={1}>
        <MetadataRow
          label="Status"
          value={<StatusBadge status={cellData.status} />}
        />

        {output?.provider && <MetadataRow label="Provider" value={output.provider} />}

        {column.type === 'output' && column.prompt && (
          <MetadataRow label="Prompt" value={column.prompt.label || 'Unknown'} />
        )}

        <MetadataRow label="Test" value={`#${rowData.index + 1}`} />

        {output?.score !== undefined && (
          <MetadataRow
            label="Score"
            value={
              <Text color={output.score >= 0.5 ? 'green' : 'red'}>
                {(output.score * 100).toFixed(1)}%
              </Text>
            }
          />
        )}

        {output?.latencyMs !== undefined && output.latencyMs > 0 && (
          <MetadataRow label="Latency" value={formatLatency(output.latencyMs)} />
        )}

        {output?.cost !== undefined && output.cost > 0 && (
          <MetadataRow label="Cost" value={formatCost(output.cost)} />
        )}
      </Box>

      {/* Output Content Section */}
      <SectionHeader title="Output" width={contentWidth} />
      <Box flexDirection="column" marginLeft={1}>
        <Text wrap="wrap">{cellData.content || '(empty)'}</Text>
      </Box>

      {/* Assertion Results Section */}
      {output?.gradingResult && (
        <>
          <SectionHeader title="Assertion Results" width={contentWidth} />
          <Box flexDirection="column" marginLeft={1}>
            <AssertionResults gradingResult={output.gradingResult} />
          </Box>
        </>
      )}

      {/* Variables Section */}
      {rowData.originalRow.vars.length > 0 && (
        <>
          <SectionHeader title="Variables" width={contentWidth} />
          <Box flexDirection="column" marginLeft={1}>
            {rowData.originalRow.vars.map((varValue, idx) => (
              <Box key={idx}>
                <Text dimColor>var{idx + 1}: </Text>
                <Text wrap="truncate-end">{varValue}</Text>
              </Box>
            ))}
          </Box>
        </>
      )}

      {/* Footer */}
      <Box marginTop={1}>
        <Divider width={contentWidth} />
      </Box>
      <Box justifyContent="center">
        <Text dimColor>Press </Text>
        <Text bold>Escape</Text>
        <Text dimColor> to close</Text>
      </Box>
    </Box>
  );
}

/**
 * Display assertion/grading results.
 */
function AssertionResults({ gradingResult }: { gradingResult: any }) {
  // Handle different grading result formats
  if (!gradingResult) {
    return <Text dimColor>No assertion details available</Text>;
  }

  // If it's a simple pass/fail result
  if (typeof gradingResult.pass === 'boolean') {
    return (
      <Box flexDirection="column">
        <Box>
          <StatusBadge status={gradingResult.pass ? 'pass' : 'fail'} />
          {gradingResult.reason && (
            <>
              <Text> </Text>
              <Text wrap="wrap">{gradingResult.reason}</Text>
            </>
          )}
        </Box>
        {gradingResult.score !== undefined && (
          <Text dimColor>Score: {(gradingResult.score * 100).toFixed(1)}%</Text>
        )}
      </Box>
    );
  }

  // If it has componentResults (multiple assertions)
  if (gradingResult.componentResults && Array.isArray(gradingResult.componentResults)) {
    return (
      <Box flexDirection="column">
        {gradingResult.componentResults.map((result: any, idx: number) => (
          <Box key={idx} marginBottom={idx < gradingResult.componentResults.length - 1 ? 1 : 0}>
            <StatusBadge status={result.pass ? 'pass' : 'fail'} />
            <Text> </Text>
            <Text wrap="wrap">{result.assertion?.type || 'assertion'}</Text>
            {result.reason && (
              <Text dimColor> - {result.reason}</Text>
            )}
          </Box>
        ))}
      </Box>
    );
  }

  // Fallback: show raw JSON
  return (
    <Text wrap="wrap" dimColor>
      {JSON.stringify(gradingResult, null, 2)}
    </Text>
  );
}

/**
 * Minimal cell detail view (for very narrow terminals).
 */
export function MinimalCellDetail({ cellData, onClose }: { cellData: any; onClose: () => void }) {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
      <Box justifyContent="space-between">
        <StatusBadge status={cellData.status} />
        <Text dimColor>[Esc]</Text>
      </Box>
      <Text wrap="wrap">{cellData.content}</Text>
    </Box>
  );
}

export default CellDetailOverlay;
