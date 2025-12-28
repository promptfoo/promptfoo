/**
 * Progress bar component for tracking task completion.
 */

import { useMemo } from 'react';

import { Box, Text, useStdout } from 'ink';

export interface ProgressBarProps {
  /** Current progress value */
  value: number;
  /** Maximum value (default: 100) */
  max?: number;
  /** Width of the progress bar in characters (default: auto based on terminal width) */
  width?: number;
  /** Show percentage text */
  showPercentage?: boolean;
  /** Show value/max text (e.g., "50/100") */
  showCount?: boolean;
  /** Label to display before the bar */
  label?: string;
  /** Color of the filled portion */
  color?: 'green' | 'yellow' | 'blue' | 'cyan' | 'magenta' | 'red' | 'white';
  /** Character for filled portion (default: '█') */
  filledChar?: string;
  /** Character for empty portion (default: '░') */
  emptyChar?: string;
}

/**
 * Progress bar component.
 *
 * @example
 * ```tsx
 * <ProgressBar value={50} max={100} label="Progress" showPercentage />
 * // Output: Progress [████████████░░░░░░░░░░░░] 50%
 * ```
 */
export function ProgressBar({
  value,
  max = 100,
  width: customWidth,
  showPercentage = true,
  showCount = false,
  label,
  color = 'green',
  filledChar = '█',
  emptyChar = '░',
}: ProgressBarProps) {
  const { stdout } = useStdout();
  const terminalWidth = stdout?.columns || 80;

  // Calculate bar width accounting for label, percentage, and padding
  const barWidth = useMemo(() => {
    if (customWidth) {
      return customWidth;
    }

    let reservedSpace = 2; // For brackets []
    if (label) {
      reservedSpace += label.length + 1; // label + space
    }
    if (showPercentage) {
      reservedSpace += 5; // " 100%"
    }
    if (showCount) {
      reservedSpace += String(max).length * 2 + 3; // " 100/100"
    }

    // Use at most 60% of terminal width for the bar itself
    const maxBarWidth = Math.floor(terminalWidth * 0.6);
    return Math.min(40, Math.max(10, terminalWidth - reservedSpace - 2), maxBarWidth);
  }, [customWidth, terminalWidth, label, showPercentage, showCount, max]);

  // Calculate filled/empty portions
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const filledWidth = Math.round((percentage / 100) * barWidth);
  const emptyWidth = barWidth - filledWidth;

  const filledPart = filledChar.repeat(filledWidth);
  const emptyPart = emptyChar.repeat(emptyWidth);

  return (
    <Box>
      {label && <Text>{label} </Text>}
      <Text>[</Text>
      <Text color={color}>{filledPart}</Text>
      <Text dimColor>{emptyPart}</Text>
      <Text>]</Text>
      {showPercentage && <Text> {Math.round(percentage)}%</Text>}
      {showCount && (
        <Text dimColor>
          {' '}
          {value}/{max}
        </Text>
      )}
    </Box>
  );
}

/**
 * Compact inline progress indicator.
 */
export interface InlineProgressProps {
  value: number;
  max: number;
  /** Format: 'fraction' (50/100), 'percentage' (50%), 'both' (50/100 (50%)) */
  format?: 'fraction' | 'percentage' | 'both';
  /** Color based on progress */
  colorByProgress?: boolean;
}

export function InlineProgress({
  value,
  max,
  format = 'fraction',
  colorByProgress = false,
}: InlineProgressProps) {
  const percentage = Math.round((value / max) * 100);

  // Determine color based on progress
  let color: 'red' | 'yellow' | 'green' | undefined;
  if (colorByProgress) {
    if (percentage < 33) {
      color = 'red';
    } else if (percentage < 66) {
      color = 'yellow';
    } else {
      color = 'green';
    }
  }

  let text: string;
  switch (format) {
    case 'percentage':
      text = `${percentage}%`;
      break;
    case 'both':
      text = `${value}/${max} (${percentage}%)`;
      break;
    case 'fraction':
    default:
      text = `${value}/${max}`;
      break;
  }

  return <Text color={color}>{text}</Text>;
}
