/**
 * User API Contract Tests
 *
 * These tests capture the CURRENT behavior of user endpoints.
 * They serve as a safety net during DTO migration - if these fail,
 * we've broken the API contract.
 *
 * DO NOT modify these tests to match new behavior - the tests define
 * the contract that must be preserved.
 */
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../src/server/server';

// Mock dependencies to isolate the route handlers
vi.mock('../../../src/globalConfig/accounts');
vi.mock('../../../src/globalConfig/cloud');
vi.mock('../../../src/telemetry');

import * as accounts from '../../../src/globalConfig/accounts';
import { cloudConfig } from '../../../src/globalConfig/cloud';

const mockedAccounts = vi.mocked(accounts);
const mockedCloudConfig = vi.mocked(cloudConfig);

describe('User API Contracts', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ===========================================================================
  // GET /api/user/email
  // ===========================================================================
  describe('GET /api/user/email', () => {
    it('returns { email: string } when email is set', async () => {
      mockedAccounts.getUserEmail.mockReturnValue('test@example.com');

      const response = await request(app).get('/api/user/email');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ email: 'test@example.com' });
    });

    it('returns { email: null } when email is not set', async () => {
      mockedAccounts.getUserEmail.mockReturnValue('');

      const response = await request(app).get('/api/user/email');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ email: null });
    });

    it('returns { email: null } when email is undefined', async () => {
      mockedAccounts.getUserEmail.mockReturnValue(undefined as unknown as string);

      const response = await request(app).get('/api/user/email');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ email: null });
    });

    it('returns 500 with { error: string } on failure', async () => {
      mockedAccounts.getUserEmail.mockImplementation(() => {
        throw new Error('Database error');
      });

      const response = await request(app).get('/api/user/email');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
      expect(typeof response.body.error).toBe('string');
    });
  });

  // ===========================================================================
  // GET /api/user/id
  // ===========================================================================
  describe('GET /api/user/id', () => {
    it('returns { id: string }', async () => {
      mockedAccounts.getUserId.mockReturnValue('user-123-abc');

      const response = await request(app).get('/api/user/id');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ id: 'user-123-abc' });
    });

    it('returns 500 with { error: string } on failure', async () => {
      mockedAccounts.getUserId.mockImplementation(() => {
        throw new Error('Failed to get ID');
      });

      const response = await request(app).get('/api/user/id');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  // ===========================================================================
  // POST /api/user/email
  // ===========================================================================
  describe('POST /api/user/email', () => {
    it('returns { success: true, message: string } on valid email', async () => {
      mockedAccounts.setUserEmail.mockReturnValue(undefined);

      const response = await request(app)
        .post('/api/user/email')
        .send({ email: 'new@example.com' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        message: expect.any(String),
      });
    });

    it('returns 400 with { error: string } on invalid email', async () => {
      const response = await request(app).post('/api/user/email').send({ email: 'not-an-email' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(typeof response.body.error).toBe('string');
    });

    it('returns 400 with { error: string } on missing email', async () => {
      const response = await request(app).post('/api/user/email').send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  // ===========================================================================
  // PUT /api/user/email/clear
  // ===========================================================================
  describe('PUT /api/user/email/clear', () => {
    it('returns { success: true, message: string }', async () => {
      mockedAccounts.clearUserEmail.mockReturnValue(undefined);

      const response = await request(app).put('/api/user/email/clear');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        message: expect.any(String),
      });
    });

    it('returns 500 with { error: string } on failure', async () => {
      mockedAccounts.clearUserEmail.mockImplementation(() => {
        throw new Error('Failed to clear');
      });

      const response = await request(app).put('/api/user/email/clear');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  // ===========================================================================
  // GET /api/user/email/status
  // ===========================================================================
  describe('GET /api/user/email/status', () => {
    it('returns email status object', async () => {
      mockedAccounts.checkEmailStatus.mockResolvedValue({
        hasEmail: true,
        email: 'test@example.com',
        status: 'ok',
        message: undefined,
      });

      const response = await request(app).get('/api/user/email/status');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        hasEmail: true,
        email: 'test@example.com',
        status: 'ok',
      });
    });

    it('returns status with message when present', async () => {
      mockedAccounts.checkEmailStatus.mockResolvedValue({
        hasEmail: true,
        email: 'test@example.com',
        status: 'show_usage_warning',
        message: 'Approaching usage limit',
      });

      const response = await request(app).get('/api/user/email/status');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        hasEmail: true,
        status: 'show_usage_warning',
        message: 'Approaching usage limit',
      });
    });

    it('accepts validate query parameter', async () => {
      mockedAccounts.checkEmailStatus.mockResolvedValue({
        hasEmail: false,
        status: 'no_email',
      });

      const response = await request(app).get('/api/user/email/status?validate=true');

      expect(response.status).toBe(200);
      expect(mockedAccounts.checkEmailStatus).toHaveBeenCalledWith({ validate: true });
    });

    it('returns 500 with { error: string } on failure', async () => {
      mockedAccounts.checkEmailStatus.mockRejectedValue(new Error('Check failed'));

      const response = await request(app).get('/api/user/email/status');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  // ===========================================================================
  // POST /api/user/login
  // ===========================================================================
  describe('POST /api/user/login', () => {
    it('returns success response with user info', async () => {
      const now = new Date();
      mockedCloudConfig.getApiHost.mockReturnValue('https://api.example.com');
      mockedCloudConfig.validateAndSetApiToken.mockResolvedValue({
        user: {
          id: 'user-1',
          name: 'Test User',
          email: 'user@example.com',
          createdAt: now,
          updatedAt: now,
        },
        organization: { id: 'org-1', name: 'Test Org', createdAt: now, updatedAt: now },
        app: { url: 'https://app.example.com' },
      });

      const response = await request(app).post('/api/user/login').send({ apiKey: 'test-api-key' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        user: {
          id: 'user-1',
          name: 'Test User',
          email: 'user@example.com',
        },
        organization: {
          id: 'org-1',
          name: 'Test Org',
        },
        app: {
          url: 'https://app.example.com',
        },
      });
    });

    it('returns 400 with { error: string } on missing apiKey', async () => {
      const response = await request(app).post('/api/user/login').send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('returns 401 with { error: string } on invalid apiKey', async () => {
      mockedCloudConfig.getApiHost.mockReturnValue('https://api.example.com');
      mockedCloudConfig.validateAndSetApiToken.mockRejectedValue(new Error('Invalid API key'));

      const response = await request(app).post('/api/user/login').send({ apiKey: 'invalid-key' });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });
  });

  // ===========================================================================
  // POST /api/user/logout
  // ===========================================================================
  describe('POST /api/user/logout', () => {
    it('returns { success: true, message: string }', async () => {
      mockedAccounts.setUserEmail.mockReturnValue(undefined);
      mockedCloudConfig.delete.mockReturnValue(undefined);

      const response = await request(app).post('/api/user/logout');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        message: expect.any(String),
      });
    });

    it('returns 500 with { error: string } on failure', async () => {
      mockedAccounts.setUserEmail.mockImplementation(() => {
        throw new Error('Logout failed');
      });

      const response = await request(app).post('/api/user/logout');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  // ===========================================================================
  // GET /api/user/cloud-config
  // ===========================================================================
  describe('GET /api/user/cloud-config', () => {
    it('returns cloud config when enabled', async () => {
      mockedCloudConfig.getAppUrl.mockReturnValue('https://app.example.com');
      mockedCloudConfig.isEnabled.mockReturnValue(true);

      const response = await request(app).get('/api/user/cloud-config');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        appUrl: 'https://app.example.com',
        isEnabled: true,
      });
    });

    it('returns cloud config when disabled', async () => {
      mockedCloudConfig.getAppUrl.mockReturnValue('');
      mockedCloudConfig.isEnabled.mockReturnValue(false);

      const response = await request(app).get('/api/user/cloud-config');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        isEnabled: false,
      });
    });

    it('returns 500 with { error: string } on failure', async () => {
      mockedCloudConfig.getAppUrl.mockImplementation(() => {
        throw new Error('Config error');
      });

      const response = await request(app).get('/api/user/cloud-config');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });
});
