import type { Server } from 'node:http';

import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../src/server/server';

// Mock dependencies before imports
vi.mock('../../../src/globalConfig/accounts');
vi.mock('../../../src/globalConfig/cloud', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/globalConfig/cloud')>();
  return {
    ...actual,
    cloudConfig: {
      delete: vi.fn(),
      getApiHost: vi.fn(),
      getAppUrl: vi.fn(),
      isEnabled: vi.fn(),
      validateAndSetApiToken: vi.fn(),
    },
  };
});
vi.mock('../../../src/telemetry');

// Import after mocking
import { checkEmailStatus, setUserEmail } from '../../../src/globalConfig/accounts';
import { cloudConfig } from '../../../src/globalConfig/cloud';
import telemetry from '../../../src/telemetry';

const mockedSetUserEmail = vi.mocked(setUserEmail);
const mockedCheckEmailStatus = vi.mocked(checkEmailStatus);
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
  });

  afterEach(() => {
    vi.resetAllMocks();
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

  describe('GET /api/user/cloud-config', () => {
    it('should return configured cloud state', async () => {
      mockedCloudConfig.isEnabled.mockReturnValue(true);
      mockedCloudConfig.getAppUrl.mockReturnValue('https://app.promptfoo.app');

      const response = await api.get('/api/user/cloud-config');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        appUrl: 'https://app.promptfoo.app',
        isEnabled: true,
        isEnterprise: false,
      });
    });

    it('should retain a valid app URL when cloud is not configured', async () => {
      mockedCloudConfig.isEnabled.mockReturnValue(false);
      mockedCloudConfig.getAppUrl.mockReturnValue('https://app.promptfoo.app');

      const response = await api.get('/api/user/cloud-config');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        appUrl: 'https://app.promptfoo.app',
        isEnabled: false,
        isEnterprise: false,
      });
    });

    it('should detect enterprise deployment for custom domains', async () => {
      mockedCloudConfig.isEnabled.mockReturnValue(true);
      mockedCloudConfig.getAppUrl.mockReturnValue('https://enterprise.company.com');

      const response = await api.get('/api/user/cloud-config');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        appUrl: 'https://enterprise.company.com',
        isEnabled: true,
        isEnterprise: true,
      });
    });

    it('should not detect enterprise for standard promptfoo domains', async () => {
      const standardUrls = [
        'https://promptfoo.app',
        'https://www.promptfoo.app',
        'https://app.promptfoo.app',
      ];

      for (const url of standardUrls) {
        mockedCloudConfig.isEnabled.mockReturnValue(true);
        mockedCloudConfig.getAppUrl.mockReturnValue(url);

        const response = await api.get('/api/user/cloud-config');

        expect(response.status).toBe(200);
        expect(response.body.isEnterprise).toBe(false);
      }
    });

    it('should classify suspicious lookalike promptfoo domains as enterprise', async () => {
      const testCases = [
        'https://evil.promptfoo.app.attacker.com',
        'https://promptfoo.app.evil.com',
      ];

      for (const url of testCases) {
        mockedCloudConfig.isEnabled.mockReturnValue(false);
        mockedCloudConfig.getAppUrl.mockReturnValue(url);

        const response = await api.get('/api/user/cloud-config');

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          appUrl: url,
          isEnabled: false,
          isEnterprise: true,
        });
      }
    });

    it('should reject invalid or non-http app URLs for enterprise detection', async () => {
      const invalidUrls = ['not-a-url', 'javascript:alert(1)'];

      for (const url of invalidUrls) {
        mockedCloudConfig.isEnabled.mockReturnValue(true);
        mockedCloudConfig.getAppUrl.mockReturnValue(url);

        const response = await api.get('/api/user/cloud-config');

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          appUrl: null,
          isEnabled: true,
          isEnterprise: false,
        });
      }
    });

    it('should detect enterprise deployment even when cloud is not configured', async () => {
      mockedCloudConfig.isEnabled.mockReturnValue(false);
      mockedCloudConfig.getAppUrl.mockReturnValue('https://enterprise.company.com');

      const response = await api.get('/api/user/cloud-config');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        appUrl: 'https://enterprise.company.com',
        isEnabled: false,
        isEnterprise: true,
      });
    });

    it('should handle cloud config errors without exposing details', async () => {
      mockedCloudConfig.isEnabled.mockImplementation(() => {
        throw new Error('test error');
      });

      const response = await api.get('/api/user/cloud-config');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Failed to get cloud config',
      });
    });
  });
});
