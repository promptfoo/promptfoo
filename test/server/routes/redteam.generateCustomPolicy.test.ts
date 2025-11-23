import type { Request, Response } from 'express';
import { getRemoteGenerationUrl } from '../../../src/redteam/remoteGeneration';
import { fetchWithProxy } from '../../../src/util/fetch/index';
import logger from '../../../src/logger';

// Mock dependencies
jest.mock('../../../src/redteam/remoteGeneration');
jest.mock('../../../src/util/fetch');
jest.mock('../../../src/logger');

// Import route handler logic (simplified for testing)
const generateCustomPolicyHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { applicationDefinition, existingPolicies } = req.body;

    // Get remote generation URL
    const remoteGenerationUrl = getRemoteGenerationUrl();

    if (!remoteGenerationUrl) {
      res.status(400).json({
        error: 'Remote generation not configured',
        details:
          'Custom policy generation requires remote generation. Set PROMPTFOO_REMOTE_GENERATION_URL environment variable.',
      });
      return;
    }

    logger.debug(`[Custom Policy] Using remote generation: ${remoteGenerationUrl}`);

    // Forward to remote endpoint
    const response = await fetchWithProxy(`${remoteGenerationUrl}/redteam/generate-custom-policy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ applicationDefinition, existingPolicies }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: 'Remote generation failed', details: errorText };
      }

      logger.error(
        `[Custom Policy] Remote generation failed with status ${response.status}: ${JSON.stringify(errorData)}`,
      );

      res.status(response.status).json(errorData);
      return;
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    logger.error(
      `[Custom Policy] Error generating policies: ${error instanceof Error ? error.message : String(error)}`,
    );

    res.status(500).json({
      error: 'Failed to generate policies',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};

describe('redteam - POST /generate-custom-policy', () => {
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
      body: {
        applicationDefinition: {
          purpose: 'Customer service chatbot for banking',
        },
        existingPolicies: ['Do not provide account passwords'],
      },
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('success cases', () => {
    it('should generate policies successfully when remote URL is configured', async () => {
      const remoteUrl = 'http://localhost:3201/api/v1';
      const mockPolicies = [
        { name: 'PII Protection', text: 'Do not expose personal information' },
        { name: 'Brand Safety', text: 'Avoid controversial topics' },
        { name: 'Financial Advice', text: 'Do not provide specific financial recommendations' },
      ];

      (getRemoteGenerationUrl as jest.Mock).mockReturnValue(remoteUrl);
      (fetchWithProxy as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ policies: mockPolicies }),
        text: jest.fn(),
      });

      await generateCustomPolicyHandler(mockReq as Request, mockRes as Response);

      expect(getRemoteGenerationUrl).toHaveBeenCalled();
      expect(fetchWithProxy).toHaveBeenCalledWith(`${remoteUrl}/redteam/generate-custom-policy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          applicationDefinition: mockReq.body.applicationDefinition,
          existingPolicies: mockReq.body.existingPolicies,
        }),
      });
      expect(logger.debug).toHaveBeenCalledWith(
        `[Custom Policy] Using remote generation: ${remoteUrl}`,
      );
      expect(jsonMock).toHaveBeenCalledWith({ policies: mockPolicies });
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should handle empty existing policies', async () => {
      const remoteUrl = 'http://localhost:3201/api/v1';
      mockReq.body.existingPolicies = [];

      (getRemoteGenerationUrl as jest.Mock).mockReturnValue(remoteUrl);
      (fetchWithProxy as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ policies: [] }),
        text: jest.fn(),
      });

      await generateCustomPolicyHandler(mockReq as Request, mockRes as Response);

      expect(fetchWithProxy).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith({ policies: [] });
    });
  });

  describe('configuration errors', () => {
    it('should return 400 when remote URL is not configured', async () => {
      (getRemoteGenerationUrl as jest.Mock).mockReturnValue(null);

      await generateCustomPolicyHandler(mockReq as Request, mockRes as Response);

      expect(getRemoteGenerationUrl).toHaveBeenCalled();
      expect(fetchWithProxy).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Remote generation not configured',
        details:
          'Custom policy generation requires remote generation. Set PROMPTFOO_REMOTE_GENERATION_URL environment variable.',
      });
    });

    it('should return 400 when remote URL is empty string', async () => {
      (getRemoteGenerationUrl as jest.Mock).mockReturnValue('');

      await generateCustomPolicyHandler(mockReq as Request, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Remote generation not configured',
        details:
          'Custom policy generation requires remote generation. Set PROMPTFOO_REMOTE_GENERATION_URL environment variable.',
      });
    });
  });

  describe('remote server errors', () => {
    it('should handle 400 error from remote server', async () => {
      const remoteUrl = 'http://localhost:3201/api/v1';
      const errorResponse = {
        error: 'Invalid request',
        details: ['applicationDefinition.purpose is required'],
      };

      (getRemoteGenerationUrl as jest.Mock).mockReturnValue(remoteUrl);
      (fetchWithProxy as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        text: jest.fn().mockResolvedValue(JSON.stringify(errorResponse)),
        json: jest.fn(),
      });

      await generateCustomPolicyHandler(mockReq as Request, mockRes as Response);

      expect(logger.error).toHaveBeenCalledWith(
        `[Custom Policy] Remote generation failed with status 400: ${JSON.stringify(errorResponse)}`,
      );
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(errorResponse);
    });

    it('should handle 401 authentication error from remote server', async () => {
      const remoteUrl = 'http://localhost:3201/api/v1';
      const errorResponse = { error: 'Authentication Required' };

      (getRemoteGenerationUrl as jest.Mock).mockReturnValue(remoteUrl);
      (fetchWithProxy as jest.Mock).mockResolvedValue({
        ok: false,
        status: 401,
        text: jest.fn().mockResolvedValue(JSON.stringify(errorResponse)),
        json: jest.fn(),
      });

      await generateCustomPolicyHandler(mockReq as Request, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(errorResponse);
    });

    it('should handle 500 internal server error from remote server', async () => {
      const remoteUrl = 'http://localhost:3201/api/v1';
      const errorResponse = {
        error: 'Internal server error',
        details: 'LLM provider failed',
      };

      (getRemoteGenerationUrl as jest.Mock).mockReturnValue(remoteUrl);
      (fetchWithProxy as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue(JSON.stringify(errorResponse)),
        json: jest.fn(),
      });

      await generateCustomPolicyHandler(mockReq as Request, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(errorResponse);
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle non-JSON error response from remote server', async () => {
      const remoteUrl = 'http://localhost:3201/api/v1';
      const errorText = 'Internal Server Error';

      (getRemoteGenerationUrl as jest.Mock).mockReturnValue(remoteUrl);
      (fetchWithProxy as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue(errorText),
        json: jest.fn(),
      });

      await generateCustomPolicyHandler(mockReq as Request, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Remote generation failed',
        details: errorText,
      });
    });
  });

  describe('network and unexpected errors', () => {
    it('should handle network error', async () => {
      const remoteUrl = 'http://localhost:3201/api/v1';
      const networkError = new Error('Network request failed');

      (getRemoteGenerationUrl as jest.Mock).mockReturnValue(remoteUrl);
      (fetchWithProxy as jest.Mock).mockRejectedValue(networkError);

      await generateCustomPolicyHandler(mockReq as Request, mockRes as Response);

      expect(logger.error).toHaveBeenCalledWith(
        `[Custom Policy] Error generating policies: ${networkError.message}`,
      );
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Failed to generate policies',
        details: networkError.message,
      });
    });

    it('should handle timeout error', async () => {
      const remoteUrl = 'http://localhost:3201/api/v1';
      const timeoutError = new Error('Request timeout');

      (getRemoteGenerationUrl as jest.Mock).mockReturnValue(remoteUrl);
      (fetchWithProxy as jest.Mock).mockRejectedValue(timeoutError);

      await generateCustomPolicyHandler(mockReq as Request, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Failed to generate policies',
        details: 'Request timeout',
      });
    });

    it('should handle JSON parse error from successful response', async () => {
      const remoteUrl = 'http://localhost:3201/api/v1';

      (getRemoteGenerationUrl as jest.Mock).mockReturnValue(remoteUrl);
      (fetchWithProxy as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON')),
        text: jest.fn(),
      });

      await generateCustomPolicyHandler(mockReq as Request, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Failed to generate policies',
        details: 'Invalid JSON',
      });
    });

    it('should handle non-Error thrown values', async () => {
      const remoteUrl = 'http://localhost:3201/api/v1';

      (getRemoteGenerationUrl as jest.Mock).mockReturnValue(remoteUrl);
      (fetchWithProxy as jest.Mock).mockRejectedValue('String error');

      await generateCustomPolicyHandler(mockReq as Request, mockRes as Response);

      expect(logger.error).toHaveBeenCalledWith(
        '[Custom Policy] Error generating policies: String error',
      );
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Failed to generate policies',
        details: 'String error',
      });
    });
  });

  describe('request data validation', () => {
    it('should forward all application definition fields', async () => {
      const remoteUrl = 'http://localhost:3201/api/v1';
      mockReq.body = {
        applicationDefinition: {
          purpose: 'Banking chatbot',
          userGroups: 'Enterprise customers',
          businessEntity: 'ACME Corp',
        },
        existingPolicies: ['Policy 1', 'Policy 2'],
      };

      (getRemoteGenerationUrl as jest.Mock).mockReturnValue(remoteUrl);
      (fetchWithProxy as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ policies: [] }),
        text: jest.fn(),
      });

      await generateCustomPolicyHandler(mockReq as Request, mockRes as Response);

      expect(fetchWithProxy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            applicationDefinition: {
              purpose: 'Banking chatbot',
              userGroups: 'Enterprise customers',
              businessEntity: 'ACME Corp',
            },
            existingPolicies: ['Policy 1', 'Policy 2'],
          }),
        }),
      );
    });
  });

  describe('logging', () => {
    it('should log debug message with remote URL', async () => {
      const remoteUrl = 'http://test-server:9000/api/v1';

      (getRemoteGenerationUrl as jest.Mock).mockReturnValue(remoteUrl);
      (fetchWithProxy as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ policies: [] }),
        text: jest.fn(),
      });

      await generateCustomPolicyHandler(mockReq as Request, mockRes as Response);

      expect(logger.debug).toHaveBeenCalledWith(
        `[Custom Policy] Using remote generation: ${remoteUrl}`,
      );
    });

    it('should log errors with context', async () => {
      const remoteUrl = 'http://localhost:3201/api/v1';
      const errorData = { error: 'Provider not configured' };

      (getRemoteGenerationUrl as jest.Mock).mockReturnValue(remoteUrl);
      (fetchWithProxy as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        text: jest.fn().mockResolvedValue(JSON.stringify(errorData)),
        json: jest.fn(),
      });

      await generateCustomPolicyHandler(mockReq as Request, mockRes as Response);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('[Custom Policy] Remote generation failed with status 400'),
      );
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Provider not configured'));
    });
  });
});
