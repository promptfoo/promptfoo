import chalk from 'chalk';
import { formatDuration } from '../../util/formatDuration';

import type { TokenUsage } from '../../types/index';
import type { TokenUsageTracker } from '../../util/tokenUsage';

/**
 * Parameters for generating an evaluation summary report.
 *
 * Contains all the data needed to generate a formatted CLI summary including
 * completion status, token usage, test results, and guidance messages.
 */
export interface EvalSummaryParams {
  /** Unique identifier for the evaluation */
  evalId: string;
  /** Whether this is a red team evaluation */
  isRedteam: boolean;
  /** Whether results should be written to database */
  writeToDatabase: boolean;
  /** URL for sharing the evaluation results (if created) */
  shareableUrl: string | null;
  /** Whether the user requested sharing */
  wantsToShare: boolean;
  /** Whether sharing was explicitly disabled via --no-share flag */
  hasExplicitDisable: boolean;
  /** Whether cloud features are enabled */
  cloudEnabled: boolean;
  /** Whether sharing is actively in progress (for async background sharing) */
  activelySharing?: boolean;
  /** Token usage statistics for the evaluation */
  tokenUsage: TokenUsage;
  /** Number of successful test cases */
  successes: number;
  /** Number of failed test cases */
  failures: number;
  /** Number of test cases with errors */
  errors: number;
  /** Duration of the evaluation in seconds */
  duration: number;
  /** Maximum concurrent API calls during evaluation */
  maxConcurrency: number;
  /** Token usage tracker for provider-level breakdown */
  tracker: TokenUsageTracker;
}

function buildCompletionMessage(
  completionType: string,
  writeToDatabase: boolean,
  shareableUrl: string | null,
  activelySharing: boolean,
  evalId: string,
): string {
  if (writeToDatabase && shareableUrl) {
    return `${chalk.green('✓')} ${completionType} complete: ${shareableUrl}`;
  }
  if (writeToDatabase && activelySharing) {
    return `${chalk.green('✓')} ${completionType} complete`;
  }
  if (writeToDatabase) {
    return `${chalk.green('✓')} ${completionType} complete (ID: ${chalk.cyan(evalId)})`;
  }
  return `${chalk.green('✓')} ${completionType} complete`;
}

function buildGuidanceLines(
  writeToDatabase: boolean,
  shareableUrl: string | null,
  wantsToShare: boolean,
  activelySharing: boolean,
  hasExplicitDisable: boolean,
  cloudEnabled: boolean,
): string[] {
  if (!writeToDatabase || shareableUrl || wantsToShare || activelySharing) {
    return [];
  }

  const lines: string[] = [''];
  lines.push(`» View results: ${chalk.green.bold('promptfoo view')}`);

  if (!hasExplicitDisable) {
    if (cloudEnabled) {
      lines.push(`» Create shareable URL: ${chalk.green.bold('promptfoo share')}`);
    } else {
      lines.push(`» Share with your team: ${chalk.green.bold('https://promptfoo.app')}`);
    }
  }

  lines.push(`» Feedback: ${chalk.green.bold('https://promptfoo.dev/feedback')}`);
  return lines;
}

function buildTokenBreakdownParts(tokens: {
  prompt: number;
  completion: number;
  cached: number;
  total: number;
  reasoning?: number;
}): string[] {
  const parts: string[] = [];
  if (tokens.prompt > 0) {
    parts.push(`${tokens.prompt.toLocaleString()} prompt`);
  }
  if (tokens.completion > 0) {
    parts.push(`${tokens.completion.toLocaleString()} completion`);
  }
  if (tokens.cached > 0) {
    if (tokens.cached === tokens.total && parts.length === 0) {
      parts.push('cached');
    } else {
      parts.push(`${tokens.cached.toLocaleString()} cached`);
    }
  }
  if (tokens.reasoning && tokens.reasoning > 0) {
    parts.push(`${tokens.reasoning.toLocaleString()} reasoning`);
  }
  return parts;
}

function buildEvalTokenLines(tokenUsage: TokenUsage, isRedteam: boolean): string[] {
  const combinedTotal = (tokenUsage.prompt || 0) + (tokenUsage.completion || 0);
  const evalTokens = {
    prompt: tokenUsage.prompt || 0,
    completion: tokenUsage.completion || 0,
    total: tokenUsage.total || combinedTotal,
    cached: tokenUsage.cached || 0,
    reasoning: tokenUsage.completionDetails?.reasoning,
  };

  const grandTotal = evalTokens.total + (tokenUsage.assertions?.total || 0);
  const lines: string[] = [];
  lines.push(`${chalk.bold('Total Tokens:')} ${chalk.white.bold(grandTotal.toLocaleString())}`);

  if (isRedteam && tokenUsage.numRequests) {
    lines.push(
      `  ${chalk.gray('Probes:')} ${chalk.white(tokenUsage.numRequests.toLocaleString())}`,
    );
  }

  if (evalTokens.total > 0) {
    const evalParts = buildTokenBreakdownParts(evalTokens);
    lines.push(
      `  ${chalk.gray('Eval:')} ${chalk.white(evalTokens.total.toLocaleString())} (${evalParts.join(', ')})`,
    );
  }

  return lines;
}

function buildGradingTokenLines(tokenUsage: TokenUsage): string[] {
  const assertions = tokenUsage.assertions;
  if (!assertions || !assertions.total || assertions.total <= 0) {
    return [];
  }

  const gradingTokens = {
    prompt: assertions.prompt || 0,
    completion: assertions.completion || 0,
    cached: assertions.cached || 0,
    total: assertions.total,
    reasoning: assertions.completionDetails?.reasoning,
  };

  const gradingParts = buildTokenBreakdownParts(gradingTokens);
  return [
    `  ${chalk.gray('Grading:')} ${chalk.white(assertions.total.toLocaleString())} (${gradingParts.join(', ')})`,
  ];
}

function buildProviderLines(tracker: TokenUsageTracker): string[] {
  const providerIds = tracker.getProviderIds();
  if (providerIds.length <= 1) {
    return [];
  }

  const lines: string[] = ['', chalk.bold('Providers:')];

  const sortedProviders = providerIds
    .map((id) => ({ id, usage: tracker.getProviderUsage(id) }))
    .filter((p): p is { id: string; usage: NonNullable<typeof p.usage> } => p.usage != null)
    .sort((a, b) => (b.usage.total || 0) - (a.usage.total || 0));

  for (const { id, usage } of sortedProviders) {
    const displayTotal = usage.total || (usage.prompt || 0) + (usage.completion || 0);
    if (displayTotal === 0 && (usage.prompt || 0) + (usage.completion || 0) === 0) {
      continue;
    }
    const displayId = id.includes(' (') ? id.substring(0, id.indexOf(' (')) : id;

    const providerTokens = {
      prompt: usage.prompt || 0,
      completion: usage.completion || 0,
      cached: usage.cached || 0,
      total: displayTotal,
      reasoning: usage.completionDetails?.reasoning,
    };
    const details = buildTokenBreakdownParts(providerTokens);

    const requestInfo = `${usage.numRequests || 0} requests`;
    const separator = details.length > 0 ? '; ' : '';
    const breakdown = ` (${requestInfo}${separator}${details.join(', ')})`;
    lines.push(
      `  ${chalk.gray(displayId + ':')} ${chalk.white(displayTotal.toLocaleString())}${breakdown}`,
    );
  }

  return lines;
}

function buildTokenUsageLines(
  tokenUsage: TokenUsage,
  isRedteam: boolean,
  tracker: TokenUsageTracker,
): string[] {
  const hasEvalTokens =
    (tokenUsage.total || 0) > 0 || (tokenUsage.prompt || 0) + (tokenUsage.completion || 0) > 0;
  const hasGradingTokens = tokenUsage.assertions && (tokenUsage.assertions.total || 0) > 0;

  if (!hasEvalTokens && !hasGradingTokens) {
    return [];
  }

  return [
    ...buildEvalTokenLines(tokenUsage, isRedteam),
    ...buildGradingTokenLines(tokenUsage),
    ...buildProviderLines(tracker),
  ];
}

function formatPassRate(passRate: number): string {
  const passRateFormatted =
    passRate === 0 || passRate === 100 ? `${passRate.toFixed(0)}%` : `${passRate.toFixed(2)}%`;

  if (passRate >= 100) {
    return chalk.green.bold(passRateFormatted);
  }
  if (passRate >= 80) {
    return chalk.yellow.bold(passRateFormatted);
  }
  return chalk.red.bold(passRateFormatted);
}

function buildResultsLines(
  successes: number,
  failures: number,
  errors: number,
  duration: number,
  maxConcurrency: number,
): string[] {
  const totalTests = successes + failures + errors;
  const passRate = (successes / totalTests) * 100;

  const passedPart =
    successes > 0
      ? `${chalk.green('✓')} ${chalk.green.bold(successes.toLocaleString())} passed`
      : `${chalk.gray.bold(successes.toLocaleString())} passed`;
  const failedPart =
    failures > 0
      ? `${chalk.red('✗')} ${chalk.red.bold(failures.toLocaleString())} failed`
      : `${chalk.gray.bold(failures.toLocaleString())} failed`;
  const errorLabel = errors === 1 ? 'error' : 'errors';
  const errorsPart =
    errors > 0
      ? `${chalk.red('✗')} ${chalk.red.bold(errors.toLocaleString())} ${errorLabel}`
      : `${chalk.gray.bold(errors.toLocaleString())} ${errorLabel}`;

  const resultsLine = `${passedPart}, ${failedPart}, ${errorsPart}`;
  const durationDisplay = formatDuration(duration);

  const lines: string[] = [];
  if (Number.isNaN(passRate)) {
    lines.push(`${chalk.bold('Results:')} ${resultsLine}`);
  } else {
    const passRateDisplay = formatPassRate(passRate);
    lines.push(`${chalk.bold('Results:')} ${resultsLine} (${passRateDisplay})`);
  }
  lines.push(chalk.gray(`Duration: ${durationDisplay} (concurrency: ${maxConcurrency})`));
  lines.push('');

  return lines;
}

/**
 * Generate formatted evaluation summary output for CLI display.
 *
 * Creates a structured summary report with:
 * - Completion message with eval ID or shareable URL
 * - Guidance on viewing/sharing results (when applicable)
 * - Token usage breakdown (eval, grading, and per-provider)
 * - Test results and pass rate
 * - Performance metrics (duration, concurrency)
 *
 * The output is formatted with ANSI colors via chalk for terminal display.
 *
 * @param params - Configuration and data for generating the summary
 * @returns Array of formatted strings ready to be logged to console
 *
 * @example
 * ```typescript
 * const lines = generateEvalSummary({
 *   evalId: 'eval-123',
 *   isRedteam: false,
 *   writeToDatabase: true,
 *   shareableUrl: null,
 *   wantsToShare: false,
 *   hasExplicitDisable: false,
 *   cloudEnabled: false,
 *   tokenUsage: { total: 1000, prompt: 400, completion: 600 },
 *   successes: 10,
 *   failures: 0,
 *   errors: 0,
 *   duration: 5000,
 *   maxConcurrency: 4,
 *   tracker: TokenUsageTracker.getInstance(),
 * });
 *
 * lines.forEach(line => logger.info(line));
 * ```
 */
export function generateEvalSummary(params: EvalSummaryParams): string[] {
  const {
    evalId,
    isRedteam,
    writeToDatabase,
    shareableUrl,
    wantsToShare,
    hasExplicitDisable,
    cloudEnabled,
    activelySharing = false,
    tokenUsage,
    successes,
    failures,
    errors,
    duration,
    maxConcurrency,
    tracker,
  } = params;

  const completionType = isRedteam ? 'Red team' : 'Eval';

  const completionMessage = buildCompletionMessage(
    completionType,
    writeToDatabase,
    shareableUrl,
    activelySharing,
    evalId,
  );

  const guidanceLines = buildGuidanceLines(
    writeToDatabase,
    shareableUrl,
    wantsToShare,
    activelySharing,
    hasExplicitDisable,
    cloudEnabled,
  );

  const tokenUsageLines = buildTokenUsageLines(tokenUsage, isRedteam, tracker);

  const resultsLines = buildResultsLines(successes, failures, errors, duration, maxConcurrency);

  return [completionMessage, ...guidanceLines, '', ...tokenUsageLines, '', ...resultsLines];
}
