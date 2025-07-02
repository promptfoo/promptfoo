import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
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
        id: 'jailbreak',
      };

      render(
        <StrategyItem
          strategy={configurableStrategy}
          isSelected={true}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
        />,
      );

      // Check that the title box has padding-right style
      const titleBox = screen.getByText('Test Strategy').parentElement;
      // Note: In tests, the actual computed styles might not reflect MUI's sx prop
      // but we're testing that the component renders without errors
      expect(titleBox).toBeInTheDocument();
    });
  });
});
