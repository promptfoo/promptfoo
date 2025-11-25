import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Review from './Review';
import { useEmailVerification } from '@app/hooks/useEmailVerification';
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
    it('renders all main sections including DefaultTestVariables component', () => {
      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      expect(screen.getByText('Review & Run')).toBeInTheDocument();
      expect(screen.getByText('Configuration Summary')).toBeInTheDocument();
      expect(screen.getByTestId('default-test-variables')).toBeInTheDocument();
      expect(screen.getByText('Run Options')).toBeInTheDocument();
    });

    it('renders configuration description field', () => {
      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const descriptionField = screen.getByLabelText('Description');
      expect(descriptionField).toBeInTheDocument();
      expect(descriptionField).toHaveValue('Test Configuration');
    });

    it('renders DefaultTestVariables component inside AccordionDetails', () => {
      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const defaultTestVariables = screen.getByTestId('default-test-variables');
      const accordionDetails = defaultTestVariables.closest(
        'div[class*="MuiAccordionDetails-root"]',
      );

      expect(accordionDetails).toBeInTheDocument();
    });
  });

  describe('Advanced Configuration Accordion', () => {
    it('should render the accordion collapsed by default when there are no test variables', () => {
      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const accordionSummary = screen
        .getByText('Advanced Configuration')
        .closest('.MuiAccordionSummary-root');
      expect(accordionSummary).not.toHaveClass('Mui-expanded');
    });

    it("should render the 'Advanced Configuration' accordion expanded by default when config.defaultTest.vars contains at least one variable", () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          ...defaultConfig,
          defaultTest: {
            vars: {
              testVar: 'testValue',
            },
          },
        },
        updateConfig: mockUpdateConfig,
      });

      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const accordionSummary = screen.getByRole('button', {
        name: 'Advanced Configuration Optional',
      });
      expect(accordionSummary).toHaveAttribute('aria-expanded', 'true');
    });

    it('displays the advanced configuration description text when the accordion is expanded', async () => {
      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const accordionSummary = screen.getByText('Advanced Configuration').closest('button');

      if (accordionSummary) {
        fireEvent.click(accordionSummary);
      }

      expect(
        screen.getByText(
          'Configure advanced options that apply to all test cases. These settings are for power users who need fine-grained control over their red team evaluation.',
        ),
      ).toBeInTheDocument();
    });
  });

  it('renders DefaultTestVariables without Paper wrapper and title when Advanced Configuration is expanded', async () => {
    render(
      <Review
        navigateToPlugins={vi.fn()}
        navigateToStrategies={vi.fn()}
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

  it('should not treat indented lines ending with colons as section headers', () => {
    mockUseRedTeamConfig.mockReturnValue({
      config: {
        ...defaultConfig,
        purpose: `
Application Details:
  This is a test application.
  It has some indented lines:
    - line 1:
    - line 2:
`,
      },
      updateConfig: mockUpdateConfig,
    });

    render(
      <Review
        navigateToPlugins={vi.fn()}
        navigateToStrategies={vi.fn()}
        navigateToPurpose={vi.fn()}
      />,
    );

    const sectionTitles = screen.getAllByRole('heading', { name: 'Application Details' });
    expect(sectionTitles.length).toBe(1);
  });

  it('handles extremely long section headers and content without breaking layout', () => {
    const longHeader = 'This is an extremely long section header that should wrap appropriately:';
    const longContent =
      'This is an extremely long section content that should wrap appropriately. '.repeat(50);
    mockUseRedTeamConfig.mockReturnValue({
      config: {
        ...defaultConfig,
        purpose: `${longHeader}\n${longContent}`,
      },
      updateConfig: mockUpdateConfig,
    });

    render(
      <Review
        navigateToPlugins={vi.fn()}
        navigateToStrategies={vi.fn()}
        navigateToPurpose={vi.fn()}
      />,
    );

    const sectionHeaderElement = screen.getByText(longHeader.slice(0, -1));
    fireEvent.click(sectionHeaderElement);

    expect(
      screen.getByText((content) => {
        return content.includes(longContent.substring(0, 50));
      }),
    ).toBeInTheDocument();
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
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Component should render without errors and read the status
      // The ApiHealthProvider handles polling automatically
      const runButton = screen.getByRole('button', { name: /run now/i });
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
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const runButton = screen.getByRole('button', { name: /run now/i });
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
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const runButton = screen.getByRole('button', { name: /run now/i });
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
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const runButton = screen.getByRole('button', { name: /run now/i });
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
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const runButton = screen.getByRole('button', { name: /run now/i });
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
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const runButton = screen.getByRole('button', { name: /run now/i });
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
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const buttonWrapper = screen.getByRole('button', { name: /run now/i }).parentElement;

      if (buttonWrapper) {
        fireEvent.mouseOver(buttonWrapper);

        // Advance timers for MUI Tooltip to appear
        await act(async () => {
          await vi.advanceTimersByTimeAsync(500);
        });

        // Match tooltip text specifically (different from Alert text)
        expect(
          screen.getByText(/Cannot connect to Promptfoo Cloud\. Please check your network/i),
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
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Check for the specific alert text
      expect(
        screen.getByText(
          /Cannot connect to Promptfoo Cloud. The "Run Now" option requires a connection to Promptfoo Cloud./i,
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
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Check for the specific alert text
      expect(
        screen.getByText(/Remote generation is disabled. The "Run Now" option is not available./),
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
          navigateToStrategies={vi.fn()}
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
          navigateToStrategies={vi.fn()}
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
          navigateToStrategies={vi.fn()}
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
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const buttonWrapper = screen.getByRole('button', { name: /run now/i }).parentElement;

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
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const buttonWrapper = screen.getByRole('button', { name: /run now/i }).parentElement;

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
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const button = screen.getByRole('button', { name: /run now/i });
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
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const button = screen.getByRole('button', { name: /run now/i });
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

    it('should disable button when isRunning is true regardless of API status', async () => {
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'connected', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      // Mock email verification to proceed
      vi.mocked(useEmailVerification).mockReturnValue({
        checkEmailStatus: vi.fn().mockResolvedValue({ canProceed: true }),
      } as any);

      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Initially button should be enabled
      const runButton = screen.getByRole('button', { name: /run now/i });
      expect(runButton).toBeEnabled();

      // Click the button to start running
      fireEvent.click(runButton);

      // Wait for the button to update to "Running..." state
      await waitFor(() => {
        const runningButton = screen.getByRole('button', { name: /running/i });
        expect(runningButton).toBeDisabled();
      });

      // Verify API was called
      expect(callApi).toHaveBeenCalledWith('/redteam/run', expect.any(Object));
    });

    it('should show "Running..." text when isRunning is true', async () => {
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'connected', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      // Mock email verification to proceed
      vi.mocked(useEmailVerification).mockReturnValue({
        checkEmailStatus: vi.fn().mockResolvedValue({ canProceed: true }),
      } as any);

      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Initially button should show "Run Now"
      expect(screen.getByRole('button', { name: /run now/i })).toBeInTheDocument();

      // Click the button to start running
      fireEvent.click(screen.getByRole('button', { name: /run now/i }));

      // Wait for the button text to change to "Running..."
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /running/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /run now/i })).not.toBeInTheDocument();
      });
    });

    it('should show Cancel button when isRunning is true', async () => {
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'connected', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      // Mock email verification to proceed
      vi.mocked(useEmailVerification).mockReturnValue({
        checkEmailStatus: vi.fn().mockResolvedValue({ canProceed: true }),
      } as any);

      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Initially Cancel button should not be present
      expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();

      // Click the Run Now button to start running
      fireEvent.click(screen.getByRole('button', { name: /run now/i }));

      // Wait for the Cancel button to appear
      await waitFor(() => {
        const cancelButton = screen.getByRole('button', { name: /cancel/i });
        expect(cancelButton).toBeInTheDocument();
        expect(cancelButton).toBeEnabled(); // Cancel button should always be enabled
      });
    });

    it('should not show tooltip when button is disabled due to isRunning', async () => {
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'connected', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      // Mock email verification to proceed
      vi.mocked(useEmailVerification).mockReturnValue({
        checkEmailStatus: vi.fn().mockResolvedValue({ canProceed: true }),
      } as any);

      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Click the Run Now button to start running
      fireEvent.click(screen.getByRole('button', { name: /run now/i }));

      // Wait for the button to be in running state
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /running/i })).toBeInTheDocument();
      });

      const runningButton = screen.getByRole('button', { name: /running/i });
      const buttonWrapper = runningButton.parentElement;

      if (buttonWrapper) {
        fireEvent.mouseOver(buttonWrapper);

        // Wait a bit to ensure tooltip would have time to appear if it was going to
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Check that no tooltip is shown
        expect(screen.queryByText(/cannot connect to promptfoo cloud/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/remote generation is disabled/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/checking connection/i)).not.toBeInTheDocument();
      }
    });

    it('should disable button when both isRunning is true and API is blocked', async () => {
      // Start with API connected so we can trigger running state
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'connected', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      // Mock email verification to proceed
      vi.mocked(useEmailVerification).mockReturnValue({
        checkEmailStatus: vi.fn().mockResolvedValue({ canProceed: true }),
      } as any);

      const { rerender } = render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Click the Run Now button to start running
      fireEvent.click(screen.getByRole('button', { name: /run now/i }));

      // Wait for running state
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /running/i })).toBeDisabled();
      });

      // Now simulate API becoming blocked while running
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'blocked', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      rerender(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Button should still be disabled (due to isRunning)
      const runningButton = screen.getByRole('button', { name: /running/i });
      expect(runningButton).toBeDisabled();
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
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Initially button should be enabled
      expect(screen.getByRole('button', { name: /run now/i })).toBeEnabled();

      // Change API status to blocked
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'blocked', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      rerender(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Button should now be disabled
      expect(screen.getByRole('button', { name: /run now/i })).toBeDisabled();

      // Change API status back to connected
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'connected', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      rerender(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Button should be enabled again
      expect(screen.getByRole('button', { name: /run now/i })).toBeEnabled();
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
          navigateToStrategies={vi.fn()}
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
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Alert should now be visible
      expect(
        screen.getByText(
          /Cannot connect to Promptfoo Cloud. The "Run Now" option requires a connection to Promptfoo Cloud./i,
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
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Alert should update its message
      expect(
        screen.getByText(/Remote generation is disabled. The "Run Now" option is not available./),
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
          navigateToStrategies={vi.fn()}
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
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const button = screen.getByRole('button', { name: /run now/i });
      const buttonWrapper = button.parentElement;

      if (buttonWrapper) {
        // First check tooltip for blocked state
        fireEvent.mouseOver(buttonWrapper);
        await waitFor(() => {
          expect(screen.getByText(/cannot connect to promptfoo cloud/i)).toBeInTheDocument();
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
            navigateToStrategies={vi.fn()}
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
            navigateToStrategies={vi.fn()}
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
