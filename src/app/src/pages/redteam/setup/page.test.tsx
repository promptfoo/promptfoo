import { usePageMeta } from '@app/hooks/usePageMeta';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { useToast } from '@app/hooks/useToast';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { useRedTeamConfig } from './hooks/useRedTeamConfig';
import { useSetupState } from './hooks/useSetupState';
import RedTeamSetupPage from './page';

// Define these variables outside the test
const mockNavigate = vi.fn();
const mockLocation = {
  pathname: '/redteam/setup',
  search: '',
  hash: '',
  state: null,
  key: 'default',
};

// Mock react-router-dom
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => mockLocation,
  };
});

// Mock hooks
vi.mock('@app/hooks/usePageMeta', () => ({ usePageMeta: vi.fn() }));
vi.mock('@app/hooks/useTelemetry', () => ({ useTelemetry: vi.fn() }));
vi.mock('@app/hooks/useToast', () => ({ useToast: vi.fn() }));
vi.mock('./hooks/useSetupState', () => ({ useSetupState: vi.fn() }));
vi.mock('./hooks/useRedTeamConfig', () => ({
  useRedTeamConfig: vi.fn(),
  DEFAULT_HTTP_TARGET: { id: 'http' },
}));
vi.mock('@app/utils/api', () => ({ callApi: vi.fn() }));

// Mock child components to isolate the page component
vi.mock('@app/components/CrispChat', () => ({ default: () => <div>CrispChat</div> }));
vi.mock('./components/Targets', () => ({ default: () => <div>Targets</div> }));
vi.mock('./components/Purpose', () => ({ default: () => <div>Purpose</div> }));
vi.mock('./components/Plugins', () => ({ default: () => <div>Plugins</div> }));
vi.mock('./components/Strategies', () => ({ default: () => <div>Strategies</div> }));
vi.mock('./components/Review', () => ({ default: () => <div>Review</div> }));
vi.mock('./components/Setup', () => ({
  default: () => <div data-testid="setup-modal">Setup</div>,
}));

const mockedUsePageMeta = usePageMeta as Mock;
const mockedUseTelemetry = useTelemetry as Mock;
const mockedUseToast = useToast as Mock;
const mockedUseSetupState = useSetupState as unknown as Mock;
const mockedUseRedTeamConfig = useRedTeamConfig as unknown as Mock;

// Add this to handle the window.scrollTo error
vi.stubGlobal('scrollTo', vi.fn());

describe('RedTeamSetupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Provide default mock implementations for hooks
    mockedUseTelemetry.mockReturnValue({ recordEvent: vi.fn() });
    mockedUseToast.mockReturnValue({ showToast: vi.fn() });
    mockedUseSetupState.mockReturnValue({
      hasSeenSetup: true, // Assume setup has been seen to not render the modal
      markSetupAsSeen: vi.fn(),
    });
    mockedUseRedTeamConfig.mockReturnValue({
      config: {
        plugins: [],
        strategies: [],
        target: { id: 'http' },
      },
      setFullConfig: vi.fn(),
      resetConfig: vi.fn(),
    });
  });

  describe('Page Metadata', () => {
    it("should set the page title to 'Red team setup' and description to 'Configure red team testing' when rendered", () => {
      render(
        <MemoryRouter initialEntries={['/redteam/setup']}>
          <RedTeamSetupPage />
        </MemoryRouter>,
      );

      expect(mockedUsePageMeta).toHaveBeenCalledTimes(1);
      expect(mockedUsePageMeta).toHaveBeenCalledWith({
        title: 'Red team setup',
        description: 'Configure red team testing',
      });
    });
  });

  describe('Accessibility Fallback', () => {
    it('should display a fallback title when JavaScript is disabled', () => {
      render(
        <MemoryRouter initialEntries={['/redteam/setup']}>
          <RedTeamSetupPage />
        </MemoryRouter>,
      );

      const fallbackTitle = screen.getByText(/New Configuration/i);
      expect(fallbackTitle).toBeInTheDocument();
    });
  });

  describe('URL Hash Updates', () => {
    it('should update the URL hash when the tab state changes', async () => {
      render(
        <MemoryRouter initialEntries={['/redteam/setup']}>
          <RedTeamSetupPage />
        </MemoryRouter>,
      );

      // Simulate a tab change by clicking the "Plugins" tab (index 2)
      const pluginsTab = screen.getByRole('tab', { name: /Plugins/i });
      fireEvent.click(pluginsTab);

      // Assert that useNavigate is called with the correct hash
      expect(mockNavigate).toHaveBeenCalledWith('#2');
    });
  });

  it('should display the setup modal if hasSeenSetup is false', () => {
    mockedUseSetupState.mockReturnValue({
      hasSeenSetup: false,
      markSetupAsSeen: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/redteam/setup']}>
        <RedTeamSetupPage />
      </MemoryRouter>,
    );

    const setupModal = screen.getByTestId('setup-modal');
    expect(setupModal).toBeInTheDocument();
  });
});
