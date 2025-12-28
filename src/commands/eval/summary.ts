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

  const lines: string[] = [];
  const completionType = isRedteam ? 'Red team' : 'Eval';

  // Completion message
  // When activelySharing, don't show eval ID since URL (which contains the ID) will appear right after
  const completionMessage =
    writeToDatabase && shareableUrl
      ? `${chalk.green('✓')} ${completionType} complete: ${shareableUrl}`
      : writeToDatabase && activelySharing
        ? `${chalk.green('✓')} ${completionType} complete`
        : writeToDatabase
          ? `${chalk.green('✓')} ${completionType} complete (ID: ${chalk.cyan(evalId)})`
          : `${chalk.green('✓')} ${completionType} complete`;

  lines.push(completionMessage);

  // Guidance section (only when writing to DB, no shareable URL, not wanting to share, and not actively sharing)
  // When wantsToShare is true, guidance is handled by notCloudEnabledShareInstructions() in eval.ts
  // When activelySharing is true, share URL will be shown after summary via ora spinner
  if (writeToDatabase && !shareableUrl && !wantsToShare && !activelySharing) {
    lines.push('');
    lines.push(`» View results: ${chalk.green.bold('promptfoo view')}`);

    if (!hasExplicitDisable) {
      if (cloudEnabled) {
        lines.push(`» Create shareable URL: ${chalk.green.bold('promptfoo share')}`);
      } else {
        lines.push(`» Share with your team: ${chalk.green.bold('https://promptfoo.app')}`);
      }
    }

    lines.push(`» Feedback: ${chalk.green.bold('https://promptfoo.dev/feedback')}`);
  }

  lines.push('');

  // Token usage section
  const hasEvalTokens =
    (tokenUsage.total || 0) > 0 || (tokenUsage.prompt || 0) + (tokenUsage.completion || 0) > 0;
  const hasGradingTokens = tokenUsage.assertions && (tokenUsage.assertions.total || 0) > 0;

  if (hasEvalTokens || hasGradingTokens) {
    const combinedTotal = (tokenUsage.prompt || 0) + (tokenUsage.completion || 0);
    const evalTokens = {
      prompt: tokenUsage.prompt || 0,
      completion: tokenUsage.completion || 0,
      total: tokenUsage.total || combinedTotal,
      cached: tokenUsage.cached || 0,
      completionDetails: tokenUsage.completionDetails || {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
      },
    };

    const grandTotal = evalTokens.total + (tokenUsage.assertions?.total || 0);
    lines.push(`${chalk.bold('Total Tokens:')} ${chalk.white.bold(grandTotal.toLocaleString())}`);

    // Show probe count for redteam
    if (isRedteam && tokenUsage.numRequests) {
      lines.push(
        `  ${chalk.gray('Probes:')} ${chalk.white(tokenUsage.numRequests.toLocaleString())}`,
      );
    }

    // Build eval breakdown - only show if there are eval tokens
    if (evalTokens.total > 0) {
      const evalParts = [];
      if (evalTokens.prompt > 0) {
        evalParts.push(`${evalTokens.prompt.toLocaleString()} prompt`);
      }
      if (evalTokens.completion > 0) {
        evalParts.push(`${evalTokens.completion.toLocaleString()} completion`);
      }
      if (evalTokens.cached > 0) {
        // If 100% cached, just say "cached" instead of repeating the number
        if (evalTokens.cached === evalTokens.total && evalParts.length === 0) {
          evalParts.push('cached');
        } else {
          evalParts.push(`${evalTokens.cached.toLocaleString()} cached`);
        }
      }
      if (evalTokens.completionDetails?.reasoning && evalTokens.completionDetails.reasoning > 0) {
        evalParts.push(`${evalTokens.completionDetails.reasoning.toLocaleString()} reasoning`);
      }
      lines.push(
        `  ${chalk.gray('Eval:')} ${chalk.white(evalTokens.total.toLocaleString())} (${evalParts.join(', ')})`,
      );
    }

    // Grading breakdown (if present)
    if (tokenUsage.assertions && tokenUsage.assertions.total && tokenUsage.assertions.total > 0) {
      const gradingParts = [];
      if (tokenUsage.assertions.prompt && tokenUsage.assertions.prompt > 0) {
        gradingParts.push(`${tokenUsage.assertions.prompt.toLocaleString()} prompt`);
      }
      if (tokenUsage.assertions.completion && tokenUsage.assertions.completion > 0) {
        gradingParts.push(`${tokenUsage.assertions.completion.toLocaleString()} completion`);
      }
      if (tokenUsage.assertions.cached && tokenUsage.assertions.cached > 0) {
        // Simplify 100% cached
        if (
          tokenUsage.assertions.cached === tokenUsage.assertions.total &&
          gradingParts.length === 0
        ) {
          gradingParts.push('cached');
        } else {
          gradingParts.push(`${tokenUsage.assertions.cached.toLocaleString()} cached`);
        }
      }
      if (
        tokenUsage.assertions.completionDetails?.reasoning &&
        tokenUsage.assertions.completionDetails.reasoning > 0
      ) {
        gradingParts.push(
          `${tokenUsage.assertions.completionDetails.reasoning.toLocaleString()} reasoning`,
        );
      }
      lines.push(
        `  ${chalk.gray('Grading:')} ${chalk.white(tokenUsage.assertions.total.toLocaleString())} (${gradingParts.join(', ')})`,
      );
    }

    // Provider breakdown (if multiple providers)
    const providerIds = tracker.getProviderIds();
    if (providerIds.length > 1) {
      lines.push('');
      lines.push(chalk.bold('Providers:'));

      // Sort providers by total token usage (descending), filtering out any with undefined usage
      const sortedProviders = providerIds
        .map((id) => ({ id, usage: tracker.getProviderUsage(id) }))
        .filter((p): p is { id: string; usage: NonNullable<typeof p.usage> } => p.usage != null)
        .sort((a, b) => (b.usage.total || 0) - (a.usage.total || 0));

      for (const { id, usage } of sortedProviders) {
        if ((usage.total || 0) > 0 || (usage.prompt || 0) + (usage.completion || 0) > 0) {
          const displayTotal = usage.total || (usage.prompt || 0) + (usage.completion || 0);
          // Extract just the provider ID part (remove class name in parentheses)
          const displayId = id.includes(' (') ? id.substring(0, id.indexOf(' (')) : id;

          // Build breakdown details - only show non-zero values, simplify 100% cached
          const details = [];
          if (usage.prompt && usage.prompt > 0) {
            details.push(`${usage.prompt.toLocaleString()} prompt`);
          }
          if (usage.completion && usage.completion > 0) {
            details.push(`${usage.completion.toLocaleString()} completion`);
          }
          if (usage.cached && usage.cached > 0) {
            // Simplify 100% cached
            if (usage.cached === displayTotal && details.length === 0) {
              details.push('cached');
            } else {
              details.push(`${usage.cached.toLocaleString()} cached`);
            }
          }
          if (usage.completionDetails?.reasoning && usage.completionDetails.reasoning > 0) {
            details.push(`${usage.completionDetails.reasoning.toLocaleString()} reasoning`);
          }

          // Always show request count - 0 requests means 100% cached, which is valuable info
          const requestInfo = `${usage.numRequests || 0} requests`;
          const separator = details.length > 0 ? '; ' : '';
          const breakdown = ` (${requestInfo}${separator}${details.join(', ')})`;
          lines.push(
            `  ${chalk.gray(displayId + ':')} ${chalk.white(displayTotal.toLocaleString())}${breakdown}`,
          );
        }
      }
    }
  }

  // Add spacing between provider breakdown and results
  lines.push('');

  // Results section
  const totalTests = successes + failures + errors;
  const passRate = (successes / totalTests) * 100;

  // Determine pass rate color and precision
  let passRateDisplay;
  if (!Number.isNaN(passRate)) {
    // Use smart precision: whole numbers for 0% and 100%, otherwise 2 decimals
    const passRateFormatted =
      passRate === 0 || passRate === 100 ? `${passRate.toFixed(0)}%` : `${passRate.toFixed(2)}%`;

    if (passRate >= 100) {
      passRateDisplay = chalk.green.bold(passRateFormatted);
    } else if (passRate >= 80) {
      passRateDisplay = chalk.yellow.bold(passRateFormatted);
    } else {
      passRateDisplay = chalk.red.bold(passRateFormatted);
    }
  }

  // Results line - always show detailed breakdown with bold numbers
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
  if (Number.isNaN(passRate)) {
    lines.push(`${chalk.bold('Results:')} ${resultsLine}`);
  } else {
    lines.push(`${chalk.bold('Results:')} ${resultsLine} (${passRateDisplay})`);
  }

  const durationDisplay = formatDuration(duration);
  lines.push(chalk.gray(`Duration: ${durationDisplay} (concurrency: ${maxConcurrency})`));
  lines.push('');

  return lines;
}
