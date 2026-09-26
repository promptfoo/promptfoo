import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCacheEnabled } from '../../src/cache';
import { cloudConfig } from '../../src/globalConfig/cloud';
import { readGlobalConfig, writeGlobalConfig } from '../../src/globalConfig/globalConfig';
import { evaluate } from '../../src/index';
import { PromptfooSimulatedUserProvider } from '../../src/providers/promptfoo';
import { PromptfooModelProvider } from '../../src/providers/promptfooModel';
import { doRemoteGrading } from '../../src/remoteGrading';
import { getConfigDirectoryPath, setConfigDirectoryPath } from '../../src/util/config/manage';
import { mockProcessEnv } from '../util/utils';

vi.mock('../../src/telemetry');

const apiHost = 'https://cloud.example.com';
const requests: Array<{ path: string; team: string | null; body?: any }> = [];
const team = (id: string, organizationId: string) => ({
  id,
  organizationId,
  name: id,
  slug: id,
  createdAt: '2025-01-01',
  updatedAt: '2025-01-01',
});
let directory: string;
let previousDirectory: string;
let restoreEnv: () => void;
let failDiscovery: boolean;

beforeEach(() => {
  previousDirectory = getConfigDirectoryPath();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-task-team-'));
  setConfigDirectoryPath(directory);
  restoreEnv = mockProcessEnv({
    PROMPTFOO_API_KEY: 'environment-a',
    PROMPTFOO_CLOUD_API_URL: apiHost,
    PROMPTFOO_CLOUD_AUTH_HEADER: undefined,
    PROMPTFOO_REMOTE_GENERATION_URL: undefined,
    PROMPTFOO_DISABLE_REMOTE_GENERATION: 'false',
    PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION: 'false',
    PROMPTFOO_DISABLE_TELEMETRY: 'true',
    PROMPTFOO_DISABLE_SHARING: 'true',
    PROMPTFOO_CACHE_ENABLED: 'false',
  });
  writeGlobalConfig({
    id: 'task-team-context',
    cloud: {
      currentOrganizationId: 'org-a',
      teams: { 'org-a': { currentTeamId: 'selected-a' }, 'org-b': { currentTeamId: 'selected-b' } },
    },
  });
  requests.length = 0;
  failDiscovery = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, options?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const headers = new Headers(options?.headers);
      const body = options?.body ? JSON.parse(String(options.body)) : undefined;
      requests.push({ path: url.pathname, team: headers.get('x-promptfoo-team-id'), body });
      if (url.pathname === '/api/v1/users/me') {
        return Response.json({
          organization: {
            id: headers.get('Authorization') === 'Bearer environment-b' ? 'org-b' : 'org-a',
          },
        });
      }
      if (url.pathname === '/api/v1/users/me/teams') {
        return failDiscovery
          ? new Response('Unavailable', { status: 503 })
          : Response.json([team('selected-a', 'org-a'), team('selected-b', 'org-b')]);
      }
      if (url.pathname === '/api/v1/task') {
        return Response.json({
          result:
            body.task === 'promptfoo:model'
              ? { choices: [{ message: { content: 'Hello QA' } }] }
              : body.task === 'llm-rubric'
                ? { pass: true, score: 1, reason: 'Matches' }
                : 'Hello QA',
        });
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    }),
  );
});

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  restoreEnv();
  setConfigDirectoryPath(previousDirectory);
  fs.rmSync(directory, { recursive: true, force: true });
});

const model = () => new PromptfooModelProvider('test-model').callApi('Hello');
const grade = () =>
  withCacheEnabled(false, () =>
    doRemoteGrading({ task: 'llm-rubric', output: 'Hello QA', rubric: 'Starts with Hello' }),
  );
const simulate = () =>
  new PromptfooSimulatedUserProvider({ instructions: 'Say hello' }, 'tau').callApi('[]');

describe('Cloud task team recovery', () => {
  it.each([
    ['model', model],
    ['grading', grade],
    ['simulated user', simulate],
  ] as const)('restores the selected team before a direct %s request', async (_name, call) => {
    await call();
    expect(requests.filter((r) => r.path === '/api/v1/task')).toEqual([
      expect.objectContaining({ team: 'selected-a' }),
    ]);
    expect(cloudConfig.getRequestConfig().teamId).toBe('selected-a');
  });

  it('restores the same-org preference after a credential rotation', async () => {
    await model();
    vi.stubEnv('PROMPTFOO_API_KEY', 'rotated-a');
    expect(cloudConfig.getRequestConfig().teamId).toBeUndefined();
    await model();
    expect(requests.filter((r) => r.path === '/api/v1/task').map((r) => r.team)).toEqual([
      'selected-a',
      'selected-a',
    ]);
  });

  it('restores only the new organization preference after a credential rotation', async () => {
    await model();
    vi.stubEnv('PROMPTFOO_API_KEY', 'environment-b');
    await model();
    expect(requests.filter((r) => r.path === '/api/v1/task').map((r) => r.team)).toEqual([
      'selected-a',
      'selected-b',
    ]);
  });

  it('coalesces concurrent recovery and avoids directory requests after recovery', async () => {
    await Promise.all([model(), grade(), simulate()]);
    await model();
    expect(requests.filter((r) => r.path === '/api/v1/users/me')).toHaveLength(1);
    expect(requests.filter((r) => r.path === '/api/v1/users/me/teams')).toHaveLength(1);
    expect(requests.filter((r) => r.path === '/api/v1/task').map((r) => r.team)).toEqual(
      Array(4).fill('selected-a'),
    );
  });

  it('recovers before public Node evaluate dispatches model calls', async () => {
    const evalRecord = await evaluate(
      {
        prompts: ['Hello'],
        providers: ['promptfoo:model:test-model'],
        sharing: false,
        tests: [{ assert: [{ type: 'equals', value: 'Hello QA' }] }],
      },
      { cache: false },
    );
    const summary = await evalRecord.toEvaluateSummary();
    expect(summary.results[0]).toMatchObject({
      success: true,
      score: 1,
      response: { output: 'Hello QA' },
    });
    expect(requests.filter((r) => r.path === '/api/v1/task')[0].team).toBe('selected-a');
  });

  it('keeps a local echo evaluation offline with an unresolved environment preference', async () => {
    const before = readGlobalConfig();
    const evalRecord = await evaluate(
      {
        prompts: ['Hello'],
        providers: ['echo'],
        sharing: false,
        tests: [{ assert: [{ type: 'equals', value: 'Hello' }] }],
      },
      { cache: false },
    );
    expect((await evalRecord.toEvaluateSummary()).results[0].success).toBe(true);
    expect(requests).toEqual([]);
    expect(readGlobalConfig()).toEqual(before);
  });

  it('does not dispatch a task with the default team when discovery fails', async () => {
    failDiscovery = true;
    await expect(model()).rejects.toThrow('Failed to get user teams');
    expect(requests.some((r) => r.path === '/api/v1/task')).toBe(false);
    expect(cloudConfig.hasPendingEnvironmentSelection()).toBe(true);
    failDiscovery = false;
    await model();
    expect(requests.at(-1)?.team).toBe('selected-a');
  });

  it('preserves explicit target routing without discovering a default team', async () => {
    await new PromptfooSimulatedUserProvider({ targetId: 'assigned-target' }, 'tau').callApi('[]');
    expect(requests).toEqual([
      expect.objectContaining({
        path: '/api/v1/task',
        body: expect.objectContaining({ targetId: 'assigned-target' }),
      }),
    ]);
    expect(cloudConfig.hasPendingEnvironmentSelection()).toBe(true);
  });

  it('leaves custom task endpoints independent of Cloud team discovery', async () => {
    vi.stubEnv('PROMPTFOO_REMOTE_GENERATION_URL', 'https://custom.example.com/api/v1/task');
    await grade();
    expect(requests).toEqual([expect.objectContaining({ path: '/api/v1/task', team: null })]);
    expect(cloudConfig.hasPendingEnvironmentSelection()).toBe(true);
  });

  it('does not introduce discovery when no preference has been saved', async () => {
    writeGlobalConfig({ id: 'fresh-installation' });
    await model();
    expect(requests).toEqual([expect.objectContaining({ path: '/api/v1/task', team: null })]);
  });
});
