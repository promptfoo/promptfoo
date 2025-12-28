import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const {
  updateChangelog,
  isEmptySection,
  extractUnreleasedContent,
  buildUpdatedChangelog,
  CHANGELOG_CATEGORIES,
} = require('../../scripts/update-changelog-version.cjs') as {
  updateChangelog: (options?: {
    changelogPath?: string;
    packageJsonPath?: string;
    date?: string;
  }) => {
    success: boolean;
    error?: string;
    version?: string;
    changelog?: string;
  };
  isEmptySection: (content: string) => boolean;
  extractUnreleasedContent: (
    changelog: string,
  ) => { content: string; match: RegExpMatchArray } | null;
  buildUpdatedChangelog: (
    changelog: string,
    version: string,
    unreleasedContent: string,
    date: string,
  ) => string;
  CHANGELOG_CATEGORIES: string[];
};

describe('update-changelog-version', () => {
  describe('CHANGELOG_CATEGORIES', () => {
    it('should include all Keep a Changelog categories', () => {
      expect(CHANGELOG_CATEGORIES).toContain('Added');
      expect(CHANGELOG_CATEGORIES).toContain('Changed');
      expect(CHANGELOG_CATEGORIES).toContain('Deprecated');
      expect(CHANGELOG_CATEGORIES).toContain('Removed');
      expect(CHANGELOG_CATEGORIES).toContain('Fixed');
      expect(CHANGELOG_CATEGORIES).toContain('Security');
    });

    it('should include custom categories', () => {
      expect(CHANGELOG_CATEGORIES).toContain('Dependencies');
      expect(CHANGELOG_CATEGORIES).toContain('Documentation');
      expect(CHANGELOG_CATEGORIES).toContain('Tests');
    });
  });

  describe('isEmptySection', () => {
    it('should return true for empty section with only headers', () => {
      const content = `### Added

### Changed

### Fixed`;
      expect(isEmptySection(content)).toBe(true);
    });

    it('should return false when section has entries', () => {
      const content = `### Added

- feat: new feature (#1234)

### Changed`;
      expect(isEmptySection(content)).toBe(false);
    });

    it('should return true for completely empty string', () => {
      expect(isEmptySection('')).toBe(true);
    });

    it('should return true for whitespace only', () => {
      expect(isEmptySection('   \n\n   ')).toBe(true);
    });

    it('should handle all Keep a Changelog categories', () => {
      const content = `### Added

### Changed

### Deprecated

### Removed

### Fixed

### Security`;
      expect(isEmptySection(content)).toBe(true);
    });

    it('should handle custom categories', () => {
      const content = `### Dependencies

### Documentation

### Tests`;
      expect(isEmptySection(content)).toBe(true);
    });

    it('should detect entry under Deprecated category', () => {
      const content = `### Deprecated

- chore: deprecate old API (#1234)`;
      expect(isEmptySection(content)).toBe(false);
    });

    it('should detect entry under Security category', () => {
      const content = `### Security

- fix: patch XSS vulnerability (#5678)`;
      expect(isEmptySection(content)).toBe(false);
    });
  });

  describe('extractUnreleasedContent', () => {
    it('should extract content from Unreleased section', () => {
      const changelog = `# Changelog

## [Unreleased]

### Added

- feat: new feature (#1234)

## [1.0.0] - 2024-01-01

### Added

- feat: old feature (#100)`;

      const result = extractUnreleasedContent(changelog);
      expect(result).not.toBeNull();
      expect(result!.content).toContain('feat: new feature (#1234)');
    });

    it('should return null if no Unreleased section', () => {
      const changelog = `# Changelog

## [1.0.0] - 2024-01-01

### Added

- feat: feature (#100)`;

      expect(extractUnreleasedContent(changelog)).toBeNull();
    });

    it('should return null if no versioned section after Unreleased', () => {
      const changelog = `# Changelog

## [Unreleased]

### Added

- feat: new feature (#1234)`;

      expect(extractUnreleasedContent(changelog)).toBeNull();
    });

    it('should trim whitespace from extracted content', () => {
      const changelog = `# Changelog

## [Unreleased]


### Added

- feat: new feature (#1234)


## [1.0.0] - 2024-01-01`;

      const result = extractUnreleasedContent(changelog);
      expect(result!.content).not.toMatch(/^\s/);
      expect(result!.content).not.toMatch(/\s$/);
    });
  });

  describe('buildUpdatedChangelog', () => {
    const baseChangelog = `# Changelog

## [Unreleased]

### Added

- feat: new feature (#1234)

## [1.0.0] - 2024-01-01

### Added

- feat: old feature (#100)`;

    it('should create new versioned section', () => {
      const result = buildUpdatedChangelog(
        baseChangelog,
        '1.1.0',
        '### Added\n\n- feat: new feature (#1234)',
        '2024-02-01',
      );

      expect(result).toContain('## [1.1.0] - 2024-02-01');
      expect(result).toContain('feat: new feature (#1234)');
    });

    it('should include empty Unreleased template', () => {
      const result = buildUpdatedChangelog(
        baseChangelog,
        '1.1.0',
        '### Added\n\n- feat: new feature (#1234)',
        '2024-02-01',
      );

      expect(result).toContain('## [Unreleased]');
      expect(result).toContain('### Deprecated');
      expect(result).toContain('### Security');
    });

    it('should clean up triple newlines', () => {
      const result = buildUpdatedChangelog(
        baseChangelog,
        '1.1.0',
        '### Added\n\n- feat: new feature (#1234)',
        '2024-02-01',
      );

      expect(result).not.toMatch(/\n{3,}/);
    });

    it('should preserve existing versions', () => {
      const result = buildUpdatedChangelog(
        baseChangelog,
        '1.1.0',
        '### Added\n\n- feat: new feature (#1234)',
        '2024-02-01',
      );

      expect(result).toContain('## [1.0.0] - 2024-01-01');
      expect(result).toContain('feat: old feature (#100)');
    });

    it('should place new version between Unreleased and old versions', () => {
      const result = buildUpdatedChangelog(
        baseChangelog,
        '1.1.0',
        '### Added\n\n- feat: new feature (#1234)',
        '2024-02-01',
      );

      const unreleasedIndex = result.indexOf('## [Unreleased]');
      const newVersionIndex = result.indexOf('## [1.1.0]');
      const oldVersionIndex = result.indexOf('## [1.0.0]');

      expect(unreleasedIndex).toBeLessThan(newVersionIndex);
      expect(newVersionIndex).toBeLessThan(oldVersionIndex);
    });
  });

  describe('updateChangelog', () => {
    let tempDir: string;
    let changelogPath: string;
    let packageJsonPath: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-test-'));
      changelogPath = path.join(tempDir, 'CHANGELOG.md');
      packageJsonPath = path.join(tempDir, 'package.json');
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should successfully update changelog', () => {
      fs.writeFileSync(
        changelogPath,
        `# Changelog

## [Unreleased]

### Added

- feat: new feature (#1234)

## [1.0.0] - 2024-01-01

### Added

- feat: old feature (#100)`,
      );

      fs.writeFileSync(packageJsonPath, JSON.stringify({ version: '1.1.0' }));

      const result = updateChangelog({
        changelogPath,
        packageJsonPath,
        date: '2024-02-01',
      });

      expect(result.success).toBe(true);
      expect(result.version).toBe('1.1.0');
      expect(result.changelog).toContain('## [1.1.0] - 2024-02-01');
    });

    it('should fail if package.json is missing', () => {
      fs.writeFileSync(changelogPath, '# Changelog\n\n## [Unreleased]');

      const result = updateChangelog({
        changelogPath,
        packageJsonPath: path.join(tempDir, 'nonexistent.json'),
        date: '2024-02-01',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to read package.json');
    });

    it('should fail if changelog is missing', () => {
      fs.writeFileSync(packageJsonPath, JSON.stringify({ version: '1.0.0' }));

      const result = updateChangelog({
        changelogPath: path.join(tempDir, 'nonexistent.md'),
        packageJsonPath,
        date: '2024-02-01',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to read CHANGELOG.md');
    });

    it('should fail if no version in package.json', () => {
      fs.writeFileSync(changelogPath, '# Changelog\n\n## [Unreleased]');
      fs.writeFileSync(packageJsonPath, JSON.stringify({ name: 'test' }));

      const result = updateChangelog({
        changelogPath,
        packageJsonPath,
        date: '2024-02-01',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('No version found in package.json');
    });

    it('should fail if no Unreleased section', () => {
      fs.writeFileSync(
        changelogPath,
        `# Changelog

## [1.0.0] - 2024-01-01

### Added

- feat: old feature (#100)`,
      );
      fs.writeFileSync(packageJsonPath, JSON.stringify({ version: '1.1.0' }));

      const result = updateChangelog({
        changelogPath,
        packageJsonPath,
        date: '2024-02-01',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Could not find Unreleased section in CHANGELOG.md');
    });

    it('should fail if Unreleased section is empty', () => {
      fs.writeFileSync(
        changelogPath,
        `# Changelog

## [Unreleased]

### Added

### Changed

## [1.0.0] - 2024-01-01`,
      );
      fs.writeFileSync(packageJsonPath, JSON.stringify({ version: '1.1.0' }));

      const result = updateChangelog({
        changelogPath,
        packageJsonPath,
        date: '2024-02-01',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No entries in Unreleased section');
    });

    it('should write updated changelog to disk', () => {
      fs.writeFileSync(
        changelogPath,
        `# Changelog

## [Unreleased]

### Added

- feat: new feature (#1234)

## [1.0.0] - 2024-01-01`,
      );
      fs.writeFileSync(packageJsonPath, JSON.stringify({ version: '1.1.0' }));

      updateChangelog({
        changelogPath,
        packageJsonPath,
        date: '2024-02-01',
      });

      const written = fs.readFileSync(changelogPath, 'utf8');
      expect(written).toContain('## [1.1.0] - 2024-02-01');
      expect(written).toContain('feat: new feature (#1234)');
    });

    it('should handle multiple entries in different categories', () => {
      fs.writeFileSync(
        changelogPath,
        `# Changelog

## [Unreleased]

### Added

- feat: new feature (#1234)

### Fixed

- fix: bug fix (#5678)

### Security

- fix: security patch (#9999)

## [1.0.0] - 2024-01-01`,
      );
      fs.writeFileSync(packageJsonPath, JSON.stringify({ version: '1.1.0' }));

      const result = updateChangelog({
        changelogPath,
        packageJsonPath,
        date: '2024-02-01',
      });

      expect(result.success).toBe(true);
      expect(result.changelog).toContain('feat: new feature (#1234)');
      expect(result.changelog).toContain('fix: bug fix (#5678)');
      expect(result.changelog).toContain('fix: security patch (#9999)');
    });

    it('should fail on invalid JSON in package.json', () => {
      fs.writeFileSync(changelogPath, '# Changelog\n\n## [Unreleased]');
      fs.writeFileSync(packageJsonPath, 'not valid json');

      const result = updateChangelog({
        changelogPath,
        packageJsonPath,
        date: '2024-02-01',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to read package.json');
    });
  });
});
