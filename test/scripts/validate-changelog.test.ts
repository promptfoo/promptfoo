import { describe, expect, it } from 'vitest';

interface ValidationResult {
  valid: boolean;
  error?: string;
  message?: string;
  entries?: string[];
  footer?: string;
}

const {
  findEntriesMissingPrNumber,
  findEntriesWithCommitHash,
  parseAddedEntries,
  findUnreleasedEnd,
  findEntriesInVersionedSections,
  validateChangelogDiff,
} = require('../../scripts/validate-changelog.cjs') as {
  findEntriesMissingPrNumber: (entries: string[]) => string[];
  findEntriesWithCommitHash: (entries: string[]) => string[];
  parseAddedEntries: (diff: string) => string[];
  findUnreleasedEnd: (changelogContent: string) => number;
  findEntriesInVersionedSections: (
    diff: string,
    unreleasedEnd: number,
  ) => Array<{ line: number; content: string }>;
  validateChangelogDiff: (options: {
    diff: string;
    changelogContent: string;
    branchName: string;
    prNumber: string;
  }) => ValidationResult;
};

describe('validate-changelog', () => {
  describe('findEntriesMissingPrNumber', () => {
    it('should return empty array when all entries have PR numbers', () => {
      const entries = [
        '- feat(cli): add new feature (#1234)',
        '- fix(api): resolve bug (#5678)',
        '- chore: update deps (#9999)',
      ];
      expect(findEntriesMissingPrNumber(entries)).toEqual([]);
    });

    it('should find entries missing PR numbers', () => {
      const entries = [
        '- feat(cli): add new feature (#1234)',
        '- fix(api): resolve bug',
        '- chore: update deps (#9999)',
        '- docs: update readme',
      ];
      expect(findEntriesMissingPrNumber(entries)).toEqual([
        '- fix(api): resolve bug',
        '- docs: update readme',
      ]);
    });

    it('should handle empty array', () => {
      expect(findEntriesMissingPrNumber([])).toEqual([]);
    });

    it('should recognize various PR number formats', () => {
      const entries = ['- feat: feature (#1)', '- fix: fix (#12345)', '- chore: update (#999999)'];
      expect(findEntriesMissingPrNumber(entries)).toEqual([]);
    });

    it('should not be fooled by hash in text without parentheses', () => {
      const entries = ['- feat: implement #1234 feature'];
      expect(findEntriesMissingPrNumber(entries)).toEqual(['- feat: implement #1234 feature']);
    });
  });

  describe('findEntriesWithCommitHash', () => {
    it('should return empty array when no commit hashes present', () => {
      const entries = ['- feat(cli): add new feature (#1234)', '- fix(api): resolve bug (#5678)'];
      expect(findEntriesWithCommitHash(entries)).toEqual([]);
    });

    it('should find entries with commit hashes', () => {
      const entries = [
        '- feat(cli): add new feature (abc1234)',
        '- fix(api): resolve bug (#5678)',
        '- chore: update deps (1234567)',
      ];
      expect(findEntriesWithCommitHash(entries)).toEqual([
        '- feat(cli): add new feature (abc1234)',
        '- chore: update deps (1234567)',
      ]);
    });

    it('should flag entries that have both hash and PR number', () => {
      // Commit hashes should not be used even if PR number is present
      const entries = ['- feat: feature (abc1234) related to (#1234)'];
      expect(findEntriesWithCommitHash(entries)).toEqual([
        '- feat: feature (abc1234) related to (#1234)',
      ]);
    });

    it('should recognize long commit hashes (40 chars)', () => {
      const entries = ['- fix: bug (1234567890abcdef1234567890abcdef12345678)'];
      expect(findEntriesWithCommitHash(entries)).toEqual([
        '- fix: bug (1234567890abcdef1234567890abcdef12345678)',
      ]);
    });

    it('should not flag short hashes (less than 7 chars)', () => {
      const entries = ['- fix: bug (abc123)'];
      expect(findEntriesWithCommitHash(entries)).toEqual([]);
    });
  });

  describe('parseAddedEntries', () => {
    it('should extract added entry lines from diff', () => {
      const diff = `diff --git a/CHANGELOG.md b/CHANGELOG.md
index abc1234..def5678 100644
--- a/CHANGELOG.md
+++ b/CHANGELOG.md
@@ -7,6 +7,8 @@
 ## [Unreleased]

 ### Added
+
+- feat(cli): add new feature (#1234)
+- fix(api): resolve bug (#5678)

 ## [1.0.0] - 2024-01-01`;

      const entries = parseAddedEntries(diff);
      expect(entries).toEqual([
        '- feat(cli): add new feature (#1234)',
        '- fix(api): resolve bug (#5678)',
      ]);
    });

    it('should ignore non-entry added lines', () => {
      const diff = `+### Added
+
+- feat: new feature (#1234)
+Some context line`;

      const entries = parseAddedEntries(diff);
      expect(entries).toEqual(['- feat: new feature (#1234)']);
    });

    it('should handle empty diff', () => {
      expect(parseAddedEntries('')).toEqual([]);
    });

    it('should handle diff with only removals', () => {
      const diff = `--- a/CHANGELOG.md
+++ b/CHANGELOG.md
@@ -10,3 +10,2 @@
-- feat: removed feature (#1234)
 - feat: kept feature (#5678)`;

      expect(parseAddedEntries(diff)).toEqual([]);
    });
  });

  describe('findUnreleasedEnd', () => {
    it('should find line number of first versioned section', () => {
      const content = `# Changelog

## [Unreleased]

### Added

- feat: new feature (#1234)

## [1.0.0] - 2024-01-01

### Added

- feat: released feature (#100)`;

      expect(findUnreleasedEnd(content)).toBe(9);
    });

    it('should return 999999 when no versioned sections exist', () => {
      const content = `# Changelog

## [Unreleased]

### Added

- feat: new feature (#1234)`;

      expect(findUnreleasedEnd(content)).toBe(999999);
    });

    it('should find first versioned section among multiple', () => {
      const content = `# Changelog

## [Unreleased]

## [2.0.0] - 2024-06-01

## [1.0.0] - 2024-01-01`;

      expect(findUnreleasedEnd(content)).toBe(5);
    });
  });

  describe('findEntriesInVersionedSections', () => {
    it('should find entries added after unreleased section', () => {
      const diff = `@@ -1,10 +1,12 @@
 # Changelog

 ## [Unreleased]

 ### Added

 ## [1.0.0] - 2024-01-01

 ### Added
+
+- feat: added to old version (#1234)`;

      const entries = findEntriesInVersionedSections(diff, 7);
      expect(entries).toHaveLength(1);
      expect(entries[0].content).toBe('- feat: added to old version (#1234)');
      expect(entries[0].line).toBeGreaterThanOrEqual(7);
    });

    it('should not flag entries in unreleased section', () => {
      const diff = `@@ -1,6 +1,8 @@
 # Changelog

 ## [Unreleased]

 ### Added
+
+- feat: new feature (#1234)`;

      const entries = findEntriesInVersionedSections(diff, 10);
      expect(entries).toEqual([]);
    });

    it('should handle multiple hunks', () => {
      const diff = `@@ -3,3 +3,4 @@
 ## [Unreleased]
+- feat: in unreleased (#1)

@@ -10,3 +11,4 @@
 ## [1.0.0]
+- feat: in versioned (#2)`;

      const entries = findEntriesInVersionedSections(diff, 8);
      expect(entries).toHaveLength(1);
      expect(entries[0].content).toBe('- feat: in versioned (#2)');
    });
  });

  describe('validateChangelogDiff', () => {
    // Note: changelogContent should reflect the state AFTER the diff is applied
    // (as it would be in the working directory during CI)

    it('should pass validation for correct entries', () => {
      const diff = `@@ -3,4 +3,6 @@
 ## [Unreleased]

 ### Added
+
+- feat: new feature (#1234)`;

      // Changelog content after the diff is applied
      const changelogAfterDiff = `# Changelog

## [Unreleased]

### Added

- feat: new feature (#1234)

## [1.0.0] - 2024-01-01

### Added

- feat: old feature (#100)`;

      const result = validateChangelogDiff({
        diff,
        changelogContent: changelogAfterDiff,
        branchName: 'feat/my-feature',
        prNumber: '1234',
      });

      expect(result.valid).toBe(true);
    });

    it('should skip validation for version bump branches', () => {
      const diff = `+- feat: no pr number`;

      const changelogContent = `# Changelog

## [Unreleased]

### Added

- feat: no pr number

## [1.0.0] - 2024-01-01`;

      const result = validateChangelogDiff({
        diff,
        changelogContent,
        branchName: 'chore/bump-version-12345',
        prNumber: '1234',
      });

      expect(result.valid).toBe(true);
    });

    it('should fail when PR numbers are missing', () => {
      const diff = `@@ -3,4 +3,6 @@
 ## [Unreleased]

 ### Added
+
+- feat: new feature without pr`;

      const changelogContent = `# Changelog

## [Unreleased]

### Added

- feat: new feature without pr

## [1.0.0] - 2024-01-01`;

      const result = validateChangelogDiff({
        diff,
        changelogContent,
        branchName: 'feat/my-feature',
        prNumber: '1234',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe('missing_pr_number');
      expect(result.entries).toContain('- feat: new feature without pr');
    });

    it('should fail when commit hashes are used instead of PR numbers', () => {
      // Entry with a valid PR number AND a commit hash - tests that hashes are detected
      const diff = `@@ -3,4 +3,6 @@
 ## [Unreleased]

 ### Added
+
+- feat: new feature (abc1234)`;

      const changelogContent = `# Changelog

## [Unreleased]

### Added

- feat: new feature (abc1234)

## [1.0.0] - 2024-01-01`;

      const result = validateChangelogDiff({
        diff,
        changelogContent,
        branchName: 'feat/my-feature',
        prNumber: '1234',
      });

      // Note: This fails the "missing PR number" check first, since (abc1234) is not (#1234)
      expect(result.valid).toBe(false);
      expect(result.error).toBe('missing_pr_number');
    });

    it('should detect commit hash when entry also has PR-like text', () => {
      // Entry with text containing # but using commit hash in parentheses
      const diff = `+- feat: fix issue #123 (abc1234)`;

      const changelogContent = `# Changelog

## [Unreleased]

### Added

- feat: fix issue #123 (abc1234)

## [1.0.0] - 2024-01-01`;

      const result = validateChangelogDiff({
        diff,
        changelogContent,
        branchName: 'feat/my-feature',
        prNumber: '1234',
      });

      // This should fail the commit hash check since it has # in text but not (#\d+) format
      expect(result.valid).toBe(false);
      expect(result.error).toBe('missing_pr_number');
    });

    it('should detect commit hash even when valid PR number is present', () => {
      // Entry has valid PR format (#1234) AND a commit hash - should fail
      const diff = `+- feat: new feature (abc1234) (#1234)`;

      const changelogContent = `# Changelog

## [Unreleased]

### Added

- feat: new feature (abc1234) (#1234)

## [1.0.0] - 2024-01-01`;

      const result = validateChangelogDiff({
        diff,
        changelogContent,
        branchName: 'feat/my-feature',
        prNumber: '1234',
      });

      // Should pass PR number check but fail commit hash check
      expect(result.valid).toBe(false);
      expect(result.error).toBe('commit_hash_instead_of_pr');
    });

    it('should fail when entries are in versioned sections', () => {
      const diff = `@@ -8,4 +8,6 @@
 ## [1.0.0] - 2024-01-01

 ### Added
+
+- feat: added to wrong section (#1234)`;

      const changelogContent = `# Changelog

## [Unreleased]

### Added

## [1.0.0] - 2024-01-01

### Added

- feat: added to wrong section (#1234)

- feat: old feature (#100)`;

      const result = validateChangelogDiff({
        diff,
        changelogContent,
        branchName: 'feat/my-feature',
        prNumber: '1234',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe('entries_in_versioned_section');
    });

    it('should pass when no entries are added', () => {
      const diff = `@@ -1,3 +1,3 @@
 # Changelog
-old header
+new header`;

      const changelogContent = `# Changelog
new header

## [Unreleased]

## [1.0.0] - 2024-01-01`;

      const result = validateChangelogDiff({
        diff,
        changelogContent,
        branchName: 'feat/my-feature',
        prNumber: '1234',
      });

      expect(result.valid).toBe(true);
    });

    it('should include PR number in error message', () => {
      const diff = `+- feat: missing pr number`;

      const changelogContent = `# Changelog

## [Unreleased]

### Added

- feat: missing pr number

## [1.0.0] - 2024-01-01`;

      const result = validateChangelogDiff({
        diff,
        changelogContent,
        branchName: 'feat/my-feature',
        prNumber: '5678',
      });

      expect(result.message).toContain('(#5678)');
    });

    it('should validate multiple entries correctly', () => {
      const diff = `@@ -3,4 +3,8 @@
 ## [Unreleased]

 ### Added
+
+- feat: first feature (#1234)
+- fix: second fix (#5678)
+- chore: third update (#9999)`;

      const changelogContent = `# Changelog

## [Unreleased]

### Added

- feat: first feature (#1234)
- fix: second fix (#5678)
- chore: third update (#9999)

## [1.0.0] - 2024-01-01

### Added

- feat: old feature (#100)`;

      const result = validateChangelogDiff({
        diff,
        changelogContent,
        branchName: 'feat/my-feature',
        prNumber: '1234',
      });

      expect(result.valid).toBe(true);
    });

    it('should fail if any entry is missing PR number', () => {
      const diff = `@@ -3,4 +3,8 @@
 ## [Unreleased]

 ### Added
+
+- feat: first feature (#1234)
+- fix: second fix
+- chore: third update (#9999)`;

      const changelogContent = `# Changelog

## [Unreleased]

### Added

- feat: first feature (#1234)
- fix: second fix
- chore: third update (#9999)

## [1.0.0] - 2024-01-01`;

      const result = validateChangelogDiff({
        diff,
        changelogContent,
        branchName: 'feat/my-feature',
        prNumber: '1234',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe('missing_pr_number');
      expect(result.entries).toEqual(['- fix: second fix']);
    });
  });
});
