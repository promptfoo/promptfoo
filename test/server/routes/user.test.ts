import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../src/server/server';

// Mock dependencies before imports
vi.mock('../../../src/globalConfig/accounts');
vi.mock('../../../src/globalConfig/cloud');
vi.mock('../../../src/telemetry');

// Import after mocking
import { checkEmailStatus, setUserEmail } from '../../../src/globalConfig/accounts';
import telemetry from '../../../src/telemetry';

const mockedSetUserEmail = vi.mocked(setUserEmail);
const mockedCheckEmailStatus = vi.mocked(checkEmailStatus);
const mockedTelemetry = vi.mocked(telemetry);

describe('User Routes', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.resetAllMocks();

    // Setup telemetry mock
    mockedTelemetry.record = vi.fn().mockResolvedValue(undefined);
    mockedTelemetry.saveConsent = vi.fn().mockResolvedValue(undefined);

    app = createApp();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('POST /api/user/email', () => {
    it('should return 400 when body is empty', async () => {
      const response = await request(app).post('/api/user/email').send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('email');
    });

    it('should return 400 when email is not a string', async () => {
      const response = await request(app).post('/api/user/email').send({ email: 123 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('email');
    });

    it('should return 200 when email is valid', async () => {
      mockedSetUserEmail.mockImplementation(() => {});

      const response = await request(app)
        .post('/api/user/email')
        .send({ email: 'test@example.com' });

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
      const response = await request(app).get('/api/user/email/status');

      expect(response.status).toBe(200);
      expect(response.body.hasEmail).toBe(true);
      expect(response.body.email).toBe('test@example.com');
      expect(response.body.status).toBe('ok');
      expect(mockedCheckEmailStatus).toHaveBeenCalledWith({ validate: false });
    });

    it('should return 200 when validate=true', async () => {
      const response = await request(app).get('/api/user/email/status?validate=true');

      expect(response.status).toBe(200);
      expect(response.body.hasEmail).toBe(true);
      expect(response.body.email).toBe('test@example.com');
      expect(response.body.status).toBe('ok');
      expect(mockedCheckEmailStatus).toHaveBeenCalledWith({ validate: true });
    });

    it('should return 200 when validate=yes (permissive - treated as false)', async () => {
      const response = await request(app).get('/api/user/email/status?validate=yes');

      expect(response.status).toBe(200);
      expect(response.body.hasEmail).toBe(true);
      expect(mockedCheckEmailStatus).toHaveBeenCalledWith({ validate: false });
    });

    it('should return 200 when validate=1 (permissive - treated as false)', async () => {
      const response = await request(app).get('/api/user/email/status?validate=1');

      expect(response.status).toBe(200);
      expect(response.body.hasEmail).toBe(true);
      expect(mockedCheckEmailStatus).toHaveBeenCalledWith({ validate: false });
    });
  });

  describe('POST /api/user/login', () => {
    it('should return 400 when body is empty', async () => {
      const response = await request(app).post('/api/user/login').send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('apiKey');
    });

    it('should return 400 when apiKey is not a string', async () => {
      const response = await request(app).post('/api/user/login').send({ apiKey: 123 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('apiKey');
    });

    it('should return 400 when apiKey is empty string', async () => {
      const response = await request(app).post('/api/user/login').send({ apiKey: '' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('API key is required');
    });
  });
});
