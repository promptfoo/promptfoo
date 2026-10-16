import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluateTurn, loadOnlineConfig } from '../../../src/commands/online/evaluate';
import { evaluateWithSource } from '../../../src/evaluate';
import { readConfig } from '../../../src/util/config/load';
import { maybeLoadFromExternalFile } from '../../../src/util/file';

import type { CapturedTurn } from '../../../src/commands/online/store';
import type { ApiProvider } from '../../../src/types/index';

vi.mock('../../../src/evaluate', () => ({ evaluateWithSource: vi.fn() }));
vi.mock('../../../src/util/config/load', () => ({ readConfig: vi.fn() }));
vi.mock('../../../src/util/file', () => ({ maybeLoadFromExternalFile: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

const turn: CapturedTurn = {
  version: 1,
  agent: 'generic',
  sessionId: 's',
  turnId: 't',
  input: 'original request',
  output: '',
  capturedAt: '2026-01-01T00:00:00.000Z',
};

describe('online grading', () => {
  it('loads an external default test relative to the resolved base path', async () => {
    vi.mocked(readConfig).mockResolvedValue({
      prompts: [],
      basePath: path.resolve('/trusted/assets'),
      defaultTest: 'file://rubric.yaml',
    });
    vi.mocked(maybeLoadFromExternalFile).mockReturnValue({
      assert: [{ type: 'contains', value: 'ok' }],
    });
    const config = await loadOnlineConfig('/trusted/config/grading.yaml');
    expect(maybeLoadFromExternalFile).toHaveBeenCalledWith(
      `file://${path.resolve('/trusted/assets', 'rubric.yaml')}`,
    );
    expect(config.grading.assert).toEqual([{ type: 'contains', value: 'ok' }]);
  });
  it('preserves the resolved asset base path and defaults to the config directory', async () => {
    const defaultTest = { assert: [{ type: 'javascript' as const, value: 'file://grade.js' }] };
    vi.mocked(readConfig).mockResolvedValue({
      prompts: [],
      defaultTest,
      basePath: '/trusted/assets',
    });
    expect((await loadOnlineConfig('/trusted/config/grading.yaml')).basePath).toBe(
      '/trusted/assets',
    );
    vi.mocked(readConfig).mockResolvedValue({ prompts: [], defaultTest });
    expect((await loadOnlineConfig('/trusted/config/grading.yaml')).basePath).toBe(
      path.dirname(path.resolve('/trusted/config/grading.yaml')),
    );
  });
  it('requires explicit assertions', async () => {
    vi.mocked(readConfig).mockResolvedValue({ prompts: [], defaultTest: { assert: [] } });
    await expect(loadOnlineConfig('/trusted/grading.yaml')).rejects.toThrow(
      'at least one assertion',
    );
  });

  it('uses only grading fields from configuration and does not call a target Agent', async () => {
    vi.mocked(readConfig).mockResolvedValue({
      providers: ['exec: must-not-run'],
      prompts: ['unrelated'],
      tests: [{ vars: { input: 'wrong' } }],
      defaultTest: {
        assert: [{ type: 'contains', value: 'ok' }],
        vars: { input: 'wrong', rubric: 'reference' },
      },
    });
    const config = await loadOnlineConfig('/trusted/grading.yaml');
    const summary = { stats: { successes: 0, failures: 1, errors: 0 } };
    vi.mocked(evaluateWithSource).mockResolvedValue({
      id: 'eval-test',
      toEvaluateSummary: async () => summary,
    } as Awaited<ReturnType<typeof evaluateWithSource>>);
    await evaluateTurn(turn, 'event-id', config, '/private/reports');
    const [suite, options] = vi.mocked(evaluateWithSource).mock.calls[0];
    expect(suite.sharing).toBe(false);
    expect(suite.writeLatestResults).toBe(true);
    expect(options).toMatchObject({ cache: false, maxConcurrency: 1 });
    expect(suite.tests).toEqual([
      expect.objectContaining({
        vars: { input: 'original request', rubric: 'reference' },
        metadata: expect.objectContaining({
          sessionId: 's',
          turnId: 't',
          onlineEventId: 'event-id',
        }),
      }),
    ]);
    const provider = (suite.providers as ApiProvider[])[0];
    expect(provider.id()).toBe('online:generic');
    expect(await provider.callApi('anything')).toEqual({ output: '' });
    expect(suite.outputPath).toEqual([
      path.join('/private/reports', 'event-id.json'),
      path.join('/private/reports', 'event-id.html'),
    ]);
  });
});
