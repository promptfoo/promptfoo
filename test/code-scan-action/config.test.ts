import * as fs from 'fs';

import { afterEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { generateConfigFile } from '../../code-scan-action/src/config';
import { ScanConfigSchema } from '../../src/types/codeScan';
import { loadYaml } from '../../src/util/yamlLoad';

describe('generateConfigFile', () => {
  const generatedPaths: string[] = [];

  afterEach(() => {
    for (const configPath of generatedPaths.splice(0)) {
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
      }
    }
  });

  function readGeneratedConfig(minimumSeverity: string, guidance?: string): string {
    const configPath = generateConfigFile(minimumSeverity, guidance);
    generatedPaths.push(configPath);
    return fs.readFileSync(configPath, 'utf8');
  }

  it('writes a normalized config for full-repository scans', () => {
    expect(ScanConfigSchema.parse(loadYaml(readGeneratedConfig(' HIGH ')))).toEqual({
      minimumSeverity: 'high',
      diffsOnly: false,
    });
  });

  it.each([
    'Review "auth": carefully',
    'Line one\nLine two',
    '  indented first\nunindented second',
    'one\n\n',
    '\n\nleading blank',
    'Windows\r\nline',
    'tab\tfield',
    'control\u0000char',
    'Unicode λ 😀',
    'on',
    'false',
    'null',
    '2026-01-02',
    '{"nested":{"array":[true,1,null]}}',
    '  ',
  ])('preserves guidance exactly through the scanner YAML loader: %j', (guidance) => {
    const parsed = ScanConfigSchema.parse(loadYaml(readGeneratedConfig('critical', guidance)));
    expect(parsed).toEqual({ minimumSeverity: 'critical', diffsOnly: false, guidance });
  });

  it.each(['', undefined])('omits empty or absent guidance: %j', (guidance) => {
    const parsed = ScanConfigSchema.parse(loadYaml(readGeneratedConfig('low', guidance)));
    expect(parsed).toEqual({ minimumSeverity: 'low', diffsOnly: false });
  });

  it.each([null, false, 0, { nested: ['guidance'] }, ['guidance']])(
    'rejects invalid guidance before serialization: %j',
    (guidance) => {
      expect(() => readGeneratedConfig('high', guidance as unknown as string)).toThrow(ZodError);
    },
  );

  it('rejects invalid severities', () => {
    let thrown: unknown;

    try {
      generateConfigFile('high!');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ZodError);

    const issue = (thrown as ZodError).issues[0];
    expect(issue).toMatchObject({
      code: 'invalid_value',
      message: expect.stringContaining('Invalid option'),
    });
    expect(issue).toHaveProperty('values', ['critical', 'high', 'medium', 'low', 'none']);
  });
});
