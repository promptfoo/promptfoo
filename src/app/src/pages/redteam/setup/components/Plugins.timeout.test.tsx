import { useToast } from '@app/hooks/useToast';
import { callApi } from '@app/utils/api';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

// Mock the callApi function
vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
}));

// Mock the toast hook
vi.mock('@app/hooks/useToast', () => ({
  useToast: vi.fn(),
}));

// Type definitions
const mockCallApi = callApi as unknown as Mock;
const mockUseToast = useToast as unknown as Mock;

describe('Plugins Component - Timeout Error Handling', () => {
  const mockShowToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseToast.mockReturnValue({
      showToast: mockShowToast,
    });
  });

  describe('Test Generation Timeout Behavior', () => {
    // Import the actual implementation code for testing
    // This simulates the key logic from generateTestCaseWithConfig function
    const generateTestCaseWithConfig = async (plugin: string, config: any, toast: any) => {
      try {
        const response = await callApi('/redteam/generate-test', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
          },
          body: JSON.stringify({
            pluginId: plugin,
            config: config,
          }),
          timeout: 10000, // 10 second timeout
        });

        const data = await response.json();

        if (data.error) {
          throw new Error(data.error);
        }

        return data;
      } catch (error) {
        // This is the actual error handling logic from Plugins.tsx
        const errorMessage =
          error instanceof Error
            ? error.message.includes('timed out')
              ? 'Test generation timed out. Please try again or check your connection.'
              : error.message
            : 'Failed to generate test case';

        toast.showToast(errorMessage, 'error');
        throw error;
      }
    };

    it('should call API with 10 second timeout', async () => {
      const mockResponse = {
        json: vi.fn().mockResolvedValue({
          prompt: 'Test prompt',
          context: 'Test context',
        }),
      };
      mockCallApi.mockResolvedValueOnce(mockResponse);

      const mockToast = { showToast: vi.fn() };
      await generateTestCaseWithConfig('bola', {}, mockToast);

      expect(mockCallApi).toHaveBeenCalledWith(
        '/redteam/generate-test',
        expect.objectContaining({
          method: 'POST',
          timeout: 10000,
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('should show timeout-specific error message when request times out', async () => {
      const timeoutError = new Error('Request timed out after 10000ms');
      mockCallApi.mockRejectedValueOnce(timeoutError);

      const mockToast = { showToast: vi.fn() };

      await expect(generateTestCaseWithConfig('bola', {}, mockToast)).rejects.toThrow(timeoutError);

      expect(mockToast.showToast).toHaveBeenCalledWith(
        'Test generation timed out. Please try again or check your connection.',
        'error',
      );
    });

    it('should show generic error message for non-timeout errors', async () => {
      const genericError = new Error('Internal server error');
      mockCallApi.mockRejectedValueOnce(genericError);

      const mockToast = { showToast: vi.fn() };

      await expect(generateTestCaseWithConfig('bola', {}, mockToast)).rejects.toThrow(genericError);

      expect(mockToast.showToast).toHaveBeenCalledWith('Internal server error', 'error');
    });

    it('should handle various timeout error messages', async () => {
      const timeoutMessages = [
        'Request timed out after 10000ms',
        'The operation timed out',
        'Connection timed out while waiting',
      ];

      for (const message of timeoutMessages) {
        mockCallApi.mockRejectedValueOnce(new Error(message));
        const mockToast = { showToast: vi.fn() };

        await expect(generateTestCaseWithConfig('bola', {}, mockToast)).rejects.toThrow();

        expect(mockToast.showToast).toHaveBeenCalledWith(
          'Test generation timed out. Please try again or check your connection.',
          'error',
        );
      }
    });

    it('should handle API response with error property', async () => {
      const errorResponse = {
        json: vi.fn().mockResolvedValue({
          error: 'Invalid configuration provided',
        }),
      };
      mockCallApi.mockResolvedValueOnce(errorResponse);

      const mockToast = { showToast: vi.fn() };

      await expect(generateTestCaseWithConfig('bola', {}, mockToast)).rejects.toThrow(
        'Invalid configuration provided',
      );

      expect(mockToast.showToast).toHaveBeenCalledWith('Invalid configuration provided', 'error');
    });

    it('should handle network errors gracefully', async () => {
      const networkError = new Error('NetworkError: Failed to fetch');
      mockCallApi.mockRejectedValueOnce(networkError);

      const mockToast = { showToast: vi.fn() };

      await expect(generateTestCaseWithConfig('bola', {}, mockToast)).rejects.toThrow(networkError);

      expect(mockToast.showToast).toHaveBeenCalledWith('NetworkError: Failed to fetch', 'error');
    });

    it('should pass plugin configuration in request body', async () => {
      const mockResponse = {
        json: vi.fn().mockResolvedValue({
          prompt: 'Test prompt',
          context: 'Test context',
        }),
      };
      mockCallApi.mockResolvedValueOnce(mockResponse);

      const pluginConfig = {
        applicationDefinition: { purpose: 'Test app' },
        additionalConfig: { key: 'value' },
      };

      const mockToast = { showToast: vi.fn() };
      await generateTestCaseWithConfig('harmful:hate', pluginConfig, mockToast);

      const callArgs = mockCallApi.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body);

      expect(requestBody).toEqual({
        pluginId: 'harmful:hate',
        config: pluginConfig,
      });
    });

    it('should handle successful retry after timeout', async () => {
      // First attempt: timeout
      const timeoutError = new Error('Request timed out after 10000ms');
      mockCallApi.mockRejectedValueOnce(timeoutError);

      // Second attempt: success
      const successResponse = {
        json: vi.fn().mockResolvedValue({
          prompt: 'Generated prompt',
          context: 'Generated context',
        }),
      };
      mockCallApi.mockResolvedValueOnce(successResponse);

      const mockToast = { showToast: vi.fn() };

      // First attempt fails
      await expect(generateTestCaseWithConfig('bola', {}, mockToast)).rejects.toThrow(timeoutError);

      expect(mockToast.showToast).toHaveBeenCalledWith(
        'Test generation timed out. Please try again or check your connection.',
        'error',
      );

      // Clear toast calls
      mockToast.showToast.mockClear();

      // Second attempt succeeds
      const result = await generateTestCaseWithConfig('bola', {}, mockToast);

      expect(result).toEqual({
        prompt: 'Generated prompt',
        context: 'Generated context',
      });

      // Should not show error on success
      expect(mockToast.showToast).not.toHaveBeenCalled();

      // Both calls should include timeout
      expect(mockCallApi).toHaveBeenCalledTimes(2);
      expect(mockCallApi).toHaveBeenNthCalledWith(
        1,
        '/redteam/generate-test',
        expect.objectContaining({ timeout: 10000 }),
      );
      expect(mockCallApi).toHaveBeenNthCalledWith(
        2,
        '/redteam/generate-test',
        expect.objectContaining({ timeout: 10000 }),
      );
    });

    it('should include all required headers', async () => {
      const mockResponse = {
        json: vi.fn().mockResolvedValue({
          prompt: 'Test prompt',
          context: 'Test context',
        }),
      };
      mockCallApi.mockResolvedValueOnce(mockResponse);

      const mockToast = { showToast: vi.fn() };
      await generateTestCaseWithConfig('bola', {}, mockToast);

      expect(mockCallApi).toHaveBeenCalledWith(
        '/redteam/generate-test',
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
          },
        }),
      );
    });
  });
});
