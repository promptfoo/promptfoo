import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/updates');
vi.mock('../../../src/updates/updateCommands');
vi.mock('../../../src/util/promptfooCommand');

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
    vi.resetAllMocks();
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
  });

  it('should not return 500 when fetch fails (graceful fallback)', async () => {
    mockedGetLatestVersion.mockRejectedValue(new Error('Network error'));

    const response = await request(app).get('/api/version');

    // Should still return 200, not 500 — schema must match even on fallback path
    expect(response.status).toBe(200);
    expect(typeof response.body.currentVersion).toBe('string');
    expect(typeof response.body.latestVersion).toBe('string');
    expect(typeof response.body.updateAvailable).toBe('boolean');
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
