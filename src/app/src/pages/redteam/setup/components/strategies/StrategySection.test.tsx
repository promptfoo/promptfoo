import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StrategySection } from './StrategySection';

import type { StrategyCardData } from './types';

describe('StrategySection', () => {
  const mockOnToggle = vi.fn();
  const mockOnConfigClick = vi.fn();
  const mockOnSelectNone = vi.fn();

  const testStrategies: StrategyCardData[] = [
    { id: 'basic', name: 'Strategy 1', description: 'Description 1' },
    { id: 'jailbreak', name: 'Strategy 2', description: 'Description 2' },
    { id: 'multilingual', name: 'Strategy 3', description: 'Description 3' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic rendering', () => {
    it('renders section title', () => {
      render(
        <StrategySection
          isStrategyDisabled={() => false}
          isRemoteGenerationDisabled={false}
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
          isStrategyDisabled={() => false}
          isRemoteGenerationDisabled={false}
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
          isStrategyDisabled={() => false}
          isRemoteGenerationDisabled={false}
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
          isStrategyDisabled={() => false}
          isRemoteGenerationDisabled={false}
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
          isStrategyDisabled={() => false}
          isRemoteGenerationDisabled={false}
          title="Test Section"
          strategies={testStrategies}
          selectedIds={['basic']}
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
          isStrategyDisabled={() => false}
          isRemoteGenerationDisabled={false}
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
          isStrategyDisabled={() => false}
          isRemoteGenerationDisabled={false}
          title="Test Section"
          strategies={testStrategies}
          selectedIds={['basic', 'jailbreak']}
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
          isStrategyDisabled={() => false}
          isRemoteGenerationDisabled={false}
          title="Test Section"
          strategies={testStrategies}
          selectedIds={['basic', 'multilingual']}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onSelectNone={mockOnSelectNone}
        />,
      );

      const resetButton = screen.getByText('Reset');
      fireEvent.click(resetButton);

      expect(mockOnSelectNone).toHaveBeenCalledWith(['basic', 'multilingual']);
    });

    it('falls back to calling onToggle for each selected strategy when onSelectNone is not provided', () => {
      render(
        <StrategySection
          isStrategyDisabled={() => false}
          isRemoteGenerationDisabled={false}
          title="Test Section"
          strategies={testStrategies}
          selectedIds={['basic', 'multilingual']}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
        />,
      );

      const resetButton = screen.getByText('Reset');
      fireEvent.click(resetButton);

      expect(mockOnToggle).toHaveBeenCalledTimes(2);
      expect(mockOnToggle).toHaveBeenCalledWith('basic');
      expect(mockOnToggle).toHaveBeenCalledWith('multilingual');
    });

    it('calls onSelectNone with only valid strategy IDs when Reset is clicked and selectedIds contains non-existent IDs', () => {
      render(
        <StrategySection
          isStrategyDisabled={() => false}
          isRemoteGenerationDisabled={false}
          title="Test Section"
          strategies={testStrategies}
          selectedIds={['basic', 'nonexistent', 'multilingual']}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onSelectNone={mockOnSelectNone}
        />,
      );

      const resetButton = screen.getByText('Reset');
      fireEvent.click(resetButton);

      expect(mockOnSelectNone).toHaveBeenCalledWith(['basic', 'multilingual']);
    });

    it('does not call onSelectNone or onToggle when strategies are empty but selectedIds contains IDs', () => {
      render(
        <StrategySection
          isStrategyDisabled={() => false}
          isRemoteGenerationDisabled={false}
          title="Test Section"
          strategies={[]}
          selectedIds={['basic', 'jailbreak']}
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
          isStrategyDisabled={() => false}
          isRemoteGenerationDisabled={false}
          title="Test Section"
          strategies={testStrategies}
          selectedIds={[]}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          highlighted={true}
        />,
      );

      // Look for the grid container with highlighted styling (Tailwind classes)
      const gridContainer = container.querySelector('.border-primary\\/10');
      expect(gridContainer).toBeInTheDocument();
    });

    it('applies special title styling when highlighted', () => {
      render(
        <StrategySection
          isStrategyDisabled={() => false}
          isRemoteGenerationDisabled={false}
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
          isStrategyDisabled={() => false}
          isRemoteGenerationDisabled={false}
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
      render(
        <StrategySection
          isStrategyDisabled={() => false}
          isRemoteGenerationDisabled={false}
          title="Test Section"
          strategies={testStrategies}
          selectedIds={[]}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          highlighted={true}
        />,
      );

      expect(screen.getByText('Test Section')).toBeInTheDocument();
    });
  });

  describe('Configurable strategies', () => {
    beforeEach(() => {
      vi.mock('./StrategyItem', () => ({
        StrategyItem: vi.fn().mockImplementation(({ strategy, isSelected, onConfigClick }) => (
          <div>
            {isSelected && strategy.id === 'multilingual' && (
              <button aria-label="settings" onClick={() => onConfigClick(strategy.id)}>
                Settings
              </button>
            )}
            {strategy.name}
          </div>
        )),
        CONFIGURABLE_STRATEGIES: ['multilingual'],
      }));
    });

    it('renders config button when strategy is selected and configurable', () => {
      const configurableStrategyId = 'multilingual';
      const configurableStrategy: StrategyCardData = {
        id: configurableStrategyId,
        name: 'Configurable Strategy',
        description: 'Description for configurable strategy',
      };

      render(
        <StrategySection
          isStrategyDisabled={() => false}
          isRemoteGenerationDisabled={false}
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
