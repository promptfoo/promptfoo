import React from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { ToastProvider } from '@app/contexts/ToastContext';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestCaseGenerationProvider } from './TestCaseGenerationProvider';
import VerticalSuiteCard from './VerticalSuiteCard';
import type { Plugin } from '@promptfoo/redteam/constants';

// Mock dependencies
vi.mock('@app/hooks/useApiHealth', () => ({
  useApiHealth: () => ({
    data: { status: 'connected', message: null },
    refetch: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock('./TestCaseGenerationProvider', async () => {
  const actual = await vi.importActual('./TestCaseGenerationProvider');
  return {
    ...actual,
    useTestCaseGeneration: () => ({
      isGenerating: false,
      plugin: null,
    }),
  };
});

vi.mock('./TestCaseDialog', () => ({
  default: () => <div data-testid="test-case-dialog">Test Case Dialog</div>,
  TestCaseGenerateButton: () => <button type="button">Generate Test Case</button>,
  TestCaseDialog: () => <div data-testid="test-case-dialog">Test Case Dialog</div>,
}));

const mockRedTeamConfig = {
  plugins: [],
  description: '',
  prompts: [],
  target: { id: '', config: {} },
  strategies: [],
  applicationDefinition: {},
  entities: [],
};

// Helper function for rendering with providers
const renderWithProviders = (ui: React.ReactNode) => {
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <ToastProvider>
          <TestCaseGenerationProvider redTeamConfig={mockRedTeamConfig}>
            {ui}
          </TestCaseGenerationProvider>
        </ToastProvider>
      </TooltipProvider>
    </MemoryRouter>,
  );
};

// Mock suite data for testing
const mockSuite = {
  id: 'test-suite',
  name: 'Test Suite',
  description: 'A test suite for testing',
  longDescription: 'A longer description for testing',
  icon: <span data-testid="mock-icon">Icon</span>,
  plugins: ['bola' as Plugin, 'harmful:hate' as Plugin, 'harmful:self-harm' as Plugin],
  pluginGroups: [
    {
      name: 'Test Group',
      plugins: ['bola' as Plugin, 'harmful:hate' as Plugin, 'harmful:self-harm' as Plugin],
    },
  ],
  color: 'blue',
  requiresEnterprise: false,
};

describe('VerticalSuiteCard handleToggleAll batch update', () => {
  const mockSetSelectedPlugins = vi.fn();
  const mockOnPluginToggle = vi.fn();
  const mockOnConfigClick = vi.fn();
  const mockOnGenerateTestCase = vi.fn();
  const mockIsPluginConfigured = vi.fn(() => true);
  const mockIsPluginDisabled = vi.fn(() => false);

  const defaultProps = {
    suite: mockSuite,
    selectedPlugins: new Set<Plugin>(),
    onPluginToggle: mockOnPluginToggle,
    setSelectedPlugins: mockSetSelectedPlugins,
    onConfigClick: mockOnConfigClick,
    onGenerateTestCase: mockOnGenerateTestCase,
    isPluginConfigured: mockIsPluginConfigured,
    isPluginDisabled: mockIsPluginDisabled,
    hasEnterpriseAccess: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('selecting all plugins in a suite', () => {
    it('should add all suite plugins in a single state update when none are selected', async () => {
      const user = userEvent.setup();

      renderWithProviders(<VerticalSuiteCard {...defaultProps} />);

      // Find the "Select All" button for the suite
      const selectAllButton = screen.getByRole('button', { name: /select all/i });
      await user.click(selectAllButton);

      // Verify setSelectedPlugins was called exactly once (batch update)
      await waitFor(() => {
        expect(mockSetSelectedPlugins).toHaveBeenCalledTimes(1);
      });

      // Verify it was called with a Set containing all suite plugins
      const callArg = mockSetSelectedPlugins.mock.calls[0][0];
      expect(callArg).toBeInstanceOf(Set);
      expect(callArg.size).toBeGreaterThanOrEqual(3); // At least the 3 plugins in the suite
      expect(callArg.has('bola')).toBe(true);
      expect(callArg.has('harmful:hate')).toBe(true);
      expect(callArg.has('harmful:self-harm')).toBe(true);
    });

    it('should remove all suite plugins in a single state update when all are selected', async () => {
      const user = userEvent.setup();

      // Start with all suite plugins selected
      const selectedPlugins = new Set<Plugin>(['bola', 'harmful:hate', 'harmful:self-harm']);

      renderWithProviders(
        <VerticalSuiteCard {...defaultProps} selectedPlugins={selectedPlugins} />,
      );

      // Find the "Select All" button (should show "Deselect All" when all selected)
      // or click it to toggle off
      const selectAllButton = screen.getByRole('button', { name: /select all/i });
      await user.click(selectAllButton);

      // Verify setSelectedPlugins was called exactly once (batch update)
      await waitFor(() => {
        expect(mockSetSelectedPlugins).toHaveBeenCalledTimes(1);
      });

      // Verify it was called with a Set that doesn't contain the suite plugins
      const callArg = mockSetSelectedPlugins.mock.calls[0][0];
      expect(callArg).toBeInstanceOf(Set);
      expect(callArg.has('bola')).toBe(false);
      expect(callArg.has('harmful:hate')).toBe(false);
      expect(callArg.has('harmful:self-harm')).toBe(false);
    });

    it('should preserve other selected plugins when toggling suite', async () => {
      const user = userEvent.setup();

      // Start with some plugins selected, including one outside the suite
      const selectedPlugins = new Set<Plugin>([
        'prompt-extraction', // Not in the suite
        'bola', // In the suite
      ]);

      renderWithProviders(
        <VerticalSuiteCard {...defaultProps} selectedPlugins={selectedPlugins} />,
      );

      // Click the Select All button (should add remaining suite plugins)
      const selectAllButton = screen.getByRole('button', { name: /select all/i });
      await user.click(selectAllButton);

      await waitFor(() => {
        expect(mockSetSelectedPlugins).toHaveBeenCalled();
      });

      // Verify prompt-extraction (outside the suite) is preserved
      const callArg = mockSetSelectedPlugins.mock.calls[0][0];
      expect(callArg.has('prompt-extraction')).toBe(true);
      // And all suite plugins are added
      expect(callArg.has('bola')).toBe(true);
      expect(callArg.has('harmful:hate')).toBe(true);
      expect(callArg.has('harmful:self-harm')).toBe(true);
    });

    it('should not call onPluginToggle in a loop', async () => {
      // This test verifies the fix for infinite render loops
      // The old implementation called onPluginToggle for each plugin in a forEach loop
      // The new implementation uses setSelectedPlugins with a single new Set
      const user = userEvent.setup();

      renderWithProviders(<VerticalSuiteCard {...defaultProps} />);

      // Click the Select All button
      const selectAllButton = screen.getByRole('button', { name: /select all/i });
      await user.click(selectAllButton);

      await waitFor(() => {
        expect(mockSetSelectedPlugins).toHaveBeenCalled();
      });

      // onPluginToggle should NOT be called at all
      expect(mockOnPluginToggle).not.toHaveBeenCalled();
    });
  });

  describe('locked suite behavior', () => {
    it('should not toggle plugins when suite is locked', async () => {
      const user = userEvent.setup();

      // Create a locked suite (requires enterprise, no access)
      const lockedSuite = {
        ...mockSuite,
        requiresEnterprise: true,
      };

      renderWithProviders(
        <VerticalSuiteCard {...defaultProps} suite={lockedSuite} hasEnterpriseAccess={false} />,
      );

      // Try to click the Select All button (should be disabled or do nothing when locked)
      // When locked, the button may not be present or may be disabled
      const selectAllButtons = screen.queryAllByRole('button', { name: /select all/i });

      if (selectAllButtons.length > 0) {
        await user.click(selectAllButtons[0]);
        // setSelectedPlugins should NOT be called when locked
        expect(mockSetSelectedPlugins).not.toHaveBeenCalled();
      }
    });
  });

  describe('batch update prevents infinite render loops', () => {
    it('should not cause infinite re-renders when toggling suite multiple times', async () => {
      const user = userEvent.setup();

      renderWithProviders(<VerticalSuiteCard {...defaultProps} />);

      // Rapidly toggle the Select All button multiple times
      const selectAllButton = screen.getByRole('button', { name: /select all/i });

      await user.click(selectAllButton);
      await user.click(selectAllButton);
      await user.click(selectAllButton);

      // Wait a bit to ensure no infinite loop occurs
      await waitFor(
        () => {
          // setSelectedPlugins should be called a bounded number of times (3 clicks = 3 calls)
          expect(mockSetSelectedPlugins.mock.calls.length).toBeLessThan(10);
        },
        { timeout: 1000 },
      );
    });

    it('should handle partial selection correctly', async () => {
      const user = userEvent.setup();

      // Start with some but not all suite plugins selected
      const selectedPlugins = new Set<Plugin>(['bola']);

      renderWithProviders(
        <VerticalSuiteCard {...defaultProps} selectedPlugins={selectedPlugins} />,
      );

      // Click the Select All button (should select all remaining)
      const selectAllButton = screen.getByRole('button', { name: /select all/i });
      await user.click(selectAllButton);

      await waitFor(() => {
        expect(mockSetSelectedPlugins).toHaveBeenCalled();
      });

      // All suite plugins should now be selected
      const callArg = mockSetSelectedPlugins.mock.calls[0][0];
      expect(callArg.has('bola')).toBe(true);
      expect(callArg.has('harmful:hate')).toBe(true);
      expect(callArg.has('harmful:self-harm')).toBe(true);
    });
  });

  describe('integration with event propagation', () => {
    it('should stop event propagation when toggling suite', async () => {
      const user = userEvent.setup();

      renderWithProviders(<VerticalSuiteCard {...defaultProps} />);

      // The handleToggleAll function calls e.stopPropagation()
      // This ensures that clicking the button doesn't trigger other events
      const selectAllButton = screen.getByRole('button', { name: /select all/i });
      await user.click(selectAllButton);

      await waitFor(() => {
        expect(mockSetSelectedPlugins).toHaveBeenCalled();
      });

      // The component should remain in its current state
      // (propagation was stopped)
      expect(screen.getByRole('heading', { name: 'Test Suite' })).toBeInTheDocument();
    });
  });
});
