/**
 * Git Metadata Extraction
 *
 * Extracts metadata about the current branch and commits.
 */

import simpleGit, { type SimpleGit, type LogResult } from 'simple-git';
import type { GitMetadata } from '../../../types/codeScan';

export class GitMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitMetadataError';
  }
}

/**
 * Extract git metadata for the comparison
 * @param repoPath Path to the git repository
 * @param baseBranch Base branch or commit
 * @param compareRef Compare branch or commit
 * @returns Git metadata object
 */
export async function extractMetadata(
  repoPath: string,
  baseBranch: string,
  compareRef: string,
): Promise<GitMetadata> {
  const git = simpleGit(repoPath);

  try {
    // Get commits between base and compare ref
    const log: LogResult = await git.log({
      from: baseBranch,
      to: compareRef,
    });

    // Extract commit messages
    const commitMessages = log.all.map((commit) => {
      return `${commit.hash.substring(0, 7)}: ${commit.message}`;
    });

    // Get author from most recent commit
    const author = log.latest?.author_name || 'Unknown';

    // Get timestamp from most recent commit
    const timestamp = log.latest?.date || new Date().toISOString();

    return {
      branch: compareRef,
      baseBranch,
      commitMessages,
      author,
      timestamp,
    };
  } catch (error) {
    throw new GitMetadataError(
      `Failed to extract git metadata: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
