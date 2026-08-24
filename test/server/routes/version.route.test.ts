import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/updates');
vi.mock('../../../src/updates/updateCommands');
vi.mock('../../../src/util/promptfooCommand');

import { createApp } from '../../../src/server/server';
import { getLatestVersion } from '../../../src/updates';
import { getUpdateCommands } from '../../../src/updates/updateCommands';
import { isRunningUnderNpx } from '../../../src/util/promptfooCommand';
import { mockProcessEnv } from '../../util/utils';

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
    vi.resetAllMocks();
  });

  /** Prime the route's 5-minute version cache at a fixed time so a test can then advance the clock. */
  async function seedVersionCache(isoTime: string, latestVersion = '98.0.0') {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(isoTime));
    mockedGetLatestVersion.mockResolvedValueOnce(latestVersion);

    const response = await request(app).get('/api/version');

    expect(response.status).toBe(200);
    expect(response.body.latestVersion).toBe(latestVersion);
  }

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
  });

  it('should not return 500 when fetch fails (graceful fallback)', async () => {
    await seedVersionCache('2099-01-01T00:00:00.000Z');

    vi.setSystemTime(new Date('2099-01-01T00:06:00.000Z'));
    mockedGetLatestVersion.mockRejectedValueOnce(new Error('Network error'));

    const response = await request(app).get('/api/version');

    // An expired cache must attempt the failing fetch and retain its stale value.
    expect(response.status).toBe(200);
    expect(mockedGetLatestVersion).toHaveBeenCalledTimes(2);
    expect(typeof response.body.currentVersion).toBe('string');
    expect(response.body.latestVersion).toBe('98.0.0');
    expect(response.body.updateAvailable).toBe(true);
  });

  it('should refresh a cached version when the clock moves backward', async () => {
    await seedVersionCache('2099-01-02T00:00:00.000Z');

    vi.setSystemTime(new Date('2099-01-01T23:59:00.000Z'));
    mockedGetLatestVersion.mockResolvedValueOnce('99.0.0');

    const response = await request(app).get('/api/version');

    expect(response.status).toBe(200);
    expect(mockedGetLatestVersion).toHaveBeenCalledTimes(2);
    expect(response.body.latestVersion).toBe('99.0.0');
  });

  it('should retry after the clock moves behind a failed update attempt', async () => {
    await seedVersionCache('2099-01-03T00:00:00.000Z');

    vi.setSystemTime(new Date('2099-01-03T00:10:00.000Z'));
    mockedGetLatestVersion.mockRejectedValueOnce(new Error('Network error'));

    const failedResponse = await request(app).get('/api/version');

    expect(failedResponse.status).toBe(200);
    expect(failedResponse.body.latestVersion).toBe('98.0.0');

    vi.setSystemTime(new Date('2099-01-03T00:06:00.000Z'));
    mockedGetLatestVersion.mockResolvedValueOnce('99.0.0');

    const response = await request(app).get('/api/version');

    expect(response.status).toBe(200);
    expect(mockedGetLatestVersion).toHaveBeenCalledTimes(3);
    expect(response.body.latestVersion).toBe('99.0.0');
  });

  it('should skip upstream update checks when they are disabled', async () => {
    const restoreEnv = mockProcessEnv({ PROMPTFOO_DISABLE_UPDATE: 'true' });

    try {
      const response = await request(app).get('/api/version');

      expect(response.status).toBe(200);
      expect(mockedGetLatestVersion).not.toHaveBeenCalled();
      expect(response.body.latestVersion).toBe(response.body.currentVersion);
      expect(response.body.updateAvailable).toBe(false);
    } finally {
      restoreEnv();
    }
  });

  it('should not classify generic self-hosted mode as Docker', async () => {
    const restoreEnv = mockProcessEnv({
      PROMPTFOO_OFFICIAL_DOCKER_IMAGE: undefined,
      PROMPTFOO_SELF_HOSTED: 'true',
    });
    mockedGetLatestVersion.mockResolvedValue('99.0.0');

    try {
      const response = await request(app).get('/api/version');

      expect(response.status).toBe(200);
      expect(response.body.selfHosted).toBe(true);
      expect(mockedGetUpdateCommands).toHaveBeenCalledWith({
        isContainer: false,
        isOfficialDockerImage: false,
        isNpx: false,
      });
    } finally {
      restoreEnv();
    }
  });

  it('should use Docker guidance only when the official-image marker is set', async () => {
    const restoreEnv = mockProcessEnv({
      PROMPTFOO_OFFICIAL_DOCKER_IMAGE: 'true',
      PROMPTFOO_RUNNING_IN_DOCKER: 'true',
      PROMPTFOO_SELF_HOSTED: 'true',
    });
    mockedGetLatestVersion.mockResolvedValue('99.0.0');

    try {
      const response = await request(app).get('/api/version');

      expect(response.status).toBe(200);
      expect(response.body.selfHosted).toBe(true);
      expect(mockedGetUpdateCommands).toHaveBeenCalledWith({
        isContainer: true,
        isOfficialDockerImage: true,
        isNpx: false,
      });
    } finally {
      restoreEnv();
    }
  });

  it('should distinguish custom containers from official images', async () => {
    const restoreEnv = mockProcessEnv({
      PROMPTFOO_OFFICIAL_DOCKER_IMAGE: undefined,
      PROMPTFOO_RUNNING_IN_DOCKER: 'true',
      PROMPTFOO_SELF_HOSTED: 'true',
    });
    mockedGetLatestVersion.mockResolvedValue('99.0.0');
    mockedGetUpdateCommands.mockReturnValue({
      primary: '',
      alternative: null,
      commandType: 'npm',
      isCustomContainer: true,
    });

    try {
      const response = await request(app).get('/api/version');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        commandType: 'npm',
        updateCommands: {
          primary: '',
          alternative: null,
          commandType: 'npm',
          isCustomContainer: true,
        },
      });
      expect(mockedGetUpdateCommands).toHaveBeenCalledWith({
        isContainer: true,
        isOfficialDockerImage: false,
        isNpx: false,
      });
    } finally {
      restoreEnv();
    }
  });

  it('should include all required fields matching UpdateCommandResult shape', async () => {
    mockedGetLatestVersion.mockResolvedValue('99.0.0');
    mockedGetUpdateCommands.mockReturnValue({
      primary: 'docker pull promptfoo/promptfoo:latest',
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
