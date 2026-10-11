import { TooltipProvider } from '@app/components/ui/tooltip';
import { ToastProvider } from '@app/contexts/ToastContext';
import { useToast } from '@app/hooks/useToast';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const getUploadInputForLabel = (label: HTMLElement) => {
  const fileInput = label.closest('label')?.querySelector<HTMLInputElement>('input[type="file"]');
  if (!fileInput) {
    throw new Error('CSV upload input not found');
  }
  return fileInput;
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
      const user = userEvent.setup();
      renderComponent();

      // Wait for component to be ready - use findByText since it's a label with asChild
      const uploadButton = await screen.findByText(/upload csv/i);

      const csvContent = 'policy_text\n"Policy from CSV 1"\n"Policy from CSV 2"';
      const file = new File([csvContent], 'policies.csv', { type: 'text/csv' });
      Object.defineProperty(file, 'text', {
        value: () => Promise.resolve(csvContent),
      });

      const fileInput = getUploadInputForLabel(uploadButton);

      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(mockUpdateConfig).toHaveBeenCalled();

        expect(mockShowToast).toHaveBeenCalledWith(
          'Successfully imported 2 policies from CSV',
          'success',
        );
      });
    });

    it('should disable the "Upload CSV" button and display "Uploading..." while processing, then re-enable and restore label', async () => {
      const user = userEvent.setup();
      renderComponent();

      const csvContent = 'policy_text\n"Policy from CSV 1"';
      const file = new File([csvContent], 'policies.csv', { type: 'text/csv' });
      let resolveFileText!: (value: string) => void;
      Object.defineProperty(file, 'text', {
        value: () =>
          new Promise<string>((resolve) => {
            resolveFileText = resolve;
          }),
      });

      // Wait for component to be ready
      const uploadLabel = await screen.findByText(/upload csv/i);
      const uploadButton = uploadLabel.closest('label');
      const fileInput = getUploadInputForLabel(uploadLabel);

      const uploadPromise = user.upload(fileInput, file);

      // Wait for the "Uploading..." state to appear
      await waitFor(() => {
        expect(uploadButton).toHaveTextContent('Uploading...');
      });

      resolveFileText(csvContent);
      await uploadPromise;

      // Then wait for it to return to normal
      await waitFor(() => {
        expect(uploadButton).toHaveTextContent('Upload CSV');
      });
    });

    it('should show a warning toast when no valid policies are found in the CSV', async () => {
      const user = userEvent.setup();
      renderComponent();

      const csvContent = 'policy_text\n\n\n';
      const file = new File([csvContent], 'policies.csv', { type: 'text/csv' });
      Object.defineProperty(file, 'text', {
        value: () => Promise.resolve(csvContent),
      });

      // Wait for component to be ready
      const uploadLabel = await screen.findByText(/upload csv/i);
      const fileInput = getUploadInputForLabel(uploadLabel);

      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          'No valid policies found in CSV file',
          'warning',
        );
      });
    });

    it('should show an error toast when a non-CSV file is uploaded with a .csv extension', async () => {
      const user = userEvent.setup();
      renderComponent();

      const csvContent = 'This is not a CSV file. <?xml version="1.0"?>';
      const file = new File([csvContent], 'not-csv.csv', { type: 'text/csv' });
      Object.defineProperty(file, 'text', {
        value: () => Promise.resolve(csvContent),
      });

      // Wait for component to be ready
      const uploadLabel = await screen.findByText(/upload csv/i);
      const fileInput = getUploadInputForLabel(uploadLabel);

      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('Error parsing CSV'),
          'error',
        );
      });
    });

    it('should show an error toast when a file cannot be read as text', async () => {
      const user = userEvent.setup();
      renderComponent();

      const file = new File([''], 'test.csv', { type: 'text/csv' });
      Object.defineProperty(file, 'text', {
        value: () => Promise.reject(new Error('File could not be read')),
      });

      // Wait for component to be ready
      const uploadLabel = await screen.findByText(/upload csv/i);
      const fileInput = getUploadInputForLabel(uploadLabel);

      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('Error parsing CSV'),
          'error',
        );
      });
    });
  });

  // Policy Test Generation Timeout Tests
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

  describe('policy actions', () => {
    it('labels edit actions by row', async () => {
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

      renderComponent();

      expect(await screen.findByRole('button', { name: 'Edit policy 1' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Edit policy 2' })).toBeInTheDocument();
    });
  });
});
