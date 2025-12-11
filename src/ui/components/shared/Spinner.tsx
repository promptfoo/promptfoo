/**
 * Spinner component for loading states.
 */

import { Text } from 'ink';
import { useSpinnerFrame, type SpinnerType } from '../../hooks/useSpinnerFrame';

export interface SpinnerProps {
  /** Text to display next to the spinner */
  text?: string;
  /** Spinner animation type */
  type?: SpinnerType;
  /** Color of the spinner */
  color?: 'green' | 'yellow' | 'blue' | 'cyan' | 'magenta' | 'red' | 'white';
  /** Whether the spinner is active */
  active?: boolean;
}

/**
 * Animated spinner component.
 *
 * @example
 * ```tsx
 * <Spinner text="Loading..." />
 * <Spinner type="dots" color="green" text="Processing" />
 * ```
 */
export function Spinner({ text, type = 'dots', color = 'cyan', active = true }: SpinnerProps) {
  const frame = useSpinnerFrame({ type, active });

  if (!active) {
    return null;
  }

  return (
    <Text>
      <Text color={color}>{frame}</Text>
      {text && <Text> {text}</Text>}
    </Text>
  );
}

/**
 * Spinner with success/failure states.
 */
export interface StatusSpinnerProps extends SpinnerProps {
  /** Current status */
  status: 'loading' | 'success' | 'error' | 'warning';
  /** Text for success state */
  successText?: string;
  /** Text for error state */
  errorText?: string;
}

const STATUS_ICONS = {
  loading: null, // Use spinner
  success: '✓',
  error: '✗',
  warning: '⚠',
} as const;

const STATUS_COLORS = {
  loading: 'cyan',
  success: 'green',
  error: 'red',
  warning: 'yellow',
} as const;

export function StatusSpinner({
  text,
  type = 'dots',
  status,
  successText,
  errorText,
}: StatusSpinnerProps) {
  const frame = useSpinnerFrame({ type, active: status === 'loading' });

  const displayText =
    status === 'success' ? (successText ?? text) : status === 'error' ? (errorText ?? text) : text;

  const icon = status === 'loading' ? frame : STATUS_ICONS[status];
  const color = STATUS_COLORS[status];

  return (
    <Text>
      <Text color={color}>{icon}</Text>
      {displayText && <Text> {displayText}</Text>}
    </Text>
  );
}
