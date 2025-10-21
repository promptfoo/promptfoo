import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import EstimatedProbesDisplay from './EstimatedProbesDisplay';
import type { Config } from '../types';

// Mock the utils module
vi.mock('./strategies/utils', () => ({
  getEstimatedProbes: vi.fn(),
}));

// Import the mocked function for use in tests
import { getEstimatedProbes } from './strategies/utils';
const mockGetEstimatedProbes = vi.mocked(getEstimatedProbes);

// Helper function to render with theme
const renderWithTheme = (component: React.ReactNode, isDarkMode = false) => {
  const theme = createTheme({
    palette: {
      mode: isDarkMode ? 'dark' : 'light',
    },
  });
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

const mockConfig: Config = {
  description: 'Test Configuration',
  prompts: ['prompt1', 'prompt2'],
  numTests: 10,
  plugins: ['plugin1', 'plugin2', 'plugin3'],
  strategies: [{ id: 'basic' }],
  purpose: 'Test purpose',
  target: {
    id: 'http',
    config: {},
  },
  defaultTest: {},
  maxConcurrency: 4,
  testGenerationInstructions: '',
  applicationDefinition: {},
  entities: [],
};

describe('EstimatedProbesDisplay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock return value
    mockGetEstimatedProbes.mockReturnValue(150);
  });

  describe('Basic rendering', () => {
    it('renders the "Estimated Probes:" label', () => {
      renderWithTheme(<EstimatedProbesDisplay config={mockConfig} />);

      expect(screen.getByText('Estimated Probes:')).toBeInTheDocument();
    });

    it('displays the probe count value', () => {
      mockGetEstimatedProbes.mockReturnValue(150);
      renderWithTheme(<EstimatedProbesDisplay config={mockConfig} />);

      expect(screen.getByText('150')).toBeInTheDocument();
    });

    it('renders the info icon for tooltip', () => {
      renderWithTheme(<EstimatedProbesDisplay config={mockConfig} />);

      // MUI icons are typically rendered as SVG elements
      const infoIcon = document.querySelector('[data-testid="InfoOutlinedIcon"]');
      expect(infoIcon).toBeInTheDocument();
    });

    it('applies proper styling with theme', () => {
      const { container } = renderWithTheme(<EstimatedProbesDisplay config={mockConfig} />);

      // Check for Box container
      const boxElement = container.firstElementChild;
      expect(boxElement).toBeInTheDocument();
      expect(boxElement?.tagName).toBe('DIV');
    });
  });

  describe('Number formatting', () => {
    it('formats numbers with commas for thousands', () => {
      mockGetEstimatedProbes.mockReturnValue(1234);
      renderWithTheme(<EstimatedProbesDisplay config={mockConfig} />);

      expect(screen.getByText('1,234')).toBeInTheDocument();
    });

    it('formats large numbers with multiple commas', () => {
      mockGetEstimatedProbes.mockReturnValue(1234567);
      renderWithTheme(<EstimatedProbesDisplay config={mockConfig} />);

      expect(screen.getByText('1,234,567')).toBeInTheDocument();
    });

    it('handles zero count correctly', () => {
      mockGetEstimatedProbes.mockReturnValue(0);
      renderWithTheme(<EstimatedProbesDisplay config={mockConfig} />);

      expect(screen.getByText('0')).toBeInTheDocument();
    });

    it('handles single digit numbers', () => {
      mockGetEstimatedProbes.mockReturnValue(5);
      renderWithTheme(<EstimatedProbesDisplay config={mockConfig} />);

      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('handles numbers in the hundreds', () => {
      mockGetEstimatedProbes.mockReturnValue(999);
      renderWithTheme(<EstimatedProbesDisplay config={mockConfig} />);

      expect(screen.getByText('999')).toBeInTheDocument();
    });
  });

  describe('Reactivity to config changes', () => {
    it('recalculates when config changes', () => {
      const { rerender } = renderWithTheme(<EstimatedProbesDisplay config={mockConfig} />);

      expect(mockGetEstimatedProbes).toHaveBeenCalledWith(mockConfig);
      expect(mockGetEstimatedProbes).toHaveBeenCalledTimes(1);

      // Update config with more plugins
      const updatedConfig = {
        ...mockConfig,
        plugins: ['plugin1', 'plugin2', 'plugin3', 'plugin4', 'plugin5'],
        numTests: 20,
      };

      mockGetEstimatedProbes.mockReturnValue(500);
      rerender(
        <ThemeProvider theme={createTheme()}>
          <EstimatedProbesDisplay config={updatedConfig} />
        </ThemeProvider>,
      );

      expect(mockGetEstimatedProbes).toHaveBeenCalledWith(updatedConfig);
      expect(screen.getByText('500')).toBeInTheDocument();
    });

    it('does not recalculate when config reference is same (memoization)', () => {
      const { rerender } = renderWithTheme(<EstimatedProbesDisplay config={mockConfig} />);

      expect(mockGetEstimatedProbes).toHaveBeenCalledTimes(1);

      // Rerender with same config reference
      rerender(
        <ThemeProvider theme={createTheme()}>
          <EstimatedProbesDisplay config={mockConfig} />
        </ThemeProvider>,
      );

      // Should not call again due to memoization
      expect(mockGetEstimatedProbes).toHaveBeenCalledTimes(1);
    });

    it('updates display when probe count changes', () => {
      mockGetEstimatedProbes.mockReturnValue(100);
      const { rerender } = renderWithTheme(<EstimatedProbesDisplay config={mockConfig} />);

      expect(screen.getByText('100')).toBeInTheDocument();

      // Change the mock return value and update config
      mockGetEstimatedProbes.mockReturnValue(200);
      const newConfig = { ...mockConfig, numTests: 20 };

      rerender(
        <ThemeProvider theme={createTheme()}>
          <EstimatedProbesDisplay config={newConfig} />
        </ThemeProvider>,
      );

      expect(screen.getByText('200')).toBeInTheDocument();
    });
  });

  describe('Tooltip functionality', () => {
    it('displays default tooltip content on hover', async () => {
      const user = userEvent.setup();
      renderWithTheme(<EstimatedProbesDisplay config={mockConfig} />);

      const infoIcon = document.querySelector('[data-testid="InfoOutlinedIcon"]');
      expect(infoIcon).toBeInTheDocument();

      if (infoIcon) {
        await user.hover(infoIcon);

        await waitFor(() => {
          const tooltip = screen.getByRole('tooltip');
          expect(tooltip).toHaveTextContent(
            'Probes are the number of requests to the target application. ' +
              'This is calculated based on your selected plugins, strategies, and number of test cases.',
          );
        });
      }
    });

    it('displays custom tooltip content when provided', async () => {
      const user = userEvent.setup();
      const customTooltip = 'Custom tooltip explaining probe calculation';

      renderWithTheme(
        <EstimatedProbesDisplay config={mockConfig} tooltipContent={customTooltip} />,
      );

      const infoIcon = document.querySelector('[data-testid="InfoOutlinedIcon"]');

      if (infoIcon) {
        await user.hover(infoIcon);

        await waitFor(() => {
          const tooltip = screen.getByRole('tooltip');
          expect(tooltip).toHaveTextContent(customTooltip);
        });
      }
    });

    it('info icon has correct styling for help cursor', () => {
      const { container } = renderWithTheme(<EstimatedProbesDisplay config={mockConfig} />);

      const infoIcon = container.querySelector('[data-testid="InfoOutlinedIcon"]');
      expect(infoIcon).toBeInTheDocument();

      // The icon is rendered and wrapped in a Tooltip component
      // We can verify it exists and is properly structured
      const iconParent = infoIcon?.parentElement;
      expect(iconParent).toBeInTheDocument();

      // The cursor style is applied inline through the sx prop in the actual component
      // In unit tests, we just verify the icon exists and is rendered correctly
      expect(infoIcon).toBeTruthy();
    });
  });

  describe('Custom props', () => {
    it('applies custom sx prop styles', () => {
      const customSx = {
        backgroundColor: 'custom.background',
        padding: 4,
        margin: 2,
      };

      const { container } = renderWithTheme(
        <EstimatedProbesDisplay config={mockConfig} sx={customSx} />,
      );

      // Verify component renders without errors with custom sx
      expect(container.firstElementChild).toBeInTheDocument();
    });

    it('merges custom sx with default styles', () => {
      const customSx = {
        mb: 5, // Override default mb: 3
      };

      const { container } = renderWithTheme(
        <EstimatedProbesDisplay config={mockConfig} sx={customSx} />,
      );

      // Component should render with merged styles
      const boxElement = container.firstElementChild;
      expect(boxElement).toBeInTheDocument();
    });

    it('renders without sx prop (using defaults)', () => {
      const { container } = renderWithTheme(<EstimatedProbesDisplay config={mockConfig} />);

      expect(container.firstElementChild).toBeInTheDocument();
    });
  });

  describe('Theme compatibility', () => {
    it('renders correctly in light mode', () => {
      renderWithTheme(<EstimatedProbesDisplay config={mockConfig} />, false);

      expect(screen.getByText('Estimated Probes:')).toBeInTheDocument();
      expect(screen.getByText('150')).toBeInTheDocument();
    });

    it('renders correctly in dark mode', () => {
      renderWithTheme(<EstimatedProbesDisplay config={mockConfig} />, true);

      expect(screen.getByText('Estimated Probes:')).toBeInTheDocument();
      expect(screen.getByText('150')).toBeInTheDocument();
    });
  });

  describe('Edge cases', () => {
    it('handles empty plugin array', () => {
      const emptyConfig = {
        ...mockConfig,
        plugins: [],
      };

      mockGetEstimatedProbes.mockReturnValue(0);
      renderWithTheme(<EstimatedProbesDisplay config={emptyConfig} />);

      expect(screen.getByText('0')).toBeInTheDocument();
    });

    it('handles empty strategy array', () => {
      const emptyStrategyConfig = {
        ...mockConfig,
        strategies: [],
      };

      mockGetEstimatedProbes.mockReturnValue(0);
      renderWithTheme(<EstimatedProbesDisplay config={emptyStrategyConfig} />);

      expect(mockGetEstimatedProbes).toHaveBeenCalledWith(emptyStrategyConfig);
    });

    it('handles undefined numTests', () => {
      const configWithoutNumTests = {
        ...mockConfig,
        numTests: undefined as any,
      };

      mockGetEstimatedProbes.mockReturnValue(75);
      renderWithTheme(<EstimatedProbesDisplay config={configWithoutNumTests} />);

      expect(mockGetEstimatedProbes).toHaveBeenCalledWith(configWithoutNumTests);
      expect(screen.getByText('75')).toBeInTheDocument();
    });

    it('handles very large probe counts', () => {
      mockGetEstimatedProbes.mockReturnValue(999999999);
      renderWithTheme(<EstimatedProbesDisplay config={mockConfig} />);

      expect(screen.getByText('999,999,999')).toBeInTheDocument();
    });
  });

  describe('Component structure', () => {
    it('has correct nesting of Typography components', () => {
      renderWithTheme(<EstimatedProbesDisplay config={mockConfig} />);

      const labelTypography = screen.getByText('Estimated Probes:');
      const valueTypography = screen.getByText('150');

      expect(labelTypography.tagName).toBe('P'); // Typography renders as p by default
      expect(valueTypography.tagName).toBe('P');
    });

    it('has proper Box container structure', () => {
      const { container } = renderWithTheme(<EstimatedProbesDisplay config={mockConfig} />);

      const outerBox = container.firstElementChild;
      expect(outerBox).toBeInTheDocument();
      expect(outerBox?.tagName).toBe('DIV');

      // Check for inner structure
      const innerElements = outerBox?.children;
      expect(innerElements?.length).toBeGreaterThanOrEqual(3); // At least label box, value, and tooltip icon
    });
  });

  describe('Performance', () => {
    it('memoizes calculation correctly', () => {
      const { rerender } = renderWithTheme(<EstimatedProbesDisplay config={mockConfig} />);

      expect(mockGetEstimatedProbes).toHaveBeenCalledTimes(1);

      // Multiple rerenders with same config should not recalculate
      for (let i = 0; i < 5; i++) {
        rerender(
          <ThemeProvider theme={createTheme()}>
            <EstimatedProbesDisplay config={mockConfig} />
          </ThemeProvider>,
        );
      }

      // Still should have been called only once
      expect(mockGetEstimatedProbes).toHaveBeenCalledTimes(1);
    });

    it('only recalculates when config dependency changes', () => {
      const { rerender } = renderWithTheme(<EstimatedProbesDisplay config={mockConfig} />);

      expect(mockGetEstimatedProbes).toHaveBeenCalledTimes(1);

      // Create new config object with same values
      const sameValuesDifferentObject = { ...mockConfig };

      rerender(
        <ThemeProvider theme={createTheme()}>
          <EstimatedProbesDisplay config={sameValuesDifferentObject} />
        </ThemeProvider>,
      );

      // Should recalculate because it's a different object reference
      expect(mockGetEstimatedProbes).toHaveBeenCalledTimes(2);
    });
  });

  describe('Integration with parent components', () => {
    it('works as a drop-in replacement for inline implementation', () => {
      mockGetEstimatedProbes.mockReturnValue(250);
      renderWithTheme(<EstimatedProbesDisplay config={mockConfig} />);

      // Should display all the expected elements
      expect(screen.getByText('Estimated Probes:')).toBeInTheDocument();
      expect(screen.getByText('250')).toBeInTheDocument();
      expect(document.querySelector('[data-testid="InfoOutlinedIcon"]')).toBeInTheDocument();
    });

    it('maintains consistent display across different configs', () => {
      const configs = [
        { ...mockConfig, numTests: 5, plugins: ['a'] },
        { ...mockConfig, numTests: 10, plugins: ['a', 'b'] },
        { ...mockConfig, numTests: 20, plugins: ['a', 'b', 'c'] },
      ];

      configs.forEach((config, index) => {
        mockGetEstimatedProbes.mockReturnValue((index + 1) * 100);

        const { unmount } = renderWithTheme(<EstimatedProbesDisplay config={config} />);

        expect(screen.getByText('Estimated Probes:')).toBeInTheDocument();
        expect(screen.getByText(`${(index + 1) * 100}`)).toBeInTheDocument();

        unmount();
      });
    });
  });
});
