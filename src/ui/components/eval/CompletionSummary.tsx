/**
 * CompletionSummary - Displays comprehensive evaluation summary upon completion.
 *
 * This component shows token usage summary, provider breakdown, grading tokens,
 * duration, success/failure counts, and pass rate - matching the CLI output format.
 */

import { Box, Text } from 'ink';
import { useEvalState } from '../../contexts/EvalContext';
import { formatDuration } from '../../utils/format';

/**
 * Horizontal divider line.
 */
function Divider({ width = 70 }: { width?: number }) {
  return <Text color="gray">{'='.repeat(width)}</Text>;
}

/**
 * Format a number with locale-specific separators.
 */
function formatNumber(n: number): string {
  return n.toLocaleString();
}

/**
 * Token breakdown row with label and value.
 */
function TokenRow({
  label,
  value,
  indent = 2,
  color = 'white',
  dimLabel = true,
}: {
  label: string;
  value: number;
  indent?: number;
  color?: string;
  dimLabel?: boolean;
}) {
  const paddingLeft = ' '.repeat(indent);
  return (
    <Box>
      <Text>
        {paddingLeft}
        {dimLabel ? <Text dimColor>{label}:</Text> : <Text>{label}:</Text>}{' '}
        <Text color={color}>{formatNumber(value)}</Text>
      </Text>
    </Box>
  );
}

/**
 * Provider token breakdown with detailed info.
 */
interface ProviderTokenBreakdownProps {
  providerId: string;
  tokens: {
    prompt: number;
    completion: number;
    cached: number;
    total: number;
    reasoning: number;
  };
  requests: number;
}

function ProviderTokenBreakdown({ providerId, tokens, requests }: ProviderTokenBreakdownProps) {
  // Extract display name (remove class name in parentheses if present)
  const displayId = providerId.includes(' (')
    ? providerId.substring(0, providerId.indexOf(' ('))
    : providerId;

  const displayTotal = tokens.total || tokens.prompt + tokens.completion;

  // Build detail parts
  const details: string[] = [];
  if (tokens.prompt) {
    details.push(`${formatNumber(tokens.prompt)} prompt`);
  }
  if (tokens.completion) {
    details.push(`${formatNumber(tokens.completion)} completion`);
  }
  if (tokens.cached) {
    details.push(`${formatNumber(tokens.cached)} cached`);
  }
  if (tokens.reasoning) {
    details.push(`${formatNumber(tokens.reasoning)} reasoning`);
  }

  return (
    <Box flexDirection="column" marginLeft={2}>
      <Text>
        <Text dimColor>{displayId}:</Text> <Text>{formatNumber(displayTotal)}</Text>
        <Text dimColor> ({requests} requests)</Text>
      </Text>
      {details.length > 0 && (
        <Box marginLeft={2}>
          <Text dimColor>({details.join(', ')})</Text>
        </Box>
      )}
    </Box>
  );
}

/**
 * Token usage summary section.
 */
function TokenUsageSummary() {
  const {
    totalTokens,
    promptTokens,
    completionTokens,
    cachedTokens,
    reasoningTokens,
    gradingTokens,
    providers,
    providerOrder,
  } = useEvalState();

  // Check if we have any token usage
  const hasEvalTokens = totalTokens > 0 || promptTokens + completionTokens > 0;
  const hasGradingTokens = gradingTokens.total > 0;
  const hasMultipleProviders = providerOrder.length > 1;

  if (!hasEvalTokens && !hasGradingTokens) {
    return null;
  }

  // Calculate grand total
  const grandTotal = totalTokens + gradingTokens.total;

  return (
    <Box flexDirection="column">
      <Text bold>Token Usage Summary:</Text>

      {/* Evaluation tokens */}
      {hasEvalTokens && (
        <Box flexDirection="column" marginTop={1} marginLeft={1}>
          <Text bold color="yellow">
            Evaluation:
          </Text>
          <TokenRow label="Total" value={totalTokens || promptTokens + completionTokens} />
          <TokenRow label="Prompt" value={promptTokens} />
          <TokenRow label="Completion" value={completionTokens} />
          {cachedTokens > 0 && <TokenRow label="Cached" value={cachedTokens} color="green" />}
          {reasoningTokens > 0 && <TokenRow label="Reasoning" value={reasoningTokens} />}
        </Box>
      )}

      {/* Provider breakdown */}
      {hasMultipleProviders && (
        <Box flexDirection="column" marginTop={1} marginLeft={1}>
          <Text bold color="cyan">
            Provider Breakdown:
          </Text>
          {providerOrder
            .map((id) => providers[id])
            .filter((p) => p && (p.tokens.total > 0 || p.tokens.prompt + p.tokens.completion > 0))
            .sort((a, b) => (b.tokens.total || 0) - (a.tokens.total || 0))
            .map((provider) => (
              <ProviderTokenBreakdown
                key={provider.id}
                providerId={provider.id}
                tokens={provider.tokens}
                requests={provider.requests.total}
              />
            ))}
        </Box>
      )}

      {/* Grading tokens */}
      {hasGradingTokens && (
        <Box flexDirection="column" marginTop={1} marginLeft={1}>
          <Text bold color="magenta">
            Grading:
          </Text>
          <TokenRow label="Total" value={gradingTokens.total} />
          {gradingTokens.prompt > 0 && <TokenRow label="Prompt" value={gradingTokens.prompt} />}
          {gradingTokens.completion > 0 && (
            <TokenRow label="Completion" value={gradingTokens.completion} />
          )}
          {gradingTokens.cached > 0 && (
            <TokenRow label="Cached" value={gradingTokens.cached} color="green" />
          )}
          {gradingTokens.reasoning > 0 && (
            <TokenRow label="Reasoning" value={gradingTokens.reasoning} />
          )}
        </Box>
      )}

      {/* Grand total */}
      <Box marginTop={1} marginLeft={1}>
        <Text bold color="blue">
          Grand Total:{' '}
        </Text>
        <Text bold>{formatNumber(grandTotal)} tokens</Text>
      </Box>
    </Box>
  );
}

/**
 * Results statistics section.
 */
function ResultsStats() {
  const { passedTests, failedTests, errorCount, elapsedMs, concurrency } = useEvalState();

  const totalTests = passedTests + failedTests;
  const passRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;

  return (
    <Box flexDirection="column">
      <Text dimColor>
        Duration: {formatDuration(elapsedMs)} (concurrency: {concurrency})
      </Text>
      <Text bold color="green">
        Successes: {passedTests}
      </Text>
      <Text bold color={failedTests > 0 ? 'red' : 'white'}>
        Failures: {failedTests}
      </Text>
      {!Number.isNaN(errorCount) && (
        <Text bold color={errorCount > 0 ? 'red' : 'white'}>
          Errors: {errorCount}
        </Text>
      )}
      {!Number.isNaN(passRate) && (
        <Text bold color="blue">
          Pass Rate: {passRate.toFixed(2)}%
        </Text>
      )}
    </Box>
  );
}

/**
 * Main CompletionSummary component.
 */
export interface CompletionSummaryProps {
  /** Optional share URL for the evaluation (overrides state) */
  shareUrl?: string;
  /** Whether to show the token usage section */
  showTokenUsage?: boolean;
}

export function CompletionSummary({
  shareUrl: propShareUrl,
  showTokenUsage = true,
}: CompletionSummaryProps) {
  const { phase, shareUrl: stateShareUrl } = useEvalState();
  const shareUrl = propShareUrl || stateShareUrl;

  // Only render when evaluation is complete
  if (phase !== 'completed') {
    return null;
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Divider />

      {/* Completion header */}
      <Box>
        <Text color="green">{'✔'} </Text>
        <Text>Evaluation complete</Text>
        {shareUrl && (
          <>
            <Text>: </Text>
            <Text color="cyan">{shareUrl}</Text>
          </>
        )}
      </Box>

      <Divider />

      {/* Token usage summary */}
      {showTokenUsage && (
        <>
          <TokenUsageSummary />
          <Divider />
        </>
      )}

      {/* Results statistics */}
      <ResultsStats />

      <Divider />
    </Box>
  );
}

export default CompletionSummary;
