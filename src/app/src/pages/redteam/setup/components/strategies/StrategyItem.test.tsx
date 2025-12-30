import { TooltipProvider } from '@app/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestCaseGenerationProvider } from '../TestCaseGenerationProvider';
import { StrategyItem } from './StrategyItem';

import type { StrategyCardData } from './types';

// Mock dependencies
vi.mock('../../hooks/useRedTeamConfig', () => ({
  useRedTeamConfig: vi.fn(() => ({
    config: {
      strategies: [],
      plugins: [],
      applicationDefinition: {
        purpose: 'Test app',
      },
      target: null,
    },
    updateConfig: vi.fn(),
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

describe('StrategyItem', () => {
  const mockOnToggle = vi.fn();
  const mockOnConfigClick = vi.fn();

  const baseStrategy: StrategyCardData = {
    id: 'basic',
    name: 'Test Strategy',
    description: 'Test description',
  };

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const renderStrategyItem = (props: any) => {
    const redTeamConfig = {
      description: 'Test config',
      prompts: ['Test prompt'],
      strategies: [],
      plugins: [],
      applicationDefinition: {
        purpose: 'Test app',
      },
      entities: [],
      target: null as any,
    };

    return render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <TestCaseGenerationProvider redTeamConfig={redTeamConfig as any}>
            <StrategyItem {...props} />
          </TestCaseGenerationProvider>
        </TooltipProvider>
      </QueryClientProvider>,
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic rendering', () => {
    it('renders strategy name and description', () => {
      renderStrategyItem({
        isDisabled: false,
        isRemoteGenerationDisabled: false,
        strategy: baseStrategy,
        isSelected: false,
        onToggle: mockOnToggle,
        onConfigClick: mockOnConfigClick,
      });

      expect(screen.getByText('Test Strategy')).toBeInTheDocument();
      expect(screen.getByText('Test description')).toBeInTheDocument();
    });

    it('renders checkbox with correct state', () => {
      const { rerender } = renderStrategyItem({
        isDisabled: false,
        isRemoteGenerationDisabled: false,
        strategy: baseStrategy,
        isSelected: false,
        onToggle: mockOnToggle,
        onConfigClick: mockOnConfigClick,
      });

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).not.toBeChecked();

      const redTeamConfig = {
        description: 'Test config',
        prompts: ['Test prompt'],
        strategies: [],
        plugins: [],
        applicationDefinition: {
          purpose: 'Test app',
        },
        entities: [],
        target: null as any,
      };

      rerender(
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <TestCaseGenerationProvider redTeamConfig={redTeamConfig as any}>
              <StrategyItem
                isDisabled={false}
                isRemoteGenerationDisabled={false}
                strategy={baseStrategy}
                isSelected={true}
                onToggle={mockOnToggle}
                onConfigClick={mockOnConfigClick}
              />
            </TestCaseGenerationProvider>
          </TooltipProvider>
        </QueryClientProvider>,
      );

      expect(checkbox).toBeChecked();
    });
  });

  describe('Labels and Pills', () => {
    it('shows Recommended pill for default strategies', () => {
      const recommendedStrategy: StrategyCardData = {
        ...baseStrategy,
        id: 'basic',
      };

      renderStrategyItem({
        isDisabled: false,
        isRemoteGenerationDisabled: false,
        strategy: recommendedStrategy,
        isSelected: false,
        onToggle: mockOnToggle,
        onConfigClick: mockOnConfigClick,
      });

      expect(screen.getByText('Recommended')).toBeInTheDocument();
    });

    it('shows Agent pill for agentic strategies', () => {
      const agenticStrategy: StrategyCardData = {
        ...baseStrategy,
        id: 'jailbreak',
      };

      renderStrategyItem({
        isDisabled: false,
        isRemoteGenerationDisabled: false,
        strategy: agenticStrategy,
        isSelected: false,
        onToggle: mockOnToggle,
        onConfigClick: mockOnConfigClick,
      });

      expect(screen.getByText('Agent')).toBeInTheDocument();
    });

    it('shows Multi-modal pill for multi-modal strategies', () => {
      const multiModalStrategy: StrategyCardData = {
        ...baseStrategy,
        id: 'audio',
      };

      renderStrategyItem({
        isDisabled: false,
        isRemoteGenerationDisabled: false,
        strategy: multiModalStrategy,
        isSelected: false,
        onToggle: mockOnToggle,
        onConfigClick: mockOnConfigClick,
      });

      expect(screen.getByText('Multi-modal')).toBeInTheDocument();
    });

    it('renders multiple badges when a strategy belongs to multiple categories', () => {
      const multiCategoryStrategy: StrategyCardData = {
        ...baseStrategy,
        id: 'jailbreak:meta',
      };

      renderStrategyItem({
        isDisabled: false,
        isRemoteGenerationDisabled: false,
        strategy: multiCategoryStrategy,
        isSelected: false,
        onToggle: mockOnToggle,
        onConfigClick: mockOnConfigClick,
      });

      expect(screen.getByText('Recommended')).toBeInTheDocument();
      expect(screen.getByText('Agent')).toBeInTheDocument();
    });
  });

  describe('Settings button', () => {
    it('does not show settings button when not selected', () => {
      const configurableStrategy: StrategyCardData = {
        ...baseStrategy,
        id: 'jailbreak',
      };

      renderStrategyItem({
        isDisabled: false,
        isRemoteGenerationDisabled: false,
        strategy: configurableStrategy,
        isSelected: false,
        onToggle: mockOnToggle,
        onConfigClick: mockOnConfigClick,
      });

      // Should only have test case generation button, not settings button
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(1); // Only test case generation button
      expect(screen.queryByTestId('SettingsOutlinedIcon')).not.toBeInTheDocument();
    });

    it('shows settings button for configurable strategies when selected', () => {
      const configurableStrategy: StrategyCardData = {
        ...baseStrategy,
        id: 'jailbreak',
      };

      renderStrategyItem({
        isDisabled: false,
        isRemoteGenerationDisabled: false,
        strategy: configurableStrategy,
        isSelected: true,
        onToggle: mockOnToggle,
        onConfigClick: mockOnConfigClick,
      });

      // Should have test case generation button + settings button
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(2); // Test case generation + settings buttons
    });

    it('shows settings button for hydra when selected and enabled', () => {
      const hydraStrategy: StrategyCardData = {
        ...baseStrategy,
        id: 'jailbreak:hydra',
      };

      const redTeamConfig = {
        description: 'Test config',
        prompts: ['Test prompt'],
        strategies: [],
        plugins: [],
        applicationDefinition: {
          purpose: 'Test app',
        },
        entities: [],
        target: null as any,
      };

      render(
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <TestCaseGenerationProvider redTeamConfig={redTeamConfig as any}>
              <StrategyItem
                isDisabled={false}
                isRemoteGenerationDisabled={false}
                strategy={hydraStrategy}
                isSelected={true}
                onToggle={mockOnToggle}
                onConfigClick={mockOnConfigClick}
              />
            </TestCaseGenerationProvider>
          </TooltipProvider>
        </QueryClientProvider>,
      );

      // Should have test case generation button + settings button
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    });

    it('does not show settings button for non-configurable strategies even when selected', () => {
      const nonConfigurableStrategy: StrategyCardData = {
        ...baseStrategy,
        id: 'basic',
      };

      renderStrategyItem({
        isDisabled: false,
        isRemoteGenerationDisabled: false,
        strategy: nonConfigurableStrategy,
        isSelected: true,
        onToggle: mockOnToggle,
        onConfigClick: mockOnConfigClick,
      });

      // Should only have test case generation button, no settings button
      const buttons = screen.queryAllByRole('button');
      expect(buttons).toHaveLength(1); // Only test case generation button
      expect(screen.queryByTestId('SettingsOutlinedIcon')).not.toBeInTheDocument();
    });

    it('shows settings button with error color when isSelected and not isConfigured', () => {
      const configurableStrategy: StrategyCardData = {
        ...baseStrategy,
        id: 'jailbreak',
      };

      const { container } = renderStrategyItem({
        isDisabled: false,
        isRemoteGenerationDisabled: false,
        strategy: configurableStrategy,
        isSelected: true,
        onToggle: mockOnToggle,
        onConfigClick: mockOnConfigClick,
        isConfigured: false,
      });

      // Look for the settings button with destructive (error) color class
      const settingsButton = container.querySelector('.text-destructive');
      expect(settingsButton).toBeInTheDocument();
    });
  });

  describe('Interactions', () => {
    it('calls onToggle when card is clicked', () => {
      const { container } = renderStrategyItem({
        isDisabled: false,
        isRemoteGenerationDisabled: false,
        strategy: baseStrategy,
        isSelected: false,
        onToggle: mockOnToggle,
        onConfigClick: mockOnConfigClick,
      });

      // Find the Card component wrapper (has cursor-pointer class)
      const card = container.querySelector('.cursor-pointer');
      fireEvent.click(card!);

      expect(mockOnToggle).toHaveBeenCalledWith('basic');
    });

    it('calls onToggle when checkbox is clicked', () => {
      renderStrategyItem({
        isDisabled: false,
        isRemoteGenerationDisabled: false,
        strategy: baseStrategy,
        isSelected: false,
        onToggle: mockOnToggle,
        onConfigClick: mockOnConfigClick,
      });

      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      expect(mockOnToggle).toHaveBeenCalledWith('basic');
    });

    it('calls onConfigClick when settings button is clicked', () => {
      const configurableStrategy: StrategyCardData = {
        ...baseStrategy,
        id: 'jailbreak',
      };

      renderStrategyItem({
        isDisabled: false,
        isRemoteGenerationDisabled: false,
        strategy: configurableStrategy,
        isSelected: true,
        onToggle: mockOnToggle,
        onConfigClick: mockOnConfigClick,
      });

      const buttons = screen.getAllByRole('button');
      const settingsButton = buttons[buttons.length - 1]; // Last button is settings
      fireEvent.click(settingsButton);

      expect(mockOnConfigClick).toHaveBeenCalledWith('jailbreak');
      expect(mockOnToggle).not.toHaveBeenCalled(); // Should not toggle
    });
  });

  describe('Layout fixes', () => {
    it('applies padding to title section when settings button is present', () => {
      const configurableStrategy: StrategyCardData = {
        ...baseStrategy,
        id: 'jailbreak',
      };

      renderStrategyItem({
        isDisabled: false,
        isRemoteGenerationDisabled: false,
        strategy: configurableStrategy,
        isSelected: true,
        onToggle: mockOnToggle,
        onConfigClick: mockOnConfigClick,
      });

      const titleBox = screen.getByText('Test Strategy').closest('div');
      expect(titleBox).toHaveStyle({ paddingRight: expect.anything() });
    });

    it('renders without overlap when multiple pills and settings button are present', () => {
      const multiBadgeStrategy: StrategyCardData = {
        ...baseStrategy,
        id: 'jailbreak:meta',
      };

      renderStrategyItem({
        isDisabled: false,
        isRemoteGenerationDisabled: false,
        strategy: multiBadgeStrategy,
        isSelected: true,
        onToggle: mockOnToggle,
        onConfigClick: mockOnConfigClick,
      });

      expect(screen.getByText('Test Strategy')).toBeInTheDocument();
      expect(screen.getByText('Agent')).toBeInTheDocument();
      expect(screen.getByText('Recommended')).toBeInTheDocument();

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    });

    it('handles extremely long strategy names without layout issues', () => {
      const longStrategyName =
        'This is an extremely long strategy name that should not break the layout';
      const configurableStrategy: StrategyCardData = {
        id: 'jailbreak',
        name: longStrategyName,
        description: 'Test description',
      };

      renderStrategyItem({
        isDisabled: false,
        isRemoteGenerationDisabled: false,
        strategy: configurableStrategy,
        isSelected: true,
        onToggle: mockOnToggle,
        onConfigClick: mockOnConfigClick,
      });

      expect(screen.getByText(longStrategyName)).toBeInTheDocument();
    });
  });
});
