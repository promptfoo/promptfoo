/**
 * Config Generator Tests
 */

import * as fs from 'fs';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateConfigFile } from '../../code-scan-action/src/config';

describe('generateConfigFile', () => {
  afterEach(() => {
    // Clean up any generated config files
    vi.restoreAllMocks();
  });

  it('should generate config file with minimum severity', () => {
    const configPath = generateConfigFile('high');

    expect(configPath).toBeTruthy();
    expect(configPath).toMatch(/code-scan-config-.*\.yaml$/);
    expect(fs.existsSync(configPath)).toBe(true);

    const content = fs.readFileSync(configPath, 'utf8');
    expect(content).toContain('minimumSeverity: high');
    expect(content).toContain('diffsOnly: false');

    // Cleanup
    fs.unlinkSync(configPath);
  });

  it('should handle different severity levels', () => {
    const levels = ['low', 'medium', 'high', 'critical'];

    for (const level of levels) {
      const configPath = generateConfigFile(level);
      const content = fs.readFileSync(configPath, 'utf8');

      expect(content).toContain(`minimumSeverity: ${level}`);

      // Cleanup
      fs.unlinkSync(configPath);
    }
  });

  it('should always enable full repo exploration (never diffs-only)', () => {
    const configPath = generateConfigFile('medium');
    const content = fs.readFileSync(configPath, 'utf8');

    expect(content).toContain('diffsOnly: false');

    // Cleanup
    fs.unlinkSync(configPath);
  });

  it('should normalize severity case (uppercase)', () => {
    const configPath = generateConfigFile('HIGH');
    const content = fs.readFileSync(configPath, 'utf8');

    expect(content).toContain('minimumSeverity: high');

    // Cleanup
    fs.unlinkSync(configPath);
  });

  it('should normalize severity case (mixed case)', () => {
    const configPath = generateConfigFile('CriTicAL');
    const content = fs.readFileSync(configPath, 'utf8');

    expect(content).toContain('minimumSeverity: critical');

    // Cleanup
    fs.unlinkSync(configPath);
  });

  it('should trim whitespace from severity', () => {
    const configPath = generateConfigFile('  medium  ');
    const content = fs.readFileSync(configPath, 'utf8');

    expect(content).toContain('minimumSeverity: medium');

    // Cleanup
    fs.unlinkSync(configPath);
  });

  it('should throw error for invalid severity level', () => {
    expect(() => generateConfigFile('invalid')).toThrow();
  });

  it('should throw error for empty severity', () => {
    expect(() => generateConfigFile('')).toThrow();
  });

  it('should throw error for numeric severity', () => {
    expect(() => generateConfigFile('123')).toThrow();
  });

  it('should throw error for severity with special characters', () => {
    expect(() => generateConfigFile('high!')).toThrow();
  });
});
