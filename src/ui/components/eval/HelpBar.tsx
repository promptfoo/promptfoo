/**
 * HelpBar component for displaying keyboard shortcuts.
 *
 * This component shows contextually relevant keyboard shortcuts
 * at the bottom of the evaluation screen.
 */

import { Box, Text } from 'ink';

export interface HelpBarProps {
  /** Whether the evaluation is complete */
  isComplete?: boolean;
  /** Whether verbose mode is enabled */
  showVerbose?: boolean;
  /** Whether there are errors to display */
  hasErrors?: boolean;
  /** Whether error details are shown */
  showErrorDetails?: boolean;
  /** Number of log warnings to display in hint */
  logWarningCount?: number;
  /** Custom shortcuts to display */
  shortcuts?: Array<{ key: string; label: string; active?: boolean }>;
}

/**
 * A single shortcut item.
 */
function ShortcutItem({
  shortcutKey,
  label,
  active = false,
}: {
  shortcutKey: string;
  label: string;
  active?: boolean;
}) {
  return (
    <Box>
      <Text color="cyan">{shortcutKey}</Text>
      <Text dimColor> {label}</Text>
      {active && <Text color="green"> *</Text>}
    </Box>
  );
}

/**
 * Separator between shortcuts.
 */
function Separator() {
  return <Text dimColor> · </Text>;
}

/**
 * HelpBar displays available keyboard shortcuts.
 */
export function HelpBar({
  isComplete = false,
  showVerbose = false,
  hasErrors = false,
  showErrorDetails = false,
  logWarningCount = 0,
  shortcuts,
}: HelpBarProps) {
  // If custom shortcuts are provided, use those
  if (shortcuts && shortcuts.length > 0) {
    return (
      <Box marginTop={1}>
        {shortcuts.map((shortcut, index) => (
          <Box key={shortcut.key}>
            {index > 0 && <Separator />}
            <ShortcutItem
              shortcutKey={shortcut.key}
              label={shortcut.label}
              active={shortcut.active}
            />
          </Box>
        ))}
      </Box>
    );
  }

  // Build verbose label with warning count hint
  let verboseLabel = 'verbose';
  if (!showVerbose && logWarningCount > 0) {
    verboseLabel = `verbose (${logWarningCount} warning${logWarningCount > 1 ? 's' : ''})`;
  }

  // Default shortcuts based on state
  return (
    <Box marginTop={1}>
      <ShortcutItem shortcutKey="q" label="quit" />
      <Separator />
      <ShortcutItem shortcutKey="v" label={verboseLabel} active={showVerbose} />
      {hasErrors && (
        <>
          <Separator />
          <ShortcutItem shortcutKey="e" label="errors" active={showErrorDetails} />
        </>
      )}
      <Separator />
      <ShortcutItem shortcutKey="?" label="help" />
      {isComplete && (
        <>
          <Separator />
          <Text dimColor>Evaluation complete</Text>
        </>
      )}
    </Box>
  );
}
