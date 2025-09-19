import {
  downloadResultsFile,
  downloadResultsCsv,
  downloadResultsJson,
} from '../../../src/app/src/utils/api/downloads';

// Mock the callApi function
const mockCallApi = jest.fn();
jest.mock('../../../src/app/src/utils/api', () => ({
  callApi: mockCallApi,
}));

describe('downloads API utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('downloadResultsFile', () => {
    it('should fetch CSV file successfully', async () => {
      const mockBlob = new Blob(['csv,data'], { type: 'text/csv' });
      const mockResponse = {
        ok: true,
        blob: jest.fn().mockResolvedValue(mockBlob),
        text: jest.fn(),
      };
      mockCallApi.mockResolvedValue(mockResponse);

      const result = await downloadResultsFile('test-eval-123', 'csv');

      expect(mockCallApi).toHaveBeenCalledWith('/eval/test-eval-123/table?format=csv', {
        method: 'GET',
      });
      expect(mockResponse.blob).toHaveBeenCalled();
      expect(result).toBe(mockBlob);
    });

    it('should fetch JSON file successfully', async () => {
      const mockBlob = new Blob(['{"data": "test"}'], { type: 'application/json' });
      const mockResponse = {
        ok: true,
        blob: jest.fn().mockResolvedValue(mockBlob),
        text: jest.fn(),
      };
      mockCallApi.mockResolvedValue(mockResponse);

      const result = await downloadResultsFile('test-eval-456', 'json');

      expect(mockCallApi).toHaveBeenCalledWith('/eval/test-eval-456/table?format=json', {
        method: 'GET',
      });
      expect(mockResponse.blob).toHaveBeenCalled();
      expect(result).toBe(mockBlob);
    });

    it('should throw error when response is not ok', async () => {
      const mockResponse = {
        ok: false,
        blob: jest.fn(),
        text: jest.fn().mockResolvedValue('Server error: Internal Server Error'),
      };
      mockCallApi.mockResolvedValue(mockResponse);

      await expect(downloadResultsFile('test-eval', 'csv')).rejects.toThrow(
        'Failed to download CSV: Server error: Internal Server Error',
      );

      expect(mockResponse.text).toHaveBeenCalled();
    });

    it('should handle error text extraction failure gracefully', async () => {
      const mockResponse = {
        ok: false,
        blob: jest.fn(),
        text: jest.fn().mockRejectedValue(new Error('Failed to read response')),
      };
      mockCallApi.mockResolvedValue(mockResponse);

      await expect(downloadResultsFile('test-eval', 'json')).rejects.toThrow(
        'Failed to download JSON: Unknown error',
      );
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network request failed');
      mockCallApi.mockRejectedValue(networkError);

      await expect(downloadResultsFile('test-eval', 'csv')).rejects.toThrow(
        'Network request failed',
      );
    });

    it('should handle special characters in eval ID', async () => {
      const mockBlob = new Blob(['csv,data'], { type: 'text/csv' });
      const mockResponse = {
        ok: true,
        blob: jest.fn().mockResolvedValue(mockBlob),
      };
      mockCallApi.mockResolvedValue(mockResponse);

      const specialEvalId = 'eval@with#special$chars%123';
      await downloadResultsFile(specialEvalId, 'csv');

      expect(mockCallApi).toHaveBeenCalledWith(`/eval/${specialEvalId}/table?format=csv`, {
        method: 'GET',
      });
    });

    it('should handle empty eval ID', async () => {
      const mockBlob = new Blob(['csv,data'], { type: 'text/csv' });
      const mockResponse = {
        ok: true,
        blob: jest.fn().mockResolvedValue(mockBlob),
      };
      mockCallApi.mockResolvedValue(mockResponse);

      await downloadResultsFile('', 'csv');

      expect(mockCallApi).toHaveBeenCalledWith('/eval//table?format=csv', {
        method: 'GET',
      });
    });
  });

  describe('downloadResultsCsv', () => {
    it('should download CSV using downloadResultsFile', async () => {
      const mockBlob = new Blob(['csv,data'], { type: 'text/csv' });
      const mockResponse = {
        ok: true,
        blob: jest.fn().mockResolvedValue(mockBlob),
      };
      mockCallApi.mockResolvedValue(mockResponse);

      const result = await downloadResultsCsv('csv-eval-id');

      expect(mockCallApi).toHaveBeenCalledWith('/eval/csv-eval-id/table?format=csv', {
        method: 'GET',
      });
      expect(result).toBe(mockBlob);
    });

    it('should propagate errors from downloadResultsFile', async () => {
      const mockResponse = {
        ok: false,
        text: jest.fn().mockResolvedValue('Not found'),
      };
      mockCallApi.mockResolvedValue(mockResponse);

      await expect(downloadResultsCsv('invalid-eval')).rejects.toThrow(
        'Failed to download CSV: Not found',
      );
    });
  });

  describe('downloadResultsJson', () => {
    it('should download JSON using downloadResultsFile', async () => {
      const mockBlob = new Blob(['{"data": "test"}'], { type: 'application/json' });
      const mockResponse = {
        ok: true,
        blob: jest.fn().mockResolvedValue(mockBlob),
      };
      mockCallApi.mockResolvedValue(mockResponse);

      const result = await downloadResultsJson('json-eval-id');

      expect(mockCallApi).toHaveBeenCalledWith('/eval/json-eval-id/table?format=json', {
        method: 'GET',
      });
      expect(result).toBe(mockBlob);
    });

    it('should propagate errors from downloadResultsFile', async () => {
      const mockResponse = {
        ok: false,
        text: jest.fn().mockResolvedValue('Forbidden'),
      };
      mockCallApi.mockResolvedValue(mockResponse);

      await expect(downloadResultsJson('restricted-eval')).rejects.toThrow(
        'Failed to download JSON: Forbidden',
      );
    });
  });

  describe('Edge cases', () => {
    it('should handle very long evaluation IDs', async () => {
      const mockBlob = new Blob(['data'], { type: 'text/csv' });
      const mockResponse = {
        ok: true,
        blob: jest.fn().mockResolvedValue(mockBlob),
      };
      mockCallApi.mockResolvedValue(mockResponse);

      const longEvalId = 'a'.repeat(500);
      await downloadResultsFile(longEvalId, 'csv');

      expect(mockCallApi).toHaveBeenCalledWith(`/eval/${longEvalId}/table?format=csv`, {
        method: 'GET',
      });
    });

    it('should handle response with different content types', async () => {
      const mockHtmlBlob = new Blob(['<html>Error page</html>'], { type: 'text/html' });
      const mockResponse = {
        ok: false,
        blob: jest.fn().mockResolvedValue(mockHtmlBlob),
        text: jest.fn().mockResolvedValue('<html>Error page</html>'),
      };
      mockCallApi.mockResolvedValue(mockResponse);

      await expect(downloadResultsFile('test-eval', 'csv')).rejects.toThrow(
        'Failed to download CSV: <html>Error page</html>',
      );
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'TimeoutError';
      mockCallApi.mockRejectedValue(timeoutError);

      await expect(downloadResultsFile('test-eval', 'json')).rejects.toThrow('Request timeout');
    });

    it('should handle concurrent requests for the same evaluation', async () => {
      const mockBlob = new Blob(['data'], { type: 'text/csv' });
      const mockResponse = {
        ok: true,
        blob: jest.fn().mockResolvedValue(mockBlob),
      };
      mockCallApi.mockResolvedValue(mockResponse);

      const [result1, result2, result3] = await Promise.all([
        downloadResultsCsv('same-eval'),
        downloadResultsCsv('same-eval'),
        downloadResultsCsv('same-eval'),
      ]);

      expect(mockCallApi).toHaveBeenCalledTimes(3);
      expect(result1).toBe(mockBlob);
      expect(result2).toBe(mockBlob);
      expect(result3).toBe(mockBlob);
    });

    it('should handle mixed format requests', async () => {
      const csvBlob = new Blob(['csv'], { type: 'text/csv' });
      const jsonBlob = new Blob(['{"json": true}'], { type: 'application/json' });

      mockCallApi
        .mockResolvedValueOnce({
          ok: true,
          blob: jest.fn().mockResolvedValue(csvBlob),
        })
        .mockResolvedValueOnce({
          ok: true,
          blob: jest.fn().mockResolvedValue(jsonBlob),
        });

      const [csvResult, jsonResult] = await Promise.all([
        downloadResultsCsv('eval-1'),
        downloadResultsJson('eval-2'),
      ]);

      expect(csvResult).toBe(csvBlob);
      expect(jsonResult).toBe(jsonBlob);
      expect(mockCallApi).toHaveBeenCalledWith('/eval/eval-1/table?format=csv', { method: 'GET' });
      expect(mockCallApi).toHaveBeenCalledWith('/eval/eval-2/table?format=json', { method: 'GET' });
    });

    it('should handle API rate limiting error', async () => {
      const mockResponse = {
        ok: false,
        status: 429,
        text: jest.fn().mockResolvedValue('Rate limit exceeded'),
      };
      mockCallApi.mockResolvedValue(mockResponse);

      await expect(downloadResultsFile('test-eval', 'csv')).rejects.toThrow(
        'Failed to download CSV: Rate limit exceeded',
      );
    });

    it('should handle malformed JSON response for JSON download', async () => {
      const malformedBlob = new Blob(['not valid json'], { type: 'application/json' });
      const mockResponse = {
        ok: true,
        blob: jest.fn().mockResolvedValue(malformedBlob),
      };
      mockCallApi.mockResolvedValue(mockResponse);

      // Should still return the blob even if it's malformed
      const result = await downloadResultsJson('test-eval');
      expect(result).toBe(malformedBlob);
    });
  });
});
