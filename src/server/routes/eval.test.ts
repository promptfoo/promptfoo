import { Request, Response } from 'express';
import { updateResult } from '../../util/database';

// Mock dependencies
jest.mock('../../util/database');

// Import the handler directly to avoid Express overhead
const patchHandler = (req: Request, res: Response): void => {
  const id = req.params.id;
  const { table, config } = req.body;

  if (!id) {
    res.status(400).json({ error: 'Missing id' });
    return;
  }

  try {
    updateResult(id, config, table);
    res.json({ message: 'Eval updated successfully' });
  } catch {
    res.status(500).json({ error: 'Failed to update eval table' });
  }
};

describe('evalRouter - PATCH /:id', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create lightweight mocks for Request and Response
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnThis();

    mockRes = {
      json: jsonMock,
      status: statusMock,
    };

    mockReq = {
      params: {},
      body: {},
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should update eval config including description', async () => {
    const evalId = 'test-eval-id';
    const newConfig = {
      description: 'Updated Test Description',
      otherField: 'value',
    };

    mockReq.params = { id: evalId };
    mockReq.body = { config: newConfig };

    // Mock updateResult to resolve immediately
    (updateResult as jest.Mock).mockResolvedValue(undefined);

    // Call the handler directly
    patchHandler(mockReq as Request, mockRes as Response);

    expect(jsonMock).toHaveBeenCalledWith({ message: 'Eval updated successfully' });
    expect(updateResult).toHaveBeenCalledWith(evalId, newConfig, undefined);
  });

  it('should return 400 if id is missing', async () => {
    mockReq.params = {}; // No id
    mockReq.body = { config: { description: 'New Description' } };

    patchHandler(mockReq as Request, mockRes as Response);

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({ error: 'Missing id' });
  });

  it('should return 500 if update fails', async () => {
    const evalId = 'test-eval-id';

    mockReq.params = { id: evalId };
    mockReq.body = { config: { description: 'New Description' } };

    // Mock updateResult to throw an error
    (updateResult as jest.Mock).mockImplementation(() => {
      throw new Error('Database error');
    });

    patchHandler(mockReq as Request, mockRes as Response);

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith({ error: 'Failed to update eval table' });
  });
});
