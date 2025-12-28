/**
 * Badge and status indicator components.
 */

import React from 'react';

import { Text } from 'ink';

export type BadgeVariant = 'success' | 'error' | 'warning' | 'info' | 'neutral';

export interface BadgeProps {
  /** Badge text */
  children: React.ReactNode;
  /** Badge variant/color */
  variant?: BadgeVariant;
  /** Whether to use bold text */
  bold?: boolean;
}

const VARIANT_COLORS = {
  success: 'green',
  error: 'red',
  warning: 'yellow',
  info: 'blue',
  neutral: 'gray',
} as const;

/**
 * Colored badge component.
 *
 * @example
 * ```tsx
 * <Badge variant="success">PASS</Badge>
 * <Badge variant="error">FAIL</Badge>
 * ```
 */
export function Badge({ children, variant = 'neutral', bold = true }: BadgeProps) {
  const color = VARIANT_COLORS[variant];

  return (
    <Text color={color} bold={bold}>
      [{children}]
    </Text>
  );
}

/**
 * Pass/fail indicator.
 */
export interface PassFailProps {
  /** Whether the test passed */
  passed: boolean;
  /** Optional custom text */
  passText?: string;
  failText?: string;
}

export function PassFail({ passed, passText = 'PASS', failText = 'FAIL' }: PassFailProps) {
  return <Badge variant={passed ? 'success' : 'error'}>{passed ? passText : failText}</Badge>;
}

/**
 * Score display with color coding.
 */
export interface ScoreProps {
  /** Score value (0-1) */
  value: number;
  /** Whether to show as percentage */
  asPercentage?: boolean;
  /** Threshold for "good" score (default: 0.7) */
  goodThreshold?: number;
  /** Threshold for "warning" score (default: 0.4) */
  warningThreshold?: number;
}

export function Score({
  value,
  asPercentage = true,
  goodThreshold = 0.7,
  warningThreshold = 0.4,
}: ScoreProps) {
  let color: 'green' | 'yellow' | 'red';
  if (value >= goodThreshold) {
    color = 'green';
  } else if (value >= warningThreshold) {
    color = 'yellow';
  } else {
    color = 'red';
  }

  const displayValue = asPercentage ? `${Math.round(value * 100)}%` : value.toFixed(2);

  return <Text color={color}>{displayValue}</Text>;
}

/**
 * Count display with optional label.
 */
export interface CountBadgeProps {
  /** Count value */
  count: number;
  /** Label to display */
  label?: string;
  /** Color */
  color?: 'green' | 'yellow' | 'red' | 'blue' | 'cyan' | 'gray';
}

export function CountBadge({ count, label, color }: CountBadgeProps) {
  return (
    <Text color={color}>
      {label && `${label}: `}
      {count}
    </Text>
  );
}
