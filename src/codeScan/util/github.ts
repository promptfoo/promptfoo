/**
 * GitHub Utilities
 *
 * Helper functions for GitHub integration.
 */

import type { ParsedGitHubPR } from '../../types/codeScan';

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
