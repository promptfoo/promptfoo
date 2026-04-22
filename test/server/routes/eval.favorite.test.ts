import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/models/eval');

import Eval from '../../../src/models/eval';
import { createApp } from '../../../src/server/server';

const mockedEval = vi.mocked(Eval);

describe('evalRouter - PATCH /:id/favorite', () => {
  let app: ReturnType<typeof createApp>;
  let mockFindById: ReturnType<typeof vi.fn>;
  let mockSave: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();

    mockFindById = vi.fn();
    mockSave = vi.fn().mockResolvedValue(undefined);
    mockedEval.findById = mockFindById as any;

    app = createApp();
  });

  it('updates favorite status successfully', async () => {
    const mockEval = {
      id: 'test-eval-123',
      isFavorite: false,
      save: mockSave,
    };
    mockFindById.mockResolvedValue(mockEval);

    const response = await request(app).patch('/api/eval/test-eval-123/favorite').send({
      isFavorite: true,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: 'Favorite status updated successfully',
      isFavorite: true,
    });
    expect(mockFindById).toHaveBeenCalledWith('test-eval-123');
    expect(mockEval.isFavorite).toBe(true);
    expect(mockSave).toHaveBeenCalled();
  });

  it('returns 404 when eval does not exist', async () => {
    mockFindById.mockResolvedValue(undefined);

    const response = await request(app).patch('/api/eval/test-eval-123/favorite').send({
      isFavorite: true,
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Eval not found' });
    expect(mockFindById).toHaveBeenCalledWith('test-eval-123');
  });

  it('returns 400 when isFavorite is not boolean', async () => {
    const response = await request(app).patch('/api/eval/test-eval-123/favorite').send({
      isFavorite: 'true',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('isFavorite');
    expect(mockFindById).not.toHaveBeenCalled();
  });

  it('unfavorites an eval', async () => {
    const mockEval = {
      id: 'test-eval-123',
      isFavorite: true,
      save: mockSave,
    };
    mockFindById.mockResolvedValue(mockEval);

    const response = await request(app).patch('/api/eval/test-eval-123/favorite').send({
      isFavorite: false,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: 'Favorite status updated successfully',
      isFavorite: false,
    });
    expect(mockEval.isFavorite).toBe(false);
    expect(mockSave).toHaveBeenCalled();
  });
});
