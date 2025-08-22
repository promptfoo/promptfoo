import { useTelemetry } from '@app/hooks/useTelemetry';
import { MULTI_MODAL_STRATEGIES } from '@promptfoo/redteam/constants';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';
import Strategies from './Strategies';
import { callApi } from '@app/utils/api';

// Mock only external dependencies and hooks
vi.mock('../hooks/useRedTeamConfig');
vi.mock('@app/hooks/useTelemetry');
vi.mock('./StrategyConfigDialog', () => ({
  default: () => <div data-testid="strategy-config-dialog">Strategy Config Dialog</div>,
}));
vi.mock('@app/utils/api');

const mockUpdateConfig = vi.fn();
const mockRecordEvent = vi.fn();

describe('Strategies', () => {
  const mockOnNext = vi.fn();
  const mockOnBack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    (useRedTeamConfig as any).mockReturnValue({
      config: {
        target: {
          config: {
            stateful: false,
          },
        },
        strategies: [],
        plugins: [],
        numTests: 5,
      },
      updateConfig: mockUpdateConfig,
    });

    (useTelemetry as any).mockReturnValue({
      recordEvent: mockRecordEvent,
    });
  });

  describe('Basic rendering', () => {
    it('renders the page with title and help elements', () => {
      render(
        <MemoryRouter>
          <Strategies onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>,
      );

      // Check for main heading structure
      expect(screen.getByRole('heading', { level: 4 })).toBeInTheDocument();
    });

    it('renders the documentation link with correct attributes', () => {
      render(
        <MemoryRouter>
          <Strategies onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>,
      );

      const links = screen.getAllByRole('link');
      const docLink = links.find((link) =>
        link.getAttribute('href')?.includes('promptfoo.dev/docs/red-team/strategies'),
      );

      expect(docLink).toBeInTheDocument();
      expect(docLink).toHaveAttribute('target', '_blank');
    });

    it('renders navigation buttons', () => {
      render(
        <MemoryRouter>
          <Strategies onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>,
      );

      const buttons = screen.getAllByRole('button');
      const backButton = buttons.find((btn) => btn.textContent?.includes('Back'));
      const nextButton = buttons.find((btn) => btn.textContent?.includes('Next'));

      expect(backButton).toBeInTheDocument();
      expect(nextButton).toBeInTheDocument();
    });
  });

  describe('Strategy sections', () => {
    it('renders multiple strategy sections', () => {
      render(
        <MemoryRouter>
          <Strategies onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>,
      );

      // Check for multiple section headings (h6 elements)
      const sectionHeadings = screen.getAllByRole('heading', { level: 6 });
      expect(sectionHeadings.length).toBeGreaterThan(0);
    });

    it('renders strategy items with checkboxes', () => {
      render(
        <MemoryRouter>
          <Strategies onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>,
      );

      // Check that strategy items with checkboxes are rendered
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes.length).toBeGreaterThan(0);
    });
  });

  describe('MULTI_MODAL_STRATEGIES export', () => {
    it('exports MULTI_MODAL_STRATEGIES constant with expected values', () => {
      expect(MULTI_MODAL_STRATEGIES).toBeDefined();
      expect(MULTI_MODAL_STRATEGIES).toEqual(['audio', 'image', 'video']);
    });

    it('contains expected multi-modal strategy identifiers', () => {
      expect(MULTI_MODAL_STRATEGIES).toContain('audio');
      expect(MULTI_MODAL_STRATEGIES).toContain('video');
      expect(MULTI_MODAL_STRATEGIES).toContain('image');
    });
  });

  describe('Preset selection', () => {
    it('renders preset selector cards', () => {
      render(
        <MemoryRouter>
          <Strategies onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>,
      );

      // Check for preset cards by looking for elements with role="button" that are likely presets
      const presetElements = screen.getAllByRole('button');
      // Should have at least some preset buttons
      expect(presetElements.length).toBeGreaterThan(2);
    });
  });

  describe('Telemetry', () => {
    it('records page view on mount', () => {
      render(
        <MemoryRouter>
          <Strategies onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>,
      );

      expect(mockRecordEvent).toHaveBeenCalledWith('webui_page_view', {
        page: 'redteam_config_strategies',
      });
    });
  });

  describe('System configuration', () => {
    it('shows system configuration section when goat or crescendo strategies are selected', () => {
      (useRedTeamConfig as any).mockReturnValue({
        config: {
          target: {
            config: {
              stateful: false,
            },
          },
          strategies: [{ id: 'goat' }],
          plugins: [],
          numTests: 5,
        },
        updateConfig: mockUpdateConfig,
      });

      render(
        <MemoryRouter>
          <Strategies onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>,
      );

      // SystemConfiguration component should be rendered - check by heading structure
      const headings = screen.getAllByRole('heading');
      expect(headings.length).toBeGreaterThan(1);
    });
  });

  describe('UI behavior', () => {
    it('renders strategy items for basic strategy', () => {
      render(
        <MemoryRouter>
          <Strategies onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>,
      );

      // Check that we have strategy items rendered (without checking specific text)
      const strategyItems = screen.getAllByRole('checkbox');
      expect(strategyItems.length).toBeGreaterThan(0);
    });
  });

  describe('Strategy categorization', () => {
    it('renders strategy when multi-modal strategy is selected', () => {
      (useRedTeamConfig as any).mockReturnValue({
        config: {
          target: {
            config: {
              stateful: false,
            },
          },
          strategies: [{ id: 'image' }],
          plugins: [],
          numTests: 5,
        },
        updateConfig: mockUpdateConfig,
      });

      render(
        <MemoryRouter>
          <Strategies onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>,
      );

      // Check that the component renders without errors
      expect(screen.getByRole('heading', { level: 4 })).toBeInTheDocument();
    });

    it('renders the Multi-modal Strategies section when multi-modal strategies are present', () => {
      (useRedTeamConfig as any).mockReturnValue({
        config: {
          target: {
            config: {
              stateful: false,
            },
          },
          strategies: [{ id: 'audio' }],
          plugins: [],
          numTests: 5,
        },
        updateConfig: mockUpdateConfig,
      });

      render(
        <MemoryRouter>
          <Strategies onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>,
      );

      expect(screen.getByText('Multi-modal Strategies')).toBeInTheDocument();
    });
  });

  describe('Strategy compatibility testing', () => {
    beforeEach(() => {
      (useRedTeamConfig as any).mockReturnValue({
        config: {
          target: {
            id: 'test-provider',
            config: {
              stateful: false,
            },
          },
          strategies: [{ id: 'image' }],
          plugins: [],
          numTests: 5,
        },
        updateConfig: mockUpdateConfig,
      });
    });

    it('displays a success message when the strategy test is successful', async () => {
      (callApi as any).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, message: 'Strategy is compatible!' }),
      });

      render(
        <MemoryRouter>
          <Strategies onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>,
      );

      const testButton = screen.getByRole('button', { name: 'Test Strategy Compatibility' });
      fireEvent.click(testButton);

      await waitFor(() => {
        expect(screen.getByText('Strategy is compatible!')).toBeInTheDocument();
      });
    });

    it('should display an error message and suggestions when the test strategy compatibility fails', async () => {
      (callApi as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: false,
          message: 'Provider is not compatible with the selected strategy.',
          suggestions: ['Try a different provider.', 'Select a different strategy.'],
        }),
      });

      render(
        <MemoryRouter>
          <Strategies onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>,
      );

      const testButton = screen.getByRole('button', { name: 'Test Strategy Compatibility' });
      fireEvent.click(testButton);

      await waitFor(() => {
        expect(
          screen.getByText('Provider is not compatible with the selected strategy.'),
        ).toBeInTheDocument();
        expect(screen.getByText(/Try a different provider/)).toBeInTheDocument();
        expect(screen.getByText(/Select a different strategy/)).toBeInTheDocument();
      });
    });

    it('Test Strategy Compatibility button exits loading state on API error', async () => {
      (callApi as any).mockRejectedValue(new Error('API Error'));

      render(
        <MemoryRouter>
          <Strategies onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>,
      );

      const testButton = screen.getByRole('button', {
        name: 'Test Strategy Compatibility',
      });

      fireEvent.click(testButton);

      await waitFor(() => {
        expect(testButton).not.toHaveTextContent('Testing...');
      });

      expect(testButton).toHaveTextContent('Test Strategy Compatibility');
    });

    it('handles non-JSON error response from API', async () => {
      const mockNonJsonResponse = 'Internal Server Error';
      (callApi as any).mockResolvedValue({
        ok: false,
        text: async () => mockNonJsonResponse,
      });

      render(
        <MemoryRouter>
          <Strategies onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>,
      );

      const testButton = screen.getByRole('button', {
        name: 'Test Strategy Compatibility',
      });
      fireEvent.click(testButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to test strategy')).toBeInTheDocument();
      });
    });
  });

  describe('Multi-modal warning alert', () => {
    it('removes the multi-modal warning alert when all multi-modal strategies are deselected', async () => {
      (useRedTeamConfig as any).mockReturnValue({
        config: {
          target: {
            config: {
              stateful: false,
            },
          },
          strategies: [{ id: 'image' }],
          plugins: [],
          numTests: 5,
        },
        updateConfig: mockUpdateConfig,
      });

      const { rerender } = render(
        <MemoryRouter>
          <Strategies onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>,
      );

      expect(screen.getByText('Multi-modal Strategy Requirements')).toBeInTheDocument();

      (useRedTeamConfig as any).mockReturnValue({
        config: {
          target: {
            config: {
              stateful: false,
            },
          },
          strategies: [],
          plugins: [],
          numTests: 5,
        },
        updateConfig: mockUpdateConfig,
      });

      rerender(
        <MemoryRouter>
          <Strategies onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>,
      );

      expect(screen.queryByText('Multi-modal Strategy Requirements')).toBeNull();
    });
  });

  it('renders multiple StrategySection components inside PageWrapper', () => {
    render(
      <MemoryRouter>
        <Strategies onNext={mockOnNext} onBack={mockOnBack} />
      </MemoryRouter>,
    );

    const strategySectionHeadings = screen.getAllByRole('heading', { level: 6 });
    expect(strategySectionHeadings.length).toBeGreaterThanOrEqual(5);
  });

  it('calls onNext and onBack when the respective buttons are clicked', () => {
    render(
      <MemoryRouter>
        <Strategies onNext={mockOnNext} onBack={mockOnBack} />
      </MemoryRouter>,
    );

    const nextButton = screen.getByRole('button', { name: 'Next' });
    const backButton = screen.getByRole('button', { name: 'Back' });

    fireEvent.click(nextButton);
    expect(mockOnNext).toHaveBeenCalledTimes(1);

    fireEvent.click(backButton);
    expect(mockOnBack).toHaveBeenCalledTimes(1);
  });
});
