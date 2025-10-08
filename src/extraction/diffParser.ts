import { execSync } from 'child_process';
import * as fs from 'fs';
import logger from '../logger';
import type { ApiProvider } from '../types';
import { extractPromptsFromContent, isSupportedFile } from './promptExtractor';
import type { DiffChange } from './types';

interface ParsedDiffFile {
  from: string;
  to: string;
  chunks: DiffChunk[];
}

interface DiffChunk {
  addedLines: string[];
  removedLines: string[];
  context: string;
}

/**
 * Extract prompts from a git diff
 */
export async function extractPromptsFromDiff(
  diffSource: string,
  provider: ApiProvider,
  minConfidence = 0.6,
): Promise<DiffChange[]> {
  logger.info(`[diffParser] Extracting prompts from diff: ${diffSource}`);

  let diffContent: string;

  // Check if diffSource is a commit range or a file
  if (diffSource.includes('..') || diffSource === 'HEAD' || diffSource.startsWith('HEAD~')) {
    // It's a commit range - get the diff from git
    diffContent = await getDiffFromGit(diffSource);
  } else {
    // It's a file path - read the file
    try {
      diffContent = await fs.promises.readFile(diffSource, 'utf-8');
    } catch (error) {
      throw new Error(
        `Failed to read diff file: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  // Parse the diff
  const files = parseDiff(diffContent);

  logger.debug(`[diffParser] Parsed ${files.length} files from diff`);

  // Extract prompts from added/modified lines
  const changes: DiffChange[] = [];

  for (const file of files) {
    // Skip unsupported files
    if (!isSupportedFile(file.to)) {
      logger.debug(`[diffParser] Skipping unsupported file: ${file.to}`);
      continue;
    }

    // Extract prompts from added lines
    for (const chunk of file.chunks) {
      if (chunk.addedLines.length === 0) {
        continue;
      }

      const addedContent = chunk.addedLines.join('\n');
      const prompts = await extractPromptsFromContent(
        addedContent,
        file.to,
        provider,
        minConfidence,
      );

      for (const prompt of prompts) {
        changes.push({
          type: 'added',
          prompt,
          afterContent: prompt.content,
        });
      }

      // Check for modifications (removed + added)
      if (chunk.removedLines.length > 0) {
        const removedContent = chunk.removedLines.join('\n');
        const removedPrompts = await extractPromptsFromContent(
          removedContent,
          file.to,
          provider,
          minConfidence,
        );

        // Match removed prompts with added prompts to detect modifications
        for (const removedPrompt of removedPrompts) {
          const matchingAdded = prompts.find(
            (p) => p.location.line === removedPrompt.location.line,
          );

          if (matchingAdded) {
            // Found a modification
            const existingChange = changes.find((c) => c.prompt === matchingAdded);
            if (existingChange) {
              existingChange.type = 'modified';
              existingChange.beforeContent = removedPrompt.content;
            }
          }
        }
      }
    }
  }

  logger.info(`[diffParser] Extracted ${changes.length} prompt changes from diff`);

  return changes;
}

/**
 * Get diff from git for a commit range
 */
async function getDiffFromGit(commitRange: string): Promise<string> {
  logger.debug(`[diffParser] Getting diff from git: ${commitRange}`);

  try {
    // Check if we're in a git repository
    execSync('git rev-parse --git-dir', { encoding: 'utf-8', stdio: 'pipe' });
  } catch (_error) {
    throw new Error('Not in a git repository');
  }

  try {
    let command: string;

    if (commitRange === 'HEAD') {
      // Compare working directory with HEAD
      command = 'git diff HEAD';
    } else if (commitRange.startsWith('HEAD~')) {
      // Compare HEAD with previous commits
      command = `git diff ${commitRange}`;
    } else if (commitRange.includes('..')) {
      // Commit range
      command = `git diff ${commitRange}`;
    } else {
      // Assume it's a single commit
      command = `git diff ${commitRange}^..${commitRange}`;
    }

    const diff = execSync(command, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });

    if (!diff.trim()) {
      logger.warn(`[diffParser] No changes found in ${commitRange}`);
    }

    return diff;
  } catch (error) {
    throw new Error(
      `Failed to get diff from git: ${error instanceof Error ? error.message : error}`,
    );
  }
}

/**
 * Parse unified diff format
 */
function parseDiff(diffContent: string): ParsedDiffFile[] {
  const files: ParsedDiffFile[] = [];
  const lines = diffContent.split('\n');

  let currentFile: ParsedDiffFile | null = null;
  let currentChunk: DiffChunk | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // File header: diff --git a/file b/file
    if (line.startsWith('diff --git')) {
      // Save previous file
      if (currentFile && currentChunk) {
        currentFile.chunks.push(currentChunk);
      }
      if (currentFile) {
        files.push(currentFile);
      }

      // Parse file paths
      const match = line.match(/diff --git a\/(.*?) b\/(.*)/);
      if (match) {
        currentFile = {
          from: match[1],
          to: match[2],
          chunks: [],
        };
        currentChunk = null;
      }
    }
    // Old file: --- a/file
    else if (line.startsWith('---')) {
      const match = line.match(/^--- a\/(.*)/);
      if (match && currentFile) {
        currentFile.from = match[1];
      }
    }
    // New file: +++ b/file
    else if (line.startsWith('+++')) {
      const match = line.match(/^\+\+\+ b\/(.*)/);
      if (match && currentFile) {
        currentFile.to = match[1];
      }
    }
    // Chunk header: @@ -1,4 +1,5 @@
    else if (line.startsWith('@@')) {
      // Save previous chunk
      if (currentChunk && currentFile) {
        currentFile.chunks.push(currentChunk);
      }

      currentChunk = {
        addedLines: [],
        removedLines: [],
        context: line,
      };
    }
    // Added line
    else if (line.startsWith('+') && !line.startsWith('+++')) {
      if (currentChunk) {
        currentChunk.addedLines.push(line.substring(1));
      }
    }
    // Removed line
    else if (line.startsWith('-') && !line.startsWith('---')) {
      if (currentChunk) {
        currentChunk.removedLines.push(line.substring(1));
      }
    }
    // Context line (starts with space)
    // Skip for now, we only care about changes
  }

  // Save last file and chunk
  if (currentFile && currentChunk) {
    currentFile.chunks.push(currentChunk);
  }
  if (currentFile) {
    files.push(currentFile);
  }

  return files;
}

/**
 * Get diff for staged changes
 */
export async function extractPromptsFromStagedChanges(
  provider: ApiProvider,
  minConfidence = 0.6,
): Promise<DiffChange[]> {
  logger.info(`[diffParser] Extracting prompts from staged changes`);

  try {
    const diffContent = execSync('git diff --cached', {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });

    if (!diffContent.trim()) {
      logger.warn(`[diffParser] No staged changes found`);
      return [];
    }

    const files = parseDiff(diffContent);
    const changes: DiffChange[] = [];

    for (const file of files) {
      if (!isSupportedFile(file.to)) {
        continue;
      }

      for (const chunk of file.chunks) {
        if (chunk.addedLines.length === 0) {
          continue;
        }

        const addedContent = chunk.addedLines.join('\n');
        const prompts = await extractPromptsFromContent(
          addedContent,
          file.to,
          provider,
          minConfidence,
        );

        for (const prompt of prompts) {
          changes.push({
            type: 'added',
            prompt,
            afterContent: prompt.content,
          });
        }
      }
    }

    return changes;
  } catch (error) {
    throw new Error(
      `Failed to extract from staged changes: ${error instanceof Error ? error.message : error}`,
    );
  }
}
