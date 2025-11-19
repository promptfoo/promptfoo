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
const EMPTY_UNRELEASED = `## [Unreleased]

### Added

### Changed

### Fixed

### Removed

### Dependencies

### Documentation

### Tests
`;

function updateChangelog() {
  // Read package.json to get new version
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'),
  );
  const version = packageJson.version;

  // Read current changelog
  const changelog = fs.readFileSync(CHANGELOG_PATH, 'utf8');

  // Find Unreleased section content (between ## [Unreleased] and next ## [x.y.z])
  const unreleasedMatch = changelog.match(/## \[Unreleased\]\n([\s\S]*?)(?=\n## \[\d)/);

  if (!unreleasedMatch) {
    console.error('Error: Could not find Unreleased section in CHANGELOG.md');
    process.exit(1);
  }

  const unreleasedContent = unreleasedMatch[1].trim();

  // Check if Unreleased has actual content (not just empty headers)
  if (!unreleasedContent || isEmptySection(unreleasedContent)) {
    console.error('Error: No entries in Unreleased section to release');
    console.error('Add changelog entries before bumping version');
    process.exit(1);
  }

  // Format today's date as YYYY-MM-DD
  const today = new Date().toISOString().split('T')[0];

  // Build new versioned section
  const newVersionSection = `## [${version}] - ${today}\n\n${unreleasedContent}`;

  // Replace Unreleased content with empty template and insert new version
  const updatedChangelog = changelog.replace(
    /## \[Unreleased\]\n[\s\S]*?(?=\n## \[\d)/,
    `${EMPTY_UNRELEASED}\n\n${newVersionSection}\n\n`,
  );

  // Clean up any triple+ newlines
  const cleanedChangelog = updatedChangelog.replace(/\n{3,}/g, '\n\n');

  // Write back
  fs.writeFileSync(CHANGELOG_PATH, cleanedChangelog);

  console.log(`Updated CHANGELOG.md for version ${version}`);
}

function isEmptySection(content) {
  // Remove all category headers and whitespace, check if anything remains
  const withoutHeaders = content
    .replace(/### (Added|Changed|Fixed|Dependencies|Documentation|Tests|Removed)/g, '')
    .trim();
  return withoutHeaders.length === 0;
}

updateChangelog();
