import request from 'supertest';
import express from 'express';
import { evalRouter } from './eval';
import { updateResult } from '../../util/database';

// Mock dependencies
jest.mock('../../util/database');

describe('evalRouter', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/eval', evalRouter);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('PATCH /:id', () => {
    it('should update eval config including description', async () => {
      const evalId = 'test-eval-id';
      const newConfig = {
        description: 'Updated Test Description',
        otherField: 'value',
      };

      // Mock updateResult to resolve immediately
      (updateResult as jest.Mock).mockResolvedValue(undefined);

      const response = await request(app).patch(`/api/eval/${evalId}`).send({ config: newConfig });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Eval updated successfully' });
      expect(updateResult).toHaveBeenCalledWith(evalId, newConfig, undefined);
    });

    it('should return 404 if id is missing', async () => {
      const response = await request(app)
        .patch('/api/eval/')
        .send({ config: { description: 'New Description' } });

      expect(response.status).toBe(404); // Express returns 404 for missing route params
    });

    it('should return 500 if update fails', async () => {
      const evalId = 'test-eval-id';
      (updateResult as jest.Mock).mockImplementation(() => {
        throw new Error('Database error');
      });

      const response = await request(app)
        .patch(`/api/eval/${evalId}`)
        .send({ config: { description: 'New Description' } });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to update eval table' });
    });
  });
});
