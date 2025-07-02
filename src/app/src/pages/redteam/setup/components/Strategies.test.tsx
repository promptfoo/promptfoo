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
    it('renders the page title and help text', () => {
      render(
        <MemoryRouter>
          <Strategies onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>,
      );

      expect(screen.getByText('Strategy Configuration')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Strategies modify how prompts are delivered to test different attack vectors.',
        ),
      ).toBeInTheDocument();
    });

    it('renders the documentation link', () => {
      render(
        <MemoryRouter>
          <Strategies onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>,
      );

      const docLink = screen.getByText('Learn more about strategies');
      expect(docLink).toBeInTheDocument();
      expect(docLink).toHaveAttribute(
        'href',
        'https://www.promptfoo.dev/docs/red-team/strategies/',
      );
      expect(docLink).toHaveAttribute('target', '_blank');
      expect(docLink).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('renders navigation buttons', () => {
      render(
        <MemoryRouter>
          <Strategies onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>,
      );

      expect(screen.getByText('Back')).toBeInTheDocument();
      expect(screen.getByText('Next')).toBeInTheDocument();
    });
  });

  describe('Strategy sections', () => {
    it('renders strategy sections with actual strategies', () => {
      render(
        <MemoryRouter>
          <Strategies onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>,
      );

      // Check for section titles
      expect(screen.getByText('Recommended Strategies')).toBeInTheDocument();
      expect(screen.getByText('Agentic Strategies (Single-turn)')).toBeInTheDocument();
      expect(screen.getByText('Agentic Strategies (Multi-turn)')).toBeInTheDocument();
      expect(screen.getByText('Multi-modal Strategies')).toBeInTheDocument();

      // Check for actual strategy items
      expect(screen.getByText('Basic')).toBeInTheDocument();
      expect(screen.getByText('Composite Jailbreaks')).toBeInTheDocument();
      expect(screen.getByText('Audio')).toBeInTheDocument();
      expect(screen.getByText('Video')).toBeInTheDocument();
      expect(screen.getByText('Image')).toBeInTheDocument();
    });

    it('renders section descriptions', () => {
      render(
        <MemoryRouter>
          <Strategies onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>,
      );

      expect(
        screen.getByText('Core strategies that provide comprehensive coverage for most use cases'),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          'Advanced AI-powered strategies that dynamically adapt their attack patterns',
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText('AI-powered strategies that evolve across multiple conversation turns'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Test handling of non-text content including audio, video, and images'),
      ).toBeInTheDocument();
    });
  });

  describe('MULTI_MODAL_STRATEGIES export', () => {
    it('exports MULTI_MODAL_STRATEGIES constant', () => {
      expect(MULTI_MODAL_STRATEGIES).toBeDefined();
      expect(MULTI_MODAL_STRATEGIES).toEqual(['audio', 'video', 'image']);
    });
  });

  describe('Preset selection', () => {
    it('renders preset selector cards', () => {
      render(
        <MemoryRouter>
          <Strategies onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>,
      );

      // Check for preset cards (they appear as headings, not buttons)
      expect(screen.getByText('Quick')).toBeInTheDocument();
      expect(screen.getByText('Medium')).toBeInTheDocument();
      expect(screen.getByText('Large')).toBeInTheDocument();
      expect(screen.getByText('Custom')).toBeInTheDocument();
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

      // SystemConfiguration component should be rendered
      expect(screen.getByText('System Configuration')).toBeInTheDocument();
    });
  });

  describe('UI description overrides', () => {
    it('uses UI-friendly description for basic strategy', () => {
      render(
        <MemoryRouter>
          <Strategies onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>,
      );

      // The basic strategy should have the UI override description
      const basicDescription = screen.getByText(
        'Standard testing without additional attack strategies. Tests prompts as-is to establish baseline behavior.',
      );
      expect(basicDescription).toBeInTheDocument();
    });
  });
});
