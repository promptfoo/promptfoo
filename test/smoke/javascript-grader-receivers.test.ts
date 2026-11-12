import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CLI_PATH, runCli } from './runCli';

describe('Compiled JavaScript grader receivers', () => {
  let directory: string;

  beforeAll(() => {
    if (!fs.existsSync(CLI_PATH)) {
      throw new Error(`Built CLI not found at ${CLI_PATH}. Run 'npm run build' first.`);
    }
  });

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-transpiled-grader-'));
    fs.writeFileSync(path.join(directory, 'package.json'), '{"type":"module"}');
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it.each([
    { name: 'CommonJS default function', extension: 'cjs', method: false, functionName: undefined },
    {
      name: 'VM-fallback default function',
      extension: 'js',
      method: false,
      functionName: undefined,
    },
    {
      name: 'explicit VM-fallback default function',
      extension: 'js',
      method: false,
      functionName: 'default',
    },
    { name: 'transpiled object method', extension: 'cjs', method: true, functionName: 'grade' },
  ])('uses the correct receiver for a $name', ({ extension, method, functionName }) => {
    const exported = method
      ? `{ expected: 'hello', grade(output) { return output === this.expected; } }`
      : `function(output) {
          'use strict';
          return this === undefined && output === 'hello';
        }`;
    fs.writeFileSync(
      path.join(directory, `grader.${extension}`),
      `Object.defineProperty(exports, '__esModule', { value: true });
        exports.default = ${exported};`,
    );
    const configPath = path.join(directory, 'config.yaml');
    const outputPath = path.join(directory, 'output.json');
    fs.writeFileSync(
      configPath,
      `providers: [echo]
prompts: [hello]
tests:
  - assert:
      - type: javascript
        value: file://grader.${extension}${functionName ? `:${functionName}` : ''}
`,
    );

    const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache'], {
      env: {
        PROMPTFOO_CONFIG_DIR: path.join(directory, 'state'),
        PROMPTFOO_DISABLE_TELEMETRY: 'true',
        PROMPTFOO_DISABLE_UPDATE: 'true',
      },
    });

    expect(exitCode).toBe(0);
    const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    expect(report.results.results).toHaveLength(1);
    expect(report.results.results[0]).toMatchObject({ success: true, score: 1 });
  });
});
