/**
 * Status message component for displaying alerts and notifications.
 */

import React from 'react';

import { Box, Text } from 'ink';

export type StatusType = 'info' | 'success' | 'warning' | 'error';

export interface StatusMessageProps {
  /** Type of status message */
  type: StatusType;
  /** Message text */
  children: React.ReactNode;
  /** Optional title/label */
  title?: string;
}

const STATUS_CONFIG = {
  info: { icon: 'ℹ', color: 'blue' as const, label: 'Info' },
  success: { icon: '✓', color: 'green' as const, label: 'Success' },
  warning: { icon: '⚠', color: 'yellow' as const, label: 'Warning' },
  error: { icon: '✗', color: 'red' as const, label: 'Error' },
} as const;

/**
 * Status message component.
 *
 * @example
 * ```tsx
 * <StatusMessage type="success">All tests passed!</StatusMessage>
 * <StatusMessage type="error" title="Error">Something went wrong</StatusMessage>
 * ```
 */
export function StatusMessage({ type, children, title }: StatusMessageProps) {
  const config = STATUS_CONFIG[type];
  const displayTitle = title ?? config.label;

  return (
    <Box flexDirection="column">
      <Text color={config.color}>
        {config.icon} <Text bold>{displayTitle}:</Text> {children}
      </Text>
    </Box>
  );
}

/**
 * Simple inline status text.
 */
export interface StatusTextProps {
  type: StatusType;
  children: React.ReactNode;
}

export function StatusText({ type, children }: StatusTextProps) {
  const config = STATUS_CONFIG[type];

  return (
    <Text color={config.color}>
      {config.icon} {children}
    </Text>
  );
}

/**
 * Error display component with optional details.
 */
export interface ErrorDisplayProps {
  /** Error message */
  message: string;
  /** Optional error details/stack */
  details?: string;
  /** Whether to show details */
  showDetails?: boolean;
}

export function ErrorDisplay({ message, details, showDetails = false }: ErrorDisplayProps) {
  return (
    <Box flexDirection="column">
      <StatusMessage type="error">{message}</StatusMessage>
      {showDetails && details && (
        <Box marginLeft={2} marginTop={1}>
          <Text dimColor>{details}</Text>
        </Box>
      )}
    </Box>
  );
}

/**
 * Warning list component.
 */
export interface WarningListProps {
  warnings: string[];
  title?: string;
}

export function WarningList({ warnings, title = 'Warnings' }: WarningListProps) {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column">
      <Text color="yellow" bold>
        ⚠ {title}:
      </Text>
      {warnings.map((warning, index) => (
        <Box key={index} marginLeft={2}>
          <Text color="yellow">• {warning}</Text>
        </Box>
      ))}
    </Box>
  );
}
