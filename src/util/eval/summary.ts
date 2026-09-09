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
  /** HTTP status code if the scan was aborted due to a non-transient target error (401, 403, 404, 501) */
  targetErrorStatus?: number;
}

type TokenUsageBreakdown = Pick<
  TokenUsage,
  'prompt' | 'completion' | 'total' | 'cached' | 'numRequests' | 'completionDetails'
>;

function getTokenUsageTotal(usage: TokenUsageBreakdown | undefined): number {
  return usage?.total ?? (usage?.prompt ?? 0) + (usage?.completion ?? 0);
}

function getCompletionMessage({
  completionType,
  evalId,
  shareableUrl,
  wasAborted,
  writeToDatabase,
  activelySharing,
}: {
  completionType: string;
  evalId: string;
  shareableUrl: string | null;
  wasAborted: boolean;
  writeToDatabase: boolean;
  activelySharing: boolean;
}): string {
  if (wasAborted) {
    const idSuffix = writeToDatabase ? ` (ID: ${chalk.cyan(evalId)})` : '';
    return `${chalk.red('✗')} ${completionType} aborted${idSuffix}`;
  }

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

function getAbortSummaryLines(targetErrorStatus: number | undefined): string[] {
  if (targetErrorStatus == null) {
    return [];
  }

  return [
    '',
    chalk.red.bold('Scan stopped: Target is unavailable and will not recover on retry.'),
    chalk.red(`  Target returned HTTP ${targetErrorStatus}`),
    '',
    chalk.yellow('Possible causes:'),
    chalk.yellow('  • Invalid API key or authentication (401/403)'),
    chalk.yellow('  • Target endpoint does not exist (404)'),
    chalk.yellow('  • Server does not support the request (501)'),
    '',
    chalk.cyan('To fix: Check your target configuration and credentials.'),
  ];
}

function getGuidanceLines({
  writeToDatabase,
  shareableUrl,
  wantsToShare,
  activelySharing,
  hasExplicitDisable,
  cloudEnabled,
}: {
  writeToDatabase: boolean;
  shareableUrl: string | null;
  wantsToShare: boolean;
  activelySharing: boolean;
  hasExplicitDisable: boolean;
  cloudEnabled: boolean;
}): string[] {
  if (!writeToDatabase || shareableUrl || wantsToShare || activelySharing) {
    return [];
  }

  const lines = ['', `» View results: ${chalk.green.bold('promptfoo view')}`];

  if (!hasExplicitDisable) {
    lines.push(
      cloudEnabled
        ? `» Create shareable URL: ${chalk.green.bold('promptfoo share')}`
        : `» Share with your team: ${chalk.green.bold('https://promptfoo.app')}`,
    );
  }

  lines.push(`» Feedback: ${chalk.green.bold('https://promptfoo.dev/feedback')}`);
  return lines;
}

function buildUsageDetails(usage: TokenUsageBreakdown, total: number): string[] {
  const parts: string[] = [];

  if (usage.prompt && usage.prompt > 0) {
    parts.push(`${usage.prompt.toLocaleString()} prompt`);
  }

  if (usage.completion && usage.completion > 0) {
    parts.push(`${usage.completion.toLocaleString()} completion`);
  }

  if (usage.cached && usage.cached > 0) {
    parts.push(
      usage.cached === total && parts.length === 0
        ? 'cached'
        : `${usage.cached.toLocaleString()} cached`,
    );
  }

  if (usage.completionDetails?.reasoning && usage.completionDetails.reasoning > 0) {
    parts.push(`${usage.completionDetails.reasoning.toLocaleString()} reasoning`);
  }

  return parts;
}

function getGradingUsageLine(assertions: TokenUsage['assertions']): string | undefined {
  const total = getTokenUsageTotal(assertions);
  if (!assertions || (total === 0 && (assertions.cached || 0) === 0)) {
    return undefined;
  }

  const details = buildUsageDetails(assertions, total);
  return `  ${chalk.gray('Grading:')} ${chalk.white(total.toLocaleString())} (${details.join(', ')})`;
}

function getTokenUsageLines(
  tokenUsage: TokenUsage,
  isRedteam: boolean,
  tracker: TokenUsageTracker,
): string[] {
  const primaryTokens = getTokenUsageTotal(tokenUsage);
  const gradingUsageLine = getGradingUsageLine(tokenUsage.assertions);
  const hasGradingTokens = gradingUsageLine !== undefined;
  const attackerTokens = getTokenUsageTotal(tokenUsage.attacker);
  const generationTokens = getTokenUsageTotal(tokenUsage.generation);
  const generationRequests = tokenUsage.generation?.numRequests ?? 0;

  if (
    primaryTokens === 0 &&
    !hasGradingTokens &&
    attackerTokens === 0 &&
    generationTokens === 0 &&
    generationRequests === 0
  ) {
    return [];
  }

  const evalTokens = {
    prompt: tokenUsage.prompt || 0,
    completion: tokenUsage.completion || 0,
    total: primaryTokens,
    cached: tokenUsage.cached || 0,
    numRequests: tokenUsage.numRequests || 0,
    completionDetails: tokenUsage.completionDetails || {
      reasoning: 0,
      acceptedPrediction: 0,
      rejectedPrediction: 0,
    },
  };

  const lines = [
    `${chalk.bold('Total Tokens:')} ${chalk.white.bold(
      (
        evalTokens.total +
        attackerTokens +
        getTokenUsageTotal(tokenUsage.assertions) +
        generationTokens
      ).toLocaleString(),
    )}`,
  ];

  if (isRedteam && tokenUsage.numRequests) {
    lines.push(
      `  ${chalk.gray('Probes:')} ${chalk.white(tokenUsage.numRequests.toLocaleString())}`,
    );
  }

  if (evalTokens.total > 0) {
    const evalParts = buildUsageDetails(evalTokens, evalTokens.total);
    const primaryUsageLabel = isRedteam ? 'Target' : 'Provider';
    lines.push(
      `  ${chalk.gray(`${primaryUsageLabel}:`)} ${chalk.white(
        evalTokens.total.toLocaleString(),
      )} (${evalParts.join(', ')})`,
    );
  }

  if (tokenUsage.generation && generationTokens > 0) {
    const generationParts = buildUsageDetails(tokenUsage.generation, generationTokens);
    lines.push(
      `  ${chalk.gray('Generation:')} ${chalk.white(generationTokens.toLocaleString())} (${generationParts.join(', ')})`,
    );
  } else if (generationRequests > 0) {
    const requestLabel = generationRequests === 1 ? 'request' : 'requests';
    lines.push(
      `  ${chalk.gray('Generation:')} token usage unavailable (${generationRequests.toLocaleString()} ${requestLabel})`,
    );
  }

  if (tokenUsage.attacker && attackerTokens > 0) {
    const attackerParts = buildUsageDetails(tokenUsage.attacker, attackerTokens);
    lines.push(
      `  ${chalk.gray('Attacker:')} ${chalk.white(attackerTokens.toLocaleString())} (${attackerParts.join(', ')})`,
    );
  }

  if (gradingUsageLine) {
    lines.push(gradingUsageLine);
  }

  const incurredUsage = tokenUsage.incurredTokenUsage;
  if (incurredUsage) {
    const incurredTokens =
      getTokenUsageTotal(incurredUsage) +
      getTokenUsageTotal(incurredUsage.attacker) +
      getTokenUsageTotal(incurredUsage.assertions) +
      getTokenUsageTotal(incurredUsage.generation);
    const evaluationTokens =
      evalTokens.total +
      attackerTokens +
      getTokenUsageTotal(tokenUsage.assertions) +
      generationTokens;
    const cachedSavings = Math.max(evaluationTokens - incurredTokens, 0);

    if (cachedSavings > 0) {
      lines.push(
        `${chalk.bold('Incurred Tokens:')} ${chalk.white.bold(incurredTokens.toLocaleString())}`,
        `  ${chalk.gray('Cached Savings:')} ${chalk.white(cachedSavings.toLocaleString())}`,
        `  ${chalk.gray('Actual Target Requests:')} ${chalk.white((incurredUsage.numRequests ?? 0).toLocaleString())}`,
      );
    }
  }

  lines.push(...getProviderUsageLines(tracker));
  return lines;
}

function getProviderUsageLines(tracker: TokenUsageTracker): string[] {
  const providerIds = tracker.getProviderIds();
  if (providerIds.length <= 1) {
    return [];
  }

  const sortedProviders = providerIds
    .map((id) => ({ id, usage: tracker.getProviderUsage(id) }))
    .filter((p): p is { id: string; usage: NonNullable<typeof p.usage> } => p.usage != null)
    .sort((a, b) => (b.usage.total || 0) - (a.usage.total || 0));

  const lines = ['', chalk.bold('Providers:')];

  for (const { id, usage } of sortedProviders) {
    if ((usage.total || 0) === 0 && (usage.prompt || 0) + (usage.completion || 0) === 0) {
      continue;
    }

    const displayTotal = usage.total || (usage.prompt || 0) + (usage.completion || 0);
    const displayId = id.includes(' (') ? id.substring(0, id.indexOf(' (')) : id;
    const details = buildUsageDetails(usage, displayTotal);
    const requestInfo = `${usage.numRequests || 0} requests`;
    const separator = details.length > 0 ? '; ' : '';

    lines.push(
      `  ${chalk.gray(`${displayId}:`)} ${chalk.white(
        displayTotal.toLocaleString(),
      )} (${requestInfo}${separator}${details.join(', ')})`,
    );
  }

  return lines;
}

function formatResultPercentage(count: number, totalTests: number): string {
  const percentage = totalTests === 0 ? 0 : (count / totalTests) * 100;
  return percentage === 0 || percentage === 100
    ? `${percentage.toFixed(0)}%`
    : `${percentage.toFixed(2)}%`;
}

function formatResultLine(
  count: number,
  label: string,
  icon: string | undefined,
  iconColor: (text: string) => string,
  totalTests: number,
): string {
  const iconPart = icon ? `${iconColor(icon)} ` : '';
  return `  ${iconPart}${chalk.white.bold(count.toLocaleString())} ${chalk.white(
    label,
  )} ${chalk.gray(`(${formatResultPercentage(count, totalTests)})`)}`;
}

function getResultsLines({
  successes,
  failures,
  errors,
  duration,
  maxConcurrency,
}: Pick<EvalSummaryParams, 'successes' | 'failures' | 'errors' | 'duration' | 'maxConcurrency'>) {
  const totalTests = successes + failures + errors;
  const errorLabel = errors === 1 ? 'error' : 'errors';

  return [
    '',
    chalk.bold('Results:'),
    formatResultLine(successes, 'passed', successes > 0 ? '✓' : undefined, chalk.green, totalTests),
    formatResultLine(failures, 'failed', failures > 0 ? '✗' : undefined, chalk.red, totalTests),
    formatResultLine(errors, errorLabel, errors > 0 ? '✗' : undefined, chalk.red, totalTests),
    chalk.gray(`Duration: ${formatDuration(duration)} (concurrency: ${maxConcurrency})`),
    '',
  ];
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
  const completionType = params.isRedteam ? 'Red team' : 'Eval';
  return [
    getCompletionMessage({
      completionType,
      evalId: params.evalId,
      shareableUrl: params.shareableUrl,
      wasAborted: params.targetErrorStatus != null,
      writeToDatabase: params.writeToDatabase,
      activelySharing: params.activelySharing ?? false,
    }),
    ...getAbortSummaryLines(params.targetErrorStatus),
    ...getGuidanceLines({
      writeToDatabase: params.writeToDatabase,
      shareableUrl: params.shareableUrl,
      wantsToShare: params.wantsToShare,
      activelySharing: params.activelySharing ?? false,
      hasExplicitDisable: params.hasExplicitDisable,
      cloudEnabled: params.cloudEnabled,
    }),
    '',
    ...getTokenUsageLines(params.tokenUsage, params.isRedteam, params.tracker),
    ...getResultsLines(params),
  ];
}
