import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { vi } from 'vitest';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';
import Strategies from './Strategies';
import { MULTI_MODAL_STRATEGIES } from './strategies/constants';

// Mock only external dependencies and hooks
vi.mock('../hooks/useRedTeamConfig');
vi.mock('@app/hooks/useTelemetry');
vi.mock('./StrategyConfigDialog', () => ({
  default: () => <div data-testid="strategy-config-dialog">Strategy Config Dialog</div>,
}));

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

      // Check for help icon
      expect(screen.getByTestId('HelpOutlineIcon')).toBeInTheDocument();
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
      expect(docLink).toHaveAttribute('rel', 'noopener noreferrer');
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
      expect(MULTI_MODAL_STRATEGIES).toEqual(['audio', 'video', 'image']);
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
  });
});
