/**
 * Header component for the eval screen.
 */

import { Box, Text } from 'ink';
import { useEvalProgress } from '../../contexts/EvalContext';
import { ProgressBar } from '../shared/ProgressBar';
import { Spinner } from '../shared/Spinner';

export interface EvalHeaderProps {
  /** Title to display */
  title?: string;
  /** Whether to show timing information */
  showTiming?: boolean;
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

const PHASE_LABELS: Record<string, string> = {
  initializing: 'Initializing',
  loading: 'Loading configuration',
  evaluating: 'Running evaluations',
  grading: 'Grading results',
  completed: 'Complete',
  error: 'Error',
};

export function EvalHeader({ title = 'Evaluation', showTiming = true }: EvalHeaderProps) {
  const { completed, total, isRunning, isComplete, phase, elapsedMs } = useEvalProgress();

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Title and status */}
      <Box>
        <Text bold>{title}</Text>
        <Text> - </Text>
        {isRunning && <Spinner type="dots" color="cyan" />}
        <Text color={isComplete ? 'green' : 'cyan'}> {PHASE_LABELS[phase] || phase}</Text>
        {showTiming && elapsedMs > 0 && <Text dimColor> ({formatDuration(elapsedMs)})</Text>}
      </Box>

      {/* Progress bar */}
      {total > 0 && (
        <Box marginTop={1}>
          <ProgressBar
            value={completed}
            max={total}
            showPercentage
            showCount
            color={isComplete ? 'green' : 'cyan'}
          />
        </Box>
      )}
    </Box>
  );
}

/**
 * Compact header for narrow terminals.
 */
export function EvalHeaderCompact({ title = 'Eval' }: { title?: string }) {
  const { completed, total, percent, isRunning, phase } = useEvalProgress();

  return (
    <Box>
      {isRunning && <Spinner type="dots" color="cyan" />}
      <Text bold>{title}</Text>
      <Text>: </Text>
      <Text color={phase === 'completed' ? 'green' : 'cyan'}>
        {completed}/{total} ({percent}%)
      </Text>
    </Box>
  );
}
