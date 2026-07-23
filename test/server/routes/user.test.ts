import type { Server } from 'node:http';

import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../src/server/server';

// Mock dependencies before imports
vi.mock('../../../src/globalConfig/accounts');
vi.mock('../../../src/globalConfig/cloud');
vi.mock('../../../src/telemetry');

// Import after mocking
import {
  checkEmailStatus,
  getCloudUserEmail,
  getUserEmail,
  setUserEmail,
} from '../../../src/globalConfig/accounts';
import { cloudConfig } from '../../../src/globalConfig/cloud';
import telemetry from '../../../src/telemetry';

const mockedSetUserEmail = vi.mocked(setUserEmail);
const mockedCheckEmailStatus = vi.mocked(checkEmailStatus);
const mockedGetCloudUserEmail = vi.mocked(getCloudUserEmail);
const mockedGetUserEmail = vi.mocked(getUserEmail);
const mockedCloudConfig = vi.mocked(cloudConfig);
const mockedTelemetry = vi.mocked(telemetry);

describe('User Routes', () => {
  let api: ReturnType<typeof request.agent>;
  let server: Server;

  beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server = createApp().listen(0, '127.0.0.1', (error?: Error) =>
        error ? reject(error) : resolve(),
      );
    });
    api = request.agent(server);
  });

  afterAll(async () => {
    if (!server.listening) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  beforeEach(() => {
    vi.resetAllMocks();

    // Setup telemetry mock
    mockedTelemetry.record = vi.fn().mockResolvedValue(undefined);
    mockedTelemetry.saveConsent = vi.fn().mockResolvedValue(undefined);
    mockedCloudConfig.isEnabled.mockReturnValue(false);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('GET /api/user/email', () => {
    it('returns the local email when cloud authentication is disabled', async () => {
      mockedGetUserEmail.mockReturnValue('local@example.com');

      const response = await api.get('/api/user/email');

      expect(response.status).toBe(200);
      expect(response.body.email).toBe('local@example.com');
      expect(mockedGetCloudUserEmail).not.toHaveBeenCalled();
    });

    it('returns the token-backed identity when cloud authentication is enabled', async () => {
      mockedCloudConfig.isEnabled.mockReturnValue(true);
      mockedGetUserEmail.mockReturnValue('stale@example.com');
      mockedGetCloudUserEmail.mockResolvedValue('cloud-user@example.com');

      const response = await api.get('/api/user/email');

      expect(response.status).toBe(200);
      expect(response.body.email).toBe('cloud-user@example.com');
      expect(mockedGetCloudUserEmail).toHaveBeenCalledOnce();
    });

    it('does not expose cloud authentication errors', async () => {
      mockedCloudConfig.isEnabled.mockReturnValue(true);
      mockedGetCloudUserEmail.mockRejectedValue(new Error('token details'));

      const response = await api.get('/api/user/email');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to get email' });
      expect(response.text).not.toContain('token details');
    });
  });

  describe('POST /api/user/email', () => {
    it('should return 400 when body is empty', async () => {
      const response = await api.post('/api/user/email').send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('email');
    });

    it('should return 400 when email is not a string', async () => {
      const response = await api.post('/api/user/email').send({ email: 123 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('email');
    });

    it('should return 200 when email is valid', async () => {
      mockedSetUserEmail.mockImplementation(() => {});

      const response = await api.post('/api/user/email').send({ email: 'test@example.com' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Email updated');
      expect(mockedSetUserEmail).toHaveBeenCalledWith('test@example.com');
      expect(mockedTelemetry.record).toHaveBeenCalled();
      expect(mockedTelemetry.saveConsent).toHaveBeenCalled();
    });

    it('should reject manually changing the authenticated cloud email', async () => {
      mockedCloudConfig.isEnabled.mockReturnValue(true);

      const response = await api
        .post('/api/user/email')
        .send({ email: 'impersonated@example.com' });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Email is managed through Promptfoo Cloud authentication');
      expect(mockedSetUserEmail).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/user/email/clear', () => {
    it('should reject clearing the authenticated cloud email', async () => {
      mockedCloudConfig.isEnabled.mockReturnValue(true);

      const response = await api.put('/api/user/email/clear');

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Email is managed through Promptfoo Cloud authentication');
    });
  });

  describe('GET /api/user/email/status', () => {
    beforeEach(() => {
      mockedCheckEmailStatus.mockResolvedValue({
        hasEmail: true,
        email: 'test@example.com',
        status: 'ok',
      });
    });

    it('should return 200 with default validate=false when no query param', async () => {
      const response = await api.get('/api/user/email/status');

      expect(response.status).toBe(200);
      expect(response.body.hasEmail).toBe(true);
      expect(response.body.email).toBe('test@example.com');
      expect(response.body.status).toBe('ok');
      expect(mockedCheckEmailStatus).toHaveBeenCalledWith({ validate: false });
    });

    it('should return 200 when validate=true', async () => {
      const response = await api.get('/api/user/email/status?validate=true');

      expect(response.status).toBe(200);
      expect(response.body.hasEmail).toBe(true);
      expect(response.body.email).toBe('test@example.com');
      expect(response.body.status).toBe('ok');
      expect(mockedCheckEmailStatus).toHaveBeenCalledWith({ validate: true });
    });

    it('should return 200 when validate=yes (permissive - treated as false)', async () => {
      const response = await api.get('/api/user/email/status?validate=yes');

      expect(response.status).toBe(200);
      expect(response.body.hasEmail).toBe(true);
      expect(mockedCheckEmailStatus).toHaveBeenCalledWith({ validate: false });
    });

    it('should return 200 when validate=1 (permissive - treated as false)', async () => {
      const response = await api.get('/api/user/email/status?validate=1');

      expect(response.status).toBe(200);
      expect(response.body.hasEmail).toBe(true);
      expect(mockedCheckEmailStatus).toHaveBeenCalledWith({ validate: false });
    });

    it('should return 200 when validate is repeated (permissive - treated as false)', async () => {
      const response = await api.get('/api/user/email/status?validate=true&validate=false');

      expect(response.status).toBe(200);
      expect(response.body.hasEmail).toBe(true);
      expect(mockedCheckEmailStatus).toHaveBeenCalledWith({ validate: false });
    });
  });

  describe('POST /api/user/login', () => {
    it('should return 400 when body is empty', async () => {
      const response = await api.post('/api/user/login').send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('apiKey');
    });

    it('should return 400 when apiKey is not a string', async () => {
      const response = await api.post('/api/user/login').send({ apiKey: 123 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('apiKey');
    });

    it('should return 400 when apiKey is empty string', async () => {
      const response = await api.post('/api/user/login').send({ apiKey: '' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('API key is required');
    });
  });
});
