import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { getEnvString } from '../../src/envars';
import { getProcessEnv } from '../../src/envOverrides';
import { doEval } from '../../src/node/doEval';
import { getEvalConfigFromCloud } from '../../src/util/cloud';
import { readConfig } from '../../src/util/config/load';
import { getNunjucksEngineForFilePath } from '../../src/util/file';
import { getNunjucksEngine } from '../../src/util/templates';
import { mockProcessEnv } from '../util/utils';

vi.mock('../../src/util/cloud', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/util/cloud')>()),
  getEvalConfigFromCloud: vi.fn(),
}));

describe('doEval environment files', () => {
  let tempDir: string;
  let restoreEnv: () => void;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-do-eval-env-'));
    restoreEnv = mockProcessEnv({
      PROMPTFOO_REVIEW_ENV_PROBE: 'host',
      PROMPTFOO_DISABLE_TELEMETRY: 'true',
      PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS: 'false',
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
    restoreEnv();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('keeps file defaults below suite values without saving them as config overrides', async () => {
    const configPath = path.join(tempDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      prompts: ['hello'], providers: ['echo'],
      env: { PROMPTFOO_REVIEW_ENV_PROBE: '{{env.PROMPTFOO_REVIEW_ENV_PROBE}}' },
    }));
    const engine = getNunjucksEngine();
    await cliState.withEnvFileOverrides({ PROMPTFOO_REVIEW_ENV_PROBE: 'file', FILE_ONLY: 'private' }, async () => {
      expect(getProcessEnv().PROMPTFOO_REVIEW_ENV_PROBE).toBe('file');
      expect((await readConfig(configPath)).env).toEqual({ PROMPTFOO_REVIEW_ENV_PROBE: 'file' });
      for (const [env, expected] of [
        [undefined, 'file'],
        [{}, 'file'],
        [{ PROMPTFOO_REVIEW_ENV_PROBE: undefined }, 'file'],
        [{ PROMPTFOO_REVIEW_ENV_PROBE: '' }, ''],
        [{ PROMPTFOO_REVIEW_ENV_PROBE: 'suite' }, 'suite'],
      ] as const) {
        cliState.withEnv(env, () => {
          expect(getEnvString('PROMPTFOO_REVIEW_ENV_PROBE')).toBe(expected);
          expect(getNunjucksEngineForFilePath().renderString('{{env.PROMPTFOO_REVIEW_ENV_PROBE}}', {})).toBe(expected);
          expect(engine.renderString('{{env.PROMPTFOO_REVIEW_ENV_PROBE}}', {})).toBe(expected);
        });
      }
    });
    expect(engine.renderString('{{env.PROMPTFOO_REVIEW_ENV_PROBE}}', {})).toBe('host');
  });

  it.each(['process', 'file', 'suite'] as const)('honors %s template restrictions for file defaults', async (source) => {
    const restore = mockProcessEnv({ PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS: source === 'process' ? 'true' : 'false' });
    try {
      await cliState.withEnvFileOverrides({
        PROMPTFOO_REVIEW_ENV_PROBE: 'file',
        PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS: source === 'file' ? 'true' : 'false',
      }, () => cliState.withEnv({ PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS: source === 'suite' ? 'true' : 'false' }, () => {
        const engine = getNunjucksEngine();
        expect(getEnvString('PROMPTFOO_REVIEW_ENV_PROBE')).toBe('file');
          expect(getNunjucksEngineForFilePath().renderString('{{env.PROMPTFOO_REVIEW_ENV_PROBE}}', {})).toBe('');
        expect(engine.renderString('{{env.PROMPTFOO_REVIEW_ENV_PROBE}}', {})).toBe('');
        expect(engine.renderString('{% for key, value in env %}{{value}}{% endfor %}', {})).not.toContain('file');
      }));
    } finally {
      restore();
    }
  });

  it('isolates overlapping env files before cloud loading, provider loading, and evaluation', async () => {
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    let arrived = 0;
    const loadedEnv: (string | undefined)[] = [];
    vi.mocked(getEvalConfigFromCloud).mockImplementation(async () => {
      if (++arrived === 2) {
        release();
      }
      await ready;
      loadedEnv.push(getEnvString('PROMPTFOO_REVIEW_ENV_PROBE'));
      return {
        prompts: ['{{env.PROMPTFOO_REVIEW_ENV_PROBE}}'],
        providers: ['echo'],
        tests: [{ vars: {} }],
      };
    });

    const outputs = await Promise.all(
      ['first', 'second'].map(async (value) => {
        const envPath = path.join(tempDir, `${value}.env`);
        fs.writeFileSync(envPath, `PROMPTFOO_REVIEW_ENV_PROBE=${value}\n`);
        const evaluation = await doEval(
          {
            config: ['11111111-1111-4111-8111-111111111111'],
            envPath: [envPath],
            write: false,
            share: false,
            table: false,
            progressBar: false,
          },
          {},
          undefined,
          { eventSource: 'mcp', cache: false },
        );
        const [row] = await evaluation.getResults();
        expect(row.success).toBe(true);
        return row.response?.output;
      }),
    );

    expect(loadedEnv.sort()).toEqual(['first', 'second']);
    expect(outputs).toEqual(['first', 'second']);
    expect(process.env.PROMPTFOO_REVIEW_ENV_PROBE).toBe('host');
  });

  it('restores the caller environment when cloud loading fails', async () => {
    const envPath = path.join(tempDir, 'failed.env');
    fs.writeFileSync(envPath, 'PROMPTFOO_REVIEW_ENV_PROBE=failed\n');
    vi.mocked(getEvalConfigFromCloud).mockRejectedValue(new Error('cloud unavailable'));
    await expect(
      doEval(
        { config: ['11111111-1111-4111-8111-111111111111'], envPath: [envPath] },
        {},
        undefined,
        { eventSource: 'mcp' },
      ),
    ).rejects.toThrow('cloud unavailable');
    expect(getEnvString('PROMPTFOO_REVIEW_ENV_PROBE')).toBe('host');
    expect(process.env.PROMPTFOO_REVIEW_ENV_PROBE).toBe('host');
  });

  it('isolates config-defined env files through concurrent provider calls', async () => {
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    let arrived = 0;
    const outputs = await Promise.all(
      ['first', 'second'].map(async (value) => {
        const envPath = path.join(tempDir, `${value}.env`);
        fs.writeFileSync(envPath, `PROMPTFOO_REVIEW_ENV_PROBE=${value}\n`);
        const result = await doEval(
          { write: false, share: false, table: false, progressBar: false },
          {
            prompts: ['hello'],
            providers: [
              async () => {
                if (++arrived === 2) {
                  release();
                }
                await ready;
                return { output: getEnvString('PROMPTFOO_REVIEW_ENV_PROBE') };
              },
            ],
            tests: [{ vars: {} }],
            commandLineOptions: { envPath: [envPath] },
          },
          undefined,
          { eventSource: 'mcp', cache: false },
        );
        const [row] = await result.getResults();
        expect(row.success).toBe(true);
        return row.response?.output;
      }),
    );
    expect(outputs).toEqual(['first', 'second']);
    expect(process.env.PROMPTFOO_REVIEW_ENV_PROBE).toBe('host');
  });
});
