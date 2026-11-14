/**
 * Git Metadata Extraction
 *
 * Extracts metadata about the current branch and commits.
 */

import { GitMetadataError } from '../../types/codeScan';
import { runGit } from './command';

import type { GitMetadata } from '../../types/codeScan';

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
  try {
    const resolveRef = (ref: string) =>
      runGit(repoPath, ['rev-parse', '--verify', '--end-of-options', ref]);
    const [baseSha, compareSha] = await Promise.all([
      resolveRef(baseBranch),
      resolveRef(compareRef),
    ]);
    const stdout = await runGit(repoPath, [
      'log',
      '--no-show-signature',
      '-z',
      '--format=%H%x00%s%x00%aN%x00%aI',
      `${baseSha}...${compareSha}`,
      '--',
    ]);
    // Each record contains four NUL-delimited fields, including the mailmapped author.
    const fields = stdout.split('\0');
    const commitMessages: string[] = [];
    for (let i = 0; i + 3 < fields.length; i += 4) {
      commitMessages.push(`${fields[i].slice(0, 7)}: ${fields[i + 1]}`);
    }

    return {
      branch: compareRef,
      baseBranch,
      baseRef: baseBranch,
      baseSha,
      compareRef,
      compareSha,
      commitMessages,
      author: fields[2] || 'Unknown',
      timestamp: fields[3] || new Date().toISOString(),
    };
  } catch (error) {
    throw new GitMetadataError(
      `Failed to extract git metadata: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
