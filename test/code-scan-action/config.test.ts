import * as fs from 'fs';
import * as path from 'path';

import yaml from 'js-yaml';
import { afterEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { generateConfigFile } from '../../code-scan-action/src/config';

describe('generateConfigFile', () => {
  const generatedPaths: string[] = [];

  afterEach(() => {
    for (const configPath of generatedPaths.splice(0)) {
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
      }
    }
  });

  function readGeneratedConfig(
    minimumSeverity: string,
    guidance?: string,
    diffsOnly?: boolean,
  ): string {
    const configPath = generateConfigFile(minimumSeverity, guidance, diffsOnly);
    generatedPaths.push(configPath);
    return fs.readFileSync(configPath, 'utf8');
  }

  it('writes a normalized config for full-repository scans', () => {
    expect(readGeneratedConfig(' HIGH ')).toBe('minimumSeverity: high\ndiffsOnly: false\n');
  });

  it('writes diff-only scan policy when requested', () => {
    expect(readGeneratedConfig('medium', undefined, true)).toBe(
      'minimumSeverity: medium\ndiffsOnly: true\n',
    );
  });

  it('escapes single-line guidance as a YAML string', () => {
    expect(readGeneratedConfig('medium', 'Review "auth" carefully')).toBe(
      'minimumSeverity: medium\ndiffsOnly: false\nguidance: "Review \\"auth\\" carefully"\n',
    );
  });

  it('writes multiline guidance as a YAML literal block', () => {
    expect(readGeneratedConfig('critical', 'Line one\nLine two')).toBe(
      'minimumSeverity: critical\ndiffsOnly: false\nguidance: |\n  Line one\n  Line two\n',
    );
  });

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

describe('Action metadata', () => {
  const action = yaml.load(
    fs.readFileSync(path.resolve('code-scan-action/action.yml'), 'utf8'),
  ) as {
    inputs: Record<string, { default?: unknown; description: string }>;
    runs: { using: string };
  };

  it('keeps the scanner host pinned by trusted workflow metadata', () => {
    expect(action.inputs['api-host'].default).toBe('https://api.promptfoo.app');
    expect(action.inputs['config-path'].description).toContain(
      'api-host remains workflow-controlled',
    );
  });

  it('keeps diffs-only default-free so omitted and explicit false remain distinguishable', () => {
    expect(action.inputs['diffs-only']).not.toHaveProperty('default');
    expect(action.runs.using).toBe('node24');
  });
});
