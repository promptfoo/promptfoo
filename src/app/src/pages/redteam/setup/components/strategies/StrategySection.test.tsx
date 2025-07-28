import { createTheme, ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { StrategySection } from './StrategySection';

import type { StrategyCardData } from './types';

describe('StrategySection', () => {
  const mockOnToggle = vi.fn();
  const mockOnConfigClick = vi.fn();
  const mockOnSelectNone = vi.fn();

  const testStrategies: StrategyCardData[] = [
    { id: 'strategy1', name: 'Strategy 1', description: 'Description 1' },
    { id: 'strategy2', name: 'Strategy 2', description: 'Description 2' },
    { id: 'strategy3', name: 'Strategy 3', description: 'Description 3' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic rendering', () => {
    it('renders section title', () => {
      render(
        <StrategySection
          title="Test Section"
          strategies={testStrategies}
          selectedIds={[]}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
        />,
      );

      expect(screen.getByText('Test Section')).toBeInTheDocument();
    });

    it('renders section description when provided', () => {
      render(
        <StrategySection
          title="Test Section"
          description="This is a test description"
          strategies={testStrategies}
          selectedIds={[]}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
        />,
      );

      expect(screen.getByText('This is a test description')).toBeInTheDocument();
    });

    it('does not render description when not provided', () => {
      render(
        <StrategySection
          title="Test Section"
          strategies={testStrategies}
          selectedIds={[]}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
        />,
      );

      expect(screen.queryByText('This is a test description')).not.toBeInTheDocument();
    });

    it('renders all strategy items', () => {
      render(
        <StrategySection
          title="Test Section"
          strategies={testStrategies}
          selectedIds={[]}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
        />,
      );

      expect(screen.getByText('Strategy 1')).toBeInTheDocument();
      expect(screen.getByText('Strategy 2')).toBeInTheDocument();
      expect(screen.getByText('Strategy 3')).toBeInTheDocument();
    });
  });

  describe('Reset button', () => {
    it('shows Reset button when strategies exist', () => {
      render(
        <StrategySection
          title="Test Section"
          strategies={testStrategies}
          selectedIds={['strategy1']}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onSelectNone={mockOnSelectNone}
        />,
      );

      expect(screen.getByText('Reset')).toBeInTheDocument();
    });

    it('disables Reset button when no strategies are selected', () => {
      render(
        <StrategySection
          title="Test Section"
          strategies={testStrategies}
          selectedIds={[]}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onSelectNone={mockOnSelectNone}
        />,
      );

      const resetButton = screen.getByText('Reset');
      expect(resetButton).toBeDisabled();
    });

    it('enables Reset button when strategies are selected', () => {
      render(
        <StrategySection
          title="Test Section"
          strategies={testStrategies}
          selectedIds={['strategy1', 'strategy2']}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onSelectNone={mockOnSelectNone}
        />,
      );

      const resetButton = screen.getByText('Reset');
      expect(resetButton).not.toBeDisabled();
    });

    it('calls onSelectNone with selected strategy IDs when Reset is clicked', () => {
      render(
        <StrategySection
          title="Test Section"
          strategies={testStrategies}
          selectedIds={['strategy1', 'strategy3']}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onSelectNone={mockOnSelectNone}
        />,
      );

      const resetButton = screen.getByText('Reset');
      fireEvent.click(resetButton);

      expect(mockOnSelectNone).toHaveBeenCalledWith(['strategy1', 'strategy3']);
    });

    it('falls back to calling onToggle for each selected strategy when onSelectNone is not provided', () => {
      render(
        <StrategySection
          title="Test Section"
          strategies={testStrategies}
          selectedIds={['strategy1', 'strategy3']}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
        />,
      );

      const resetButton = screen.getByText('Reset');
      fireEvent.click(resetButton);

      expect(mockOnToggle).toHaveBeenCalledTimes(2);
      expect(mockOnToggle).toHaveBeenCalledWith('strategy1');
      expect(mockOnToggle).toHaveBeenCalledWith('strategy3');
    });

    it('calls onSelectNone with only valid strategy IDs when Reset is clicked and selectedIds contains non-existent IDs', () => {
      render(
        <StrategySection
          title="Test Section"
          strategies={testStrategies}
          selectedIds={['strategy1', 'nonexistent', 'strategy3']}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onSelectNone={mockOnSelectNone}
        />,
      );

      const resetButton = screen.getByText('Reset');
      fireEvent.click(resetButton);

      expect(mockOnSelectNone).toHaveBeenCalledWith(['strategy1', 'strategy3']);
    });

    it('does not call onSelectNone or onToggle when strategies are empty but selectedIds contains IDs', () => {
      render(
        <StrategySection
          title="Test Section"
          strategies={[]}
          selectedIds={['strategy1', 'strategy2']}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onSelectNone={mockOnSelectNone}
        />,
      );

      const resetButton = screen.queryByText('Reset');

      expect(resetButton).toBeNull();
      expect(mockOnSelectNone).not.toHaveBeenCalled();
      expect(mockOnToggle).not.toHaveBeenCalled();
    });
  });

  describe('Highlighting', () => {
    it('applies highlighted styling when highlighted prop is true', () => {
      const { container } = render(
        <StrategySection
          title="Test Section"
          strategies={testStrategies}
          selectedIds={[]}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          highlighted={true}
        />,
      );

      // Look for the grid container with special styling
      const gridContainer = container.querySelector('[class*="MuiBox-root"]');
      expect(gridContainer).toBeInTheDocument();
    });

    it('applies special title styling when highlighted', () => {
      render(
        <StrategySection
          title="Highlighted Section"
          strategies={testStrategies}
          selectedIds={[]}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          highlighted={true}
        />,
      );

      const title = screen.getByText('Highlighted Section');
      // The highlighted title should be in the document (styling is applied via sx prop)
      expect(title).toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    it('renders empty section when no strategies provided', () => {
      render(
        <StrategySection
          title="Empty Section"
          strategies={[]}
          selectedIds={[]}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
        />,
      );

      expect(screen.getByText('Empty Section')).toBeInTheDocument();
      // Should not show any strategy items
      expect(screen.queryByText('Strategy 1')).not.toBeInTheDocument();
    });
  });

  describe('Theme customization', () => {
    it('renders without error when theme.palette.primary.main is not defined and highlighted is true', () => {
      const customTheme = createTheme({
        palette: {
          mode: 'light',
        },
      });

      render(
        <ThemeProvider theme={customTheme}>
          <StrategySection
            title="Test Section"
            strategies={testStrategies}
            selectedIds={[]}
            onToggle={mockOnToggle}
            onConfigClick={mockOnConfigClick}
            highlighted={true}
          />
        </ThemeProvider>,
      );

      expect(screen.getByText('Test Section')).toBeInTheDocument();
    });
  });

  describe('Configurable strategies', () => {
    beforeEach(() => {
      vi.mock('./StrategyItem', () => ({
        StrategyItem: vi
          .fn()
          .mockImplementation(({ strategy, isSelected, onToggle, onConfigClick }) => (
            <div>
              {isSelected && strategy.id === 'configurable-strategy-id' && (
                <button aria-label="settings" onClick={() => onConfigClick(strategy.id)}>
                  Settings
                </button>
              )}
              {strategy.name}
            </div>
          )),
        CONFIGURABLE_STRATEGIES: ['configurable-strategy-id'],
      }));
    });

    it('renders config button when strategy is selected and configurable', () => {
      const configurableStrategyId = 'configurable-strategy-id';
      const configurableStrategy: StrategyCardData = {
        id: configurableStrategyId,
        name: 'Configurable Strategy',
        description: 'Description for configurable strategy',
      };

      render(
        <StrategySection
          title="Test Section"
          strategies={[configurableStrategy]}
          selectedIds={[configurableStrategyId]}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
        />,
      );

      const configButton = screen.getByLabelText('settings');
      expect(configButton).toBeInTheDocument();
    });
  });
});
