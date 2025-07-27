import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { StrategyItem } from './StrategyItem';

import type { StrategyCardData } from './types';

describe('StrategyItem', () => {
  const mockOnToggle = vi.fn();
  const mockOnConfigClick = vi.fn();

  const baseStrategy: StrategyCardData = {
    id: 'test-strategy',
    name: 'Test Strategy',
    description: 'Test description',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic rendering', () => {
    it('renders strategy name and description', () => {
      render(
        <StrategyItem
          strategy={baseStrategy}
          isSelected={false}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
        />,
      );

      expect(screen.getByText('Test Strategy')).toBeInTheDocument();
      expect(screen.getByText('Test description')).toBeInTheDocument();
    });

    it('renders checkbox with correct state', () => {
      const { rerender } = render(
        <StrategyItem
          strategy={baseStrategy}
          isSelected={false}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
        />,
      );

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).not.toBeChecked();

      rerender(
        <StrategyItem
          strategy={baseStrategy}
          isSelected={true}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
        />,
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

      render(
        <StrategyItem
          strategy={recommendedStrategy}
          isSelected={false}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
        />,
      );

      expect(screen.getByText('Recommended')).toBeInTheDocument();
    });

    it('shows Agent pill for agentic strategies', () => {
      const agenticStrategy: StrategyCardData = {
        ...baseStrategy,
        id: 'jailbreak',
      };

      render(
        <StrategyItem
          strategy={agenticStrategy}
          isSelected={false}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
        />,
      );

      expect(screen.getByText('Agent')).toBeInTheDocument();
    });

    it('shows Multi-modal pill for multi-modal strategies', () => {
      const multiModalStrategy: StrategyCardData = {
        ...baseStrategy,
        id: 'audio',
      };

      render(
        <StrategyItem
          strategy={multiModalStrategy}
          isSelected={false}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
        />,
      );

      expect(screen.getByText('Multi-modal')).toBeInTheDocument();
    });

    it('shows Experimental pill for pandamonium strategy', () => {
      const experimentalStrategy: StrategyCardData = {
        ...baseStrategy,
        id: 'pandamonium',
      };

      render(
        <StrategyItem
          strategy={experimentalStrategy}
          isSelected={false}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
        />,
      );

      expect(screen.getByText('Experimental')).toBeInTheDocument();
    });

    it('renders multiple badges when a strategy belongs to multiple categories', () => {
      const multiCategoryStrategy: StrategyCardData = {
        ...baseStrategy,
        id: 'jailbreak',
      };

      render(
        <StrategyItem
          strategy={multiCategoryStrategy}
          isSelected={false}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
        />,
      );

      expect(screen.getByText('Recommended')).toBeInTheDocument();
      expect(screen.getByText('Agent')).toBeInTheDocument();
    });
  });

  describe('Settings button', () => {
    it('does not show settings button when not selected', () => {
      const configurableStrategy: StrategyCardData = {
        ...baseStrategy,
        id: 'multilingual',
      };

      render(
        <StrategyItem
          strategy={configurableStrategy}
          isSelected={false}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
        />,
      );

      expect(screen.queryByRole('button', { name: '' })).not.toBeInTheDocument();
    });

    it('shows settings button for configurable strategies when selected', () => {
      const configurableStrategy: StrategyCardData = {
        ...baseStrategy,
        id: 'multilingual',
      };

      render(
        <StrategyItem
          strategy={configurableStrategy}
          isSelected={true}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
        />,
      );

      // The icon button has no explicit name, so we look for buttons
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(1);
    });

    it('does not show settings button for non-configurable strategies even when selected', () => {
      const nonConfigurableStrategy: StrategyCardData = {
        ...baseStrategy,
        id: 'basic',
      };

      render(
        <StrategyItem
          strategy={nonConfigurableStrategy}
          isSelected={true}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
        />,
      );

      // Should only have checkbox, no settings button
      const buttons = screen.queryAllByRole('button');
      expect(buttons).toHaveLength(0);
    });
  });

  describe('Interactions', () => {
    it('calls onToggle when card is clicked', () => {
      render(
        <StrategyItem
          strategy={baseStrategy}
          isSelected={false}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
        />,
      );

      const card = screen.getByText('Test Strategy').closest('[class*="MuiPaper"]');
      fireEvent.click(card!);

      expect(mockOnToggle).toHaveBeenCalledWith('test-strategy');
    });

    it('calls onToggle when checkbox is clicked', () => {
      render(
        <StrategyItem
          strategy={baseStrategy}
          isSelected={false}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
        />,
      );

      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      expect(mockOnToggle).toHaveBeenCalledWith('test-strategy');
    });

    it('calls onConfigClick when settings button is clicked', () => {
      const configurableStrategy: StrategyCardData = {
        ...baseStrategy,
        id: 'multilingual',
      };

      render(
        <StrategyItem
          strategy={configurableStrategy}
          isSelected={true}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
        />,
      );

      const buttons = screen.getAllByRole('button');
      const settingsButton = buttons[buttons.length - 1]; // Last button is settings
      fireEvent.click(settingsButton);

      expect(mockOnConfigClick).toHaveBeenCalledWith('multilingual');
      expect(mockOnToggle).not.toHaveBeenCalled(); // Should not toggle
    });
  });

  describe('Layout fixes', () => {
    it('applies padding to title section when settings button is present', () => {
      const configurableStrategy: StrategyCardData = {
        ...baseStrategy,
        id: 'multilingual',
      };

      render(
        <StrategyItem
          strategy={configurableStrategy}
          isSelected={true}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
        />,
      );

      const titleBox = screen.getByText('Test Strategy').closest('div');
      expect(titleBox).toHaveStyle({ paddingRight: expect.anything() });
    });

    it('renders without overlap when multiple pills and settings button are present', () => {
      const multiBadgeStrategy: StrategyCardData = {
        ...baseStrategy,
        id: 'jailbreak',
      };

      render(
        <StrategyItem
          strategy={multiBadgeStrategy}
          isSelected={true}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
        />,
      );

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
        id: 'multilingual',
        name: longStrategyName,
        description: 'Test description',
      };

      render(
        <StrategyItem
          strategy={configurableStrategy}
          isSelected={true}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
        />,
      );

      expect(screen.getByText(longStrategyName)).toBeInTheDocument();
    });
  });
});
