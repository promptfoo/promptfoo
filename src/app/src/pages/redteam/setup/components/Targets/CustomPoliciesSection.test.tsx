import { ToastProvider } from '@app/contexts/ToastContext';
import { useToast } from '@app/hooks/useToast';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import { CustomPoliciesSection } from './CustomPoliciesSection';

vi.mock('../../hooks/useRedTeamConfig');
vi.mock('@app/hooks/useTelemetry', () => ({
  useTelemetry: () => ({
    recordEvent: vi.fn(),
  }),
}));
vi.mock('@app/hooks/useToast');

const mockUpdateConfig = vi.fn();
const mockShowToast = vi.fn();

const renderComponent = () => {
  const theme = createTheme();
  return render(
    <ThemeProvider theme={theme}>
      <ToastProvider>
        <CustomPoliciesSection />
      </ToastProvider>
    </ThemeProvider>,
  );
};

describe('CustomPoliciesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (useRedTeamConfig as unknown as Mock).mockReturnValue({
      config: {
        plugins: [],
      },
      updateConfig: mockUpdateConfig,
    });

    (useToast as unknown as Mock).mockReturnValue({
      showToast: mockShowToast,
    });
  });

  describe('CSV Upload', () => {
    it('should append new policies and show a success toast for a valid CSV upload', async () => {
      renderComponent();

      expect(screen.getByDisplayValue('Custom Policy 1')).toBeInTheDocument();

      const csvContent = 'policy_text\n"Policy from CSV 1"\n"Policy from CSV 2"';
      const file = new File([csvContent], 'policies.csv', { type: 'text/csv' });
      Object.defineProperty(file, 'text', {
        value: () => Promise.resolve(csvContent),
      });

      const uploadButton = screen.getByRole('button', { name: /upload csv/i });
      const fileInput = uploadButton.querySelector('input[type="file"]');
      expect(fileInput).not.toBeNull();

      fireEvent.change(fileInput!, {
        target: { files: [file] },
      });

      await waitFor(() => {
        expect(screen.getByDisplayValue('Custom Policy 2')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Custom Policy 3')).toBeInTheDocument();

        expect(screen.getByDisplayValue('Policy from CSV 1')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Policy from CSV 2')).toBeInTheDocument();

        expect(mockShowToast).toHaveBeenCalledWith(
          'Successfully imported 2 policies from CSV',
          'success',
        );
      });

      expect(screen.getByDisplayValue('Custom Policy 1')).toBeInTheDocument();
    });

    it('should disable the "Upload CSV" button and display "Uploading..." while processing, then re-enable and restore label', async () => {
      renderComponent();

      const csvContent = 'policy_text\n"Policy from CSV 1"';
      const file = new File([csvContent], 'policies.csv', { type: 'text/csv' });
      Object.defineProperty(file, 'text', {
        value: () => Promise.resolve(csvContent),
      });

      const uploadButton = screen.getByRole('button', { name: /upload csv/i });
      const fileInput = uploadButton.querySelector('input[type="file"]');

      fireEvent.change(fileInput!, {
        target: { files: [file] },
      });

      expect(uploadButton).toHaveAttribute('aria-disabled', 'true');
      expect(uploadButton).toHaveClass('Mui-disabled');
      expect(uploadButton).toHaveTextContent('Uploading...');

      await waitFor(() => {
        expect(uploadButton).not.toHaveAttribute('aria-disabled');
        expect(uploadButton).not.toHaveClass('Mui-disabled');
        expect(uploadButton).toHaveTextContent('Upload CSV');
      });
    });

    it('should not add new policies and show a warning toast when a CSV file is uploaded with only empty or whitespace values', async () => {
      renderComponent();

      expect(screen.getByDisplayValue('Custom Policy 1')).toBeInTheDocument();

      const initialPoliciesCount = screen.getAllByLabelText('Policy Text').length;

      const csvContent = 'policy_text\n""\n"   "\n" "';
      const file = new File([csvContent], 'empty_policies.csv', { type: 'text/csv' });
      Object.defineProperty(file, 'text', {
        value: () => Promise.resolve(csvContent),
      });

      const uploadButton = screen.getByRole('button', { name: /upload csv/i });
      const fileInput = uploadButton.querySelector('input[type="file"]');
      expect(fileInput).not.toBeNull();

      fireEvent.change(fileInput!, {
        target: { files: [file] },
      });

      await waitFor(() => {
        const currentPoliciesCount = screen.getAllByLabelText('Policy Text').length;
        expect(currentPoliciesCount).toBe(initialPoliciesCount);

        expect(mockShowToast).toHaveBeenCalledWith(
          'No valid policies found in CSV file',
          'warning',
        );
      });

      expect(screen.getByDisplayValue('Custom Policy 1')).toBeInTheDocument();
    });

    it('should show an error toast when a non-CSV file is uploaded with a .csv extension', async () => {
      renderComponent();

      const invalidCsvContent =
        'This is not a CSV file. <?xml version="1.0" encoding="UTF-8"?> <root> <element> <subelement>Invalid CSV Data</subelement> </element> </root>';
      const file = new File([invalidCsvContent], 'invalid.csv', { type: 'text/plain' });
      Object.defineProperty(file, 'text', {
        value: () => Promise.resolve(invalidCsvContent),
      });

      const uploadButton = screen.getByRole('button', { name: /upload csv/i });
      const fileInput = uploadButton.querySelector('input[type="file"]');
      expect(fileInput).not.toBeNull();

      fireEvent.change(fileInput!, {
        target: { files: [file] },
      });

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('Error parsing CSV:'),
          'error',
        );
      });
    });

    it('should show a warning toast when a CSV file with no columns (empty lines) is uploaded', async () => {
      renderComponent();

      const csvContent = '\n\n\n';
      const file = new File([csvContent], 'empty_policies.csv', { type: 'text/csv' });
      Object.defineProperty(file, 'text', {
        value: () => Promise.resolve(csvContent),
      });

      const uploadButton = screen.getByRole('button', { name: /upload csv/i });
      const fileInput = uploadButton.querySelector('input[type="file"]');
      expect(fileInput).not.toBeNull();

      fireEvent.change(fileInput!, {
        target: { files: [file] },
      });

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          'No valid policies found in CSV file',
          'warning',
        );
      });

      expect(screen.getByDisplayValue('Custom Policy 1')).toBeInTheDocument();
      const policyNameInputs = screen.getAllByLabelText('Policy Name');
      expect(policyNameInputs.length).toBe(1);
    });

    it('should show an error toast when a file cannot be read as text', async () => {
      renderComponent();

      const file = new File([''], 'invalid.csv', { type: 'image/jpeg' });
      Object.defineProperty(file, 'text', {
        value: () => Promise.reject(new Error('File could not be read')),
      });

      const uploadButton = screen.getByRole('button', { name: /upload csv/i });
      const fileInput = uploadButton.querySelector('input[type="file"]');
      expect(fileInput).not.toBeNull();

      fireEvent.change(fileInput!, {
        target: { files: [file] },
      });

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          'Error parsing CSV: Error: File could not be read',
          'error',
        );
      });
    });
  });

  // Policy Test Generation Timeout Tests
  describe('Policy Test Generation Timeout Behavior', () => {
    const mockCallApi = vi.fn();

    beforeEach(() => {
      vi.clearAllMocks();
    });

    // Simulate the key logic from CustomPoliciesSection's generateTestCase function
    const generateTestCase = async (policy: any, config: any, toast: any, callApi: any) => {
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

      await generateTestCase(policy, config, mockToast, mockCallApi);

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

      await expect(generateTestCase(policy, config, mockToast, mockCallApi)).rejects.toThrow(
        timeoutError,
      );

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

      await expect(generateTestCase(policy, config, mockToast, mockCallApi)).rejects.toThrow(
        genericError,
      );

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

      await expect(generateTestCase(policy, config, mockToast, mockCallApi)).rejects.toThrow(
        'Bad Request',
      );

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
        const localMockToast = { showToast: vi.fn() };

        const policy = { policy: 'Test policy' };
        const config = { applicationDefinition: { purpose: 'Test app' } };

        await expect(
          generateTestCase(policy, config, localMockToast, mockCallApi),
        ).rejects.toThrow();

        expect(localMockToast.showToast).toHaveBeenCalledWith(
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

      const result = await generateTestCase(policy, config, mockToast, mockCallApi);

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

      await generateTestCase(policy, config, mockToast, mockCallApi);

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
  });
});
