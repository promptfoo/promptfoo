/**
 * Component for displaying evaluation errors.
 */

import { Box, Text } from 'ink';
import { useEvalState, type EvalError } from '../../contexts/EvalContext';

export interface ErrorItemProps {
  error: EvalError;
  showDetails?: boolean;
}

function ErrorItem({ error, showDetails = false }: ErrorItemProps) {
  const { provider, prompt, message, vars } = error;

  // Truncate long values
  const maxMessageLength = 80;
  const displayMessage =
    message.length > maxMessageLength ? message.slice(0, maxMessageLength - 3) + '...' : message;

  const maxPromptLength = 30;
  const displayPrompt =
    prompt.length > maxPromptLength ? prompt.slice(0, maxPromptLength - 3) + '...' : prompt;

  return (
    <Box flexDirection="column" marginLeft={2}>
      <Box>
        <Text color="red">✗ </Text>
        <Text>{displayMessage}</Text>
      </Box>
      <Box marginLeft={2}>
        <Text dimColor>
          Provider: {provider} | Prompt: "{displayPrompt}"
        </Text>
      </Box>
      {showDetails && vars && Object.keys(vars).length > 0 && (
        <Box marginLeft={2}>
          <Text dimColor>Vars: {JSON.stringify(vars).slice(0, 60)}...</Text>
        </Box>
      )}
    </Box>
  );
}

export interface ErrorSummaryProps {
  /** Maximum number of errors to display */
  maxErrors?: number;
  /** Whether to show detailed error information */
  showDetails?: boolean;
  /** Title for the error section */
  title?: string;
}

export function ErrorSummary({
  maxErrors = 5,
  showDetails = false,
  title = 'Errors',
}: ErrorSummaryProps) {
  const { errors, errorCount, showErrorDetails } = useEvalState();

  if (errors.length === 0) {
    return null;
  }

  const visibleErrors = errors.slice(-maxErrors);
  const hiddenCount = errorCount - visibleErrors.length;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color="red" bold>
          {title} ({errorCount}):
        </Text>
      </Box>
      {visibleErrors.map((error) => (
        <ErrorItem key={error.id} error={error} showDetails={showDetails || showErrorDetails} />
      ))}
      {hiddenCount > 0 && (
        <Box marginLeft={2}>
          <Text dimColor>... and {hiddenCount} more errors</Text>
        </Box>
      )}
    </Box>
  );
}

/**
 * Compact error count display.
 */
export function ErrorCount() {
  const { errorCount } = useEvalState();

  if (errorCount === 0) {
    return null;
  }

  return (
    <Text color="red">
      {errorCount} error{errorCount > 1 ? 's' : ''}
    </Text>
  );
}

/**
 * Inline error indicator with count.
 */
export function ErrorIndicator() {
  const { errorCount, errors } = useEvalState();

  if (errorCount === 0) {
    return <Text color="green">No errors</Text>;
  }

  const latestError = errors[errors.length - 1];
  const shortMessage = latestError?.message?.slice(0, 40) || 'Unknown error';

  return (
    <Box>
      <Text color="red">
        ✗ {errorCount} error{errorCount > 1 ? 's' : ''}
      </Text>
      {latestError && (
        <Text dimColor>
          {' '}
          - Latest: {shortMessage}
          {latestError.message.length > 40 ? '...' : ''}
        </Text>
      )}
    </Box>
  );
}
