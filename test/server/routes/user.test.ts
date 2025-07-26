import request from 'supertest';
import express from 'express';
import { userRouter } from '../../../src/server/routes/user';
import * as globalConfig from '../../../src/globalConfig/accounts';

// Mock the global config module
jest.mock('../../../src/globalConfig/accounts', () => ({
  getUserEmail: jest.fn(),
  getUserId: jest.fn(),
  setUserEmail: jest.fn(),
  checkEmailStatus: jest.fn(),
}));

// Mock the cloud config module
jest.mock('../../../src/globalConfig/cloud', () => ({
  cloudConfig: {
    isEnabled: jest.fn(),
    getApiKey: jest.fn(),
    getAppUrl: jest.fn(),
  },
}));

import { cloudConfig } from '../../../src/globalConfig/cloud';

describe('userRouter', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/user', userRouter);
  });

  describe('GET /api/user/cloud/status', () => {
    it('should return authenticated status when cloud is enabled', async () => {
      jest.mocked(cloudConfig.isEnabled).mockReturnValue(true);
      jest.mocked(cloudConfig.getApiKey).mockReturnValue('test-api-key');
      jest.mocked(cloudConfig.getAppUrl).mockReturnValue('https://app.promptfoo.app');

      const response = await request(app).get('/api/user/cloud/status').expect(200);

      expect(response.body).toEqual({
        isAuthenticated: true,
        hasApiKey: true,
        appUrl: 'https://app.promptfoo.app',
        isEnterprise: false,
      });
    });

    it('should return unauthenticated status when cloud is not enabled', async () => {
      jest.mocked(cloudConfig.isEnabled).mockReturnValue(false);
      jest.mocked(cloudConfig.getApiKey).mockReturnValue(undefined);
      jest.mocked(cloudConfig.getAppUrl).mockReturnValue('');

      const response = await request(app).get('/api/user/cloud/status').expect(200);

      expect(response.body).toEqual({
        isAuthenticated: false,
        hasApiKey: false,
        appUrl: null,
        isEnterprise: false,
      });
    });

    it('should detect enterprise deployment when URL does not include promptfoo.app', async () => {
      jest.mocked(cloudConfig.isEnabled).mockReturnValue(true);
      jest.mocked(cloudConfig.getApiKey).mockReturnValue('enterprise-api-key');
      jest.mocked(cloudConfig.getAppUrl).mockReturnValue('https://enterprise.company.com');

      const response = await request(app).get('/api/user/cloud/status').expect(200);

      expect(response.body).toEqual({
        isAuthenticated: true,
        hasApiKey: true,
        appUrl: 'https://enterprise.company.com',
        isEnterprise: true,
      });
    });

    it('should detect enterprise deployment even for unauthenticated users', async () => {
      jest.mocked(cloudConfig.isEnabled).mockReturnValue(false);
      jest.mocked(cloudConfig.getApiKey).mockReturnValue(undefined);
      jest.mocked(cloudConfig.getAppUrl).mockReturnValue('https://enterprise.company.com');

      const response = await request(app).get('/api/user/cloud/status').expect(200);

      expect(response.body).toEqual({
        isAuthenticated: false,
        hasApiKey: false,
        appUrl: null, // Should not expose URL when not authenticated
        isEnterprise: true, // Should still detect enterprise deployment
      });
    });

    it('should handle errors gracefully', async () => {
      jest.mocked(cloudConfig.isEnabled).mockImplementation(() => {
        throw new Error('Test error');
      });

      const response = await request(app).get('/api/user/cloud/status').expect(500);

      expect(response.body).toEqual({
        error: 'Failed to check cloud status',
      });
    });
  });

  describe('GET /api/user/email', () => {
    it('should return email when user has email', async () => {
      jest.mocked(globalConfig.getUserEmail).mockReturnValue('test@example.com');

      const response = await request(app).get('/api/user/email').expect(200);

      expect(response.body).toEqual({
        email: 'test@example.com',
      });
    });

    it('should return 404 when user has no email', async () => {
      jest.mocked(globalConfig.getUserEmail).mockReturnValue(null);

      const response = await request(app).get('/api/user/email').expect(404);

      expect(response.body).toEqual({
        error: 'User not found',
      });
    });
  });

  describe('GET /api/user/id', () => {
    it('should return user id', async () => {
      jest.mocked(globalConfig.getUserId).mockReturnValue('test-user-id');

      const response = await request(app).get('/api/user/id').expect(200);

      expect(response.body).toEqual({
        id: 'test-user-id',
      });
    });
  });
});
