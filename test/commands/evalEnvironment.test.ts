import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { evalCommand } from '../../src/commands/eval';
import { addCommonOptionsRecursively } from '../../src/mainUtils';
import { getProxyForUrl } from '../../src/util/fetch/proxy';
import { mockProcessEnv } from '../util/utils';

vi.unmock('../../src/util/envFile');

let directory: string;
let restoreEnv: () => void;
let originalExitCode: typeof process.exitCode;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-eval-env-'));
  restoreEnv = mockProcessEnv({
    HTTP_PROXY: undefined,
    http_proxy: 'http://shell.example:8080',
    HTTPS_PROXY: undefined,
    https_proxy: undefined,
    ALL_PROXY: undefined,
    all_proxy: undefined,
    NO_PROXY: undefined,
    no_proxy: undefined,
    PROMPTFOO_DISABLE_TELEMETRY: 'true',
  });
  originalExitCode = process.exitCode;
});

afterEach(() => {
  process.exitCode = originalExitCode;
  restoreEnv();
  fs.rmSync(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('eval command environment files', () => {
  it.each(['before', 'after', 'alias', 'repeated', 'comma-separated', 'config', 'suite'])(
    'preserves mixed-case proxy precedence with %s environment options',
    async (placement) => {
      const file = path.join(directory, 'first.env');
      const mask = path.join(directory, 'mask.env');
      fs.writeFileSync(file, 'HTTP_PROXY=http://file.example:8081\n');
      fs.writeFileSync(mask, 'HTTP_PROXY=\n');
      const expected =
        placement === 'suite'
          ? 'http://suite.example:8082'
          : ['repeated', 'comma-separated'].includes(placement)
            ? ''
            : 'http://file.example:8081';
      const outputs: string[] = [];
      const program = new Command();
      evalCommand(
        program,
        {
          prompts: ['fixture'],
          providers: [
            async () => {
              const output = getProxyForUrl('http://target.example');
              outputs.push(output);
              return { output };
            },
          ],
          tests: [{ assert: [{ type: 'equals', value: expected }] }],
          ...(placement === 'config' ? { commandLineOptions: { envPath: [file] } } : {}),
          ...(placement === 'suite' ? { env: { HTTP_PROXY: expected } } : {}),
        },
        undefined,
      );
      addCommonOptionsRecursively(program);
      const args = ['eval', '--no-cache', '--no-write', '--no-table', '--no-progress-bar'];
      if (placement === 'before') {
        args.unshift('--env-file', file);
      } else if (placement === 'repeated') {
        args.push('--env-file', file, '--env-file', mask);
      } else if (placement === 'comma-separated') {
        args.push('--env-file', `${file},${mask}`);
      } else if (placement !== 'config') {
        args.push(placement === 'alias' ? '--env-path' : '--env-file', file);
      }
      const outerFileEnv = cliState.envFileOverrides;
      await program.parseAsync(args, { from: 'user' });
      expect(outputs).toEqual([expected]);
      expect(process.exitCode ?? 0).toBe(0);
      expect(cliState.envFileOverrides).toBe(outerFileEnv);
    },
  );
});
