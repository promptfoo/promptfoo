import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';

import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cloudConfig } from '../../../src/globalConfig/cloud';
import { readGlobalConfig } from '../../../src/globalConfig/globalConfig';
import { userRouter } from '../../../src/server/routes/user';
import telemetry from '../../../src/telemetry';
import { setConfigDirectoryPath } from '../../../src/util/config/manage';
import { fetchWithProxy } from '../../../src/util/fetch/index';
import { getCloudBearerToken, getCloudTaskTeamId } from '../../../src/util/fetch/monkeyPatchFetch';
import { mockProcessEnv } from '../../util/utils';

vi.mock('../../../src/util/fetch/index');
vi.mock('../../../src/telemetry');
vi.mock('../../../src/logger');

const oldSession = {
  token: 'old-key',
  apiHost: 'https://old.example.com',
  user: { id: 'old-user', name: 'Old User', email: 'old@example.com' },
  organization: { id: 'old-org', name: 'Old Org' },
  app: { url: 'https://old.example.com' },
  teamId: 'old-team',
};
const validation = {
  user: { id: 'new-user', name: 'New User', email: 'new@example.com' },
  organization: { id: 'new-org', name: 'New Org' },
  app: { url: 'https://new.example.com' },
};
const team = (id: string, organizationId: string, createdAt: string) => ({
  id,
  name: id,
  slug: id,
  organizationId,
  createdAt,
  updatedAt: createdAt,
});

describe('Cloud login route with persisted configuration', () => {
  let api: ReturnType<typeof request.agent>;
  let server: Server;
  let configDirectory: string;
  let restoreEnv: () => void;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/user', userRouter);
    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, '127.0.0.1', (error?: Error) => (error ? reject(error) : resolve()));
    });
    api = request.agent(server);
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  beforeEach(() => {
    vi.resetAllMocks();
    restoreEnv = mockProcessEnv({ PROMPTFOO_API_KEY: undefined });
    configDirectory = mkdtempSync(path.join(tmpdir(), 'promptfoo-user-login-'));
    setConfigDirectoryPath(configDirectory);
    cloudConfig.saveValidatedApiToken(oldSession);
    vi.mocked(fetchWithProxy).mockImplementation(async (url) => {
      if (String(url).endsWith('/users/me')) {
        return Response.json(validation);
      }
      if (String(url).endsWith('/users/me/teams')) {
        return Response.json([
          team('foreign', 'old-org', '2020'),
          team('newer', 'new-org', '2024'),
          team('oldest', 'new-org', '2023'),
        ]);
      }
      throw new Error('Unexpected request');
    });
  });

  afterEach(() => {
    setConfigDirectoryPath(undefined);
    rmSync(configDirectory, { recursive: true, force: true });
    restoreEnv();
    vi.restoreAllMocks();
  });

  it('saves the candidate identity, organization and resolved team together', async () => {
    const response = await api.post('/api/user/login').send({
      apiKey: 'new-key',
      apiHost: 'https://new.example.com/',
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, ...validation });
    expect(readGlobalConfig()).toMatchObject({
      account: { email: 'new@example.com', emailValidated: false, emailNeedsValidation: true },
      cloud: {
        apiKey: 'new-key',
        apiHost: 'https://new.example.com',
        appUrl: 'https://new.example.com',
        currentOrganizationId: 'new-org',
        teams: { 'new-org': { currentTeamId: 'oldest' }, 'old-org': { currentTeamId: 'old-team' } },
      },
    });
    expect(getCloudBearerToken('https://new.example.com/api/v1/task')).toBe('Bearer new-key');
    expect(getCloudTaskTeamId('https://new.example.com/api/v1/task')).toBe('oldest');
    expect(getCloudTaskTeamId('https://old.example.com/api/v1/task')).toBeUndefined();
    expect(fetchWithProxy).toHaveBeenCalledWith(
      'https://new.example.com/api/v1/users/me/teams',
      expect.objectContaining({
        headers: { Authorization: 'Bearer new-key' },
        skipCloudAuthInjection: true,
      }),
    );
  });

  it.each(['empty', 'unavailable'] as const)(
    'updates team preference only when team discovery is authoritative (%s)',
    async (scenario) => {
      cloudConfig.setCurrentTeamId('stale', 'new-org');
      vi.mocked(fetchWithProxy).mockImplementation(async (url) =>
        String(url).endsWith('/users/me')
          ? Response.json(validation)
          : scenario === 'empty'
            ? Response.json([])
            : new Response(null, { status: 503 }),
      );
      const response = await api.post('/api/user/login').send({ apiKey: 'new-key' });
      expect(response.status).toBe(200);
      const config = readGlobalConfig();
      expect(config.cloud?.currentOrganizationId).toBe('new-org');
      expect(config.cloud?.apiKey).toBe('new-key');
      expect(config.cloud?.teams?.['new-org']?.currentTeamId).toBe(
        scenario === 'empty' ? undefined : 'stale',
      );
      expect(getCloudTaskTeamId(`${cloudConfig.getApiHost()}/api/v1/task`)).toBe(
        scenario === 'empty' ? undefined : 'stale',
      );
      expect(config.cloud?.teams?.['old-org']?.currentTeamId).toBe('old-team');
    },
  );

  it('preserves the remembered team when the same key logs in during a team-service outage', async () => {
    vi.mocked(fetchWithProxy).mockImplementation(async (url) =>
      String(url).endsWith('/users/me')
        ? Response.json(oldSession)
        : new Response(null, { status: 503 }),
    );
    const response = await api.post('/api/user/login').send({ apiKey: 'old-key' });
    expect(response.status).toBe(200);
    expect(readGlobalConfig().cloud).toMatchObject({
      apiKey: 'old-key',
      currentOrganizationId: 'old-org',
      teams: { 'old-org': { currentTeamId: 'old-team' } },
    });
  });

  it.each([{}, { apiKey: 42 }, { apiKey: '' }, { apiKey: 'key', apiHost: 'invalid' }])(
    'rejects malformed input before changing the existing login: %j',
    async (body) => {
      const saved = readGlobalConfig();
      const response = await api.post('/api/user/login').send(body);
      expect(response.status).toBe(400);
      expect(fetchWithProxy).not.toHaveBeenCalled();
      expect(readGlobalConfig()).toEqual(saved);
    },
  );

  it.each(['rejected', 'malformed'] as const)(
    'keeps the saved session and returns a generic error for %s validation',
    async (failure) => {
      const saved = readGlobalConfig();
      vi.mocked(fetchWithProxy).mockResolvedValue(
        failure === 'rejected'
          ? new Response('Upstream diagnostic detail', { status: 401 })
          : Response.json({ ...validation, user: { ...validation.user, email: 'invalid' } }),
      );
      const response = await api.post('/api/user/login').send({ apiKey: 'new-key' });
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid API key or authentication failed' });
      expect(readGlobalConfig()).toEqual(saved);
    },
  );

  it('returns success for a saved login even when telemetry fails', async () => {
    vi.mocked(telemetry.record).mockRejectedValue(new Error('Telemetry unavailable'));
    const response = await api.post('/api/user/login').send({ apiKey: 'new-key' });
    expect(response.status).toBe(200);
    expect(readGlobalConfig().cloud?.apiKey).toBe('new-key');
  });

  it('clears stored credentials and identity on logout', async () => {
    const response = await api.post('/api/user/logout');
    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Logged out successfully');
    expect(readGlobalConfig().cloud).toBeUndefined();
    expect(readGlobalConfig().account?.email).toBeUndefined();
    expect(cloudConfig.isEnabled()).toBe(false);
  });

  it('explains when environment authentication remains after logout', async () => {
    const restoreCredential = mockProcessEnv({ PROMPTFOO_API_KEY: 'environment-key' });
    try {
      const response = await api.post('/api/user/logout');
      expect(response.status).toBe(200);
      expect(response.body.message).toContain('PROMPTFOO_API_KEY still provides authentication');
      expect(response.body.message).not.toContain('environment-key');
      expect(readGlobalConfig().cloud).toBeUndefined();
      expect(cloudConfig.isEnabled()).toBe(true);
    } finally {
      restoreCredential();
    }
  });

  it('does not claim logout succeeded when persistence fails', async () => {
    vi.spyOn(cloudConfig, 'delete').mockImplementation(() => {
      throw new Error('Cannot write config');
    });
    const response = await api.post('/api/user/logout');
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Logout failed' });
    expect(readGlobalConfig().cloud?.apiKey).toBe('old-key');
  });
});
