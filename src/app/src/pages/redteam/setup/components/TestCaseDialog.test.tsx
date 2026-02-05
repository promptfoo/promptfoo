import { TooltipProvider } from '@app/components/ui/tooltip';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { TestCaseDialog, TestCaseGenerateButton } from './TestCaseDialog';
import type { ApiHealthResult } from '@app/hooks/useApiHealth';
import type { DefinedUseQueryResult } from '@tanstack/react-query';

// Helper to render with TooltipProvider
const renderWithTooltipProvider = (ui: React.ReactElement) => {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
};

// Alias for tests that use renderWithTheme
const renderWithTheme = renderWithTooltipProvider;

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
      renderWithTooltipProvider(
        <TestCaseGenerateButton onClick={mockOnClick} tooltipTitle="Test tooltip" />,
      );

      const tooltip = screen.queryByRole('tooltip');
      expect(tooltip).not.toBeInTheDocument();
    });

    it('should show tooltip on mouse enter', async () => {
      const user = userEvent.setup();
      renderWithTooltipProvider(
        <TestCaseGenerateButton onClick={mockOnClick} tooltipTitle="Test tooltip" />,
      );

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
      renderWithTooltipProvider(
        <TestCaseGenerateButton onClick={mockOnClick} tooltipTitle="Test tooltip" />,
      );

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
      renderWithTooltipProvider(
        <TestCaseGenerateButton onClick={mockOnClick} tooltipTitle="Test tooltip" />,
      );

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
      renderWithTooltipProvider(<TestCaseGenerateButton onClick={mockOnClick} />);

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

      renderWithTooltipProvider(
        <TestCaseGenerateButton onClick={mockOnClick} tooltipTitle="Custom tooltip" />,
      );

      const iconButton = screen.getByRole('button');
      expect(iconButton).toBeDisabled();

      // Hover the button directly to trigger the tooltip
      await user.hover(iconButton);

      await waitFor(() => {
        const tooltip = screen.getByRole('tooltip');
        expect(tooltip).toHaveTextContent('Requires Promptfoo Cloud connection');
      });
    });

    it('should maintain tooltip state independently across multiple hover/unhover cycles', async () => {
      const user = userEvent.setup();
      renderWithTooltipProvider(
        <TestCaseGenerateButton onClick={mockOnClick} tooltipTitle="Test tooltip" />,
      );

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
      renderWithTooltipProvider(
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
      renderWithTooltipProvider(<TestCaseGenerateButton onClick={mockOnClick} />);

      const iconButton = screen.getByRole('button');
      await user.click(iconButton);

      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it('should be disabled when disabled prop is true', () => {
      renderWithTooltipProvider(<TestCaseGenerateButton onClick={mockOnClick} disabled={true} />);

      const iconButton = screen.getByRole('button');
      expect(iconButton).toBeDisabled();
    });

    it('should be disabled when API is not connected', () => {
      mockUseApiHealth.mockReturnValue({
        data: { status: 'disconnected', message: null },
        refetch: vi.fn(),
        isLoading: false,
      });

      renderWithTooltipProvider(<TestCaseGenerateButton onClick={mockOnClick} />);

      const iconButton = screen.getByRole('button');
      expect(iconButton).toBeDisabled();
    });
  });
});

describe('TestCaseDialog', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    plugin: { id: 'harmful:hate' as const, config: {}, isStatic: false },
    strategy: { id: 'basic' as const, config: {}, isStatic: false },
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
    it('should NOT show strategy label when allowPluginChange is false', () => {
      renderWithTheme(<TestCaseDialog {...defaultProps} allowPluginChange={false} />);

      expect(screen.queryByTestId('strategy-chip')).not.toBeInTheDocument();
    });

    it('should show strategy name as title when allowPluginChange is true', () => {
      renderWithTheme(<TestCaseDialog {...defaultProps} allowPluginChange={true} />);

      expect(screen.getByTestId('strategy-chip')).toBeInTheDocument();
      expect(screen.getByTestId('strategy-chip')).toHaveTextContent('Strategy Preview');
      // Strategy name should be in the dialog title
      expect(screen.getByText('Baseline Testing')).toBeInTheDocument();
    });

    it('should show plugin name as title when allowPluginChange is false', () => {
      renderWithTheme(<TestCaseDialog {...defaultProps} allowPluginChange={false} />);

      const pluginLabel = screen.getByTestId('plugin-chip');
      expect(pluginLabel).toBeInTheDocument();
      expect(pluginLabel).toHaveTextContent('Plugin Preview');
      // Plugin name should be in the dialog title
      expect(screen.getByText('Hate Speech')).toBeInTheDocument();
    });

    it('should show plugin dropdown when allowPluginChange is true', async () => {
      renderWithTheme(<TestCaseDialog {...defaultProps} allowPluginChange={true} />);

      // Plugin dropdown should be directly visible (not behind a popover)
      expect(screen.getByTestId('plugin-dropdown')).toBeInTheDocument();
    });

    it('should NOT show plugin dropdown when allowPluginChange is false', () => {
      renderWithTheme(<TestCaseDialog {...defaultProps} allowPluginChange={false} />);

      expect(screen.queryByTestId('plugin-dropdown')).not.toBeInTheDocument();
    });
  });

  describe('targetResponses output handling', () => {
    it('should render string output directly', () => {
      renderWithTheme(
        <TestCaseDialog
          {...defaultProps}
          targetResponses={[{ output: 'Hello from assistant', error: null }]}
        />,
      );

      expect(screen.getByText('Hello from assistant')).toBeInTheDocument();
    });

    it('should JSON stringify object output', () => {
      renderWithTheme(
        <TestCaseDialog
          {...defaultProps}
          targetResponses={[
            { output: { response: 'some text' } as unknown as string, error: null },
          ]}
        />,
      );

      expect(screen.getByText('{"response":"some text"}')).toBeInTheDocument();
    });

    it('should show error message when output is null', () => {
      renderWithTheme(
        <TestCaseDialog
          {...defaultProps}
          targetResponses={[{ output: null, error: 'Connection failed' }]}
        />,
      );

      expect(screen.getByText('Connection failed')).toBeInTheDocument();
    });

    it('should show fallback message when output and error are null', () => {
      renderWithTheme(
        <TestCaseDialog {...defaultProps} targetResponses={[{ output: null, error: null }]} />,
      );

      expect(screen.getByText('No response from target')).toBeInTheDocument();
    });
  });
});
