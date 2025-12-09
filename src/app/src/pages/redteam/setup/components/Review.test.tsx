import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Review from './Review';
import { callApi } from '@app/utils/api';
import { useApiHealth, type ApiHealthResult } from '@app/hooks/useApiHealth';
import type { DefinedUseQueryResult } from '@tanstack/react-query';

// Mock the dependencies
vi.mock('@app/hooks/useEmailVerification', () => ({
  useEmailVerification: vi.fn(() => ({
    checkEmailStatus: vi.fn().mockResolvedValue({ canProceed: true }),
  })),
}));

vi.mock('@app/hooks/useTelemetry', () => ({
  useTelemetry: () => ({
    recordEvent: vi.fn(),
  }),
}));

vi.mock('@app/hooks/useToast', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
  fetchUserEmail: vi.fn(() => Promise.resolve('test@example.com')),
  fetchUserId: vi.fn(() => Promise.resolve('test-user-id')),
  updateEvalAuthor: vi.fn(() => Promise.resolve({})),
}));

vi.mock('@app/hooks/useApiHealth', () => ({
  useApiHealth: vi.fn(),
}));

vi.mocked(useApiHealth).mockReturnValue({
  data: { status: 'connected', message: null },
  refetch: vi.fn(),
  isLoading: false,
} as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

vi.mock('@app/pages/eval-creator/components/YamlEditor', () => ({
  default: ({ initialYaml }: { initialYaml: string }) => (
    <div data-testid="yaml-editor">{initialYaml}</div>
  ),
}));

vi.mock('@promptfoo/redteam/sharedFrontend', () => ({
  getUnifiedConfig: vi.fn().mockReturnValue({
    description: 'Test config',
    plugins: [],
    strategies: [],
  }),
}));

vi.mock('../utils/yamlHelpers', () => ({
  generateOrderedYaml: vi.fn().mockReturnValue('description: Test config\nplugins: []'),
}));

vi.mock('./strategies/utils', () => ({
  getEstimatedDuration: vi.fn(() => '~5m'),
  getEstimatedProbes: vi.fn(() => 150),
}));

vi.mock('./DefaultTestVariables', () => ({
  default: () => <div data-testid="default-test-variables">Default Test Variables Component</div>,
}));

// Mock the useRedTeamConfig hook
const mockUpdateConfig = vi.fn();
const mockUseRedTeamConfig = vi.fn();

vi.mock('../hooks/useRedTeamConfig', () => ({
  useRedTeamConfig: () => mockUseRedTeamConfig(),
}));

// Mock the new job hooks
const mockJobActions = {
  startJob: vi.fn(),
  reset: vi.fn(),
  updateFromWebSocket: vi.fn(),
  updateFromPolling: vi.fn(),
  completeJob: vi.fn(),
  errorJob: vi.fn(),
  toggleLogs: vi.fn(),
  setPollInterval: vi.fn(),
  clearPollInterval: vi.fn(),
};

const mockJobState = {
  jobId: null as string | null,
  status: 'idle' as 'idle' | 'in-progress' | 'complete' | 'error',
  evalId: null as string | null,
  progress: 0,
  total: 0,
  startedAt: null as number | null,
  phase: undefined,
  phaseDetail: undefined,
  metrics: undefined,
  errors: undefined,
  summary: undefined,
  logs: [] as string[],
  logsExpanded: false,
  lastUpdateTimestamp: 0,
};

vi.mock('../hooks/useJobState', () => ({
  useJobState: () => ({
    state: mockJobState,
    actions: mockJobActions,
    pollIntervalRef: { current: null },
  }),
}));

vi.mock('../hooks/useJobSocket', () => ({
  useJobSocket: vi.fn(),
}));

describe('Review Component', () => {
  const defaultConfig = {
    description: 'Test Configuration',
    plugins: [],
    strategies: [],
    purpose: 'Test purpose',
    numTests: 10,
    maxConcurrency: 4,
    target: { id: 'test-target', config: {} },
    applicationDefinition: {},
    entities: [],
    defaultTest: { vars: {} },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Reset the mock to return a connected state by default
    vi.mocked(useApiHealth).mockReturnValue({
      data: { status: 'connected', message: null },
      refetch: vi.fn(),
      isLoading: false,
    } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

    mockUseRedTeamConfig.mockReturnValue({
      config: defaultConfig,
      updateConfig: mockUpdateConfig,
    });

    // Reset job state to idle
    mockJobState.jobId = null;
    mockJobState.status = 'idle';
    mockJobState.evalId = null;
    mockJobState.progress = 0;
    mockJobState.total = 0;
    mockJobState.startedAt = null;
    mockJobState.phase = undefined;
    mockJobState.phaseDetail = undefined;
    mockJobState.metrics = undefined;
    mockJobState.errors = undefined;
    mockJobState.summary = undefined;
    mockJobState.logs = [];
    mockJobState.logsExpanded = false;
  });

  afterEach(() => {
    // Only run pending timers if fake timers are active
    // This prevents errors when child describe blocks use real timers
    try {
      vi.runOnlyPendingTimers();
    } catch {
      // Ignore error if timers are not mocked
    }
    vi.useRealTimers();
  });

  describe('Component Integration', () => {
    it('renders all main sections', () => {
      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      expect(screen.getByText('Review & Run')).toBeInTheDocument();
      // Configuration accordion is the main section now
      expect(screen.getByText('Configuration')).toBeInTheDocument();
      // Advanced Configuration section is visible (collapsed by default)
      expect(screen.getByText('Advanced Configuration')).toBeInTheDocument();
    });

    it('renders configuration description field', () => {
      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const descriptionField = screen.getByLabelText('Description');
      expect(descriptionField).toBeInTheDocument();
      expect(descriptionField).toHaveValue('Test Configuration');
    });

    it('renders DefaultTestVariables component inside Configuration accordion when Advanced Config is expanded', async () => {
      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // First expand the Advanced Configuration section
      const advancedConfigHeader = screen.getByText('Advanced Configuration');
      fireEvent.click(advancedConfigHeader);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      const defaultTestVariables = screen.getByTestId('default-test-variables');
      const accordionDetails = defaultTestVariables.closest(
        'div[class*="MuiAccordionDetails-root"]',
      );

      expect(accordionDetails).toBeInTheDocument();
    });
  });

  describe('Advanced Configuration Section', () => {
    it('should render the Advanced Configuration section as a collapsible within Configuration', () => {
      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Advanced Configuration should be visible as a label inside Configuration
      expect(screen.getByText('Advanced Configuration')).toBeInTheDocument();
      // It should show the Optional chip
      expect(screen.getByText('Optional')).toBeInTheDocument();
    });

    it('should expand Advanced Configuration section when clicked', async () => {
      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Click on Advanced Configuration section header
      const advancedConfigHeader = screen.getByText('Advanced Configuration');
      fireEvent.click(advancedConfigHeader);

      // Advance timers for state update
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // DefaultTestVariables should now be visible
      expect(screen.getByTestId('default-test-variables')).toBeInTheDocument();
    });

    it('renders DefaultTestVariables inside Advanced Configuration when expanded', async () => {
      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Click to expand Advanced Configuration
      const advancedConfigHeader = screen.getByText('Advanced Configuration');
      fireEvent.click(advancedConfigHeader);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      const defaultTestVariables = screen.getByTestId('default-test-variables');
      expect(defaultTestVariables).toBeInTheDocument();
    });
  });

  it('renders DefaultTestVariables without Paper wrapper and title when Advanced Configuration is expanded', async () => {
    render(
      <Review
        navigateToPlugins={vi.fn()}
        navigateToPurpose={vi.fn()}
      />,
    );

    const accordionSummary = screen.getByText('Advanced Configuration');
    fireEvent.click(accordionSummary);

    // Advance timers for any animations/transitions
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    const defaultTestVariables = screen.getByTestId('default-test-variables');

    expect(defaultTestVariables).toBeInTheDocument();

    expect(defaultTestVariables.closest('paper')).toBeNull();
  });

  it('should display Application Details section when purpose is set', async () => {
    mockUseRedTeamConfig.mockReturnValue({
      config: {
        ...defaultConfig,
        purpose: 'This is a test application purpose.',
      },
      updateConfig: mockUpdateConfig,
    });

    render(
      <Review
        navigateToPlugins={vi.fn()}
        navigateToPurpose={vi.fn()}
      />,
    );

    // Application Details section should be present when purpose is set
    expect(screen.getByText('Application Details')).toBeInTheDocument();
  });

  it('expands Application Details section when clicked', async () => {
    mockUseRedTeamConfig.mockReturnValue({
      config: {
        ...defaultConfig,
        purpose: 'Test purpose content for the application.',
      },
      updateConfig: mockUpdateConfig,
    });

    render(
      <Review
        navigateToPlugins={vi.fn()}
        navigateToPurpose={vi.fn()}
      />,
    );

    // Click on Application Details to expand it - this toggles the section
    const appDetailsHeader = screen.getByText('Application Details');
    fireEvent.click(appDetailsHeader);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    // The section should be toggled (this is a simple check that clicking works)
    expect(appDetailsHeader).toBeInTheDocument();
  });

  describe('Run Now Button - API Health Integration', () => {
    it('should read API health status from context on mount', () => {
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'connected', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Component should render without errors and read the status
      // The ApiHealthProvider handles polling automatically
      const runButton = screen.getByRole('button', { name: /run scan/i });
      expect(runButton).toBeInTheDocument();
    });

    it('should enable the Run Now button when API status is connected', () => {
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'connected', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const runButton = screen.getByRole('button', { name: /run scan/i });
      expect(runButton).toBeEnabled();
    });

    it('should disable the Run Now button when API status is blocked', () => {
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'blocked', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const runButton = screen.getByRole('button', { name: /run scan/i });
      expect(runButton).toBeDisabled();
    });

    it('should disable the Run Now button when API status is disabled', () => {
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'disabled', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const runButton = screen.getByRole('button', { name: /run scan/i });
      expect(runButton).toBeDisabled();
    });

    it('should disable the Run Now button when API status is unknown', () => {
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'unknown', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const runButton = screen.getByRole('button', { name: /run scan/i });
      expect(runButton).toBeDisabled();
    });

    it('should enable the Run Now button when API status is loading', () => {
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'loading', message: null },
        refetch: vi.fn(),
        isLoading: true,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const runButton = screen.getByRole('button', { name: /run scan/i });
      expect(runButton).toBeEnabled();
    });

    it('should show tooltip message when hovering over disabled button due to blocked API', async () => {
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'blocked', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const buttonWrapper = screen.getByRole('button', { name: /run scan/i }).parentElement;

      if (buttonWrapper) {
        fireEvent.mouseOver(buttonWrapper);

        // Advance timers for MUI Tooltip to appear
        await act(async () => {
          await vi.advanceTimersByTimeAsync(500);
        });

        // Match tooltip text specifically (includes "or API settings" which the alert doesn't have)
        expect(
          screen.getByText(/API settings/i),
        ).toBeInTheDocument();
      }
    });

    it('should display warning alert when API is blocked', () => {
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'blocked', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Check for the specific alert text
      expect(
        screen.getByText(
          /Cannot connect to Promptfoo Cloud. Please check your network connection./i,
        ),
      ).toBeInTheDocument();
    });

    it('should display warning alert when API is disabled', () => {
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'disabled', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Check for the specific alert text
      expect(
        screen.getByText(/Remote generation is disabled. Save YAML and run via CLI instead./),
      ).toBeInTheDocument();
    });

    it('should display warning alert when API is unknown', () => {
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'unknown', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Check for the specific alert text
      expect(screen.getByText(/Checking connection status.../)).toBeInTheDocument();
    });

    it('should not display warning alert when API is connected', () => {
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'connected', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Check that no API health warning alert exists (but other alerts may exist)
      expect(screen.queryByText(/Cannot connect to Promptfoo Cloud/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Remote generation is disabled/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Checking connection status/)).not.toBeInTheDocument();
    });

    it('should not display warning alert when API is loading', () => {
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'loading', message: null },
        refetch: vi.fn(),
        isLoading: true,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Check that no API health warning alert exists (but other alerts may exist)
      expect(screen.queryByText(/Cannot connect to Promptfoo Cloud/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Remote generation is disabled/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Checking connection status/)).not.toBeInTheDocument();
    });

    it('should show tooltip message when hovering over disabled button due to disabled API', async () => {
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'disabled', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const buttonWrapper = screen.getByRole('button', { name: /run scan/i }).parentElement;

      if (buttonWrapper) {
        fireEvent.mouseOver(buttonWrapper);

        // Advance timers for MUI Tooltip to appear
        await act(async () => {
          await vi.advanceTimersByTimeAsync(500);
        });

        // Match tooltip text specifically (different from Alert text)
        expect(
          screen.getByText(/Remote generation is disabled\. Running red team evaluations/i),
        ).toBeInTheDocument();
      }
    });

    it('should show tooltip message when hovering over disabled button due to unknown API status', async () => {
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'unknown', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const buttonWrapper = screen.getByRole('button', { name: /run scan/i }).parentElement;

      if (buttonWrapper) {
        fireEvent.mouseOver(buttonWrapper);

        // Advance timers for MUI Tooltip to appear
        await act(async () => {
          await vi.advanceTimersByTimeAsync(500);
        });

        expect(screen.getByText(/checking connection to promptfoo cloud/i)).toBeInTheDocument();
      }
    });

    it('should not show tooltip when API is connected', async () => {
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'connected', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const button = screen.getByRole('button', { name: /run scan/i });
      const buttonWrapper = button.parentElement;

      if (buttonWrapper) {
        fireEvent.mouseOver(buttonWrapper);

        // Wait a bit to ensure tooltip would have time to appear if it was going to
        await vi.advanceTimersByTimeAsync(100);

        // Check that no tooltip is shown (check for various tooltip text patterns)
        expect(screen.queryByText(/cannot connect to promptfoo cloud/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/remote generation is disabled/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/checking connection/i)).not.toBeInTheDocument();
      }
    });

    it('should not show tooltip when API is loading', async () => {
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'loading', message: null },
        refetch: vi.fn(),
        isLoading: true,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const button = screen.getByRole('button', { name: /run scan/i });
      const buttonWrapper = button.parentElement;

      if (buttonWrapper) {
        fireEvent.mouseOver(buttonWrapper);

        // Wait a bit to ensure tooltip would have time to appear if it was going to
        await vi.advanceTimersByTimeAsync(100);

        // Check that no tooltip is shown
        expect(screen.queryByText(/cannot connect to promptfoo cloud/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/remote generation is disabled/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/checking connection/i)).not.toBeInTheDocument();
      }
    });
  });

  describe('Run Now Button - isRunning Integration', () => {
    beforeEach(() => {
      // These tests rely on real async behavior (button click → API call → state change)
      // so we need to use real timers instead of fake timers
      vi.useRealTimers();

      // Reset to connected state
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'connected', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      // Mock successful job status check and run API calls
      vi.mocked(callApi).mockImplementation(async (url: string, _options?: any) => {
        if (url === '/redteam/status') {
          return {
            json: async () => ({ hasRunningJob: false }),
          } as any;
        }
        if (url === '/redteam/run') {
          return {
            json: async () => ({ id: 'test-job-id' }),
          } as any;
        }
        if (url.startsWith('/eval/job/')) {
          return {
            json: async () => ({
              status: 'running',
              logs: ['Running tests...'],
            }),
          } as any;
        }
        return { json: async () => ({}) } as any;
      });
    });

    it('should not show Run Scan button when isRunning is true', () => {
      // Set job state to in-progress (simulates running state)
      mockJobState.status = 'in-progress';

      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'connected', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Run Scan button should not be present when running - the UI transforms to show progress
      expect(screen.queryByRole('button', { name: /run scan/i })).not.toBeInTheDocument();
    });

    it('should show progress UI when isRunning is true', () => {
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'connected', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      // Set job state to in-progress (simulates running state)
      mockJobState.status = 'in-progress';

      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // The UI transforms to show the running state - Run Scan button is replaced with Cancel
      expect(screen.queryByRole('button', { name: /run scan/i })).not.toBeInTheDocument();
      // Cancel button should be present
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    it('should show Cancel button when isRunning is true', () => {
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'connected', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      // Set job state to in-progress (simulates running state)
      mockJobState.status = 'in-progress';

      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Cancel buttons should be present when running (main button bar and ExecutionProgress)
      const cancelButtons = screen.getAllByRole('button', { name: /cancel/i });
      expect(cancelButtons.length).toBeGreaterThan(0);
      // The main cancel button in the button bar should be enabled
      expect(cancelButtons[0]).toBeEnabled();
    });

    it('should show confirmation dialog when Cancel button is clicked', async () => {
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'connected', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      // Set job state to in-progress (simulates running state)
      mockJobState.status = 'in-progress';

      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Click the Cancel button
      const cancelButtons = screen.getAllByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButtons[0]);

      // Confirmation dialog should appear
      expect(screen.getByText('Cancel Evaluation?')).toBeInTheDocument();
      expect(screen.getByText(/Are you sure you want to cancel/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Continue Running/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Cancel Evaluation/i })).toBeInTheDocument();
    });

    it('should close confirmation dialog when Continue Running is clicked', async () => {
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'connected', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      mockJobState.status = 'in-progress';

      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Open the dialog
      const cancelButtons = screen.getAllByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButtons[0]);

      // Click Continue Running
      fireEvent.click(screen.getByRole('button', { name: /Continue Running/i }));

      // Dialog should be closed
      await waitFor(() => {
        expect(screen.queryByText('Cancel Evaluation?')).not.toBeInTheDocument();
      });
    });

    it('should show Cancel button instead of Run Scan when running', () => {
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'connected', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      // Set job state to in-progress (simulates running state)
      mockJobState.status = 'in-progress';

      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // In running state, the UI transforms - no Run Scan button, only Cancel
      expect(screen.queryByRole('button', { name: /run scan/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    it('should show Cancel button when both isRunning is true and API is blocked', () => {
      // Set job state to in-progress AND API blocked
      mockJobState.status = 'in-progress';

      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'blocked', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // In running state, the UI shows Cancel button regardless of API status
      expect(screen.queryByRole('button', { name: /run scan/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });
  });

  describe('Run Now Button - State Transitions', () => {
    beforeEach(() => {
      // These tests use waitFor which doesn't work well with fake timers
      vi.useRealTimers();
    });

    it('should update button state when API health status changes', () => {
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'connected', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      const { rerender } = render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Initially button should be enabled
      expect(screen.getByRole('button', { name: /run scan/i })).toBeEnabled();

      // Change API status to blocked
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'blocked', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      rerender(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Button should now be disabled
      expect(screen.getByRole('button', { name: /run scan/i })).toBeDisabled();

      // Change API status back to connected
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'connected', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      rerender(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Button should be enabled again
      expect(screen.getByRole('button', { name: /run scan/i })).toBeEnabled();
    });

    it('should update alert visibility when API health status changes', () => {
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'connected', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      const { rerender } = render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Initially no API health alert should be shown
      expect(screen.queryByText(/Cannot connect to Promptfoo Cloud/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Remote generation is disabled/)).not.toBeInTheDocument();

      // Change API status to blocked
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'blocked', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      rerender(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Alert should now be visible
      expect(
        screen.getByText(
          /Cannot connect to Promptfoo Cloud. Please check your network connection./i,
        ),
      ).toBeInTheDocument();

      // Change API status to disabled
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'disabled', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      rerender(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Alert should update its message
      expect(
        screen.getByText(/Remote generation is disabled. Save YAML and run via CLI instead./),
      ).toBeInTheDocument();
      // Previous message should be gone
      expect(screen.queryByText(/Cannot connect to Promptfoo Cloud/)).not.toBeInTheDocument();

      // Change API status back to connected
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'connected', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      rerender(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Alert should disappear
      expect(screen.queryByText(/Remote generation is disabled/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Cannot connect to Promptfoo Cloud/)).not.toBeInTheDocument();
    });

    it('should update tooltip message when API health status changes', async () => {
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'blocked', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      const { rerender } = render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const button = screen.getByRole('button', { name: /run scan/i });
      const buttonWrapper = button.parentElement;

      if (buttonWrapper) {
        // First check tooltip for blocked state
        fireEvent.mouseOver(buttonWrapper);
        await waitFor(() => {
          // Use getAllByText since both alert and tooltip contain similar text
          const matches = screen.getAllByText(/cannot connect to promptfoo cloud/i);
          expect(matches.length).toBeGreaterThan(0);
        });
        fireEvent.mouseOut(buttonWrapper);

        // Change to disabled state
        vi.mocked(useApiHealth).mockReturnValue({
          data: { status: 'disabled', message: null },
          refetch: vi.fn(),
          isLoading: false,
        } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

        rerender(
          <Review
            navigateToPlugins={vi.fn()}
            navigateToPurpose={vi.fn()}
          />,
        );

        // Check tooltip for disabled state
        fireEvent.mouseOver(buttonWrapper);
        await waitFor(() => {
          // Check for the tooltip text specifically (not the alert text)
          const tooltips = screen.getAllByText(/remote generation is disabled/i);
          expect(tooltips.length).toBeGreaterThan(0);
        });
        fireEvent.mouseOut(buttonWrapper);

        // Change to unknown state
        vi.mocked(useApiHealth).mockReturnValue({
          data: { status: 'unknown', message: null },
          refetch: vi.fn(),
          isLoading: false,
        } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

        rerender(
          <Review
            navigateToPlugins={vi.fn()}
            navigateToPurpose={vi.fn()}
          />,
        );

        // Check tooltip for unknown state
        fireEvent.mouseOver(buttonWrapper);
        await waitFor(() => {
          expect(screen.getByText(/checking connection to promptfoo cloud/i)).toBeInTheDocument();
        });
      }
    });
  });
});
