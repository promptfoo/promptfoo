import { TooltipProvider } from '@app/components/ui/tooltip';
import { ToastProvider } from '@app/contexts/ToastContext';
import { useToast } from '@app/hooks/useToast';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import { TestCaseGenerationProvider } from '../TestCaseGenerationProvider';
import { CustomPoliciesSection } from './CustomPoliciesSection';
import type { ApiHealthResult } from '@app/hooks/useApiHealth';
import type { DefinedUseQueryResult } from '@tanstack/react-query';

vi.mock('../../hooks/useRedTeamConfig');
vi.mock('@app/hooks/useTelemetry', () => ({
  useTelemetry: () => ({
    recordEvent: vi.fn(),
  }),
}));
vi.mock('@app/hooks/useToast');
vi.mock('@app/hooks/useApiHealth', () => ({
  useApiHealth: vi.fn(
    () =>
      ({
        data: { status: 'connected', message: null },
        refetch: vi.fn(),
        isLoading: false,
      }) as unknown as DefinedUseQueryResult<ApiHealthResult, Error>,
  ),
}));

const mockUpdateConfig = vi.fn();
const mockShowToast = vi.fn();

const renderComponent = () => {
  const redTeamConfig = (useRedTeamConfig as unknown as Mock)();
  return render(
    <TooltipProvider>
      <ToastProvider>
        <TestCaseGenerationProvider redTeamConfig={redTeamConfig}>
          <CustomPoliciesSection />
        </TestCaseGenerationProvider>
      </ToastProvider>
    </TooltipProvider>,
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

  describe('Config Reset', () => {
    it('should show empty state message when config.plugins is empty', async () => {
      // Start with empty config
      const mockUseRedTeamConfig = useRedTeamConfig as unknown as Mock;
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: [],
        },
        updateConfig: mockUpdateConfig,
      });

      renderComponent();

      // Verify the empty state message is shown
      await waitFor(() => {
        const emptyMessage = screen.getByText(/No custom policies configured/i);
        expect(emptyMessage).toBeInTheDocument();
        // Table should not be rendered when there's no data
        const table = screen.queryByRole('table');
        expect(table).not.toBeInTheDocument();
      });
    });

    it('should display policies from config when they exist', async () => {
      const mockUseRedTeamConfig = useRedTeamConfig as unknown as Mock;
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: [
            { id: 'policy', config: { policy: 'Custom Policy Text 1' } },
            { id: 'policy', config: { policy: 'Custom Policy Text 2' } },
          ],
        },
        updateConfig: mockUpdateConfig,
      });

      renderComponent();

      // Verify the custom policies are displayed in the DataGrid
      await waitFor(() => {
        expect(screen.getByText('Custom Policy Text 1')).toBeInTheDocument();
        expect(screen.getByText('Custom Policy Text 2')).toBeInTheDocument();
      });
    });

    it('should reset to empty policy when config changes from having policies to none', async () => {
      // Start with some custom policies
      const mockUseRedTeamConfig = useRedTeamConfig as unknown as Mock;
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: [
            { id: 'policy', config: { policy: 'Custom Policy Text 1' } },
            { id: 'policy', config: { policy: 'Custom Policy Text 2' } },
          ],
        },
        updateConfig: mockUpdateConfig,
      });

      const { rerender } = renderComponent();

      // Verify the custom policies are displayed in the DataGrid
      await waitFor(() => {
        expect(screen.getByText('Custom Policy Text 1')).toBeInTheDocument();
        expect(screen.getByText('Custom Policy Text 2')).toBeInTheDocument();
      });

      // Simulate config reset (plugins becomes empty)
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: [],
        },
        updateConfig: mockUpdateConfig,
      });

      rerender(
        <TooltipProvider>
          <ToastProvider>
            <TestCaseGenerationProvider redTeamConfig={(mockUseRedTeamConfig as unknown as Mock)()}>
              <CustomPoliciesSection />
            </TestCaseGenerationProvider>
          </ToastProvider>
        </TooltipProvider>,
      );

      // Verify policies are reset and empty state message is shown
      await waitFor(() => {
        expect(screen.queryByText('Custom Policy Text 1')).not.toBeInTheDocument();
        expect(screen.queryByText('Custom Policy Text 2')).not.toBeInTheDocument();
        // Empty state message should be shown
        const emptyMessage = screen.getByText(/No custom policies configured/i);
        expect(emptyMessage).toBeInTheDocument();
        // Table should not be rendered when empty
        const table = screen.queryByRole('table');
        expect(table).not.toBeInTheDocument();
      });
    });
  });

  describe('CSV Upload', () => {
    it('should append new policies and show a success toast for a valid CSV upload', async () => {
      renderComponent();

      // Wait for component to be ready - use findByText since it's a label with asChild
      const uploadButton = await screen.findByText(/upload csv/i);

      const csvContent = 'policy_text\n"Policy from CSV 1"\n"Policy from CSV 2"';
      const file = new File([csvContent], 'policies.csv', { type: 'text/csv' });
      Object.defineProperty(file, 'text', {
        value: () => Promise.resolve(csvContent),
      });

      const fileInput = uploadButton.closest('label')?.querySelector('input[type="file"]');
      expect(fileInput).not.toBeNull();

      fireEvent.change(fileInput!, {
        target: { files: [file] },
      });

      await waitFor(() => {
        expect(mockUpdateConfig).toHaveBeenCalled();

        expect(mockShowToast).toHaveBeenCalledWith(
          'Successfully imported 2 policies from CSV',
          'success',
        );
      });
    });

    it('should disable the "Upload CSV" button and display "Uploading..." while processing, then re-enable and restore label', async () => {
      renderComponent();

      const csvContent = 'policy_text\n"Policy from CSV 1"';
      const file = new File([csvContent], 'policies.csv', { type: 'text/csv' });
      Object.defineProperty(file, 'text', {
        value: () => Promise.resolve(csvContent),
      });

      // Wait for component to be ready
      const uploadLabel = await screen.findByText(/upload csv/i);
      const uploadButton = uploadLabel.closest('label');
      const fileInput = uploadButton?.querySelector('input[type="file"]');

      fireEvent.change(fileInput!, {
        target: { files: [file] },
      });

      // Wait for the "Uploading..." state to appear
      await waitFor(() => {
        expect(uploadButton).toHaveTextContent('Uploading...');
      });

      // Then wait for it to return to normal
      await waitFor(() => {
        expect(uploadButton).toHaveTextContent('Upload CSV');
      });
    });

    it('should show a warning toast when no valid policies are found in the CSV', async () => {
      renderComponent();

      const csvContent = 'policy_text\n\n\n';
      const file = new File([csvContent], 'policies.csv', { type: 'text/csv' });
      Object.defineProperty(file, 'text', {
        value: () => Promise.resolve(csvContent),
      });

      // Wait for component to be ready
      const uploadLabel = await screen.findByText(/upload csv/i);
      const fileInput = uploadLabel.closest('label')?.querySelector('input[type="file"]');
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
    });

    it('should show an error toast when a non-CSV file is uploaded with a .csv extension', async () => {
      renderComponent();

      const csvContent = 'This is not a CSV file. <?xml version="1.0"?>';
      const file = new File([csvContent], 'not-csv.csv', { type: 'text/csv' });
      Object.defineProperty(file, 'text', {
        value: () => Promise.resolve(csvContent),
      });

      // Wait for component to be ready
      const uploadLabel = await screen.findByText(/upload csv/i);
      const fileInput = uploadLabel.closest('label')?.querySelector('input[type="file"]');

      fireEvent.change(fileInput!, {
        target: { files: [file] },
      });

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('Error parsing CSV'),
          'error',
        );
      });
    });

    it('should show an error toast when a file cannot be read as text', async () => {
      renderComponent();

      const file = new File([''], 'test.csv', { type: 'text/csv' });
      Object.defineProperty(file, 'text', {
        value: () => Promise.reject(new Error('File could not be read')),
      });

      // Wait for component to be ready
      const uploadLabel = await screen.findByText(/upload csv/i);
      const fileInput = uploadLabel.closest('label')?.querySelector('input[type="file"]');

      fireEvent.change(fileInput!, {
        target: { files: [file] },
      });

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('Error parsing CSV'),
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

  describe('Policy ID Stability', () => {
    it('should maintain stable IDs based on policy content', async () => {
      // Setup initial policies
      const mockUseRedTeamConfig = useRedTeamConfig as unknown as Mock;
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: [
            { id: 'policy', config: { policy: 'Policy text one' } },
            { id: 'policy', config: { policy: 'Policy text two' } },
          ],
        },
        updateConfig: mockUpdateConfig,
      });

      const { rerender } = renderComponent();

      // Wait for policies to be displayed
      await waitFor(() => {
        expect(screen.getByText('Policy text one')).toBeInTheDocument();
        expect(screen.getByText('Policy text two')).toBeInTheDocument();
      });

      // Reorder policies (swap them)
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: [
            { id: 'policy', config: { policy: 'Policy text two' } },
            { id: 'policy', config: { policy: 'Policy text one' } },
          ],
        },
        updateConfig: mockUpdateConfig,
      });

      rerender(
        <TooltipProvider>
          <ToastProvider>
            <TestCaseGenerationProvider redTeamConfig={(mockUseRedTeamConfig as unknown as Mock)()}>
              <CustomPoliciesSection />
            </TestCaseGenerationProvider>
          </ToastProvider>
        </TooltipProvider>,
      );

      // Policies should still be displayed correctly despite reordering
      // The IDs are based on content, not on position
      await waitFor(() => {
        expect(screen.getByText('Policy text one')).toBeInTheDocument();
        expect(screen.getByText('Policy text two')).toBeInTheDocument();
      });
    });
  });
});
