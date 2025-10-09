import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { StrategyItem } from './StrategyItem';

import type { StrategyCardData } from './types';

describe('StrategyItem', () => {
  const mockOnToggle = vi.fn();
  const mockOnConfigClick = vi.fn();
  const mockOnGenerateTest = vi.fn();

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

  describe('Magic Wand Button', () => {
    it('renders magic wand button when onGenerateTest is provided', () => {
      render(
        <StrategyItem
          strategy={baseStrategy}
          isSelected={false}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onGenerateTest={mockOnGenerateTest}
          isCloudEnabled={true}
        />,
      );

      // Magic wand button should be present
      const buttons = screen.getAllByRole('button');
      // Should have one button (magic wand) - no settings since not selected
      expect(buttons).toHaveLength(1);
    });

    it('does not render magic wand button when onGenerateTest is not provided', () => {
      render(
        <StrategyItem
          strategy={baseStrategy}
          isSelected={false}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
        />,
      );

      // No buttons should be present (no magic wand, no settings)
      const buttons = screen.queryAllByRole('button');
      expect(buttons).toHaveLength(0);
    });

    it('shows loading spinner when isGenerating is true', () => {
      render(
        <StrategyItem
          strategy={baseStrategy}
          isSelected={false}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onGenerateTest={mockOnGenerateTest}
          isGenerating={true}
          isCloudEnabled={true}
        />,
      );

      // Check for CircularProgress (loading spinner)
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('disables magic wand button when generating', () => {
      render(
        <StrategyItem
          strategy={baseStrategy}
          isSelected={false}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onGenerateTest={mockOnGenerateTest}
          isGenerating={true}
          isCloudEnabled={true}
        />,
      );

      const buttons = screen.getAllByRole('button');
      const magicWandButton = buttons[0];
      expect(magicWandButton).toBeDisabled();
    });

    it('calls onGenerateTest when magic wand button is clicked', () => {
      render(
        <StrategyItem
          strategy={baseStrategy}
          isSelected={false}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onGenerateTest={mockOnGenerateTest}
          isCloudEnabled={true}
        />,
      );

      const buttons = screen.getAllByRole('button');
      const magicWandButton = buttons[0];
      fireEvent.click(magicWandButton);

      expect(mockOnGenerateTest).toHaveBeenCalledWith('test-strategy');
      expect(mockOnToggle).not.toHaveBeenCalled(); // Should not toggle
    });

    it('stops event propagation when magic wand is clicked', () => {
      render(
        <StrategyItem
          strategy={baseStrategy}
          isSelected={false}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onGenerateTest={mockOnGenerateTest}
          isCloudEnabled={true}
        />,
      );

      const buttons = screen.getAllByRole('button');
      const magicWandButton = buttons[0];

      // Click the magic wand button
      fireEvent.click(magicWandButton);

      // onToggle should NOT be called (event propagation stopped)
      expect(mockOnToggle).not.toHaveBeenCalled();
      // onGenerateTest should be called
      expect(mockOnGenerateTest).toHaveBeenCalledWith('test-strategy');
    });

    it('shows both magic wand and settings buttons when appropriate', () => {
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
          onGenerateTest={mockOnGenerateTest}
          isCloudEnabled={true}
        />,
      );

      // Should have two buttons: magic wand and settings
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(2);
    });

    it('shows tooltip for magic wand button', async () => {
      render(
        <StrategyItem
          strategy={baseStrategy}
          isSelected={false}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onGenerateTest={mockOnGenerateTest}
          isCloudEnabled={true}
        />,
      );

      const buttons = screen.getAllByRole('button');
      const magicWandButton = buttons[0];

      // The tooltip should contain the strategy name
      expect(magicWandButton).toHaveAttribute(
        'aria-label',
        expect.stringContaining('Generate a test case'),
      );
    });

    it('disables magic wand button when cloud is not enabled', () => {
      render(
        <StrategyItem
          strategy={baseStrategy}
          isSelected={false}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onGenerateTest={mockOnGenerateTest}
          isCloudEnabled={false}
        />,
      );

      const buttons = screen.getAllByRole('button');
      const magicWandButton = buttons[0];
      expect(magicWandButton).toBeDisabled();
    });

    it('shows appropriate tooltip when cloud is not enabled', () => {
      render(
        <StrategyItem
          strategy={baseStrategy}
          isSelected={false}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onGenerateTest={mockOnGenerateTest}
          isCloudEnabled={false}
        />,
      );

      const buttons = screen.getAllByRole('button');
      const magicWandButton = buttons[0];

      // Should show cloud connection message in tooltip
      expect(
        magicWandButton.parentElement?.getAttribute('title') ||
          magicWandButton.getAttribute('aria-label'),
      ).toContain('Connect to Promptfoo Cloud');
    });

    it('enables magic wand button when cloud is enabled', () => {
      render(
        <StrategyItem
          strategy={baseStrategy}
          isSelected={false}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onGenerateTest={mockOnGenerateTest}
          isCloudEnabled={true}
        />,
      );

      const buttons = screen.getAllByRole('button');
      const magicWandButton = buttons[0];
      expect(magicWandButton).not.toBeDisabled();
    });

    it('disables magic wand button when both generating and cloud is enabled', () => {
      render(
        <StrategyItem
          strategy={baseStrategy}
          isSelected={false}
          onToggle={mockOnToggle}
          onConfigClick={mockOnConfigClick}
          onGenerateTest={mockOnGenerateTest}
          isGenerating={true}
          isCloudEnabled={true}
        />,
      );

      const buttons = screen.getAllByRole('button');
      const magicWandButton = buttons[0];
      expect(magicWandButton).toBeDisabled();
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
