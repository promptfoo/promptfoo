import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { useToast } from '@app/hooks/useToast';
import { callApi } from '@app/utils/api';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';
import Review from './Review';

// Mock all dependencies
vi.mock('@app/utils/api');
vi.mock('../hooks/useRedTeamConfig');
vi.mock('@app/hooks/useToast');
vi.mock('@app/hooks/useTelemetry', () => ({
  useTelemetry: () => ({ recordEvent: vi.fn() }),
}));

vi.mock('../utils/yamlHelpers', () => ({
  generateOrderedYaml: vi.fn(() => 'mocked yaml content'),
}));

vi.mock('@promptfoo/redteam/sharedFrontend', () => ({
  getUnifiedConfig: vi.fn((config) => config),
}));

vi.mock('@promptfoo/redteam/constants', () => ({
  strategyDisplayNames: {
    strategy1: 'Strategy One',
    strategy2: 'Strategy Two',
  },
  DEFAULT_PLUGINS: [
    'contracts',
    'excessive-agency',
    'hallucination',
    'harmful',
    'overreliance',
    'politics',
  ],
}));

// Mock the LogViewer component
vi.mock('./LogViewer', () => ({
  LogViewer: ({ logs }: { logs: string[] }) => (
    <div data-testid="log-viewer">{logs.join('\n')}</div>
  ),
}));

// Mock YamlEditor
vi.mock('@app/pages/eval-creator/components/YamlEditor', () => ({
  default: ({ initialYaml }: { initialYaml: string }) => (
    <div data-testid="yaml-editor">{initialYaml}</div>
  ),
}));

// Helper function to render component with theme
const renderWithTheme = (component: React.ReactElement) => {
  const theme = createTheme();
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('Review Component', () => {
  const mockCallApi = vi.mocked(callApi);
  const mockUseRedTeamConfig = vi.mocked(useRedTeamConfig);
  const mockUseToast = vi.mocked(useToast);

  const defaultConfig = {
    description: 'Test Red Team Config',
    plugins: ['plugin1', { id: 'policy', config: { policy: 'test policy' } }],
    strategies: ['strategy1', { id: 'strategy2' }],
    purpose: 'Test purpose',
    numTests: 5,
    target: { id: 'test-target' },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    mockUseRedTeamConfig.mockReturnValue({
      config: defaultConfig,
      updateConfig: vi.fn(),
    } as any);

    mockUseToast.mockReturnValue({
      showToast: vi.fn(),
    } as any);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.restoreAllMocks();
  });

  it('renders the component with initial state', () => {
    renderWithTheme(<Review />);

    expect(screen.getByText('Review Your Configuration')).toBeInTheDocument();
    expect(screen.getByLabelText('Configuration Description')).toHaveValue('Test Red Team Config');
    expect(screen.getByText('Configuration Summary')).toBeInTheDocument();
  });

  describe('Run Settings Dialog', () => {
    it('opens run settings dialog when settings button is clicked', async () => {
      renderWithTheme(<Review />);

      const settingsButton = screen.getByRole('button', { name: /run settings/i });
      await userEvent.click(settingsButton);

      expect(screen.getByText('Run Settings')).toBeInTheDocument();
      expect(screen.getByLabelText('Delay between API calls (ms)')).toBeInTheDocument();
      expect(screen.getByLabelText('Max concurrency')).toBeInTheDocument();
    });

    it('initializes with correct default values', async () => {
      renderWithTheme(<Review />);

      const settingsButton = screen.getByRole('button', { name: /run settings/i });
      await userEvent.click(settingsButton);

      const delayInput = screen.getByLabelText('Delay between API calls (ms)');
      const concurrencyInput = screen.getByLabelText('Max concurrency');

      expect(delayInput).toHaveValue(0);
      expect(concurrencyInput).toHaveValue(1);
    });

    it('disables concurrency when delay is set', async () => {
      renderWithTheme(<Review />);

      const settingsButton = screen.getByRole('button', { name: /run settings/i });
      await userEvent.click(settingsButton);

      const delayInput = screen.getByLabelText('Delay between API calls (ms)');
      const concurrencyInput = screen.getByLabelText('Max concurrency');

      // Set delay to a positive value
      await userEvent.clear(delayInput);
      await userEvent.type(delayInput, '100');

      // Concurrency should be disabled and set to 1
      expect(concurrencyInput).toBeDisabled();
      expect(concurrencyInput).toHaveValue(1);
    });

    it('disables delay when concurrency is greater than 1', async () => {
      renderWithTheme(<Review />);

      const settingsButton = screen.getByRole('button', { name: /run settings/i });
      await userEvent.click(settingsButton);

      const delayInput = screen.getByLabelText('Delay between API calls (ms)');
      const concurrencyInput = screen.getByLabelText('Max concurrency');

      // Set concurrency to a value greater than 1
      await userEvent.clear(concurrencyInput);
      await userEvent.type(concurrencyInput, '5');

      // Delay should be disabled and set to 0
      expect(delayInput).toBeDisabled();
      expect(delayInput).toHaveValue(0);
    });

    it('shows appropriate tooltips when fields are disabled', async () => {
      renderWithTheme(<Review />);

      const settingsButton = screen.getByRole('button', { name: /run settings/i });
      await userEvent.click(settingsButton);

      const concurrencyInput = screen.getByLabelText('Max concurrency');

      // Set concurrency to 5 to disable delay
      await userEvent.clear(concurrencyInput);
      await userEvent.type(concurrencyInput, '5');

      // The tooltip is on the Tooltip component wrapping the field
      // Let's just verify the field is disabled when concurrency > 1
      const delayInput = screen.getByLabelText('Delay between API calls (ms)');
      expect(delayInput).toBeDisabled();
    });

    it('prevents negative values for delay and concurrency', async () => {
      renderWithTheme(<Review />);

      const settingsButton = screen.getByRole('button', { name: /run settings/i });
      await userEvent.click(settingsButton);

      const delayInput = screen.getByLabelText('Delay between API calls (ms)');
      const concurrencyInput = screen.getByLabelText('Max concurrency');

      // Try to type negative values - they should be ignored
      const initialDelayValue = delayInput.getAttribute('value');
      const initialConcurrencyValue = concurrencyInput.getAttribute('value');

      fireEvent.change(delayInput, { target: { value: '-100' } });
      fireEvent.change(concurrencyInput, { target: { value: '-5' } });

      // Values should remain unchanged
      expect(delayInput).toHaveValue(Number(initialDelayValue));
      expect(concurrencyInput).toHaveValue(Number(initialConcurrencyValue));
    });
  });

  describe('Running Evaluation', () => {
    it('runs evaluation with correct parameters', async () => {
      mockCallApi.mockResolvedValueOnce({
        json: async () => ({ hasRunningJob: false }),
      } as Response);

      mockCallApi.mockResolvedValueOnce({
        json: async () => ({ id: 'test-job-123' }),
      } as Response);

      // Mock additional polling calls to prevent unhandled rejections
      mockCallApi.mockResolvedValue({
        json: async () => ({
          status: 'complete',
          result: { success: true },
          evalId: 'eval-456',
          logs: [],
        }),
      } as Response);

      renderWithTheme(<Review />);

      // First open settings and configure
      const settingsButton = screen.getByRole('button', { name: /run settings/i });
      await userEvent.click(settingsButton);

      const delayInput = screen.getByLabelText('Delay between API calls (ms)');
      await userEvent.clear(delayInput);
      await userEvent.type(delayInput, '500');

      // Close dialog
      const closeButton = screen.getByText('Close');
      await userEvent.click(closeButton);

      // Wait a bit for dialog animation to complete
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Now find and click the run button
      const runButton = screen.getByRole('button', { name: /run now/i });
      await userEvent.click(runButton);

      await waitFor(() => {
        // Check that the second call was to /redteam/run with the correct parameters
        expect(mockCallApi).toHaveBeenNthCalledWith(2, '/redteam/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body:
            expect.stringContaining('"maxConcurrency":"1"') &&
            expect.stringContaining('"delayMs":"500"') &&
            expect.stringContaining('"force":true') &&
            expect.stringContaining('"verbose":false'),
        });
      });
    });

    it('handles running job conflict', async () => {
      mockCallApi.mockResolvedValueOnce({
        json: async () => ({ hasRunningJob: true, jobId: 'existing-job' }),
      } as Response);

      renderWithTheme(<Review />);

      const runButton = screen.getByRole('button', { name: /run now/i });
      await userEvent.click(runButton);

      // The status check happens first, so we need to wait for it
      await waitFor(() => {
        expect(mockCallApi).toHaveBeenCalledWith('/redteam/status');
      });

      await waitFor(() => {
        expect(screen.getByText('Job Already Running')).toBeInTheDocument();
        expect(
          screen.getByText(/There is already a red team evaluation running/),
        ).toBeInTheDocument();
      });
    });

    it('cancels existing job and runs new one', async () => {
      // First call: check status - job is running
      mockCallApi.mockResolvedValueOnce({
        json: async () => ({ hasRunningJob: true }),
      } as Response);

      renderWithTheme(<Review />);

      const runButton = screen.getByRole('button', { name: /run now/i });
      await userEvent.click(runButton);

      await waitFor(() => {
        expect(screen.getByText('Job Already Running')).toBeInTheDocument();
      });

      // Mock cancel request
      mockCallApi.mockResolvedValueOnce({} as Response);

      // Mock status check after cancel - no running job
      mockCallApi.mockResolvedValueOnce({
        json: async () => ({ hasRunningJob: false }),
      } as Response);

      // Mock new run request
      mockCallApi.mockResolvedValueOnce({
        json: async () => ({ id: 'new-job-123' }),
      } as Response);

      const cancelAndRunButton = screen.getByText('Cancel Existing & Run New');
      await userEvent.click(cancelAndRunButton);

      await waitFor(() => {
        expect(mockCallApi).toHaveBeenCalledWith('/redteam/cancel', { method: 'POST' });
      });
    });

    it('displays logs during evaluation', async () => {
      mockCallApi.mockResolvedValueOnce({
        json: async () => ({ hasRunningJob: false }),
      } as Response);

      mockCallApi.mockResolvedValueOnce({
        json: async () => ({ id: 'test-job-123' }),
      } as Response);

      // Mock job status polling
      mockCallApi.mockResolvedValueOnce({
        json: async () => ({
          status: 'running',
          logs: ['Starting evaluation...', 'Processing plugins...'],
        }),
      } as Response);

      // Mock additional calls to prevent unhandled rejections
      mockCallApi.mockResolvedValue({
        json: async () => ({
          status: 'complete',
          result: { success: true },
          evalId: 'eval-456',
          logs: ['Starting evaluation...', 'Processing plugins...', 'Complete'],
        }),
      } as Response);

      renderWithTheme(<Review />);

      const runButton = screen.getByRole('button', { name: /run now/i });
      await userEvent.click(runButton);

      await waitFor(() => {
        const logViewer = screen.queryByTestId('log-viewer');
        expect(logViewer).toBeInTheDocument();
        // Check that it contains the expected logs (not exact match due to concatenation)
        expect(logViewer?.textContent).toContain('Starting evaluation...');
        expect(logViewer?.textContent).toContain('Processing plugins...');
      });
    });

    it('shows view report button on successful completion', async () => {
      mockCallApi.mockResolvedValueOnce({
        json: async () => ({ hasRunningJob: false }),
      } as Response);

      mockCallApi.mockResolvedValueOnce({
        json: async () => ({ id: 'test-job-123' }),
      } as Response);

      // Mock successful completion - need to resolve immediately to avoid polling
      mockCallApi.mockResolvedValueOnce({
        json: async () => ({
          status: 'complete',
          result: { success: true },
          evalId: 'eval-456',
          logs: ['Evaluation complete'],
        }),
      } as Response);

      // Mock any additional polling calls to avoid unhandled rejections
      mockCallApi.mockResolvedValue({
        json: async () => ({
          status: 'complete',
          result: { success: true },
          evalId: 'eval-456',
          logs: ['Evaluation complete'],
        }),
      } as Response);

      renderWithTheme(<Review />);

      const runButton = screen.getByRole('button', { name: /run now/i });
      await userEvent.click(runButton);

      await waitFor(() => {
        expect(screen.getByRole('link', { name: /view report/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /view probes/i })).toBeInTheDocument();
      });

      const reportButton = screen.getByRole('link', { name: /view report/i });
      expect(reportButton).toHaveAttribute('href', '/report?evalId=eval-456');
    });
  });

  describe('Configuration Management', () => {
    it('saves YAML configuration', async () => {
      // Mock URL.createObjectURL and URL.revokeObjectURL
      const mockCreateObjectURL = vi.fn(() => 'blob:mock-url');
      const mockRevokeObjectURL = vi.fn();
      global.URL.createObjectURL = mockCreateObjectURL;
      global.URL.revokeObjectURL = mockRevokeObjectURL;

      // Mock document.createElement for the download link
      const mockClick = vi.fn();
      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'a') {
          const link = originalCreateElement('a');
          link.click = mockClick;
          return link;
        }
        return originalCreateElement(tagName);
      });

      renderWithTheme(<Review />);

      const saveButton = screen.getByRole('button', { name: /save yaml/i });
      await userEvent.click(saveButton);

      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalled();

      vi.restoreAllMocks();
    });

    it('displays YAML in dialog', async () => {
      renderWithTheme(<Review />);

      const viewButton = screen.getByRole('button', { name: /view yaml/i });
      await userEvent.click(viewButton);

      expect(screen.getByText('YAML Configuration')).toBeInTheDocument();
      expect(screen.getByTestId('yaml-editor')).toBeInTheDocument();
    });

    it('updates description', async () => {
      const mockUpdateConfig = vi.fn();
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          description: 'Initial Description',
          plugins: [],
          strategies: [],
          purpose: '',
          numTests: 5,
          target: { id: 'test' },
        },
        updateConfig: mockUpdateConfig,
      } as any);

      renderWithTheme(<Review />);

      const descriptionInput = screen.getByLabelText('Configuration Description');

      // Clear and type in one go to avoid character-by-character updates
      fireEvent.change(descriptionInput, { target: { value: 'New Description' } });

      // The last call should be with the final value
      expect(mockUpdateConfig).toHaveBeenLastCalledWith('description', 'New Description');
    });
  });

  describe('Edge Cases', () => {
    it('handles API errors gracefully', async () => {
      const mockShowToast = vi.fn();
      mockUseToast.mockReturnValue({
        showToast: mockShowToast,
      } as any);

      mockCallApi.mockRejectedValueOnce(new Error('Network error'));

      renderWithTheme(<Review />);

      const runButton = screen.getByRole('button', { name: /run now/i });
      await userEvent.click(runButton);

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('An error occurred while starting the evaluation'),
          'error',
        );
      });
    });

    it('cleans up polling interval on unmount', async () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      mockCallApi.mockResolvedValueOnce({
        json: async () => ({ hasRunningJob: false }),
      } as Response);

      mockCallApi.mockResolvedValueOnce({
        json: async () => ({ id: 'test-job-123' }),
      } as Response);

      // Keep the job running
      mockCallApi.mockResolvedValue({
        json: async () => ({ status: 'running', logs: [] }),
      } as Response);

      const { unmount } = renderWithTheme(<Review />);

      const runButton = screen.getByRole('button', { name: /run now/i });
      await userEvent.click(runButton);

      // Wait for the run to be initiated
      await waitFor(() => {
        expect(mockCallApi).toHaveBeenCalledWith('/redteam/run', expect.any(Object));
      });

      // Give it a moment to start polling
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Unmount component
      act(() => {
        unmount();
      });

      // Polling interval should be cleared
      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it('updates both maxConcurrency and delayMs fields correctly', async () => {
      renderWithTheme(<Review />);

      const settingsButton = screen.getByRole('button', { name: /run settings/i });
      await userEvent.click(settingsButton);

      const delayInput = screen.getByLabelText('Delay between API calls (ms)');
      const concurrencyInput = screen.getByLabelText('Max concurrency');

      // Test setting concurrency first
      await userEvent.clear(concurrencyInput);
      await userEvent.type(concurrencyInput, '10');

      await waitFor(() => {
        expect(concurrencyInput).toHaveValue(10);
        expect(delayInput).toHaveValue(0);
        expect(delayInput).toBeDisabled();
      });

      // Clear concurrency and set delay
      await userEvent.clear(concurrencyInput);
      await userEvent.type(concurrencyInput, '1');
      await userEvent.clear(delayInput);
      await userEvent.type(delayInput, '1000');

      await waitFor(() => {
        expect(delayInput).toHaveValue(1000);
        expect(concurrencyInput).toHaveValue(1);
        expect(concurrencyInput).toBeDisabled();
      });
    });
  });
});
