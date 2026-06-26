import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockProcessEnv } from '../../util/utils';

vi.mock('../../../src/updates', () => ({ getLatestVersion: vi.fn() }));
vi.mock('../../../src/updates/updateCommands', () => ({ getUpdateCommands: vi.fn() }));
vi.mock('../../../src/util/promptfooCommand', () => ({ isRunningUnderNpx: vi.fn() }));

import { createApp } from '../../../src/server/server';
import { getLatestVersion } from '../../../src/updates';
import { getUpdateCommands } from '../../../src/updates/updateCommands';
import { isRunningUnderNpx } from '../../../src/util/promptfooCommand';

const mockedGetLatestVersion = vi.mocked(getLatestVersion);
const mockedGetUpdateCommands = vi.mocked(getUpdateCommands);
const mockedIsRunningUnderNpx = vi.mocked(isRunningUnderNpx);

describe('Version Route', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.resetAllMocks();
    mockedIsRunningUnderNpx.mockReturnValue(false);
    mockedGetUpdateCommands.mockReturnValue({
      primary: 'npm install -g promptfoo@latest',
      alternative: 'npx promptfoo@latest',
      commandType: 'npm',
    });
    app = createApp();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should return 200 with valid response schema shape', async () => {
    mockedGetLatestVersion.mockResolvedValue('99.0.0');

    const response = await request(app).get('/api/version');

    // If schema validation fails (e.g. wrong field names), Response.parse() throws → 500
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      selfHosted: false,
      isNpx: false,
      updateCommands: {
        primary: 'npm install -g promptfoo@latest',
        alternative: 'npx promptfoo@latest',
        commandType: 'npm',
      },
      commandType: 'npm',
    });
    expect(typeof response.body.currentVersion).toBe('string');
    expect(typeof response.body.latestVersion).toBe('string');
    expect(typeof response.body.updateAvailable).toBe('boolean');
    expect(typeof response.body.updateBlockedByRuntime).toBe('boolean');
    if (process.versions.node.startsWith('20.')) {
      expect(response.body.runtimeNotice).toMatchObject({ currentMajor: 20, runtime: 'node' });
      expect(response.body.runtimePolicy).toEqual({ supportEndDate: '2026-07-30' });
    } else {
      expect(response.body.runtimeNotice).toBeNull();
      expect(response.body.runtimePolicy).toBeNull();
    }
  });

  it('should not return 500 when fetch fails (graceful fallback)', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2099-01-01T00:00:00.000Z'));
    mockedGetLatestVersion.mockRejectedValue(new Error('Network error'));

    const response = await request(app).get('/api/version');

    // Should still return 200, not 500 — schema must match even on fallback path
    expect(response.status).toBe(200);
    expect(mockedGetLatestVersion).toHaveBeenCalledTimes(1);
    expect(typeof response.body.currentVersion).toBe('string');
    expect(typeof response.body.latestVersion).toBe('string');
    expect(typeof response.body.updateAvailable).toBe('boolean');
    expect(typeof response.body.updateBlockedByRuntime).toBe('boolean');
  });

  it('should skip upstream update checks when they are disabled', async () => {
    const restoreEnv = mockProcessEnv({ PROMPTFOO_DISABLE_UPDATE: 'true' });

    try {
      const response = await request(app).get('/api/version');

      expect(response.status).toBe(200);
      expect(mockedGetLatestVersion).not.toHaveBeenCalled();
      expect(response.body.latestVersion).toBe(response.body.currentVersion);
      expect(response.body.updateAvailable).toBe(false);
      if (process.versions.node.startsWith('20.')) {
        expect(response.body.runtimePolicy).toEqual({ supportEndDate: '2026-07-30' });
      }
    } finally {
      restoreEnv();
    }
  });

  it('should include all required fields matching UpdateCommandResult shape', async () => {
    mockedGetLatestVersion.mockResolvedValue('99.0.0');
    mockedGetUpdateCommands.mockReturnValue({
      primary: 'docker pull ghcr.io/promptfoo/promptfoo:latest',
      alternative: null,
      commandType: 'docker',
    });

    const response = await request(app).get('/api/version');

    expect(response.status).toBe(200);
    // Validates that updateCommands has primary/alternative (not global/npx)
    expect(response.body.updateCommands).toHaveProperty('primary');
    expect(response.body.updateCommands).toHaveProperty('alternative');
    expect(response.body.updateCommands).toHaveProperty('commandType');
    expect(response.body.updateCommands).not.toHaveProperty('global');
    expect(response.body.updateCommands).not.toHaveProperty('npx');
    expect(['docker', 'npx', 'npm']).toContain(response.body.commandType);
  });

  it('should block package updates but preserve Docker updates at the cutoff', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2099-01-01T00:00:00.000Z'));
    mockedGetLatestVersion.mockRejectedValueOnce(new Error('Seed future retry state'));
    const futureResponse = await request(app).get('/api/version');
    expect(futureResponse.status).toBe(200);

    mockedGetLatestVersion.mockReset();
    mockedGetLatestVersion.mockResolvedValue('99.0.0');
    vi.setSystemTime(new Date('2026-07-30T00:00:00.000Z'));

    const packageResponse = await request(app).get('/api/version');
    expect(packageResponse.status).toBe(200);
    expect(mockedGetLatestVersion).toHaveBeenCalledTimes(1);
    expect(packageResponse.body.updateBlockedByRuntime).toBe(
      process.versions.node.startsWith('20.'),
    );
    expect(packageResponse.body.updateAvailable).toBe(!process.versions.node.startsWith('20.'));

    mockedGetUpdateCommands.mockReturnValue({
      primary: 'docker pull ghcr.io/promptfoo/promptfoo:latest',
      alternative: null,
      commandType: 'docker',
    });
    const dockerResponse = await request(app).get('/api/version');
    expect(dockerResponse.status).toBe(200);
    expect(dockerResponse.body.updateBlockedByRuntime).toBe(false);
    expect(dockerResponse.body.updateAvailable).toBe(true);
  });

  it('should return 500 with fallback response when schema parse fails', async () => {
    mockedGetLatestVersion.mockResolvedValue('99.0.0');
    // Return an invalid shape that will cause VersionSchemas.Response.parse() to throw
    mockedGetUpdateCommands.mockReturnValue({
      primary: 'npm install -g promptfoo@latest',
      alternative: 'npx promptfoo@latest',
      commandType: 'invalid-type' as any,
    });

    const response = await request(app).get('/api/version');

    expect(response.status).toBe(500);
    expect(response.body).toHaveProperty('error', 'Failed to check version');
    expect(response.body).toHaveProperty('currentVersion');
    expect(response.body).toHaveProperty('updateCommands');
  });
});
