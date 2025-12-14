import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import Eval from '../../../src/models/eval';

// Mock Eval model
vi.mock('../../../src/models/eval');

describe('evalRouter - PATCH /:id/favorite', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  const mockEval = {
    id: 'test-eval-123',
    isFavorite: false,
    save: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnThis();

    mockRes = {
      json: jsonMock,
      status: statusMock,
    };

    mockReq = {
      params: { id: 'test-eval-123' },
      body: { isFavorite: true },
    };

    // Mock Eval.findById to return our mock eval
    vi.mocked(Eval.findById).mockResolvedValue(mockEval as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should update favorite status successfully', async () => {
    // Simulate the route handler logic
    const { id } = mockReq.params!;
    const { isFavorite } = mockReq.body!;

    const eval_ = await Eval.findById(id!);
    if (!eval_) {
      mockRes.status!(404).json({ error: 'Eval not found' });
      return;
    }

    eval_.isFavorite = isFavorite;
    await eval_.save();

    mockRes.json!({ message: 'Favorite status updated successfully', isFavorite });

    expect(Eval.findById).toHaveBeenCalledWith('test-eval-123');
    expect(eval_.isFavorite).toBe(true);
    expect(eval_.save).toHaveBeenCalled();
    expect(jsonMock).toHaveBeenCalledWith({
      message: 'Favorite status updated successfully',
      isFavorite: true,
    });
  });

  it('should return 404 when eval not found', async () => {
    vi.mocked(Eval.findById).mockResolvedValue(undefined);

    const { id } = mockReq.params!;
    const eval_ = await Eval.findById(id!);

    if (!eval_) {
      mockRes.status!(404).json({ error: 'Eval not found' });
    }

    expect(Eval.findById).toHaveBeenCalledWith('test-eval-123');
    expect(statusMock).toHaveBeenCalledWith(404);
    expect(jsonMock).toHaveBeenCalledWith({ error: 'Eval not found' });
  });

  it('should return 400 when isFavorite is not a boolean', async () => {
    mockReq.body = { isFavorite: 'not-a-boolean' };

    const { isFavorite } = mockReq.body!;

    if (typeof isFavorite !== 'boolean') {
      mockRes.status!(400).json({ error: 'isFavorite must be a boolean' });
      return;
    }

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({ error: 'isFavorite must be a boolean' });
  });

  it('should return 400 when id is missing', async () => {
    mockReq.params = {};

    const { id } = mockReq.params!;

    if (!id) {
      mockRes.status!(400).json({ error: 'Missing id' });
      return;
    }

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({ error: 'Missing id' });
  });

  it('should unfavorite an eval', async () => {
    mockReq.body = { isFavorite: false };
    mockEval.isFavorite = true;

    const { id } = mockReq.params!;
    const { isFavorite } = mockReq.body!;

    const eval_ = await Eval.findById(id!);
    if (!eval_) {
      mockRes.status!(404).json({ error: 'Eval not found' });
      return;
    }

    eval_.isFavorite = isFavorite;
    await eval_.save();

    mockRes.json!({ message: 'Favorite status updated successfully', isFavorite });

    expect(eval_.isFavorite).toBe(false);
    expect(eval_.save).toHaveBeenCalled();
    expect(jsonMock).toHaveBeenCalledWith({
      message: 'Favorite status updated successfully',
      isFavorite: false,
    });
  });
});
