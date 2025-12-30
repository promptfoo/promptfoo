import { TooltipProvider } from '@app/components/ui/tooltip';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EstimatedProbesDisplay from './EstimatedProbesDisplay';

import type { Config } from '../types';

// Helper to render with TooltipProvider (required for Radix Tooltip)
const renderWithProviders = (ui: React.ReactElement) => {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
};

// Mock the utils module
vi.mock('./strategies/utils', () => ({
  getEstimatedProbes: vi.fn(),
}));

// Import the mocked function for use in tests
import { getEstimatedProbes } from './strategies/utils';

const mockGetEstimatedProbes = vi.mocked(getEstimatedProbes);

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
      renderWithProviders(<EstimatedProbesDisplay config={mockConfig} />);

      expect(screen.getByText('Estimated Probes:')).toBeInTheDocument();
    });

    it('displays the probe count value', () => {
      mockGetEstimatedProbes.mockReturnValue(150);
      renderWithProviders(<EstimatedProbesDisplay config={mockConfig} />);

      expect(screen.getByText('150')).toBeInTheDocument();
    });

    it('renders the info icon for tooltip', () => {
      renderWithProviders(<EstimatedProbesDisplay config={mockConfig} />);

      // Lucide icons render as SVG elements with lucide class
      const infoIcon = document.querySelector('svg.lucide-info');
      expect(infoIcon).toBeInTheDocument();
    });

    it('applies proper styling', () => {
      const { container } = renderWithProviders(<EstimatedProbesDisplay config={mockConfig} />);

      // Check for container
      const boxElement = container.firstElementChild;
      expect(boxElement).toBeInTheDocument();
      expect(boxElement?.tagName).toBe('DIV');
    });
  });

  describe('Number formatting', () => {
    it('formats numbers with commas for thousands', () => {
      mockGetEstimatedProbes.mockReturnValue(1234);
      renderWithProviders(<EstimatedProbesDisplay config={mockConfig} />);

      expect(screen.getByText('1,234')).toBeInTheDocument();
    });

    it('formats large numbers with multiple commas', () => {
      mockGetEstimatedProbes.mockReturnValue(1234567);
      renderWithProviders(<EstimatedProbesDisplay config={mockConfig} />);

      expect(screen.getByText('1,234,567')).toBeInTheDocument();
    });

    it('handles zero count correctly', () => {
      mockGetEstimatedProbes.mockReturnValue(0);
      renderWithProviders(<EstimatedProbesDisplay config={mockConfig} />);

      expect(screen.getByText('0')).toBeInTheDocument();
    });

    it('handles single digit numbers', () => {
      mockGetEstimatedProbes.mockReturnValue(5);
      renderWithProviders(<EstimatedProbesDisplay config={mockConfig} />);

      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('handles numbers in the hundreds', () => {
      mockGetEstimatedProbes.mockReturnValue(999);
      renderWithProviders(<EstimatedProbesDisplay config={mockConfig} />);

      expect(screen.getByText('999')).toBeInTheDocument();
    });
  });

  describe('Reactivity to config changes', () => {
    it('recalculates when config changes', () => {
      const { rerender } = renderWithProviders(<EstimatedProbesDisplay config={mockConfig} />);

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
        <TooltipProvider>
          <EstimatedProbesDisplay config={updatedConfig} />
        </TooltipProvider>,
      );

      expect(mockGetEstimatedProbes).toHaveBeenCalledWith(updatedConfig);
      expect(screen.getByText('500')).toBeInTheDocument();
    });

    it('does not recalculate when config reference is same (memoization)', () => {
      const { rerender } = renderWithProviders(<EstimatedProbesDisplay config={mockConfig} />);

      expect(mockGetEstimatedProbes).toHaveBeenCalledTimes(1);

      // Rerender with same config reference
      rerender(
        <TooltipProvider>
          <EstimatedProbesDisplay config={mockConfig} />
        </TooltipProvider>,
      );

      // Should not call again due to memoization
      expect(mockGetEstimatedProbes).toHaveBeenCalledTimes(1);
    });

    it('updates display when probe count changes', () => {
      mockGetEstimatedProbes.mockReturnValue(100);
      const { rerender } = renderWithProviders(<EstimatedProbesDisplay config={mockConfig} />);

      expect(screen.getByText('100')).toBeInTheDocument();

      // Change the mock return value and update config
      mockGetEstimatedProbes.mockReturnValue(200);
      const newConfig = { ...mockConfig, numTests: 20 };

      rerender(
        <TooltipProvider>
          <EstimatedProbesDisplay config={newConfig} />
        </TooltipProvider>,
      );

      expect(screen.getByText('200')).toBeInTheDocument();
    });
  });

  describe('Tooltip functionality', () => {
    it('displays default tooltip content on hover', async () => {
      const user = userEvent.setup();
      renderWithProviders(<EstimatedProbesDisplay config={mockConfig} />);

      const infoIcon = document.querySelector('svg.lucide-info');
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

      renderWithProviders(
        <EstimatedProbesDisplay config={mockConfig} tooltipContent={customTooltip} />,
      );

      const infoIcon = document.querySelector('svg.lucide-info');

      if (infoIcon) {
        await user.hover(infoIcon);

        await waitFor(() => {
          const tooltip = screen.getByRole('tooltip');
          expect(tooltip).toHaveTextContent(customTooltip);
        });
      }
    });

    it('info icon is rendered correctly', () => {
      const { container } = renderWithProviders(<EstimatedProbesDisplay config={mockConfig} />);

      const infoIcon = container.querySelector('svg.lucide-info');
      expect(infoIcon).toBeInTheDocument();

      // The icon should be wrapped in a tooltip trigger
      expect(infoIcon).toBeTruthy();
    });
  });

  describe('Custom props', () => {
    it('applies custom className prop', () => {
      const customClassName = 'custom-class test-class';

      const { container } = renderWithProviders(
        <EstimatedProbesDisplay config={mockConfig} className={customClassName} />,
      );

      // Verify component renders with custom class
      expect(container.firstElementChild).toHaveClass('custom-class');
      expect(container.firstElementChild).toHaveClass('test-class');
    });

    it('renders without className prop (using defaults)', () => {
      const { container } = renderWithProviders(<EstimatedProbesDisplay config={mockConfig} />);

      expect(container.firstElementChild).toBeInTheDocument();
    });
  });

  describe('Edge cases', () => {
    it('handles empty plugin array', () => {
      const emptyConfig = {
        ...mockConfig,
        plugins: [],
      };

      mockGetEstimatedProbes.mockReturnValue(0);
      renderWithProviders(<EstimatedProbesDisplay config={emptyConfig} />);

      expect(screen.getByText('0')).toBeInTheDocument();
    });

    it('handles empty strategy array', () => {
      const emptyStrategyConfig = {
        ...mockConfig,
        strategies: [],
      };

      mockGetEstimatedProbes.mockReturnValue(0);
      renderWithProviders(<EstimatedProbesDisplay config={emptyStrategyConfig} />);

      expect(mockGetEstimatedProbes).toHaveBeenCalledWith(emptyStrategyConfig);
    });

    it('handles undefined numTests', () => {
      const configWithoutNumTests = {
        ...mockConfig,
        numTests: undefined as any,
      };

      mockGetEstimatedProbes.mockReturnValue(75);
      renderWithProviders(<EstimatedProbesDisplay config={configWithoutNumTests} />);

      expect(mockGetEstimatedProbes).toHaveBeenCalledWith(configWithoutNumTests);
      expect(screen.getByText('75')).toBeInTheDocument();
    });

    it('handles very large probe counts', () => {
      mockGetEstimatedProbes.mockReturnValue(999999999);
      renderWithProviders(<EstimatedProbesDisplay config={mockConfig} />);

      expect(screen.getByText('999,999,999')).toBeInTheDocument();
    });
  });

  describe('Component structure', () => {
    it('has correct nesting of text elements', () => {
      renderWithProviders(<EstimatedProbesDisplay config={mockConfig} />);

      const labelElement = screen.getByText('Estimated Probes:');
      const valueElement = screen.getByText('150');

      expect(labelElement.tagName).toBe('SPAN');
      expect(valueElement.tagName).toBe('SPAN');
    });

    it('has proper container structure', () => {
      const { container } = renderWithProviders(<EstimatedProbesDisplay config={mockConfig} />);

      const outerBox = container.firstElementChild;
      expect(outerBox).toBeInTheDocument();
      expect(outerBox?.tagName).toBe('DIV');

      // Check for inner structure - label, value, and tooltip icon
      const innerElements = outerBox?.children;
      expect(innerElements?.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Performance', () => {
    it('memoizes calculation correctly', () => {
      const { rerender } = renderWithProviders(<EstimatedProbesDisplay config={mockConfig} />);

      expect(mockGetEstimatedProbes).toHaveBeenCalledTimes(1);

      // Multiple rerenders with same config should not recalculate
      for (let i = 0; i < 5; i++) {
        rerender(
          <TooltipProvider>
            <EstimatedProbesDisplay config={mockConfig} />
          </TooltipProvider>,
        );
      }

      // Still should have been called only once
      expect(mockGetEstimatedProbes).toHaveBeenCalledTimes(1);
    });

    it('only recalculates when config dependency changes', () => {
      const { rerender } = renderWithProviders(<EstimatedProbesDisplay config={mockConfig} />);

      expect(mockGetEstimatedProbes).toHaveBeenCalledTimes(1);

      // Create new config object with same values
      const sameValuesDifferentObject = { ...mockConfig };

      rerender(
        <TooltipProvider>
          <EstimatedProbesDisplay config={sameValuesDifferentObject} />
        </TooltipProvider>,
      );

      // Should recalculate because it's a different object reference
      expect(mockGetEstimatedProbes).toHaveBeenCalledTimes(2);
    });
  });

  describe('Integration with parent components', () => {
    it('works as a drop-in replacement for inline implementation', () => {
      mockGetEstimatedProbes.mockReturnValue(250);
      renderWithProviders(<EstimatedProbesDisplay config={mockConfig} />);

      // Should display all the expected elements
      expect(screen.getByText('Estimated Probes:')).toBeInTheDocument();
      expect(screen.getByText('250')).toBeInTheDocument();
      expect(document.querySelector('svg.lucide-info')).toBeInTheDocument();
    });

    it('maintains consistent display across different configs', () => {
      const configs = [
        { ...mockConfig, numTests: 5, plugins: ['a'] },
        { ...mockConfig, numTests: 10, plugins: ['a', 'b'] },
        { ...mockConfig, numTests: 20, plugins: ['a', 'b', 'c'] },
      ];

      configs.forEach((config, index) => {
        mockGetEstimatedProbes.mockReturnValue((index + 1) * 100);

        const { unmount } = renderWithProviders(<EstimatedProbesDisplay config={config} />);

        expect(screen.getByText('Estimated Probes:')).toBeInTheDocument();
        expect(screen.getByText(`${(index + 1) * 100}`)).toBeInTheDocument();

        unmount();
      });
    });
  });
});
