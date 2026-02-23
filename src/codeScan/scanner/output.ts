/**
 * Output Formatting and Display
 *
 * Handles formatting and displaying scan results in various formats (JSON, pretty-print).
 */

import chalk from 'chalk';
import ora from 'ora';
import { TERMINAL_MAX_WIDTH } from '../../constants';
import logger from '../../logger';
import {
  CodeScanSeverity,
  countBySeverity,
  formatSeverity,
  getSeverityRank,
  type ScanResponse,
} from '../../types/codeScan';
import { formatDuration } from '../../util/formatDuration';
import { printBorder } from '../../util/index';

/**
 * Options for output display
 */
export interface OutputOptions {
  json: boolean;
  githubPr?: string;
}

/**
 * Options for spinner creation
 */
export interface SpinnerOptions {
  json: boolean;
  isWebUI: boolean;
  logLevel: string;
}

/**
 * Create spinner if appropriate for the current environment
 *
 * @param options - Options for spinner creation
 * @returns Spinner instance or undefined if spinner should not be shown
 */
export function createSpinner(options: SpinnerOptions): ReturnType<typeof ora> | undefined {
  const showSpinner = !options.isWebUI && !options.json && options.logLevel !== 'debug';

  if (showSpinner) {
    return ora({ text: '', color: 'green' }).start();
  }

  return undefined;
}

/**
 * Display scan results in the appropriate format
 *
 * @param response - Scan response from server
 * @param duration - Duration of scan in milliseconds
 * @param options - Output options
 */
function getReviewText(response: ScanResponse): string | undefined {
  if (response.review) {
    return response.review;
  }
  const noneComment = (response.comments || []).find((c) => c.severity === CodeScanSeverity.NONE);
  return noneComment?.finding;
}

function displayReviewText(reviewText: string): void {
  logger.info('');
  logger.info(reviewText);
  logger.info('');
  printBorder();
}

function displaySingleComment(comment: ScanResponse['comments'][number], isLast: boolean): void {
  const severity = formatSeverity(comment.severity);
  const location = comment.line ? `${comment.file}:${comment.line}` : comment.file || '';

  logger.info(`${severity} ${chalk.gray(location)}`);
  logger.info('');
  logger.info(comment.finding);

  if (comment.fix) {
    logger.info('');
    logger.info(chalk.bold('Suggested Fix:'));
    logger.info(comment.fix);
  }

  if (comment.aiAgentPrompt) {
    logger.info('');
    logger.info(chalk.bold('AI Agent Prompt:'));
    logger.info(comment.aiAgentPrompt);
  }

  if (!isLast) {
    logger.info('');
    logger.info(chalk.gray('─'.repeat(TERMINAL_MAX_WIDTH)));
    logger.info('');
  }
}

function displayDetailedFindings(response: ScanResponse, options: OutputOptions): void {
  const { comments } = response;
  const severityCounts = countBySeverity(comments || []);
  if (severityCounts.total === 0) {
    return;
  }

  const validSeverities: CodeScanSeverity[] = [
    CodeScanSeverity.CRITICAL,
    CodeScanSeverity.HIGH,
    CodeScanSeverity.MEDIUM,
    CodeScanSeverity.LOW,
  ];
  const issuesWithSeverity = (comments || []).filter(
    (c) => c.severity && validSeverities.includes(c.severity),
  );
  const sortedComments = [...issuesWithSeverity].sort((a, b) => {
    const rankA = a.severity ? getSeverityRank(a.severity) : 0;
    const rankB = b.severity ? getSeverityRank(b.severity) : 0;
    return rankB - rankA;
  });

  logger.info('');
  for (let i = 0; i < sortedComments.length; i++) {
    displaySingleComment(sortedComments[i], i === sortedComments.length - 1);
  }
  printBorder();

  if (options.githubPr) {
    logger.info(`» Comments posted to PR: ${chalk.cyan(options.githubPr)}`);
    printBorder();
  }
}

function displayPrettyResults(
  response: ScanResponse,
  duration: number,
  options: OutputOptions,
): void {
  const { comments } = response;
  const severityCounts = countBySeverity(comments || []);

  // Completion message and issue summary
  printBorder();
  logger.info(`${chalk.green('✓')} Scan complete (${formatDuration(duration / 1000)})`);
  if (severityCounts.total > 0) {
    logger.info(
      chalk.yellow(`⚠ Found ${severityCounts.total} issue${severityCounts.total === 1 ? '' : 's'}`),
    );
  }
  printBorder();

  // Review summary - shown even when no issues
  const reviewText = getReviewText(response);
  if (reviewText) {
    displayReviewText(reviewText);
  }

  // Detailed findings (only show issues with valid severity)
  displayDetailedFindings(response, options);
}

export function displayScanResults(
  response: ScanResponse,
  duration: number,
  options: OutputOptions,
): void {
  if (options.json) {
    // Output full scan response to stdout for programmatic consumption
    console.log(JSON.stringify(response, null, 2));
    return;
  }
  displayPrettyResults(response, duration, options);
}
