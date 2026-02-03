import { TooltipProvider } from '@app/components/ui/tooltip';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { useToast } from '@app/hooks/useToast';
import { MULTI_MODAL_STRATEGIES } from '@promptfoo/redteam/constants';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';
import Strategies from './Strategies';

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>{ui}</TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
};

// Mock only external dependencies and hooks
vi.mock('../hooks/useRedTeamConfig');
vi.mock('@app/hooks/useTelemetry');
vi.mock('@app/hooks/useToast');
vi.mock('./StrategyConfigDialog', () => ({
  default: () => <div data-testid="strategy-config-dialog">Strategy Config Dialog</div>,
}));

const queryClient = new QueryClient();

const mockUpdateConfig = vi.fn();
const mockRecordEvent = vi.fn();
const mockShowToast = vi.fn();

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

    (useToast as any).mockReturnValue({
      showToast: mockShowToast,
    });
  });

  describe('Basic rendering', () => {
    it('renders the page with title and help elements', () => {
      renderWithProviders(<Strategies onNext={mockOnNext} onBack={mockOnBack} />);

      // Check for main heading structure - PageWrapper uses h1
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    it('renders the documentation link with correct attributes', () => {
      renderWithProviders(<Strategies onNext={mockOnNext} onBack={mockOnBack} />);

      const links = screen.getAllByRole('link');
      const docLink = links.find((link) =>
        link.getAttribute('href')?.includes('promptfoo.dev/docs/red-team/strategies'),
      );

      expect(docLink).toBeInTheDocument();
      expect(docLink).toHaveAttribute('target', '_blank');
    });

    it('renders navigation buttons', () => {
      renderWithProviders(<Strategies onNext={mockOnNext} onBack={mockOnBack} />);

      const buttons = screen.getAllByRole('button');
      const backButton = buttons.find((btn) => btn.textContent?.includes('Back'));
      const nextButton = buttons.find((btn) => btn.textContent?.includes('Next'));

      expect(backButton).toBeInTheDocument();
      expect(nextButton).toBeInTheDocument();
    });
  });

  describe('Strategy sections', () => {
    it('renders multiple strategy sections', () => {
      renderWithProviders(<Strategies onNext={mockOnNext} onBack={mockOnBack} />);

      // Check for multiple section headings (h3 elements for strategy sections)
      const sectionHeadings = screen.getAllByRole('heading', { level: 3 });
      expect(sectionHeadings.length).toBeGreaterThan(0);
    });

    it('renders strategy items with checkboxes', () => {
      renderWithProviders(<Strategies onNext={mockOnNext} onBack={mockOnBack} />);

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

  describe('Hero strategies section', () => {
    it('renders recommended strategies section with hero strategies', () => {
      renderWithProviders(<Strategies onNext={mockOnNext} onBack={mockOnBack} />);

      // Check for hero section heading
      expect(screen.getByText('Recommended Strategies')).toBeInTheDocument();

      // Hero strategies should be visible by default (not inside collapsible)
      expect(screen.getByText('Meta Agent')).toBeInTheDocument();
      expect(screen.getByText('Hydra Multi-Turn')).toBeInTheDocument();
    });

    it('renders advanced strategies collapsible trigger', () => {
      renderWithProviders(<Strategies onNext={mockOnNext} onBack={mockOnBack} />);

      // Check for the collapsible trigger
      expect(screen.getByText('Show Advanced Strategies')).toBeInTheDocument();
    });
  });

  describe('Telemetry', () => {
    it('records page view on mount', () => {
      renderWithProviders(<Strategies onNext={mockOnNext} onBack={mockOnBack} />);

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

      renderWithProviders(<Strategies onNext={mockOnNext} onBack={mockOnBack} />);

      // SystemConfiguration component should be rendered - check by heading structure
      const headings = screen.getAllByRole('heading');
      expect(headings.length).toBeGreaterThan(1);
    });
  });

  describe('UI behavior', () => {
    it('renders strategy items for basic strategy', () => {
      renderWithProviders(<Strategies onNext={mockOnNext} onBack={mockOnBack} />);

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

      renderWithProviders(<Strategies onNext={mockOnNext} onBack={mockOnBack} />);

      // Check that the component renders without errors - PageWrapper uses h1
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    it('renders the Multi-modal Strategies section when expanded', () => {
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

      renderWithProviders(<Strategies onNext={mockOnNext} onBack={mockOnBack} />);

      // Expand the advanced strategies section
      fireEvent.click(screen.getByText('Show Advanced Strategies'));

      expect(screen.getByText('Multi-modal Strategies')).toBeInTheDocument();
    });
  });

  it('renders hero section heading and advanced section after expansion', () => {
    renderWithProviders(<Strategies onNext={mockOnNext} onBack={mockOnBack} />);

    // Strategy section headings are h3 elements
    const initialHeadings = screen.getAllByRole('heading', { level: 3 });
    // Initially should have "Recommended Strategies" heading
    expect(initialHeadings.length).toBeGreaterThanOrEqual(1);

    // Expand advanced strategies
    fireEvent.click(screen.getByText('Show Advanced Strategies'));

    // After expansion, should have more headings
    const expandedHeadings = screen.getAllByRole('heading', { level: 3 });
    expect(expandedHeadings.length).toBeGreaterThan(initialHeadings.length);
  });

  it('calls onNext and onBack when the respective buttons are clicked', () => {
    renderWithProviders(<Strategies onNext={mockOnNext} onBack={mockOnBack} />);

    const nextButton = screen.getByRole('button', { name: 'Next' });
    const backButton = screen.getByRole('button', { name: 'Back' });

    fireEvent.click(nextButton);
    expect(mockOnNext).toHaveBeenCalledTimes(1);

    fireEvent.click(backButton);
    expect(mockOnBack).toHaveBeenCalledTimes(1);
  });

  describe('AgenticStrategiesGroup integration', () => {
    it('renders AgenticStrategiesGroup with parent header when expanded', () => {
      renderWithProviders(<Strategies onNext={mockOnNext} onBack={mockOnBack} />);

      // Expand advanced strategies
      fireEvent.click(screen.getByText('Show Advanced Strategies'));

      // Should render "Agentic Strategies" as the parent header
      expect(screen.getByText('Agentic Strategies')).toBeInTheDocument();

      // Should render the description
      expect(
        screen.getByText(/Advanced AI-powered strategies that dynamically adapt/),
      ).toBeInTheDocument();
    });

    it('renders subsection labels for single-turn and multi-turn agentic strategies when expanded', () => {
      renderWithProviders(<Strategies onNext={mockOnNext} onBack={mockOnBack} />);

      // Expand advanced strategies
      fireEvent.click(screen.getByText('Show Advanced Strategies'));

      // Check for subsection labels
      expect(screen.getByText('Single-turn Only')).toBeInTheDocument();
      expect(screen.getByText('Single and Multi-turn')).toBeInTheDocument();

      // Check for subsection descriptions
      expect(
        screen.getByText(/These strategies work only for single-turn evaluations/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/These strategies can be used for both single and multi-turn evaluations/),
      ).toBeInTheDocument();
    });

    it('renders Reset All button for agentic strategies section when expanded', () => {
      renderWithProviders(<Strategies onNext={mockOnNext} onBack={mockOnBack} />);

      // Expand advanced strategies
      fireEvent.click(screen.getByText('Show Advanced Strategies'));

      // Find all Reset buttons - one should be "Reset All" for the agentic strategies
      const resetButtons = screen.getAllByText(/Reset/);
      const resetAllButton = resetButtons.find((btn) => btn.textContent === 'Reset All');

      expect(resetAllButton).toBeInTheDocument();
    });

    it('updates config when hero strategies are selected', () => {
      renderWithProviders(<Strategies onNext={mockOnNext} onBack={mockOnBack} />);

      // Find and click a checkbox in the hero section (visible by default)
      const checkboxes = screen.getAllByRole('checkbox');

      // Click one of the checkboxes (hero strategies are visible by default)
      if (checkboxes.length > 0) {
        fireEvent.click(checkboxes[0]);
        expect(mockUpdateConfig).toHaveBeenCalled();
      }
    });
  });
});
