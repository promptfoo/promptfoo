#!/usr/bin/env node
/**
 * Validates CHANGELOG.md entries for PR requirements:
 * - All entries must have PR numbers (#1234)
 * - No commit hashes used instead of PR numbers
 * - All entries must be in Unreleased section
 *
 * Used by GitHub Actions workflow for changelog validation
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether validation passed
 * @property {string} [error] - Error type if validation failed
 * @property {string} [message] - Human-readable error message
 * @property {string[]} [entries] - Problematic entries
 */

/**
 * Check if entries are missing PR numbers
 * @param {string[]} entries - Array of changelog entry lines
 * @returns {string[]} Entries missing PR numbers
 */
function findEntriesMissingPrNumber(entries) {
  const prNumberPattern = /\(#\d+\)/;
  return entries.filter((entry) => !prNumberPattern.test(entry));
}

/**
 * Check if entries use commit hashes instead of PR numbers
 * @param {string[]} entries - Array of changelog entry lines
 * @returns {string[]} Entries with commit hashes
 */
function findEntriesWithCommitHash(entries) {
  // Match (abc1234) pattern - a hash in parentheses without # prefix
  const commitHashPattern = /\([a-f0-9]{7,40}\)/;
  // Valid PR number pattern
  const prNumberPattern = /\(#\d+\)/;

  return entries.filter((entry) => {
    const hasCommitHash = commitHashPattern.test(entry);
    if (!hasCommitHash) {
      return false;
    }

    // If entry has a valid PR number, check if the hash pattern is separate from it
    // e.g., "feature (abc1234) (#1234)" has both - that's still wrong
    // Remove valid PR references and check if commit hash pattern still exists
    const withoutPrRefs = entry.replace(prNumberPattern, '');
    return commitHashPattern.test(withoutPrRefs);
  });
}

/**
 * Parse git diff to extract added changelog entries
 * @param {string} diff - Git diff output
 * @returns {string[]} Added entry lines (without leading +)
 */
function parseAddedEntries(diff) {
  const lines = diff.split('\n');
  const entries = [];

  for (const line of lines) {
    // Match lines that start with +- (added entry lines)
    if (line.match(/^\+- /)) {
      entries.push(line.substring(1)); // Remove leading +
    }
  }

  return entries;
}

/**
 * Find line number where Unreleased section ends
 * @param {string} changelogContent - Full changelog content
 * @returns {number} Line number of first versioned section header
 */
function findUnreleasedEnd(changelogContent) {
  const lines = changelogContent.split('\n');
  const versionPattern = /^## \[\d+\.\d+\.\d+\]/;

  for (let i = 0; i < lines.length; i++) {
    if (versionPattern.test(lines[i])) {
      return i + 1; // Convert to 1-based line number
    }
  }

  return 999999; // No versioned sections yet
}

/**
 * Parse diff hunks to find entries added in versioned sections
 * @param {string} diff - Git diff output
 * @param {number} unreleasedEnd - Line number where versioned sections begin
 * @returns {Array<{line: number, content: string}>} Entries in versioned sections
 */
function findEntriesInVersionedSections(diff, unreleasedEnd) {
  const lines = diff.split('\n');
  const entriesInVersioned = [];
  let currentLine = 0;

  for (const line of lines) {
    // Parse hunk header: @@ -old_start,old_count +new_start,new_count @@
    const hunkMatch = line.match(/^@@ .* \+(\d+)/);
    if (hunkMatch) {
      currentLine = parseInt(hunkMatch[1], 10) - 1;
      continue;
    }

    // Skip removed lines
    if (line.startsWith('-')) {
      continue;
    }

    // Track added lines
    if (line.startsWith('+')) {
      currentLine++;
      // Check if this is a content line (starts with +- )
      if (line.match(/^\+- /) && currentLine >= unreleasedEnd) {
        entriesInVersioned.push({
          line: currentLine,
          content: line.substring(1), // Remove leading +
        });
      }
      continue;
    }

    // Context lines
    currentLine++;
  }

  return entriesInVersioned;
}

/**
 * Validate changelog entries in a git diff
 * @param {Object} options - Validation options
 * @param {string} options.diff - Git diff of CHANGELOG.md
 * @param {string} options.changelogContent - Current changelog file content
 * @param {string} options.branchName - Current branch name
 * @param {number} options.prNumber - PR number for error messages
 * @returns {ValidationResult} Validation result
 */
function validateChangelogDiff({ diff, changelogContent, branchName, prNumber }) {
  // Skip validation for version bump PRs
  if (branchName && branchName.startsWith('chore/bump-version-')) {
    return { valid: true };
  }

  const addedEntries = parseAddedEntries(diff);

  // No entries to validate
  if (addedEntries.length === 0) {
    return { valid: true };
  }

  // Rule 1: Check for PR number requirement
  const missingPrNumber = findEntriesMissingPrNumber(addedEntries);
  if (missingPrNumber.length > 0) {
    return {
      valid: false,
      error: 'missing_pr_number',
      message: `Changelog entry missing PR number

Every changelog entry must include a PR number in (#1234) format.

Expected format: - feat(scope): description (#${prNumber || '1234'})

Entries missing PR numbers:`,
      entries: missingPrNumber,
    };
  }

  // Rule 2: Check for commit hashes instead of PR numbers
  const withCommitHash = findEntriesWithCommitHash(addedEntries);
  if (withCommitHash.length > 0) {
    return {
      valid: false,
      error: 'commit_hash_instead_of_pr',
      message: `Commit hash detected instead of PR number

Use PR numbers (#1234) instead of commit hashes (abc1234).

Entries with commit hashes:`,
      entries: withCommitHash,
    };
  }

  // Rule 3: Check entries are in Unreleased section
  const unreleasedEnd = findUnreleasedEnd(changelogContent);
  const entriesInVersioned = findEntriesInVersionedSections(diff, unreleasedEnd);

  if (entriesInVersioned.length > 0) {
    return {
      valid: false,
      error: 'entries_in_versioned_section',
      message: `Changelog entries must be in the Unreleased section

The following entries were added to versioned sections:`,
      entries: entriesInVersioned.map((e) => `Line ${e.line}: ${e.content}`),
      footer: `
Add your entries under '## [Unreleased]', not in versioned sections.
Versioned sections are only updated during release.`,
    };
  }

  return { valid: true };
}

/**
 * Run validation from command line
 */
function main() {
  const baseRef = process.env.BASE_REF || 'main';
  const prNumber = process.env.PR_NUMBER || '';
  const branchName = process.env.BRANCH_NAME || '';

  try {
    // Fetch base branch
    execSync(`git fetch origin "${baseRef}"`, { stdio: 'pipe' });

    // Check if CHANGELOG.md was modified
    const modifiedFiles = execSync(`git diff --name-only origin/${baseRef}...HEAD`, {
      encoding: 'utf8',
    });

    const changelogModified = modifiedFiles.split('\n').includes('CHANGELOG.md');

    if (!changelogModified) {
      // Check for bypass labels
      const hasNoChangelogLabel = process.env.HAS_NO_CHANGELOG_LABEL === 'true';
      const hasDependenciesLabel = process.env.HAS_DEPENDENCIES_LABEL === 'true';

      if (hasNoChangelogLabel) {
        console.log("PR has 'no-changelog' label - bypassing check");
        process.exit(0);
      }

      if (hasDependenciesLabel) {
        console.log("PR has 'dependencies' label - bypassing check");
        process.exit(0);
      }

      console.log('Changelog update required');
      console.log('');
      console.log(
        "PRs that modify source code must update CHANGELOG.md under the 'Unreleased' section.",
      );
      console.log('');
      console.log('This ensures complete traceability of all changes to the codebase.');
      console.log('');
      console.log('To bypass this check, add one of these labels:');
      console.log("  - 'no-changelog' (exceptional cases only)");
      console.log("  - 'dependencies' (automated dependency updates)");
      process.exit(1);
    }

    console.log('CHANGELOG.md has been updated');

    // Get diff and changelog content
    const diff = execSync(`git diff origin/${baseRef}...HEAD -- CHANGELOG.md`, {
      encoding: 'utf8',
    });

    const changelogPath = path.join(process.cwd(), 'CHANGELOG.md');
    const changelogContent = fs.readFileSync(changelogPath, 'utf8');

    // Validate
    const result = validateChangelogDiff({
      diff,
      changelogContent,
      branchName,
      prNumber,
    });

    if (!result.valid) {
      console.log(result.message);
      if (result.entries) {
        result.entries.forEach((entry) => console.log(`  ${entry}`));
      }
      if (result.footer) {
        console.log(result.footer);
      }
      process.exit(1);
    }

    console.log('Changelog validation passed');
    process.exit(0);
  } catch (error) {
    console.error('Error during changelog validation:', error.message);
    process.exit(1);
  }
}

// Export for testing
module.exports = {
  findEntriesMissingPrNumber,
  findEntriesWithCommitHash,
  parseAddedEntries,
  findUnreleasedEnd,
  findEntriesInVersionedSections,
  validateChangelogDiff,
};

// Run if called directly
if (require.main === module) {
  main();
}
