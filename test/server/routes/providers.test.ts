import express from 'express';
import supertest from 'supertest';
import { loadApiProvider } from '../../../src/providers';
import { doTargetPurposeDiscovery } from '../../../src/redteam/commands/discover';
import { providersRouter } from '../../../src/server/routes/providers';
import type { ApiProvider } from '../../../src/types/providers';

jest.mock('../../../src/providers');
jest.mock('../../../src/redteam/commands/discover');

describe('providersRouter', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/providers', providersRouter);
  });

  describe('POST /providers/test', () => {
    beforeEach(() => {
      jest.mocked(loadApiProvider).mockReset();
    });

    it('should return 400 for invalid provider options', async () => {
      const response = await supertest(app).post('/providers/test').send({ invalid: 'options' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 if id is missing', async () => {
      const response = await supertest(app).post('/providers/test').send({ options: {} });

      expect(response.status).toBe(400);
    });

    it('should return 500 if provider API call fails', async () => {
      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: jest.fn().mockRejectedValue(new Error('API error')),
      };
      jest.mocked(loadApiProvider).mockResolvedValue(mockProvider);

      const response = await supertest(app).post('/providers/test').send({ id: 'test-provider' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to call provider API' });
    });
  });

  describe('POST /providers/discover', () => {
    beforeEach(() => {
      jest.mocked(loadApiProvider).mockReset();
      jest.mocked(doTargetPurposeDiscovery).mockReset();
    });

    it('should return 400 for invalid provider options', async () => {
      const response = await supertest(app)
        .post('/providers/discover')
        .send({ invalid: 'options' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 if id is missing', async () => {
      const response = await supertest(app).post('/providers/discover').send({ options: {} });

      expect(response.status).toBe(400);
    });

    it('should return discovery results on success', async () => {
      const mockResult = {
        purpose: 'test purpose',
        user: 'test user',
        tools: [],
        limitations: null,
      };

      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: jest.fn(),
      };
      jest.mocked(loadApiProvider).mockResolvedValue(mockProvider);
      jest.mocked(doTargetPurposeDiscovery).mockResolvedValue(mockResult);

      const response = await supertest(app)
        .post('/providers/discover')
        .send({ id: 'test-provider' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockResult);
    });

    it('should return 500 if discovery fails', async () => {
      const errorMessage = 'Discovery failed';

      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: jest.fn(),
      };
      jest.mocked(loadApiProvider).mockResolvedValue(mockProvider);
      jest.mocked(doTargetPurposeDiscovery).mockRejectedValue(new Error(errorMessage));

      const response = await supertest(app)
        .post('/providers/discover')
        .send({ id: 'test-provider' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: errorMessage });
    });
  });
});
