/**
 * Config Generator Tests
 */

import * as fs from 'fs';
import { generateConfigFile } from './config';

describe('generateConfigFile', () => {
  afterEach(() => {
    // Clean up any generated config files
    jest.restoreAllMocks();
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
});
