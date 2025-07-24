// Mock all dependencies before imports
jest.mock('../../src/models/eval');
jest.mock('../../src/util/database');
jest.mock('../../src/migrate');
jest.mock('../../src/database/signal', () => ({
  setupSignalWatcher: jest.fn(),
}));
jest.mock('../../src/logger');

// Mock Express app and router
const mockRouter = {
  post: jest.fn(),
  get: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn(),
  put: jest.fn(),
};

const mockApp = {
  use: jest.fn(),
  get: jest.fn(),
  post: jest.fn(),
};

jest.mock('express', () => ({
  __esModule: true,
  default: () => mockApp,
  Router: () => mockRouter,
}));

// Mock the server module to avoid real initialization
jest.mock('../../src/server/server', () => ({
  createApp: () => mockApp,
}));

import Eval from '../../src/models/eval';
import { writeResultsToDatabase } from '../../src/util/database';
import results_v3 from './v3evalToShare.json';
import results_v4 from './v4evalToShare.json';

const mockedEval = jest.mocked(Eval);
const mockedWriteResultsToDatabase = jest.mocked(writeResultsToDatabase);

describe('share', () => {
  let mockHandler: jest.Mock;

  beforeAll(() => {
    // Set up the mock handler for POST /api/eval
    mockHandler = jest.fn();

    // Import the eval router to register routes
    jest.isolateModules(() => {
      require('../../src/server/routes/eval');
    });

    // Get the registered route handler
    const postCall = mockRouter.post.mock.calls.find((call) => call[0] === '/');
    if (postCall) {
      mockHandler = postCall[1];
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should accept a version 3 results file', async () => {
    const mockEvalId = 'test-eval-id-v3';
    mockedWriteResultsToDatabase.mockResolvedValueOnce(mockEvalId);

    const mockReq = { body: results_v3 };
    const mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };

    await mockHandler(mockReq, mockRes);

    expect(mockRes.json).toHaveBeenCalledWith({ id: mockEvalId });
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

    const mockReq = { body: results_v4 };
    const mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };

    await mockHandler(mockReq, mockRes);

    expect(mockRes.json).toHaveBeenCalledWith({ id: mockEvalId });
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

      const mockReq = { body: {} };
      const mockRes = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      await mockHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to write eval to database' });
    });

    it('should handle invalid v3 eval data', async () => {
      mockedWriteResultsToDatabase.mockRejectedValueOnce(new Error('Invalid results data'));

      const mockReq = {
        body: {
          data: {
            results: null,
            config: null,
          },
        },
      };
      const mockRes = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      await mockHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to write eval to database' });
    });

    it('should handle database errors', async () => {
      mockedEval.create.mockRejectedValueOnce(new Error('Database connection failed'));

      const mockReq = {
        body: {
          config: {},
          results: [],
        },
      };
      const mockRes = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      await mockHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to write eval to database' });
    });
  });
});
