#!/usr/bin/env node
/**
 * Updates CHANGELOG.md when bumping version:
 * - Moves Unreleased entries to new versioned section
 * - Creates fresh Unreleased section
 *
 * Run automatically via `npm version` postversion hook
 */

const fs = require('fs');
const path = require('path');

const CHANGELOG_PATH = path.join(__dirname, '..', 'CHANGELOG.md');

/**
 * Empty template for the Unreleased section after release
 */
const EMPTY_UNRELEASED = `## [Unreleased]

### Added

### Changed

### Deprecated

### Removed

### Fixed

### Security

### Dependencies

### Documentation

### Tests
`;

/**
 * All valid Keep a Changelog category headers
 * https://keepachangelog.com/en/1.1.0/
 */
const CHANGELOG_CATEGORIES = [
  'Added',
  'Changed',
  'Deprecated',
  'Removed',
  'Fixed',
  'Security',
  'Dependencies',
  'Documentation',
  'Tests',
];

/**
 * Check if a section contains only headers and whitespace (no actual entries)
 * @param {string} content - The section content to check
 * @returns {boolean} True if section has no actual entries
 */
function isEmptySection(content) {
  // Build regex pattern for all category headers
  const headerPattern = new RegExp(`### (${CHANGELOG_CATEGORIES.join('|')})`, 'g');
  const withoutHeaders = content.replace(headerPattern, '').trim();
  return withoutHeaders.length === 0;
}

/**
 * Extract content from the Unreleased section
 * @param {string} changelog - Full changelog content
 * @returns {{content: string, match: RegExpMatchArray} | null} Extracted content or null
 */
function extractUnreleasedContent(changelog) {
  // Match content between ## [Unreleased] and next ## [x.y.z] version header
  const unreleasedMatch = changelog.match(/## \[Unreleased\]\n([\s\S]*?)(?=\n## \[\d)/);

  if (!unreleasedMatch) {
    return null;
  }

  return {
    content: unreleasedMatch[1].trim(),
    match: unreleasedMatch,
  };
}

/**
 * Build the updated changelog with new version section
 * @param {string} changelog - Original changelog content
 * @param {string} version - New version number
 * @param {string} unreleasedContent - Content to move to versioned section
 * @param {string} date - Release date in YYYY-MM-DD format
 * @returns {string} Updated changelog content
 */
function buildUpdatedChangelog(changelog, version, unreleasedContent, date) {
  // Build new versioned section
  const newVersionSection = `## [${version}] - ${date}\n\n${unreleasedContent}`;

  // Replace Unreleased content with empty template and insert new version
  const updatedChangelog = changelog.replace(
    /## \[Unreleased\]\n[\s\S]*?(?=\n## \[\d)/,
    `${EMPTY_UNRELEASED}\n\n${newVersionSection}\n\n`,
  );

  // Clean up any triple+ newlines
  return updatedChangelog.replace(/\n{3,}/g, '\n\n');
}

/**
 * @typedef {Object} UpdateChangelogOptions
 * @property {string} [changelogPath] - Path to CHANGELOG.md
 * @property {string} [packageJsonPath] - Path to package.json
 * @property {string} [date] - Override date (for testing)
 */

/**
 * @typedef {Object} UpdateChangelogResult
 * @property {boolean} success - Whether update succeeded
 * @property {string} [error] - Error message if failed
 * @property {string} [version] - Version that was released
 * @property {string} [changelog] - Updated changelog content
 */

/**
 * Update changelog for a new version release
 * @param {UpdateChangelogOptions} [options] - Configuration options
 * @returns {UpdateChangelogResult} Result of the update operation
 */
function updateChangelog(options = {}) {
  const changelogPath = options.changelogPath || CHANGELOG_PATH;
  const packageJsonPath = options.packageJsonPath || path.join(__dirname, '..', 'package.json');
  const date = options.date || new Date().toISOString().split('T')[0];

  try {
    // Read package.json to get new version
    let packageJson;
    try {
      packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    } catch (err) {
      return {
        success: false,
        error: `Failed to read package.json: ${err.message}`,
      };
    }

    const version = packageJson.version;
    if (!version) {
      return {
        success: false,
        error: 'No version found in package.json',
      };
    }

    // Read current changelog
    let changelog;
    try {
      changelog = fs.readFileSync(changelogPath, 'utf8');
    } catch (err) {
      return {
        success: false,
        error: `Failed to read CHANGELOG.md: ${err.message}`,
      };
    }

    // Extract Unreleased content
    const extracted = extractUnreleasedContent(changelog);
    if (!extracted) {
      return {
        success: false,
        error: 'Could not find Unreleased section in CHANGELOG.md',
      };
    }

    const unreleasedContent = extracted.content;

    // Check if Unreleased has actual content
    if (!unreleasedContent || isEmptySection(unreleasedContent)) {
      return {
        success: false,
        error:
          'No entries in Unreleased section to release. Add changelog entries before bumping version.',
      };
    }

    // Build updated changelog
    const updatedChangelog = buildUpdatedChangelog(changelog, version, unreleasedContent, date);

    // Write back
    try {
      fs.writeFileSync(changelogPath, updatedChangelog);
    } catch (err) {
      return {
        success: false,
        error: `Failed to write CHANGELOG.md: ${err.message}`,
      };
    }

    return {
      success: true,
      version,
      changelog: updatedChangelog,
    };
  } catch (err) {
    return {
      success: false,
      error: `Unexpected error: ${err.message}`,
    };
  }
}

/**
 * Main entry point when run from command line
 */
function main() {
  const result = updateChangelog();

  if (!result.success) {
    console.error(`Error: ${result.error}`);
    process.exit(1);
  }

  console.log(`Updated CHANGELOG.md for version ${result.version}`);
}

// Export for testing
module.exports = {
  updateChangelog,
  isEmptySection,
  extractUnreleasedContent,
  buildUpdatedChangelog,
  EMPTY_UNRELEASED,
  CHANGELOG_CATEGORIES,
};

// Run if called directly
if (require.main === module) {
  main();
}
