/**
 * Configuration Loader Tests
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig, loadConfigOrDefault } from '../../../src/codeScan/config/loader';
import { CodeScanSeverity, ConfigLoadError } from '../../../src/types/codeScan';

describe('Configuration Loader', () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-scan-test-'));
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('loadConfig', () => {
    it('should load valid configuration file', () => {
      const configPath = path.join(tempDir, 'config.yaml');
      fs.writeFileSync(configPath, 'minimumSeverity: high\ndiffsOnly: false');

      const config = loadConfig(configPath);

      expect(config).toEqual({
        minimumSeverity: CodeScanSeverity.HIGH,
        diffsOnly: false,
      });
    });

    it('should apply defaults for missing optional fields', () => {
      const configPath = path.join(tempDir, 'config.yaml');
      fs.writeFileSync(configPath, '{}'); // Empty object

      const config = loadConfig(configPath);

      expect(config).toEqual({
        minimumSeverity: CodeScanSeverity.MEDIUM,
        diffsOnly: false,
      });
    });

    it('should accept all valid severity levels', () => {
      const testCases: Array<[CodeScanSeverity, string]> = [
        [CodeScanSeverity.LOW, 'low'],
        [CodeScanSeverity.MEDIUM, 'medium'],
        [CodeScanSeverity.HIGH, 'high'],
        [CodeScanSeverity.CRITICAL, 'critical'],
      ];

      for (const [expectedLevel, levelString] of testCases) {
        const configPath = path.join(tempDir, `config-${levelString}.yaml`);
        fs.writeFileSync(configPath, `minimumSeverity: ${levelString}\ndiffsOnly: true`);

        const config = loadConfig(configPath);

        expect(config.minimumSeverity).toBe(expectedLevel);
        expect(config.diffsOnly).toBe(true);
      }
    });

    it('should throw ConfigLoadError if file does not exist', () => {
      const nonExistentPath = path.join(tempDir, 'does-not-exist.yaml');

      expect(() => loadConfig(nonExistentPath)).toThrow(ConfigLoadError);
      expect(() => loadConfig(nonExistentPath)).toThrow('Configuration file not found');
    });

    it('should throw ConfigLoadError if file cannot be parsed', () => {
      const configPath = path.join(tempDir, 'invalid.yaml');
      fs.writeFileSync(configPath, '{ invalid yaml content [[[');

      expect(() => loadConfig(configPath)).toThrow(ConfigLoadError);
      expect(() => loadConfig(configPath)).toThrow('Failed to parse YAML');
    });

    it('should throw ConfigLoadError if validation fails', () => {
      const configPath = path.join(tempDir, 'invalid-schema.yaml');
      fs.writeFileSync(configPath, 'minimumSeverity: invalid-level\ndiffsOnly: not-a-boolean');

      expect(() => loadConfig(configPath)).toThrow(ConfigLoadError);
      expect(() => loadConfig(configPath)).toThrow('Invalid configuration');
    });

    it('should handle boolean diffsOnly values', () => {
      const configPath = path.join(tempDir, 'config.yaml');
      fs.writeFileSync(configPath, 'minimumSeverity: medium\ndiffsOnly: true');

      const config = loadConfig(configPath);

      expect(config.diffsOnly).toBe(true);
    });

    it('should accept minSeverity as an alias for minimumSeverity', () => {
      const configPath = path.join(tempDir, 'config.yaml');
      fs.writeFileSync(configPath, 'minSeverity: critical\ndiffsOnly: true');

      const config = loadConfig(configPath);

      expect(config.minimumSeverity).toBe(CodeScanSeverity.CRITICAL);
      expect(config.diffsOnly).toBe(true);
    });

    it('should prefer minSeverity over minimumSeverity when both provided', () => {
      const configPath = path.join(tempDir, 'config.yaml');
      fs.writeFileSync(configPath, 'minSeverity: low\nminimumSeverity: high\ndiffsOnly: false');

      const config = loadConfig(configPath);

      expect(config.minimumSeverity).toBe(CodeScanSeverity.LOW);
      expect(config.diffsOnly).toBe(false);
    });

    it('should accept all valid severity levels with minSeverity alias', () => {
      const testCases: Array<[CodeScanSeverity, string]> = [
        [CodeScanSeverity.LOW, 'low'],
        [CodeScanSeverity.MEDIUM, 'medium'],
        [CodeScanSeverity.HIGH, 'high'],
        [CodeScanSeverity.CRITICAL, 'critical'],
      ];

      for (const [expectedLevel, levelString] of testCases) {
        const configPath = path.join(tempDir, `config-min-${levelString}.yaml`);
        fs.writeFileSync(configPath, `minSeverity: ${levelString}\ndiffsOnly: true`);

        const config = loadConfig(configPath);

        expect(config.minimumSeverity).toBe(expectedLevel);
        expect(config.diffsOnly).toBe(true);
      }
    });

    it('should accept inline guidance text', () => {
      const configPath = path.join(tempDir, 'config.yaml');
      fs.writeFileSync(
        configPath,
        'minimumSeverity: high\nguidance: "Focus on authentication vulnerabilities"',
      );

      const config = loadConfig(configPath);

      expect(config.guidance).toBe('Focus on authentication vulnerabilities');
    });

    it('should read guidanceFile and populate guidance field', () => {
      const guidanceFilePath = path.join(tempDir, 'guidance.txt');
      fs.writeFileSync(guidanceFilePath, 'Focus on authentication vulnerabilities');

      const configPath = path.join(tempDir, 'config.yaml');
      fs.writeFileSync(configPath, `minimumSeverity: high\nguidanceFile: ${guidanceFilePath}`);

      const config = loadConfig(configPath);

      expect(config.guidance).toBe('Focus on authentication vulnerabilities');
    });

    it('should throw ConfigLoadError when guidanceFile does not exist', () => {
      const configPath = path.join(tempDir, 'config.yaml');
      fs.writeFileSync(configPath, 'minimumSeverity: high\nguidanceFile: ./nonexistent.txt');

      expect(() => loadConfig(configPath)).toThrow(ConfigLoadError);
      expect(() => loadConfig(configPath)).toThrow(/Failed to read guidance file/);
    });

    it('should throw ConfigLoadError when both guidance and guidanceFile are specified', () => {
      const guidanceFilePath = path.join(tempDir, 'guidance.txt');
      fs.writeFileSync(guidanceFilePath, 'File guidance');

      const configPath = path.join(tempDir, 'config.yaml');
      fs.writeFileSync(
        configPath,
        `minimumSeverity: high\nguidance: "Inline guidance"\nguidanceFile: ${guidanceFilePath}`,
      );

      expect(() => loadConfig(configPath)).toThrow(ConfigLoadError);
      expect(() => loadConfig(configPath)).toThrow(/Cannot specify both guidance and guidanceFile/);
    });
  });

  describe('loadConfigOrDefault', () => {
    it('should return default config when no path provided', () => {
      const config = loadConfigOrDefault();

      expect(config).toEqual({
        minimumSeverity: CodeScanSeverity.MEDIUM,
        diffsOnly: false,
      });
    });

    it('should load config when path provided', () => {
      const configPath = path.join(tempDir, 'config.yaml');
      fs.writeFileSync(configPath, 'minimumSeverity: critical\ndiffsOnly: true');

      const config = loadConfigOrDefault(configPath);

      expect(config).toEqual({
        minimumSeverity: CodeScanSeverity.CRITICAL,
        diffsOnly: true,
      });
    });

    it('should return default config when empty string provided', () => {
      const config = loadConfigOrDefault('');

      expect(config).toEqual({
        minimumSeverity: CodeScanSeverity.MEDIUM,
        diffsOnly: false,
      });
    });
  });
});
