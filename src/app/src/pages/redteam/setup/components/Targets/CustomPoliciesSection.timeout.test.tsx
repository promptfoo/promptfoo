import { useToast } from '@app/hooks/useToast';
import { callApi } from '@app/utils/api';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// Mock modules
vi.mock('@app/hooks/useToast', () => ({
  useToast: vi.fn(),
}));

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
}));

// Type definitions
const mockCallApi = callApi as unknown as Mock;
const mockUseToast = useToast as unknown as Mock;

describe('CustomPoliciesSection - Timeout Error Handling', () => {
  const mockShowToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseToast.mockReturnValue({
      showToast: mockShowToast,
    });
  });

  describe('Policy Test Generation Timeout Behavior', () => {
    // Simulate the key logic from CustomPoliciesSection's generateTestCase function
    const generateTestCase = async (policy: any, config: any, toast: any) => {
      try {
        const response = await callApi('/redteam/generate-test', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            pluginId: 'policy',
            config: {
              applicationDefinition: config.applicationDefinition,
              policy: policy.policy,
            },
          }),
          timeout: 10000, // 10 second timeout
        });

        if (!response.ok) {
          throw new Error(response.statusText || 'Failed to generate test case');
        }

        const data = await response.json();

        toast.showToast('Test case generated successfully', 'success');
        return data;
      } catch (error) {
        // This is the actual error handling logic from CustomPoliciesSection.tsx
        const errorMessage =
          error instanceof Error
            ? error.message.includes('timed out')
              ? 'Test generation timed out. Please try again or check your connection.'
              : `Failed to generate test case: ${error.message}`
            : 'Failed to generate test case: Unknown error';

        toast.showToast(errorMessage, 'error');
        throw error;
      }
    };

    it('should call API with 10 second timeout', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          prompt: 'Generated prompt',
          context: 'Generated context',
        }),
      };
      mockCallApi.mockResolvedValueOnce(mockResponse);

      const mockToast = { showToast: vi.fn() };
      const policy = { policy: 'Do not reveal PII' };
      const config = { applicationDefinition: { purpose: 'Test app' } };

      await generateTestCase(policy, config, mockToast);

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
      const policy = { policy: 'Test policy' };
      const config = { applicationDefinition: { purpose: 'Test app' } };

      await expect(generateTestCase(policy, config, mockToast)).rejects.toThrow(timeoutError);

      expect(mockToast.showToast).toHaveBeenCalledWith(
        'Test generation timed out. Please try again or check your connection.',
        'error',
      );
    });

    it('should show generic error message for non-timeout errors', async () => {
      const genericError = new Error('Internal server error');
      mockCallApi.mockRejectedValueOnce(genericError);

      const mockToast = { showToast: vi.fn() };
      const policy = { policy: 'Test policy' };
      const config = { applicationDefinition: { purpose: 'Test app' } };

      await expect(generateTestCase(policy, config, mockToast)).rejects.toThrow(genericError);

      expect(mockToast.showToast).toHaveBeenCalledWith(
        'Failed to generate test case: Internal server error',
        'error',
      );
    });

    it('should handle non-ok response status', async () => {
      const errorResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      };
      mockCallApi.mockResolvedValueOnce(errorResponse);

      const mockToast = { showToast: vi.fn() };
      const policy = { policy: 'Test policy' };
      const config = { applicationDefinition: { purpose: 'Test app' } };

      await expect(generateTestCase(policy, config, mockToast)).rejects.toThrow('Bad Request');

      expect(mockToast.showToast).toHaveBeenCalledWith(
        'Failed to generate test case: Bad Request',
        'error',
      );
    });

    it('should handle various timeout error messages', async () => {
      const timeoutMessages = [
        'Request timed out after 10000ms',
        'The request timed out',
        'Operation timed out',
      ];

      for (const message of timeoutMessages) {
        mockCallApi.mockRejectedValueOnce(new Error(message));
        const mockToast = { showToast: vi.fn() };

        const policy = { policy: 'Test policy' };
        const config = { applicationDefinition: { purpose: 'Test app' } };

        await expect(generateTestCase(policy, config, mockToast)).rejects.toThrow();

        expect(mockToast.showToast).toHaveBeenCalledWith(
          'Test generation timed out. Please try again or check your connection.',
          'error',
        );
      }
    });

    it('should show success message on successful generation', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          prompt: 'Generated prompt',
          context: 'Generated context',
          metadata: { policy: 'Test policy' },
        }),
      };
      mockCallApi.mockResolvedValueOnce(mockResponse);

      const mockToast = { showToast: vi.fn() };
      const policy = { policy: 'Test policy' };
      const config = { applicationDefinition: { purpose: 'Test app' } };

      const result = await generateTestCase(policy, config, mockToast);

      expect(mockToast.showToast).toHaveBeenCalledWith(
        'Test case generated successfully',
        'success',
      );
      expect(result).toEqual({
        prompt: 'Generated prompt',
        context: 'Generated context',
        metadata: { policy: 'Test policy' },
      });
    });

    it('should pass correct policy data in the API request', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          prompt: 'Test prompt',
          context: 'Test context',
        }),
      };
      mockCallApi.mockResolvedValueOnce(mockResponse);

      const mockToast = { showToast: vi.fn() };
      const policy = { policy: 'Specific test policy: Do not reveal PII' };
      const config = { applicationDefinition: { purpose: 'Healthcare application' } };

      await generateTestCase(policy, config, mockToast);

      const callArgs = mockCallApi.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body);

      expect(requestBody).toEqual({
        pluginId: 'policy',
        config: {
          applicationDefinition: { purpose: 'Healthcare application' },
          policy: 'Specific test policy: Do not reveal PII',
        },
      });
    });

    it('should handle successful retry after timeout', async () => {
      // First attempt: timeout
      const timeoutError = new Error('Request timed out after 10000ms');
      mockCallApi.mockRejectedValueOnce(timeoutError);

      // Second attempt: success
      const successResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          prompt: 'Generated prompt',
          context: 'Generated context',
        }),
      };
      mockCallApi.mockResolvedValueOnce(successResponse);

      const mockToast = { showToast: vi.fn() };
      const policy = { policy: 'Test policy' };
      const config = { applicationDefinition: { purpose: 'Test app' } };

      // First attempt fails
      await expect(generateTestCase(policy, config, mockToast)).rejects.toThrow(timeoutError);

      expect(mockToast.showToast).toHaveBeenCalledWith(
        'Test generation timed out. Please try again or check your connection.',
        'error',
      );

      // Clear toast calls
      mockToast.showToast.mockClear();

      // Second attempt succeeds
      const result = await generateTestCase(policy, config, mockToast);

      expect(mockToast.showToast).toHaveBeenCalledWith(
        'Test case generated successfully',
        'success',
      );
      expect(result).toBeDefined();

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

    it('should handle network errors gracefully', async () => {
      const networkError = new Error('NetworkError: Failed to fetch');
      mockCallApi.mockRejectedValueOnce(networkError);

      const mockToast = { showToast: vi.fn() };
      const policy = { policy: 'Test policy' };
      const config = { applicationDefinition: { purpose: 'Test app' } };

      await expect(generateTestCase(policy, config, mockToast)).rejects.toThrow(networkError);

      expect(mockToast.showToast).toHaveBeenCalledWith(
        'Failed to generate test case: NetworkError: Failed to fetch',
        'error',
      );
    });

    it('should handle empty error message gracefully', async () => {
      const emptyError = new Error();
      mockCallApi.mockRejectedValueOnce(emptyError);

      const mockToast = { showToast: vi.fn() };
      const policy = { policy: 'Test policy' };
      const config = { applicationDefinition: { purpose: 'Test app' } };

      await expect(generateTestCase(policy, config, mockToast)).rejects.toThrow(emptyError);

      expect(mockToast.showToast).toHaveBeenCalledWith('Failed to generate test case: ', 'error');
    });

    it('should handle non-Error objects thrown', async () => {
      mockCallApi.mockRejectedValueOnce('String error message');

      const mockToast = { showToast: vi.fn() };
      const policy = { policy: 'Test policy' };
      const config = { applicationDefinition: { purpose: 'Test app' } };

      await expect(generateTestCase(policy, config, mockToast)).rejects.toThrow();

      expect(mockToast.showToast).toHaveBeenCalledWith(
        'Failed to generate test case: Unknown error',
        'error',
      );
    });
  });
});
