import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { TestCaseGenerateButton, TestCaseDialog } from './TestCaseDialog';
import type { DefinedUseQueryResult } from '@tanstack/react-query';
import type { ApiHealthResult } from '@app/hooks/useApiHealth';

vi.mock('@app/hooks/useApiHealth', () => ({
  useApiHealth: vi.fn(
    () =>
      ({
        data: { status: 'connected', message: null },
        refetch: vi.fn(),
        isLoading: false,
      }) as unknown as DefinedUseQueryResult<ApiHealthResult, Error>,
  ),
}));

import { useApiHealth } from '@app/hooks/useApiHealth';

const mockUseApiHealth = useApiHealth as unknown as Mock;

// Helper function to render with theme
const renderWithTheme = (component: React.ReactNode) => {
  const theme = createTheme();
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('TestCaseGenerateButton', () => {
  const mockOnClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseApiHealth.mockReturnValue({
      data: { status: 'connected', message: null },
      refetch: vi.fn(),
      isLoading: false,
    });
  });

  describe('Controlled tooltip functionality', () => {
    it('should not render tooltip initially', () => {
      renderWithTheme(<TestCaseGenerateButton onClick={mockOnClick} tooltipTitle="Test tooltip" />);

      const tooltip = screen.queryByRole('tooltip');
      expect(tooltip).not.toBeInTheDocument();
    });

    it('should show tooltip on mouse enter', async () => {
      const user = userEvent.setup();
      renderWithTheme(<TestCaseGenerateButton onClick={mockOnClick} tooltipTitle="Test tooltip" />);

      const iconButton = screen.getByRole('button');
      await user.hover(iconButton);

      await waitFor(() => {
        const tooltip = screen.getByRole('tooltip');
        expect(tooltip).toBeInTheDocument();
        expect(tooltip).toHaveTextContent('Test tooltip');
      });
    });

    it('should hide tooltip on mouse leave', async () => {
      const user = userEvent.setup();
      renderWithTheme(<TestCaseGenerateButton onClick={mockOnClick} tooltipTitle="Test tooltip" />);

      const iconButton = screen.getByRole('button');
      await user.hover(iconButton);

      await waitFor(() => {
        expect(screen.getByRole('tooltip')).toBeInTheDocument();
      });

      await user.unhover(iconButton);

      await waitFor(() => {
        const tooltip = screen.queryByRole('tooltip');
        expect(tooltip).not.toBeInTheDocument();
      });
    });

    it('should hide tooltip when button is clicked', async () => {
      const user = userEvent.setup();
      renderWithTheme(<TestCaseGenerateButton onClick={mockOnClick} tooltipTitle="Test tooltip" />);

      const iconButton = screen.getByRole('button');
      await user.hover(iconButton);

      await waitFor(() => {
        expect(screen.getByRole('tooltip')).toBeInTheDocument();
      });

      await user.click(iconButton);

      await waitFor(() => {
        const tooltip = screen.queryByRole('tooltip');
        expect(tooltip).not.toBeInTheDocument();
      });

      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it('should display default tooltip title when tooltipTitle prop is not provided', async () => {
      const user = userEvent.setup();
      renderWithTheme(<TestCaseGenerateButton onClick={mockOnClick} />);

      const iconButton = screen.getByRole('button');
      await user.hover(iconButton);

      await waitFor(() => {
        const tooltip = screen.getByRole('tooltip');
        expect(tooltip).toHaveTextContent('Generate test case');
      });
    });

    it('should display "Requires Promptfoo Cloud connection" tooltip when API is not connected', async () => {
      const user = userEvent.setup();
      mockUseApiHealth.mockReturnValue({
        data: { status: 'disconnected', message: null },
        refetch: vi.fn(),
        isLoading: false,
      });

      renderWithTheme(
        <TestCaseGenerateButton onClick={mockOnClick} tooltipTitle="Custom tooltip" />,
      );

      const iconButton = screen.getByRole('button');
      expect(iconButton).toBeDisabled();

      // The button is wrapped in a span, so we can hover over the span to trigger the tooltip
      const spanWrapper = iconButton.parentElement;
      expect(spanWrapper).toBeInTheDocument();
      expect(spanWrapper?.tagName).toBe('SPAN');

      await user.hover(spanWrapper!);

      await waitFor(() => {
        const tooltip = screen.getByRole('tooltip');
        expect(tooltip).toHaveTextContent('Requires Promptfoo Cloud connection');
      });
    });

    it('should maintain tooltip state independently across multiple hover/unhover cycles', async () => {
      const user = userEvent.setup();
      renderWithTheme(<TestCaseGenerateButton onClick={mockOnClick} tooltipTitle="Test tooltip" />);

      const iconButton = screen.getByRole('button');

      // First hover cycle
      await user.hover(iconButton);
      await waitFor(() => {
        expect(screen.getByRole('tooltip')).toBeInTheDocument();
      });

      await user.unhover(iconButton);
      await waitFor(() => {
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
      });

      // Second hover cycle
      await user.hover(iconButton);
      await waitFor(() => {
        expect(screen.getByRole('tooltip')).toBeInTheDocument();
      });

      await user.unhover(iconButton);
      await waitFor(() => {
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
      });
    });

    it('should close tooltip via onClose handler when clicking outside', async () => {
      const user = userEvent.setup();
      renderWithTheme(
        <div>
          <div data-testid="outside-element">Outside element</div>
          <TestCaseGenerateButton onClick={mockOnClick} tooltipTitle="Test tooltip" />
        </div>,
      );

      const iconButton = screen.getByRole('button');
      await user.hover(iconButton);

      await waitFor(() => {
        expect(screen.getByRole('tooltip')).toBeInTheDocument();
      });

      // Click outside the button, which should trigger Tooltip's onClose handler
      const outsideElement = screen.getByTestId('outside-element');
      await user.click(outsideElement);

      await waitFor(() => {
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
      });
    });
  });

  describe('Button interactions', () => {
    it('should call onClick handler when button is clicked', async () => {
      const user = userEvent.setup();
      renderWithTheme(<TestCaseGenerateButton onClick={mockOnClick} />);

      const iconButton = screen.getByRole('button');
      await user.click(iconButton);

      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it('should be disabled when disabled prop is true', () => {
      renderWithTheme(<TestCaseGenerateButton onClick={mockOnClick} disabled={true} />);

      const iconButton = screen.getByRole('button');
      expect(iconButton).toBeDisabled();
    });

    it('should be disabled when API is not connected', () => {
      mockUseApiHealth.mockReturnValue({
        data: { status: 'disconnected', message: null },
        refetch: vi.fn(),
        isLoading: false,
      });

      renderWithTheme(<TestCaseGenerateButton onClick={mockOnClick} />);

      const iconButton = screen.getByRole('button');
      expect(iconButton).toBeDisabled();
    });
  });
});

describe('TestCaseDialog', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    plugin: { id: 'harmful:hate', config: {}, isStatic: false },
    strategy: { id: 'basic', config: {}, isStatic: false },
    isGenerating: false,
    generatedTestCases: [{ prompt: 'Test prompt', context: 'Test context' }],
    targetResponses: [],
    isRunningTest: false,
    onRegenerate: vi.fn(),
    onContinue: vi.fn(),
    currentTurn: 0,
    maxTurns: 1,
    availablePlugins: ['harmful:hate', 'harmful:violence', 'pii'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseApiHealth.mockReturnValue({
      data: { status: 'connected', message: null },
      refetch: vi.fn(),
      isLoading: false,
    });
  });

  describe('allowPluginChange prop', () => {
    it('should NOT show strategy chip when allowPluginChange is false', () => {
      renderWithTheme(<TestCaseDialog {...defaultProps} allowPluginChange={false} />);

      expect(screen.queryByTestId('strategy-chip')).not.toBeInTheDocument();
    });

    it('should show strategy chip when allowPluginChange is true', () => {
      renderWithTheme(<TestCaseDialog {...defaultProps} allowPluginChange={true} />);

      expect(screen.getByTestId('strategy-chip')).toBeInTheDocument();
      expect(screen.getByTestId('strategy-chip')).toHaveTextContent('Strategy: Baseline Testing');
    });

    it('should show static plugin chip when allowPluginChange is false', () => {
      renderWithTheme(<TestCaseDialog {...defaultProps} allowPluginChange={false} />);

      const pluginChip = screen.getByTestId('plugin-chip');
      expect(pluginChip).toBeInTheDocument();
      expect(pluginChip).toHaveTextContent('Plugin: Hate Speech');
      // Should not have a dropdown arrow
      expect(pluginChip.querySelector('svg')).toBeNull();
    });

    it('should show clickable plugin chip with dropdown when allowPluginChange is true', async () => {
      const user = userEvent.setup();
      renderWithTheme(<TestCaseDialog {...defaultProps} allowPluginChange={true} />);

      const pluginChip = screen.getByTestId('plugin-chip');
      expect(pluginChip).toBeInTheDocument();
      expect(pluginChip).toHaveTextContent('Plugin: Hate Speech');

      // Click the chip to open the popover
      await user.click(pluginChip);

      // Popover should appear with plugin selector
      await waitFor(() => {
        expect(screen.getByLabelText('Select Plugin')).toBeInTheDocument();
      });
    });

    it('should show dropdown arrow icon when allowPluginChange is true', () => {
      renderWithTheme(<TestCaseDialog {...defaultProps} allowPluginChange={true} />);

      const pluginChip = screen.getByTestId('plugin-chip');
      // Check for the ArrowDropDownIcon (SVG element)
      const svg = pluginChip.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });
  });
});
