import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgenticStrategiesGroup } from './AgenticStrategiesGroup';

import type { StrategyCardData } from './types';

// Mock StrategyItem component
// Mimic the behavior of the real component: show config button only when selected AND configurable
const CONFIGURABLE_STRATEGIES = [
  'layer',
  'multilingual',
  'best-of-n',
  'goat',
  'crescendo',
  'jailbreak',
  'jailbreak:tree',
  'gcg',
  'citation',
  'custom',
  'mischievous-user',
];

vi.mock('./StrategyItem', () => ({
  StrategyItem: ({ strategy, isSelected, onToggle, onConfigClick }: any) => {
    const hasSettingsButton = isSelected && CONFIGURABLE_STRATEGIES.includes(strategy.id);

    return (
      <div data-testid={`strategy-${strategy.id}`}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggle(strategy.id)}
          aria-label={strategy.name}
        />
        <span>{strategy.name}</span>
        {hasSettingsButton && (
          <button
            data-testid={`config-${strategy.id}`}
            onClick={() => onConfigClick(strategy.id)}
            aria-label={`Configure ${strategy.name}`}
          >
            Configure
          </button>
        )}
      </div>
    );
  },
}));

describe('AgenticStrategiesGroup', () => {
  const mockOnToggle = vi.fn();
  const mockOnConfigClick = vi.fn();
  const mockOnSelectNone = vi.fn();
  const mockIsStrategyDisabled = vi.fn(() => false);

  const singleTurnStrategies: StrategyCardData[] = [
    {
      id: 'jailbreak',
      name: 'Jailbreak',
      description: 'Attempts to bypass safety measures',
    },
    {
      id: 'jailbreak:tree',
      name: 'Tree Jailbreak',
      description: 'Tree-based jailbreak approach',
    },
  ];

  const multiTurnStrategies: StrategyCardData[] = [
    {
      id: 'crescendo',
      name: 'Crescendo',
      description: 'Gradually escalating attack',
    },
    {
      id: 'goat',
      name: 'GOAT',
      description: 'Generative Offensive Agent Tester',
    },
    {
      id: 'custom',
      name: 'Custom',
      description: 'User-defined strategy',
    },
    {
      id: 'mischievous-user',
      name: 'Mischievous User',
      description: 'Simulates mischievous user behavior',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Component Rendering', () => {
    it('renders parent header with correct text', () => {
      render(
        <AgenticStrategiesGroup
          isStrategyDisabled={mockIsStrategyDisabled}
          isRemoteGenerationDisabled={false}
          singleTurnStrategies={singleTurnStrategies}
          multiTurnStrategies={multiTurnStrategies}
          selectedIds={[]}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onSelectNone={mockOnSelectNone}
        />,
      );

      expect(screen.getByText('Agentic Strategies')).toBeInTheDocument();
    });

    it('renders parent description', () => {
      render(
        <AgenticStrategiesGroup
          isStrategyDisabled={mockIsStrategyDisabled}
          isRemoteGenerationDisabled={false}
          singleTurnStrategies={singleTurnStrategies}
          multiTurnStrategies={multiTurnStrategies}
          selectedIds={[]}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onSelectNone={mockOnSelectNone}
        />,
      );

      expect(
        screen.getByText(
          'Advanced AI-powered strategies that dynamically adapt their attack patterns',
        ),
      ).toBeInTheDocument();
    });

    it('renders Single-turn Only subsection when single-turn strategies exist', () => {
      render(
        <AgenticStrategiesGroup
          isStrategyDisabled={mockIsStrategyDisabled}
          isRemoteGenerationDisabled={false}
          singleTurnStrategies={singleTurnStrategies}
          multiTurnStrategies={multiTurnStrategies}
          selectedIds={[]}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onSelectNone={mockOnSelectNone}
        />,
      );

      expect(screen.getByText('Single-turn Only')).toBeInTheDocument();
      expect(
        screen.getByText('These strategies work only for single-turn evaluations'),
      ).toBeInTheDocument();
    });

    it('renders Single and Multi-turn subsection when multi-turn strategies exist', () => {
      render(
        <AgenticStrategiesGroup
          isStrategyDisabled={mockIsStrategyDisabled}
          isRemoteGenerationDisabled={false}
          singleTurnStrategies={singleTurnStrategies}
          multiTurnStrategies={multiTurnStrategies}
          selectedIds={[]}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onSelectNone={mockOnSelectNone}
        />,
      );

      expect(screen.getByText('Single and Multi-turn')).toBeInTheDocument();
      expect(
        screen.getByText('These strategies can be used for both single and multi-turn evaluations'),
      ).toBeInTheDocument();
    });

    it('renders all strategy items from both subsections', () => {
      render(
        <AgenticStrategiesGroup
          isStrategyDisabled={mockIsStrategyDisabled}
          isRemoteGenerationDisabled={false}
          singleTurnStrategies={singleTurnStrategies}
          multiTurnStrategies={multiTurnStrategies}
          selectedIds={[]}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onSelectNone={mockOnSelectNone}
        />,
      );

      // Check single-turn strategies
      expect(screen.getByText('Jailbreak')).toBeInTheDocument();
      expect(screen.getByText('Tree Jailbreak')).toBeInTheDocument();

      // Check multi-turn strategies
      expect(screen.getByText('Crescendo')).toBeInTheDocument();
      expect(screen.getByText('GOAT')).toBeInTheDocument();
      expect(screen.getByText('Custom')).toBeInTheDocument();
      expect(screen.getByText('Mischievous User')).toBeInTheDocument();
    });

    it('does not render Single-turn Only section when no single-turn strategies', () => {
      render(
        <AgenticStrategiesGroup
          isStrategyDisabled={mockIsStrategyDisabled}
          isRemoteGenerationDisabled={false}
          singleTurnStrategies={[]}
          multiTurnStrategies={multiTurnStrategies}
          selectedIds={[]}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onSelectNone={mockOnSelectNone}
        />,
      );

      expect(screen.queryByText('Single-turn Only')).not.toBeInTheDocument();
      expect(screen.getByText('Single and Multi-turn')).toBeInTheDocument();
    });

    it('does not render Single and Multi-turn section when no multi-turn strategies', () => {
      render(
        <AgenticStrategiesGroup
          isStrategyDisabled={mockIsStrategyDisabled}
          isRemoteGenerationDisabled={false}
          singleTurnStrategies={singleTurnStrategies}
          multiTurnStrategies={[]}
          selectedIds={[]}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onSelectNone={mockOnSelectNone}
        />,
      );

      expect(screen.getByText('Single-turn Only')).toBeInTheDocument();
      expect(screen.queryByText('Single and Multi-turn')).not.toBeInTheDocument();
    });

    it('renders nothing when both strategy arrays are empty', () => {
      render(
        <AgenticStrategiesGroup
          isStrategyDisabled={mockIsStrategyDisabled}
          isRemoteGenerationDisabled={false}
          singleTurnStrategies={[]}
          multiTurnStrategies={[]}
          selectedIds={[]}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onSelectNone={mockOnSelectNone}
        />,
      );

      // Should still render the container and header
      expect(screen.getByText('Agentic Strategies')).toBeInTheDocument();

      // But no subsections
      expect(screen.queryByText('Single-turn Only')).not.toBeInTheDocument();
      expect(screen.queryByText('Single and Multi-turn')).not.toBeInTheDocument();
    });
  });

  describe('Strategy Selection', () => {
    it('shows strategies as selected when their IDs are in selectedIds', () => {
      render(
        <AgenticStrategiesGroup
          isStrategyDisabled={mockIsStrategyDisabled}
          isRemoteGenerationDisabled={false}
          singleTurnStrategies={singleTurnStrategies}
          multiTurnStrategies={multiTurnStrategies}
          selectedIds={['jailbreak', 'crescendo', 'custom']}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onSelectNone={mockOnSelectNone}
        />,
      );

      const jailbreakCheckbox = screen.getByLabelText('Jailbreak') as HTMLInputElement;
      const crescendoCheckbox = screen.getByLabelText('Crescendo') as HTMLInputElement;
      const customCheckbox = screen.getByLabelText('Custom') as HTMLInputElement;
      const goatCheckbox = screen.getByLabelText('GOAT') as HTMLInputElement;

      expect(jailbreakCheckbox.checked).toBe(true);
      expect(crescendoCheckbox.checked).toBe(true);
      expect(customCheckbox.checked).toBe(true);
      expect(goatCheckbox.checked).toBe(false);
    });

    it('calls onToggle when a strategy checkbox is clicked', () => {
      render(
        <AgenticStrategiesGroup
          isStrategyDisabled={mockIsStrategyDisabled}
          isRemoteGenerationDisabled={false}
          singleTurnStrategies={singleTurnStrategies}
          multiTurnStrategies={multiTurnStrategies}
          selectedIds={[]}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onSelectNone={mockOnSelectNone}
        />,
      );

      const jailbreakCheckbox = screen.getByLabelText('Jailbreak');
      fireEvent.click(jailbreakCheckbox);
      expect(mockOnToggle).toHaveBeenCalledWith('jailbreak');

      const crescendoCheckbox = screen.getByLabelText('Crescendo');
      fireEvent.click(crescendoCheckbox);
      expect(mockOnToggle).toHaveBeenCalledWith('crescendo');
    });

    it('calls onConfigClick when a strategy config button is clicked', () => {
      render(
        <AgenticStrategiesGroup
          isStrategyDisabled={mockIsStrategyDisabled}
          isRemoteGenerationDisabled={false}
          singleTurnStrategies={singleTurnStrategies}
          multiTurnStrategies={multiTurnStrategies}
          selectedIds={['jailbreak:tree', 'custom']}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onSelectNone={mockOnSelectNone}
        />,
      );

      const treeJailbreakConfigButton = screen.getByTestId('config-jailbreak:tree');
      fireEvent.click(treeJailbreakConfigButton);
      expect(mockOnConfigClick).toHaveBeenCalledWith('jailbreak:tree');

      const customConfigButton = screen.getByTestId('config-custom');
      fireEvent.click(customConfigButton);
      expect(mockOnConfigClick).toHaveBeenCalledWith('custom');
    });
  });

  describe('Reset All Button', () => {
    it('renders Reset All button', () => {
      render(
        <AgenticStrategiesGroup
          isStrategyDisabled={mockIsStrategyDisabled}
          isRemoteGenerationDisabled={false}
          singleTurnStrategies={singleTurnStrategies}
          multiTurnStrategies={multiTurnStrategies}
          selectedIds={[]}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onSelectNone={mockOnSelectNone}
        />,
      );

      expect(screen.getByText('Reset All')).toBeInTheDocument();
    });

    it('disables Reset All button when no strategies are selected', () => {
      render(
        <AgenticStrategiesGroup
          isStrategyDisabled={mockIsStrategyDisabled}
          isRemoteGenerationDisabled={false}
          singleTurnStrategies={singleTurnStrategies}
          multiTurnStrategies={multiTurnStrategies}
          selectedIds={[]}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onSelectNone={mockOnSelectNone}
        />,
      );

      const resetButton = screen.getByText('Reset All');
      expect(resetButton).toBeDisabled();
    });

    it('enables Reset All button when at least one strategy is selected', () => {
      render(
        <AgenticStrategiesGroup
          isStrategyDisabled={mockIsStrategyDisabled}
          isRemoteGenerationDisabled={false}
          singleTurnStrategies={singleTurnStrategies}
          multiTurnStrategies={multiTurnStrategies}
          selectedIds={['jailbreak']}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onSelectNone={mockOnSelectNone}
        />,
      );

      const resetButton = screen.getByText('Reset All');
      expect(resetButton).not.toBeDisabled();
    });

    it('calls onSelectNone with only selected agentic strategies when Reset All is clicked', () => {
      render(
        <AgenticStrategiesGroup
          isStrategyDisabled={mockIsStrategyDisabled}
          isRemoteGenerationDisabled={false}
          singleTurnStrategies={singleTurnStrategies}
          multiTurnStrategies={multiTurnStrategies}
          selectedIds={['jailbreak', 'crescendo', 'goat', 'other-strategy']}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onSelectNone={mockOnSelectNone}
        />,
      );

      const resetButton = screen.getByText('Reset All');
      fireEvent.click(resetButton);

      // Should only pass the agentic strategies that are selected, not 'other-strategy'
      expect(mockOnSelectNone).toHaveBeenCalledWith(['jailbreak', 'crescendo', 'goat']);
    });

    it('does not call onSelectNone when Reset All is clicked but no strategies are selected', () => {
      render(
        <AgenticStrategiesGroup
          isStrategyDisabled={mockIsStrategyDisabled}
          isRemoteGenerationDisabled={false}
          singleTurnStrategies={singleTurnStrategies}
          multiTurnStrategies={multiTurnStrategies}
          selectedIds={[]}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onSelectNone={mockOnSelectNone}
        />,
      );

      const resetButton = screen.getByText('Reset All');
      expect(resetButton).toBeDisabled();

      // Try to click anyway (shouldn't do anything)
      fireEvent.click(resetButton);
      expect(mockOnSelectNone).not.toHaveBeenCalled();
    });

    it('resets only strategies from both subsections when mixed selection exists', () => {
      render(
        <AgenticStrategiesGroup
          isStrategyDisabled={mockIsStrategyDisabled}
          isRemoteGenerationDisabled={false}
          singleTurnStrategies={singleTurnStrategies}
          multiTurnStrategies={multiTurnStrategies}
          selectedIds={['jailbreak', 'jailbreak:tree', 'crescendo', 'custom']}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onSelectNone={mockOnSelectNone}
        />,
      );

      const resetButton = screen.getByText('Reset All');
      fireEvent.click(resetButton);

      expect(mockOnSelectNone).toHaveBeenCalledWith([
        'jailbreak',
        'jailbreak:tree',
        'crescendo',
        'custom',
      ]);
    });
  });

  describe('Edge Cases', () => {
    it('handles strategies with special characters in IDs', () => {
      const specialStrategies: StrategyCardData[] = [
        {
          id: 'jailbreak:tree',
          name: 'Strategy With Colon',
          description: 'Test strategy',
        },
      ];

      render(
        <AgenticStrategiesGroup
          isStrategyDisabled={mockIsStrategyDisabled}
          isRemoteGenerationDisabled={false}
          singleTurnStrategies={specialStrategies}
          multiTurnStrategies={[]}
          selectedIds={['jailbreak:tree']}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onSelectNone={mockOnSelectNone}
        />,
      );

      expect(screen.getByText('Strategy With Colon')).toBeInTheDocument();

      const colonCheckbox = screen.getByLabelText('Strategy With Colon') as HTMLInputElement;
      expect(colonCheckbox.checked).toBe(true);
    });

    it('handles very long strategy names and descriptions', () => {
      const longStrategies: StrategyCardData[] = [
        {
          id: 'prompt-injection',
          name: 'This is a very long strategy name that might cause layout issues in the UI',
          description:
            'This is an extremely long description that goes on and on and on to test how the component handles text overflow and wrapping in various screen sizes',
        },
      ];

      render(
        <AgenticStrategiesGroup
          isStrategyDisabled={mockIsStrategyDisabled}
          isRemoteGenerationDisabled={false}
          singleTurnStrategies={longStrategies}
          multiTurnStrategies={[]}
          selectedIds={[]}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onSelectNone={mockOnSelectNone}
        />,
      );

      expect(
        screen.getByText(
          'This is a very long strategy name that might cause layout issues in the UI',
        ),
      ).toBeInTheDocument();
    });

    it('handles undefined onSelectNone prop gracefully', () => {
      // Use a function to ensure no error is thrown
      const renderWithoutError = () => {
        render(
          <AgenticStrategiesGroup
            isStrategyDisabled={mockIsStrategyDisabled}
            isRemoteGenerationDisabled={false}
            singleTurnStrategies={singleTurnStrategies}
            multiTurnStrategies={multiTurnStrategies}
            selectedIds={['jailbreak']}
            onToggle={mockOnToggle}
            onConfigClick={mockOnConfigClick}
            onSelectNone={undefined as any}
          />,
        );
      };

      // Should render without throwing
      expect(renderWithoutError).not.toThrow();

      // Component should still render
      expect(screen.getByText('Agentic Strategies')).toBeInTheDocument();

      // Reset button should still be present
      const resetButton = screen.getByText('Reset All');
      expect(resetButton).toBeInTheDocument();

      // Clicking reset shouldn't cause errors
      expect(() => fireEvent.click(resetButton)).not.toThrow();
    });
  });

  describe('Integration with StrategyItem', () => {
    it('passes correct props to each StrategyItem', () => {
      render(
        <AgenticStrategiesGroup
          isStrategyDisabled={mockIsStrategyDisabled}
          isRemoteGenerationDisabled={false}
          singleTurnStrategies={singleTurnStrategies}
          multiTurnStrategies={multiTurnStrategies}
          selectedIds={['jailbreak:tree', 'custom']}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onSelectNone={mockOnSelectNone}
        />,
      );

      // Check that strategy items are rendered with correct data-testid
      expect(screen.getByTestId('strategy-jailbreak')).toBeInTheDocument();
      expect(screen.getByTestId('strategy-jailbreak:tree')).toBeInTheDocument();
      expect(screen.getByTestId('strategy-crescendo')).toBeInTheDocument();
      expect(screen.getByTestId('strategy-goat')).toBeInTheDocument();
      expect(screen.getByTestId('strategy-custom')).toBeInTheDocument();
      expect(screen.getByTestId('strategy-mischievous-user')).toBeInTheDocument();

      // Check that selected configurable strategies have config buttons
      expect(screen.getByTestId('config-jailbreak:tree')).toBeInTheDocument();
      expect(screen.getByTestId('config-custom')).toBeInTheDocument();

      // Non-selected or non-configurable strategies shouldn't have config buttons
      expect(screen.queryByTestId('config-jailbreak')).not.toBeInTheDocument();
      expect(screen.queryByTestId('config-crescendo')).not.toBeInTheDocument();
    });
  });

  describe('Layout and Structure', () => {
    it('maintains correct section structure with both subsections', () => {
      const { container } = render(
        <AgenticStrategiesGroup
          isStrategyDisabled={mockIsStrategyDisabled}
          isRemoteGenerationDisabled={false}
          singleTurnStrategies={singleTurnStrategies}
          multiTurnStrategies={multiTurnStrategies}
          selectedIds={[]}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onSelectNone={mockOnSelectNone}
        />,
      );

      // Check for main container
      const mainContainer = container.firstChild;
      expect(mainContainer).toBeInTheDocument();

      // Check that both subsections exist
      expect(screen.getByText('Single-turn Only')).toBeInTheDocument();
      expect(screen.getByText('Single and Multi-turn')).toBeInTheDocument();
    });

    it('renders strategies in grid layout within each subsection', () => {
      render(
        <AgenticStrategiesGroup
          isStrategyDisabled={mockIsStrategyDisabled}
          isRemoteGenerationDisabled={false}
          singleTurnStrategies={singleTurnStrategies}
          multiTurnStrategies={multiTurnStrategies}
          selectedIds={[]}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onSelectNone={mockOnSelectNone}
        />,
      );

      // Verify all strategies are rendered in their respective sections
      const singleTurnSection = screen.getByText('Single-turn Only').parentElement?.parentElement;
      if (singleTurnSection) {
        expect(within(singleTurnSection).getByText('Jailbreak')).toBeInTheDocument();
        expect(within(singleTurnSection).getByText('Tree Jailbreak')).toBeInTheDocument();
      }

      const multiTurnSection =
        screen.getByText('Single and Multi-turn').parentElement?.parentElement;
      if (multiTurnSection) {
        expect(within(multiTurnSection).getByText('Crescendo')).toBeInTheDocument();
        expect(within(multiTurnSection).getByText('GOAT')).toBeInTheDocument();
        expect(within(multiTurnSection).getByText('Custom')).toBeInTheDocument();
        expect(within(multiTurnSection).getByText('Mischievous User')).toBeInTheDocument();
      }
    });
  });
});
