/**
 * CellDetailOverlay - Full-screen overlay showing expanded cell details.
 *
 * Features:
 * - Full output content (no truncation)
 * - Metadata display (provider, latency, cost, score)
 * - Assertion results breakdown
 * - Keyboard navigation (q to close, arrows to navigate)
 */

import { Box, Text } from 'ink';
import { useEffect } from 'react';
import { isRawModeSupported } from '../../hooks/useKeypress';
import { useTerminalSize } from '../../hooks/useTerminalSize';
import { formatCost, formatLatency } from '../../utils/format';
import { StatusBadge } from './StatusBadge';
import type { CellDetailOverlayProps } from './types';

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
export function CellDetailOverlay({
  cellData,
  column,
  rowData,
  varNames,
  onNavigate,
  onClose: _onClose,
}: CellDetailOverlayProps) {
  const { width } = useTerminalSize();
  const output = cellData.output;

  // Calculate content area
  const boxWidth = Math.min(width - 4, 100);
  const contentWidth = boxWidth - 4; // Padding

  // Handle keyboard navigation within detail view
  useEffect(() => {
    if (!isRawModeSupported() || !onNavigate) {
      return;
    }

    const handleInput = (data: Buffer) => {
      const key = data.toString();

      // Handle escape sequences for arrow keys
      if (key === '\x1b[A') {
        onNavigate('up');
      } else if (key === '\x1b[B') {
        onNavigate('down');
      } else if (key === '\x1b[C') {
        onNavigate('right');
      } else if (key === '\x1b[D') {
        onNavigate('left');
      } else {
        // Handle vim-style navigation
        const lowerKey = key.toLowerCase();
        switch (lowerKey) {
          case 'k':
            onNavigate('up');
            break;
          case 'j':
            onNavigate('down');
            break;
          case 'l':
            onNavigate('right');
            break;
          case 'h':
            onNavigate('left');
            break;
        }
      }
    };

    process.stdin.on('data', handleInput);
    return () => {
      process.stdin.off('data', handleInput);
    };
  }, [onNavigate]);

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
        <Text dimColor>{onNavigate && '←↑↓→ nav | '}[q] close</Text>
      </Box>

      <Divider width={contentWidth} char="═" />

      {/* Metadata Section */}
      <Box flexDirection="column" marginTop={1}>
        <MetadataRow label="Status" value={<StatusBadge status={cellData.status} />} />

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
            {rowData.originalRow.vars.map((varValue, idx) => {
              const varName = varNames[idx] || `var${idx + 1}`;
              return (
                <Box key={idx}>
                  <Text dimColor>{varName}: </Text>
                  <Text wrap="wrap">{varValue || '(empty)'}</Text>
                </Box>
              );
            })}
          </Box>
        </>
      )}
    </Box>
  );
}

/**
 * Format assertion type for display.
 */
function formatAssertionType(assertion: any): string {
  if (!assertion) {
    return 'assertion';
  }
  // Show the assertion type
  let label = assertion.type || 'assertion';
  // Add value context if available
  if (assertion.value !== undefined) {
    const valueStr =
      typeof assertion.value === 'string'
        ? assertion.value.length > 30
          ? assertion.value.slice(0, 30) + '…'
          : assertion.value
        : String(assertion.value);
    label += `: ${valueStr}`;
  }
  return label;
}

/**
 * Single assertion result row.
 */
function AssertionRow({ result, isLast }: { result: any; isLast: boolean }) {
  return (
    <Box flexDirection="column" marginBottom={isLast ? 0 : 1}>
      <Box>
        <StatusBadge status={result.pass ? 'pass' : 'fail'} />
        <Text> </Text>
        <Text>{formatAssertionType(result.assertion)}</Text>
      </Box>
      {result.reason && (
        <Box marginLeft={2}>
          <Text dimColor wrap="wrap">
            {result.reason}
          </Text>
        </Box>
      )}
      {result.score !== undefined && result.score !== 1 && result.score !== 0 && (
        <Box marginLeft={2}>
          <Text dimColor>Score: {(result.score * 100).toFixed(1)}%</Text>
        </Box>
      )}
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

  // Check for componentResults FIRST (multiple assertions)
  // This takes priority because gradingResult may have both pass AND componentResults
  if (gradingResult.componentResults && Array.isArray(gradingResult.componentResults)) {
    const results = gradingResult.componentResults;
    return (
      <Box flexDirection="column">
        {results.map((result: any, idx: number) => (
          <AssertionRow key={idx} result={result} isLast={idx === results.length - 1} />
        ))}
      </Box>
    );
  }

  // If it's a simple pass/fail result (single assertion)
  if (typeof gradingResult.pass === 'boolean') {
    return <AssertionRow result={gradingResult} isLast={true} />;
  }

  // Fallback: show raw JSON
  return (
    <Text wrap="wrap" dimColor>
      {JSON.stringify(gradingResult, null, 2)}
    </Text>
  );
}

/**
 * Props for VarDetailOverlay component.
 */
export interface VarDetailOverlayProps {
  /** Variable name */
  varName: string;
  /** Variable content */
  content: string;
  /** Handler for navigating to adjacent cells */
  onNavigate?: (direction: 'up' | 'down' | 'left' | 'right') => void;
  /** Handler to close the overlay */
  onClose: () => void;
}

/**
 * VarDetailOverlay - Overlay for viewing full variable content with navigation.
 */
export function VarDetailOverlay({
  varName,
  content,
  onNavigate,
  onClose: _onClose,
}: VarDetailOverlayProps) {
  const { width } = useTerminalSize();
  const boxWidth = Math.min(width - 4, 100);

  // Handle keyboard navigation within detail view
  useEffect(() => {
    if (!isRawModeSupported() || !onNavigate) {
      return;
    }

    const handleInput = (data: Buffer) => {
      const key = data.toString();

      // Handle escape sequences for arrow keys
      if (key === '\x1b[A') {
        onNavigate('up');
      } else if (key === '\x1b[B') {
        onNavigate('down');
      } else if (key === '\x1b[C') {
        onNavigate('right');
      } else if (key === '\x1b[D') {
        onNavigate('left');
      } else {
        // Handle vim-style navigation
        const lowerKey = key.toLowerCase();
        switch (lowerKey) {
          case 'k':
            onNavigate('up');
            break;
          case 'j':
            onNavigate('down');
            break;
          case 'l':
            onNavigate('right');
            break;
          case 'h':
            onNavigate('left');
            break;
        }
      }
    };

    process.stdin.on('data', handleInput);
    return () => {
      process.stdin.off('data', handleInput);
    };
  }, [onNavigate]);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      paddingY={1}
      width={boxWidth}
    >
      <Box justifyContent="space-between">
        <Text bold>{varName}</Text>
        <Text dimColor>{onNavigate && '←↑↓→ nav | '}[q] close</Text>
      </Box>
      <Box marginTop={1}>
        <Text wrap="wrap">{content || '(empty)'}</Text>
      </Box>
    </Box>
  );
}

/**
 * Minimal cell detail view (for very narrow terminals).
 */
export function MinimalCellDetail({
  cellData,
  onClose: _onClose,
}: {
  cellData: any;
  onClose: () => void;
}) {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
      <Box justifyContent="space-between">
        <StatusBadge status={cellData.status} />
        <Text dimColor>[q]</Text>
      </Box>
      <Text wrap="wrap">{cellData.content}</Text>
    </Box>
  );
}

export default CellDetailOverlay;
