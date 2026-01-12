/**
 * NavigationBar - Footer component showing available actions.
 *
 * Displays contextual keyboard shortcuts for the current wizard step.
 */

import { Box, Text } from 'ink';

export interface NavigationAction {
  key: string;
  label: string;
  disabled?: boolean;
}

export interface NavigationBarProps {
  /** Whether back navigation is available */
  canGoBack?: boolean;
  /** Whether to show next/confirm action */
  showNext?: boolean;
  /** Custom label for next action */
  nextLabel?: string;
  /** Whether next is disabled */
  nextDisabled?: boolean;
  /** Additional custom actions */
  actions?: NavigationAction[];
  /** Whether to show help hint */
  showHelp?: boolean;
}

/**
 * NavigationBar component for wizard step navigation.
 */
export function NavigationBar({
  canGoBack = true,
  showNext = true,
  nextLabel = 'Next',
  nextDisabled = false,
  actions = [],
  showHelp = true,
}: NavigationBarProps) {
  const allActions: NavigationAction[] = [];

  // Add back action
  if (canGoBack) {
    allActions.push({ key: 'Esc', label: 'Back' });
  }

  // Add custom actions
  allActions.push(...actions);

  // Add next action
  if (showNext) {
    allActions.push({ key: 'Enter', label: nextLabel, disabled: nextDisabled });
  }

  // Add help action
  if (showHelp) {
    allActions.push({ key: '?', label: 'Help' });
  }

  return (
    <Box marginTop={1} flexDirection="row" gap={2}>
      {allActions.map((action, index) => (
        <Box key={action.key} flexDirection="row">
          <Text dimColor={action.disabled}>[</Text>
          <Text color={action.disabled ? undefined : 'yellow'} dimColor={action.disabled}>
            {action.key}
          </Text>
          <Text dimColor={action.disabled}>] {action.label}</Text>
          {index < allActions.length - 1 && <Text dimColor> </Text>}
        </Box>
      ))}
    </Box>
  );
}

/**
 * Simple key hint component.
 */
export function KeyHint({ keyName, label }: { keyName: string; label: string }) {
  return (
    <Box flexDirection="row">
      <Text dimColor>[</Text>
      <Text color="yellow">{keyName}</Text>
      <Text dimColor>] {label}</Text>
    </Box>
  );
}
