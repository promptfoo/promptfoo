/**
 * StatusBadge - Displays PASS/FAIL/ERROR status indicator.
 *
 * This component renders a colored badge indicating the test result status.
 * - PASS: Green [PASS]
 * - FAIL: Red [FAIL]
 * - ERROR: Red bold [ERROR]
 */

import { Text } from 'ink';
import React from 'react';
import type { CellStatus, StatusBadgeProps } from './types';

/**
 * Badge configuration for each status type.
 */
const BADGE_CONFIG: Record<
  NonNullable<CellStatus>,
  { text: string; color: string; bold?: boolean }
> = {
  pass: { text: '[PASS]', color: 'green' },
  fail: { text: '[FAIL]', color: 'red' },
  error: { text: '[ERROR]', color: 'red', bold: true },
};

/**
 * StatusBadge component displays a colored status indicator.
 */
export function StatusBadge({ status }: StatusBadgeProps) {
  if (!status) {
    return null;
  }

  const config = BADGE_CONFIG[status];

  return (
    <Text color={config.color} bold={config.bold}>
      {config.text}
    </Text>
  );
}

/**
 * Get the character width of a status badge.
 */
export function getStatusBadgeWidth(status: CellStatus): number {
  if (!status) {
    return 0;
  }
  return BADGE_CONFIG[status].text.length;
}

/**
 * Compact status indicator (single character).
 */
export function StatusIndicator({ status }: StatusBadgeProps) {
  if (!status) {
    return <Text dimColor>-</Text>;
  }

  const indicators: Record<NonNullable<CellStatus>, { char: string; color: string }> = {
    pass: { char: '✓', color: 'green' },
    fail: { char: '✗', color: 'red' },
    error: { char: '!', color: 'red' },
  };

  const { char, color } = indicators[status];

  return (
    <Text color={color} bold={status === 'error'}>
      {char}
    </Text>
  );
}

export default StatusBadge;
