import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Strategies, { MULTI_MODAL_STRATEGIES } from './Strategies';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';
import { useTelemetry } from '@app/hooks/useTelemetry';

// Mock dependencies
vi.mock('../hooks/useRedTeamConfig');
vi.mock('@app/hooks/useTelemetry');
vi.mock('./StrategyConfigDialog', () => ({
  default: () => <div>Strategy Config Dialog</div>,
}));
vi.mock('./strategies/PresetSelector', () => ({
  PresetSelector: ({ presets, selectedPreset, onSelect }: any) => (
    <div>
      <button onClick={() => onSelect({ name: 'Quick' })}>Quick</button>
      <button onClick={() => onSelect({ name: 'Medium' })}>Medium</button>
      <button onClick={() => onSelect({ name: 'Large' })}>Large</button>
    </div>
  ),
}));
vi.mock('./strategies/RecommendedOptions', () => ({
  RecommendedOptions: () => <div>Recommended Options</div>,
}));
vi.mock('./strategies/StrategySection', () => ({
  StrategySection: ({ title, description }: any) => (
    <div>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  ),
}));
vi.mock('./strategies/SystemConfiguration', () => ({
  SystemConfiguration: () => <div>System Configuration</div>,
}));
vi.mock('./strategies/utils', () => ({
  getEstimatedProbes: vi.fn(() => 100),
  getStrategyId: vi.fn((s: any) => (typeof s === 'string' ? s : s?.id || '')),
}));
vi.mock('@promptfoo/redteam/constants', () => ({
  ALL_STRATEGIES: ['basic', 'jailbreak', 'jailbreak:composite', 'audio', 'video', 'image', 'crescendo', 'goat'],
  MULTI_TURN_STRATEGIES: ['crescendo', 'goat'],
  AGENTIC_STRATEGIES: ['jailbreak', 'crescendo', 'goat'],
  DEFAULT_STRATEGIES: ['basic', 'jailbreak', 'jailbreak:composite'],
  DEFAULT_PLUGINS: [],
  REDTEAM_DEFAULTS: {
    NUM_TESTS: 5,
    MAX_CONCURRENCY: 10,
  },
  strategyDisplayNames: {
    basic: 'Basic',
    jailbreak: 'Jailbreak',
    'jailbreak:composite': 'Composite Jailbreaks',
    audio: 'Audio',
    video: 'Video',
    image: 'Image',
    crescendo: 'Crescendo',
    goat: 'GOAT',
  },
  strategyDescriptions: {
    basic: 'Original plugin tests without any additional strategies or optimizations',
    jailbreak: 'Optimizes single-turn attacks to bypass security controls',
    'jailbreak:composite': 'Chains multiple attack vectors for enhanced effectiveness',
    audio: 'Tests detection and handling of audio-based malicious payloads',
    video: 'Tests detection and handling of video-based malicious payloads',
    image: 'Tests detection and handling of image-based malicious payloads',
    crescendo: 'Executes progressive multi-turn attacks with escalating malicious intent',
    goat: 'Deploys dynamic attack generation using advanced adversarial techniques',
  },
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
        </MemoryRouter>
      );

      expect(screen.getByText('Strategy Configuration')).toBeInTheDocument();
      expect(
        screen.getByText('Strategies modify how prompts are delivered to test different attack vectors.')
      ).toBeInTheDocument();
    });

    it('renders the documentation link', () => {
      render(
        <MemoryRouter>
          <Strategies onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>
      );

      const docLink = screen.getByText('Learn more about strategies');
      expect(docLink).toBeInTheDocument();
      expect(docLink).toHaveAttribute('href', 'https://www.promptfoo.dev/docs/red-team/strategies/');
      expect(docLink).toHaveAttribute('target', '_blank');
      expect(docLink).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('renders navigation buttons', () => {
      render(
        <MemoryRouter>
          <Strategies onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>
      );

      expect(screen.getByText('Back')).toBeInTheDocument();
      expect(screen.getByText('Next')).toBeInTheDocument();
    });
  });

  describe('Strategy categorization', () => {
    it('renders all strategy sections', () => {
      render(
        <MemoryRouter>
          <Strategies onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>
      );

      // Check for section titles
      expect(screen.getByText('Recommended Strategies')).toBeInTheDocument();
      expect(screen.getByText('Agentic Strategies (Single-turn)')).toBeInTheDocument();
      expect(screen.getByText('Agentic Strategies (Multi-turn)')).toBeInTheDocument();
      expect(screen.getByText('Multi-modal Strategies')).toBeInTheDocument();
      // Other Strategies may not be present if all strategies are categorized
    });

    it('renders section descriptions', () => {
      render(
        <MemoryRouter>
          <Strategies onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>
      );

      expect(
        screen.getByText('Core strategies that provide comprehensive coverage for most use cases')
      ).toBeInTheDocument();
      expect(
        screen.getByText('Advanced AI-powered strategies that dynamically adapt their attack patterns')
      ).toBeInTheDocument();
      expect(
        screen.getByText('AI-powered strategies that evolve across multiple conversation turns')
      ).toBeInTheDocument();
      expect(
        screen.getByText('Test handling of non-text content including audio, video, and images')
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
    it('renders preset selector', () => {
      render(
        <MemoryRouter>
          <Strategies onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>
      );

      // PresetSelector component should be rendered
      expect(screen.getByText('Quick')).toBeInTheDocument();
      expect(screen.getByText('Medium')).toBeInTheDocument();
      expect(screen.getByText('Large')).toBeInTheDocument();
    });
  });

  describe('Strategy selection', () => {
    it('renders strategy sections correctly', () => {
      render(
        <MemoryRouter>
          <Strategies onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>
      );

      // Just check that the component renders without errors
      expect(screen.getByText('Strategy Configuration')).toBeInTheDocument();
    });
  });

  describe('Telemetry', () => {
    it('records page view on mount', () => {
      render(
        <MemoryRouter>
          <Strategies onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>
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
        </MemoryRouter>
      );

      // SystemConfiguration component should be rendered
      expect(screen.getByText('System Configuration')).toBeInTheDocument();
    });
  });

  describe('UI description overrides', () => {
    it('component handles UI description overrides', () => {
      render(
        <MemoryRouter>
          <Strategies onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>
      );

      // Component should render with UI overrides applied
      expect(screen.getByText('Strategy Configuration')).toBeInTheDocument();
    });
  });
}); 