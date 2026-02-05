/**
 * GitHub Utilities
 *
 * Helper functions for GitHub integration.
 */

import {
  CodeScanSeverity,
  type Comment,
  formatSeverity,
  getSeverityRank,
} from '../../types/codeScan';

import type { ParsedGitHubPR } from '../../types/codeScan';

/**
 * Message prepended to review when no vulnerabilities are found
 */
export const ALL_CLEAR_MESSAGE = '👍 All Clear';

/**
 * Parse GitHub PR string
 *
 * @param prString - GitHub PR string in format: owner/repo#number (e.g., promptfoo/promptfoo#123)
 * @returns Parsed PR object or null if invalid format
 */
export function parseGitHubPr(prString: string): ParsedGitHubPR | null {
  const match = prString.match(/^([^/]+)\/([^#]+)#(\d+)$/);
  if (!match) {
    return null;
  }

  const [, owner, repo, prNumber] = match;
  return {
    owner,
    repo,
    number: parseInt(prNumber, 10),
  };
}

/**
 * Prepare comments and review body for GitHub posting
 *
 * Sorts comments, filters by type, and constructs the review body with
 * "All Clear" message and severity threshold when appropriate.
 *
 * @param comments - Array of comments to prepare
 * @param review - Optional review summary text
 * @param minimumSeverity - Optional minimum severity threshold (e.g., 'medium')
 * @returns Prepared comments and review body ready for GitHub posting
 */
export function prepareComments(
  comments: Comment[],
  review?: string,
  minimumSeverity?: string,
): {
  lineComments: Comment[];
  generalComments: Comment[];
  reviewBody: string;
} {
  // Sort comments by severity (descending: critical > high > medium > low)
  const sortedComments = [...comments].sort((a, b) => {
    const rankA = a.severity ? getSeverityRank(a.severity) : 0;
    const rankB = b.severity ? getSeverityRank(b.severity) : 0;
    return rankB - rankA;
  });

  // Separate line-specific comments from general PR comments
  // Filter out severity='none' comments - they shouldn't be posted separately
  const lineComments = sortedComments.filter((c) => c.file && c.finding);
  const generalComments = sortedComments.filter(
    (c) => !c.file && c.finding && c.severity !== CodeScanSeverity.NONE,
  );

  // Check if we only have "none" severity comments (i.e., no real vulnerabilities)
  const hasOnlyNoneSeverity =
    comments.length > 0 && comments.every((c) => c.severity === CodeScanSeverity.NONE);

  // Construct review body
  let reviewBody = review || '';

  // If no real vulnerabilities, prepend "All Clear" to review
  if (hasOnlyNoneSeverity && reviewBody) {
    reviewBody = `${ALL_CLEAR_MESSAGE}\n\n${reviewBody}`;
  }

  // Append minimum severity threshold if provided
  if (minimumSeverity && reviewBody) {
    const severityFormatted = formatSeverity(minimumSeverity as CodeScanSeverity, 'plain');
    reviewBody += `\n\n<sub>Minimum severity threshold: ${severityFormatted} | To re-scan after changes, comment \`@promptfoo-scanner\`</sub>`;
    reviewBody += `\n<sub>[Learn more](https://www.promptfoo.dev/docs/code-scanning/)</sub>`;
  }

  return {
    lineComments,
    generalComments,
    reviewBody,
  };
}
