import { TooltipProvider } from '@app/components/ui/tooltip';
import { EvalHistoryProvider } from '@app/contexts/EvalHistoryContext';
import { type ApiHealthResult, useApiHealth } from '@app/hooks/useApiHealth';
import { useEmailVerification } from '@app/hooks/useEmailVerification';
import { useRedteamJobStore } from '@app/stores/redteamJobStore';
import { restoreTestTimers, type TestTimers, useTestTimers } from '@app/tests/timers';
import { callApi } from '@app/utils/api';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Review from './Review';
import type { DefinedUseQueryResult } from '@tanstack/react-query';

// Helper to render with required providers
let rerenderWithProviders: (ui: React.ReactElement) => void;
const renderWithProviders = (ui: React.ReactElement) => {
  const result = render(
    <EvalHistoryProvider>
      <TooltipProvider delayDuration={0}>{ui}</TooltipProvider>
    </EvalHistoryProvider>,
  );
  rerenderWithProviders = (newUi: React.ReactElement) => {
    result.rerender(
      <EvalHistoryProvider>
        <TooltipProvider delayDuration={0}>{newUi}</TooltipProvider>
      </EvalHistoryProvider>,
    );
  };
  return result;
};

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
  callApi: vi.fn().mockImplementation(async (url: string) => {
    if (url === '/redteam/status') {
      return {
        ok: true,
        json: async () => ({ hasRunningJob: false }),
      };
    }
    return { ok: true, json: async () => ({}) };
  }),
  fetchUserEmail: vi.fn(() => Promise.resolve('test@example.com')),
  fetchUserId: vi.fn(() => Promise.resolve('test-user-id')),
  updateEvalAuthor: vi.fn(() => Promise.resolve({})),
}));

// Mock the redteamJobStore
const mockSetJob = vi.fn();
const mockClearJob = vi.fn();
vi.mock('@app/stores/redteamJobStore', () => ({
  useRedteamJobStore: vi.fn(() => ({
    jobId: null,
    setJob: mockSetJob,
    clearJob: mockClearJob,
    _hasHydrated: true, // Default to hydrated for most tests
  })),
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

vi.mock('@app/components/ui/collapsible', async () => {
  const React = await import('react');
  const CollapsibleContext = React.createContext({
    open: false,
    onOpenChange: (_open: boolean) => {},
  });

  return {
    Collapsible: ({
      open = false,
      onOpenChange = () => {},
      children,
    }: {
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
      children: React.ReactNode;
    }) => (
      <CollapsibleContext.Provider value={{ open, onOpenChange }}>
        <div data-state={open ? 'open' : 'closed'}>{children}</div>
      </CollapsibleContext.Provider>
    ),
    CollapsibleContent: ({ children }: { children: React.ReactNode }) => {
      const { open } = React.useContext(CollapsibleContext);
      if (!open) {
        return null;
      }
      return <div data-state="open">{children}</div>;
    },
    CollapsibleTrigger: ({
      children,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => {
      const { open, onOpenChange } = React.useContext(CollapsibleContext);
      return (
        <button
          type="button"
          {...props}
          aria-expanded={open}
          data-state={open ? 'open' : 'closed'}
          onClick={(event) => {
            props.onClick?.(event);
            onOpenChange(!open);
          }}
        >
          {children}
        </button>
      );
    },
  };
});

vi.mock('@app/components/ui/tooltip', async () => {
  const React = await import('react');
  const TooltipContext = React.createContext({
    open: false,
    setOpen: (_open: boolean) => {},
  });

  return {
    TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Tooltip: ({ children }: { children: React.ReactNode }) => {
      const [open, setOpen] = React.useState(false);
      return (
        <TooltipContext.Provider value={{ open, setOpen }}>{children}</TooltipContext.Provider>
      );
    },
    TooltipContent: ({ children }: { children: React.ReactNode }) => {
      const { open } = React.useContext(TooltipContext);
      if (!open) {
        return null;
      }
      return <div role="tooltip">{children}</div>;
    },
    TooltipTrigger: ({
      asChild,
      children,
    }: {
      asChild?: boolean;
      children: React.ReactElement<{
        onMouseLeave?: React.MouseEventHandler;
        onMouseOver?: React.MouseEventHandler;
      }>;
    }) => {
      const { setOpen } = React.useContext(TooltipContext);
      if (!asChild || !React.isValidElement(children)) {
        return (
          <span onMouseLeave={() => setOpen(false)} onMouseOver={() => setOpen(true)}>
            {children}
          </span>
        );
      }
      return React.cloneElement(children, {
        onMouseLeave: (event: React.MouseEvent) => {
          children.props.onMouseLeave?.(event);
          setOpen(false);
        },
        onMouseOver: (event: React.MouseEvent) => {
          children.props.onMouseOver?.(event);
          setOpen(true);
        },
      });
    },
  };
});

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
  let timers: TestTimers;

  const clickElement = (element: Element) => {
    act(() => {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
  };

  const hoverElement = (element: Element) => {
    act(() => {
      element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
    });
  };

  const defaultConfig = {
    description: 'Test Configuration',
    plugins: [],
    strategies: [],
    purpose: 'Test purpose',
    numTests: 10,
    maxCharsPerMessage: 250,
    maxConcurrency: 4,
    target: { id: 'test-target', config: {} },
    applicationDefinition: {},
    entities: [],
    defaultTest: { vars: {} },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    timers = useTestTimers();

    // Reset the mock to return a connected state by default
    vi.mocked(useApiHealth).mockReturnValue({
      data: { status: 'connected', message: null },
      refetch: vi.fn(),
      isLoading: false,
    } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

    // Reset the job store mock
    vi.mocked(useRedteamJobStore).mockReturnValue({
      jobId: null,
      setJob: mockSetJob,
      clearJob: mockClearJob,
      _hasHydrated: true,
    });

    // Reset callApi mock to default behavior
    vi.mocked(callApi).mockImplementation(async (url: string) => {
      if (url === '/redteam/status') {
        return {
          ok: true,
          json: async () => ({ hasRunningJob: false }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    mockUseRedTeamConfig.mockReturnValue({
      config: defaultConfig,
      updateConfig: mockUpdateConfig,
    });
  });

  afterEach(() => {
    restoreTestTimers({ runPending: true });
  });

  describe('Component Integration', () => {
    it('renders all main sections including Advanced Configuration accordion', () => {
      renderWithProviders(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      expect(screen.getByText('Review & Run')).toBeInTheDocument();
      expect(screen.getByText('Configuration Summary')).toBeInTheDocument();
      // Advanced Configuration accordion button is always visible
      expect(screen.getByRole('button', { name: /advanced configuration/i })).toBeInTheDocument();
      expect(screen.getByText('Run Options')).toBeInTheDocument();
    });

    it('renders configuration description field', () => {
      renderWithProviders(
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

    it('renders the max chars per message field in Run Options and persists changes', async () => {
      renderWithProviders(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const maxCharsPerMessageInput = screen.getByLabelText('Max chars per message');
      expect(maxCharsPerMessageInput).toBeInTheDocument();
      expect(maxCharsPerMessageInput).toHaveValue(250);

      timers.useRealTimers();
      const user = userEvent.setup();
      await user.clear(maxCharsPerMessageInput);
      await user.type(maxCharsPerMessageInput, '180');
      await user.tab();
      timers.useFakeTimers();

      expect(mockUpdateConfig).toHaveBeenCalledWith('maxCharsPerMessage', 180);
    });

    it('renders DefaultTestVariables component inside CollapsibleContent when expanded', async () => {
      renderWithProviders(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // First expand the Advanced Configuration accordion
      const advancedConfigButton = screen.getByRole('button', { name: /advanced configuration/i });
      clickElement(advancedConfigButton);

      const defaultTestVariables = screen.getByTestId('default-test-variables');
      // CollapsibleContent uses data-state attribute
      const collapsibleContent = defaultTestVariables.closest('[data-state]');

      expect(collapsibleContent).toBeInTheDocument();
    });
  });

  describe('Advanced Configuration Accordion', () => {
    it('should render the accordion collapsed by default when there are no test variables', () => {
      renderWithProviders(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Find the collapsible trigger button and check its data-state attribute
      const advancedConfigButton = screen.getByRole('button', {
        name: /advanced configuration/i,
      });
      expect(advancedConfigButton).toHaveAttribute('data-state', 'closed');
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

      renderWithProviders(
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
      renderWithProviders(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const accordionSummary = screen.getByText('Advanced Configuration').closest('button');

      if (accordionSummary) {
        clickElement(accordionSummary);
      }

      expect(
        screen.getByText(
          'Configure advanced options that apply to all test cases. These settings are for power users who need fine-grained control over their red team evaluation.',
        ),
      ).toBeInTheDocument();
    });
  });

  it('renders DefaultTestVariables without Paper wrapper when Advanced Configuration is expanded', async () => {
    renderWithProviders(
      <Review
        navigateToPlugins={vi.fn()}
        navigateToStrategies={vi.fn()}
        navigateToPurpose={vi.fn()}
      />,
    );

    const accordionSummary = screen.getByRole('button', { name: /advanced configuration/i });
    clickElement(accordionSummary);

    // Advance timers for any animations/transitions
    await act(async () => {
      await timers.advanceByAsync(100);
    });

    const defaultTestVariables = screen.getByTestId('default-test-variables');

    expect(defaultTestVariables).toBeInTheDocument();

    // MUI Paper is no longer used - verify the component renders without it
    expect(defaultTestVariables.closest('[class*="MuiPaper"]')).toBeNull();
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

    renderWithProviders(
      <Review
        navigateToPlugins={vi.fn()}
        navigateToStrategies={vi.fn()}
        navigateToPurpose={vi.fn()}
      />,
    );

    const sectionTitles = screen.getAllByRole('heading', { name: 'Application Details' });
    expect(sectionTitles.length).toBe(1);
  });

  it('handles extremely long section headers and content without breaking layout', async () => {
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

    renderWithProviders(
      <Review
        navigateToPlugins={vi.fn()}
        navigateToStrategies={vi.fn()}
        navigateToPurpose={vi.fn()}
      />,
    );

    // First expand the Application Details collapsible
    const applicationDetailsButton = screen.getByRole('button', {
      name: /application details/i,
    });
    clickElement(applicationDetailsButton);

    const sectionHeaderElement = screen.getByText(longHeader.slice(0, -1));
    clickElement(sectionHeaderElement);

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

      renderWithProviders(
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

      renderWithProviders(
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

      renderWithProviders(
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

      renderWithProviders(
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

      renderWithProviders(
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

      renderWithProviders(
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

      renderWithProviders(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const button = screen.getByRole('button', { name: /run now/i });
      hoverElement(button);

      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).toHaveTextContent(
        /Cannot connect to Promptfoo Cloud\. Please check your network/i,
      );
    });

    it('should display warning alert when API is blocked', () => {
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'blocked', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      renderWithProviders(
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

      renderWithProviders(
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

      renderWithProviders(
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

      renderWithProviders(
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

      renderWithProviders(
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

      renderWithProviders(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const button = screen.getByRole('button', { name: /run now/i });
      hoverElement(button);

      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).toHaveTextContent(
        /Remote generation is disabled\. Running red team evaluations/i,
      );
    });

    it('should show tooltip message when hovering over disabled button due to unknown API status', async () => {
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'unknown', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      renderWithProviders(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const button = screen.getByRole('button', { name: /run now/i });
      hoverElement(button);

      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).toHaveTextContent(/checking connection to promptfoo cloud/i);
    });

    it('should not show tooltip when API is connected', async () => {
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'connected', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      renderWithProviders(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const button = screen.getByRole('button', { name: /run now/i });
      const buttonWrapper = button.parentElement;

      if (buttonWrapper) {
        hoverElement(buttonWrapper);

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

      renderWithProviders(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const button = screen.getByRole('button', { name: /run now/i });
      const buttonWrapper = button.parentElement;

      if (buttonWrapper) {
        hoverElement(buttonWrapper);

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
      const user = userEvent.setup({ delay: null });
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'connected', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      // Mock email verification to proceed
      vi.mocked(useEmailVerification).mockReturnValue({
        checkEmailStatus: vi.fn().mockResolvedValue({ canProceed: true }),
      } as any);

      renderWithProviders(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Initially button should be enabled
      const runButton = screen.getByRole('button', { name: /run now/i });
      expect(runButton).toBeEnabled();

      await user.click(runButton);

      // Wait for the button to update to "Running..." state
      await waitFor(() => {
        const runningButton = screen.getByRole('button', { name: /running/i });
        expect(runningButton).toBeDisabled();
      });

      // Verify API was called
      expect(callApi).toHaveBeenCalledWith('/redteam/run', expect.any(Object));
    });

    it('should show "Running..." text when isRunning is true', async () => {
      const user = userEvent.setup({ delay: null });
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'connected', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      // Mock email verification to proceed
      vi.mocked(useEmailVerification).mockReturnValue({
        checkEmailStatus: vi.fn().mockResolvedValue({ canProceed: true }),
      } as any);

      renderWithProviders(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Initially button should show "Run Now"
      expect(screen.getByRole('button', { name: /run now/i })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /run now/i }));

      // Wait for the button text to change to "Running..."
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /running/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /run now/i })).not.toBeInTheDocument();
      });
    });

    it('should show Cancel button when isRunning is true', async () => {
      const user = userEvent.setup({ delay: null });
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'connected', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      // Mock email verification to proceed
      vi.mocked(useEmailVerification).mockReturnValue({
        checkEmailStatus: vi.fn().mockResolvedValue({ canProceed: true }),
      } as any);

      renderWithProviders(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Initially Cancel button should not be present
      expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /run now/i }));

      // Wait for the Cancel button to appear
      await waitFor(() => {
        const cancelButton = screen.getByRole('button', { name: /cancel/i });
        expect(cancelButton).toBeInTheDocument();
        expect(cancelButton).toBeEnabled(); // Cancel button should always be enabled
      });
    });

    it('should not show tooltip when button is disabled due to isRunning', async () => {
      const user = userEvent.setup({ delay: null });
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'connected', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      // Mock email verification to proceed
      vi.mocked(useEmailVerification).mockReturnValue({
        checkEmailStatus: vi.fn().mockResolvedValue({ canProceed: true }),
      } as any);

      renderWithProviders(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      await user.click(screen.getByRole('button', { name: /run now/i }));

      // Wait for the button to be in running state
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /running/i })).toBeInTheDocument();
      });

      const runningButton = screen.getByRole('button', { name: /running/i });
      const buttonWrapper = runningButton.parentElement;

      if (buttonWrapper) {
        await user.hover(buttonWrapper);

        // Check that no tooltip is shown
        expect(screen.queryByText(/cannot connect to promptfoo cloud/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/remote generation is disabled/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/checking connection/i)).not.toBeInTheDocument();
      }
    });

    it('should disable button when both isRunning is true and API is blocked', async () => {
      const user = userEvent.setup({ delay: null });
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

      renderWithProviders(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      await user.click(screen.getByRole('button', { name: /run now/i }));

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

      rerenderWithProviders(
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

      renderWithProviders(
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

      rerenderWithProviders(
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

      rerenderWithProviders(
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

      renderWithProviders(
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

      rerenderWithProviders(
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

      rerenderWithProviders(
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

      rerenderWithProviders(
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
      const user = userEvent.setup({ delay: null });
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'blocked', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      renderWithProviders(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const button = screen.getByRole('button', { name: /run now/i });

      await user.hover(button);
      expect(screen.getByRole('tooltip')).toHaveTextContent(/cannot connect to promptfoo cloud/i);

      // Change to disabled state and rerender
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'disabled', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      rerenderWithProviders(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      await user.hover(screen.getByRole('button', { name: /run now/i }));
      expect(screen.getByRole('tooltip')).toHaveTextContent(/remote generation is disabled/i);

      // Change to unknown state and rerender
      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'unknown', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

      rerenderWithProviders(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      await user.hover(screen.getByRole('button', { name: /run now/i }));
      expect(screen.getByRole('tooltip')).toHaveTextContent(
        /checking connection to promptfoo cloud/i,
      );
    });
  });

  describe('Job Recovery', () => {
    beforeEach(() => {
      vi.useRealTimers();

      vi.mocked(useApiHealth).mockReturnValue({
        data: { status: 'connected', message: null },
        refetch: vi.fn(),
        isLoading: false,
      } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);
    });

    it('should check for running job on mount', async () => {
      vi.mocked(callApi).mockImplementation(async (url: string) => {
        if (url === '/redteam/status') {
          return {
            ok: true,
            json: async () => ({ hasRunningJob: false }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      renderWithProviders(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Wait for the effect to run
      await waitFor(() => {
        expect(callApi).toHaveBeenCalledWith('/redteam/status');
      });
    });

    it('should reconnect to running job when server has one', async () => {
      vi.mocked(callApi).mockImplementation(async (url: string) => {
        if (url === '/redteam/status') {
          return {
            ok: true,
            json: async () => ({ hasRunningJob: true, jobId: 'server-job-123' }),
          } as Response;
        }
        if (url === '/eval/job/server-job-123') {
          return {
            ok: true,
            json: async () => ({
              status: 'in-progress',
              logs: ['Test running...'],
            }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      renderWithProviders(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Wait for recovery to complete and button to show running state
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /running/i })).toBeInTheDocument();
      });

      // Should have called setJob with the server's job ID
      expect(mockSetJob).toHaveBeenCalledWith('server-job-123');
    });

    it('should show completed state when returning to completed job', async () => {
      vi.mocked(callApi).mockImplementation(async (url: string) => {
        if (url === '/redteam/status') {
          return {
            ok: true,
            json: async () => ({ hasRunningJob: true, jobId: 'completed-job-456' }),
          } as Response;
        }
        if (url === '/eval/job/completed-job-456') {
          return {
            ok: true,
            json: async () => ({
              status: 'complete',
              evalId: 'eval-result-789',
              logs: ['Evaluation complete'],
            }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      renderWithProviders(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Wait for recovery to complete and show View Report link (MUI Button with href renders as link)
      await waitFor(() => {
        expect(screen.getByRole('link', { name: /view report/i })).toBeInTheDocument();
      });

      // Should have cleared the job since it's complete
      expect(mockClearJob).toHaveBeenCalled();
    });

    it('should check saved job when no server job is running', async () => {
      // Mock the store to have a saved job ID
      vi.mocked(useRedteamJobStore).mockReturnValue({
        jobId: 'saved-job-999',
        setJob: mockSetJob,
        clearJob: mockClearJob,
        _hasHydrated: true,
      });

      vi.mocked(callApi).mockImplementation(async (url: string) => {
        if (url === '/redteam/status') {
          return {
            ok: true,
            json: async () => ({ hasRunningJob: false }),
          } as Response;
        }
        if (url === '/eval/job/saved-job-999') {
          return {
            ok: true,
            json: async () => ({
              status: 'complete',
              evalId: 'completed-eval-123',
              logs: ['Done'],
            }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      renderWithProviders(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Wait for recovery to complete
      await waitFor(() => {
        expect(callApi).toHaveBeenCalledWith('/eval/job/saved-job-999');
      });

      // Should clear job since it completed while away
      expect(mockClearJob).toHaveBeenCalled();
    });

    it('should call setJob when starting a new job', async () => {
      const user = userEvent.setup({ delay: null });
      vi.mocked(callApi).mockImplementation(async (url: string, _options?: any) => {
        if (url === '/redteam/status') {
          return {
            ok: true,
            json: async () => ({ hasRunningJob: false }),
          } as Response;
        }
        if (url === '/redteam/run') {
          return {
            ok: true,
            json: async () => ({ id: 'new-job-id' }),
          } as Response;
        }
        if (url.startsWith('/eval/job/')) {
          return {
            ok: true,
            json: async () => ({
              status: 'in-progress',
              logs: ['Starting...'],
            }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      vi.mocked(useEmailVerification).mockReturnValue({
        checkEmailStatus: vi.fn().mockResolvedValue({ canProceed: true }),
      } as any);

      renderWithProviders(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /run now/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /run now/i }));

      // Wait for job to start
      await waitFor(() => {
        expect(mockSetJob).toHaveBeenCalledWith('new-job-id');
      });
    });

    it('should call clearJob when cancelling a job', async () => {
      const user = userEvent.setup({ delay: null });
      vi.mocked(callApi).mockImplementation(async (url: string, _options?: any) => {
        if (url === '/redteam/status') {
          return {
            ok: true,
            json: async () => ({ hasRunningJob: false }),
          } as Response;
        }
        if (url === '/redteam/run') {
          return {
            ok: true,
            json: async () => ({ id: 'job-to-cancel' }),
          } as Response;
        }
        if (url === '/redteam/cancel') {
          return {
            ok: true,
            json: async () => ({ success: true }),
          } as Response;
        }
        if (url.startsWith('/eval/job/')) {
          return {
            ok: true,
            json: async () => ({
              status: 'in-progress',
              logs: ['Running...'],
            }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      vi.mocked(useEmailVerification).mockReturnValue({
        checkEmailStatus: vi.fn().mockResolvedValue({ canProceed: true }),
      } as any);

      renderWithProviders(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /run now/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /run now/i }));

      // Wait for Cancel button to appear
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      // Should call clearJob
      await waitFor(() => {
        expect(mockClearJob).toHaveBeenCalled();
      });
    });

    it('should handle job recovery failure when server job returns 404', async () => {
      vi.mocked(callApi).mockImplementation(async (url: string) => {
        if (url === '/redteam/status') {
          return {
            ok: true,
            json: async () => ({ hasRunningJob: true, jobId: 'missing-job-404' }),
          } as Response;
        }
        if (url === '/eval/job/missing-job-404') {
          return {
            ok: false,
            status: 404,
            json: async () => ({ error: 'Job not found' }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      renderWithProviders(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Wait for recovery to attempt and clear job
      await waitFor(() => {
        expect(mockClearJob).toHaveBeenCalled();
      });

      // Run Now button should be enabled (not in running state)
      expect(screen.getByRole('button', { name: /run now/i })).toBeEnabled();
    });

    it('should not attempt recovery until store is hydrated', async () => {
      // Mock the store as not hydrated yet
      vi.mocked(useRedteamJobStore).mockReturnValue({
        jobId: 'saved-job-before-hydration',
        setJob: mockSetJob,
        clearJob: mockClearJob,
        _hasHydrated: false,
      });

      vi.mocked(callApi).mockImplementation(async (url: string) => {
        if (url === '/redteam/status') {
          return {
            ok: true,
            json: async () => ({ hasRunningJob: false }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      renderWithProviders(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      // Wait a moment - recovery should NOT be called yet because store isn't hydrated
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should NOT have checked the saved job since we're not hydrated
      expect(callApi).not.toHaveBeenCalledWith('/eval/job/saved-job-before-hydration');
    });
  });
});
