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

  describe('Config Reset', () => {
    it('should show empty grid when config.plugins is empty', async () => {
      // Start with empty config
      const mockUseRedTeamConfig = useRedTeamConfig as unknown as Mock;
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: [],
        },
        updateConfig: mockUpdateConfig,
      });

      renderComponent();

      // Verify the DataGrid is rendered but empty
      await waitFor(() => {
        const grid = screen.getByRole('grid');
        expect(grid).toBeInTheDocument();
        // No policy rows should be visible
        expect(screen.queryByDisplayValue(/Custom Policy/)).not.toBeInTheDocument();
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
        <ThemeProvider theme={createTheme()}>
          <ToastProvider>
            <CustomPoliciesSection />
          </ToastProvider>
        </ThemeProvider>,
      );

      // Verify policies are reset to empty grid
      await waitFor(() => {
        expect(screen.queryByText('Custom Policy Text 1')).not.toBeInTheDocument();
        expect(screen.queryByText('Custom Policy Text 2')).not.toBeInTheDocument();
        // Grid should be empty
        const grid = screen.getByRole('grid');
        expect(grid).toBeInTheDocument();
      });
    });
  });

  describe('CSV Upload', () => {
    it('should append new policies and show a success toast for a valid CSV upload', async () => {
      renderComponent();

      // Wait for component to be ready
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /upload csv/i })).toBeInTheDocument();
      });

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

      const uploadButton = screen.getByRole('button', { name: /upload csv/i });
      const fileInput = uploadButton.querySelector('input[type="file"]');

      fireEvent.change(fileInput!, {
        target: { files: [file] },
      });

      expect(uploadButton).toHaveAttribute('aria-disabled', 'true');
      expect(uploadButton).toHaveTextContent('Uploading...');

      await waitFor(() => {
        expect(uploadButton).not.toHaveAttribute('aria-disabled');
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
    });

    it('should show an error toast when a non-CSV file is uploaded with a .csv extension', async () => {
      renderComponent();

      const csvContent = 'This is not a CSV file. <?xml version="1.0"?>';
      const file = new File([csvContent], 'not-csv.csv', { type: 'text/csv' });
      Object.defineProperty(file, 'text', {
        value: () => Promise.resolve(csvContent),
      });

      const uploadButton = screen.getByRole('button', { name: /upload csv/i });
      const fileInput = uploadButton.querySelector('input[type="file"]');

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

      const uploadButton = screen.getByRole('button', { name: /upload csv/i });
      const fileInput = uploadButton.querySelector('input[type="file"]');

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
});
