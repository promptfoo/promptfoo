// Mock all dependencies before imports
jest.mock('../../src/models/eval');
jest.mock('../../src/util/database');
jest.mock('../../src/migrate');
jest.mock('../../src/database/signal', () => ({
  setupSignalWatcher: jest.fn(),
}));
jest.mock('../../src/logger');
jest.mock('../../src/telemetry', () => ({
  record: jest.fn(),
  default: { record: jest.fn() },
}));
jest.mock('../../src/globalConfig/accounts', () => ({
  getUserEmail: jest.fn(),
  setUserEmail: jest.fn(),
}));

import request from 'supertest';
import express from 'express';
import Eval from '../../src/models/eval';
import { writeResultsToDatabase } from '../../src/util/database';
import { evalRouter } from '../../src/server/routes/eval';
import results_v3 from './v3evalToShare.json';
import results_v4 from './v4evalToShare.json';

const mockedEval = jest.mocked(Eval);
const mockedWriteResultsToDatabase = jest.mocked(writeResultsToDatabase);

describe('share', () => {
  let app: express.Application;

  beforeAll(() => {
    // Create a minimal Express app with just the eval router
    app = express();
    app.use(express.json());
    app.use('/api/eval', evalRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should accept a version 3 results file', async () => {
    const mockEvalId = 'test-eval-id-v3';
    mockedWriteResultsToDatabase.mockResolvedValueOnce(mockEvalId);

    const res = await request(app).post('/api/eval').send(results_v3);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: mockEvalId });
    expect(mockedWriteResultsToDatabase).toHaveBeenCalledWith(
      results_v3.data.results,
      results_v3.data.config,
    );
  });

  it('should accept a new eval', async () => {
    const mockEvalId = 'test-eval-id-v4';
    const mockEval = {
      id: mockEvalId,
      addPrompts: jest.fn(),
    };
    mockedEval.create.mockResolvedValueOnce(mockEval as any);

    const res = await request(app).post('/api/eval').send(results_v4);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: mockEvalId });
    expect(mockedEval.create).toHaveBeenCalledWith(
      results_v4.config,
      results_v4.prompts || [],
      expect.objectContaining({
        createdAt: expect.any(Date),
        results: results_v4.results,
      }),
    );
  });

  describe('error handling', () => {
    it('should handle empty request body', async () => {
      mockedEval.create.mockRejectedValueOnce(new Error('Invalid eval data'));

      const res = await request(app).post('/api/eval').send({});

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to write eval to database' });
    });

    it('should handle invalid v3 eval data', async () => {
      mockedWriteResultsToDatabase.mockRejectedValueOnce(new Error('Invalid results data'));

      const res = await request(app)
        .post('/api/eval')
        .send({
          data: {
            results: null,
            config: null,
          },
        });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to write eval to database' });
    });

    it('should handle database errors', async () => {
      mockedEval.create.mockRejectedValueOnce(new Error('Database connection failed'));

      const res = await request(app).post('/api/eval').send({
        config: {},
        results: [],
      });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to write eval to database' });
    });
  });
});
