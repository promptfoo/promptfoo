import os from 'os';
import path from 'path';

import { describe, expect, it } from 'vitest';
import { createTempOutputPath, supportsCliUiWithOutput } from '../../src/commands/modelScan';

describe('supportsCliUiWithOutput', () => {
  it('should return false for null version', () => {
    expect(supportsCliUiWithOutput(null)).toBe(false);
  });

  it('should return false for versions below 0.2.20', () => {
    const oldVersions = ['0.1.0', '0.2.0', '0.2.19', '0.2.10', '0.2.1'];
    for (const version of oldVersions) {
      expect(supportsCliUiWithOutput(version)).toBe(false);
    }
  });

  it('should return true for version 0.2.20', () => {
    expect(supportsCliUiWithOutput('0.2.20')).toBe(true);
  });

  it('should return true for versions above 0.2.20', () => {
    const newVersions = ['0.2.21', '0.2.30', '0.3.0', '1.0.0', '0.10.0'];
    for (const version of newVersions) {
      expect(supportsCliUiWithOutput(version)).toBe(true);
    }
  });

  it('should return false for invalid version strings', () => {
    // Note: semver.coerce is lenient - '1.2' becomes '1.2.0' which is valid
    const invalidVersions = ['invalid', 'a.b.c', ''];
    for (const version of invalidVersions) {
      expect(supportsCliUiWithOutput(version)).toBe(false);
    }
  });

  it('should handle partial version strings with semver.coerce', () => {
    // semver.coerce('1.2') becomes '1.2.0' which is >= 0.2.20
    expect(supportsCliUiWithOutput('1.2')).toBe(true);
    // semver.coerce('0.2') becomes '0.2.0' which is < 0.2.20
    expect(supportsCliUiWithOutput('0.2')).toBe(false);
  });

  it('should handle edge cases for version comparison', () => {
    // Version 0.3.0 should be supported (minor > 2)
    expect(supportsCliUiWithOutput('0.3.0')).toBe(true);
    // Version 1.0.0 should be supported (major > 0)
    expect(supportsCliUiWithOutput('1.0.0')).toBe(true);
    // Version 0.2.19 should NOT be supported
    expect(supportsCliUiWithOutput('0.2.19')).toBe(false);
  });
});

describe('createTempOutputPath', () => {
  it('should generate path in system temp directory', () => {
    const tempPath = createTempOutputPath();
    expect(tempPath).toContain(os.tmpdir());
  });

  it('should generate path with promptfoo-modelscan prefix', () => {
    const tempPath = createTempOutputPath();
    expect(tempPath).toContain('promptfoo-modelscan-');
  });

  it('should generate path with .json extension', () => {
    const tempPath = createTempOutputPath();
    expect(tempPath).toMatch(/\.json$/);
  });

  it('should generate UUID-based unique paths', () => {
    const tempPath = createTempOutputPath();
    expect(path.basename(tempPath)).toBe('results.json');
    expect(path.basename(path.dirname(tempPath))).toMatch(
      /^promptfoo-modelscan-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9]{6}$/,
    );
  });

  it('should generate unique paths on each call', () => {
    const paths = new Set<string>();
    for (let i = 0; i < 10; i++) {
      paths.add(createTempOutputPath());
    }
    // All paths should be unique
    expect(paths.size).toBe(10);
  });
});
