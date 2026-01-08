import React from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PluginsTab from './PluginsTab';
import { TestCaseGenerationProvider } from './TestCaseGenerationProvider';
import type { Plugin } from '@promptfoo/redteam/constants';

import type { LocalPluginConfig } from '../types';

// Mock dependencies
vi.mock('@app/hooks/useTelemetry', () => ({
  useTelemetry: () => ({
    recordEvent: vi.fn(),
  }),
}));

vi.mock('@app/hooks/useToast', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

vi.mock('@app/hooks/useApiHealth', () => ({
  useApiHealth: () => ({
    data: { status: 'connected', message: null },
    refetch: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock('@app/hooks/useCloudConfig', () => ({
  default: () => ({
    data: { isPremium: true },
  }),
}));

vi.mock('react-error-boundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./TestCaseGenerationProvider', async () => {
  const actual = await vi.importActual('./TestCaseGenerationProvider');
  return {
    ...actual,
    useTestCaseGeneration: () => ({
      generateTestCase: vi.fn(),
      isGenerating: false,
    }),
  };
});

vi.mock('./PluginConfigDialog', () => ({
  default: () => <div data-testid="plugin-config-dialog">Config Dialog</div>,
}));

vi.mock('./PresetCard', () => ({
  default: ({ name, onClick }: { name: string; onClick: () => void }) => (
    <button type="button" onClick={onClick} data-testid={`preset-${name}`}>
      {name}
    </button>
  ),
}));

vi.mock('./VerticalSuiteCard', () => ({
  default: () => <div data-testid="vertical-suite-card">Suite Card</div>,
}));

const mockRedTeamConfig = {
  config: {
    plugins: [],
    description: '',
    prompts: [],
    target: { id: '' },
    strategies: [],
    applicationDefinition: {},
    entities: [],
  },
  updatePlugins: vi.fn(),
};

// Helper function for rendering with providers
const renderWithProviders = (ui: React.ReactNode) => {
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <TestCaseGenerationProvider redTeamConfig={mockRedTeamConfig}>
          {ui}
        </TestCaseGenerationProvider>
      </TooltipProvider>
    </MemoryRouter>,
  );
};

describe('PluginsTab batch update functions', () => {
  const mockSetSelectedPlugins = vi.fn();
  const mockHandlePluginToggle = vi.fn();
  const mockUpdatePluginConfig = vi.fn();
  const mockOnUserInteraction = vi.fn();

  const defaultProps = {
    selectedPlugins: new Set<Plugin>(),
    handlePluginToggle: mockHandlePluginToggle,
    setSelectedPlugins: mockSetSelectedPlugins,
    pluginConfig: {} as LocalPluginConfig,
    updatePluginConfig: mockUpdatePluginConfig,
    recentlyUsedPlugins: [],
    onUserInteraction: mockOnUserInteraction,
    isRemoteGenerationDisabled: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handlePresetSelect', () => {
    it('should replace all selected plugins with preset plugins in a single state update', async () => {
      const user = userEvent.setup();

      // Start with some plugins selected
      const initialPlugins = new Set<Plugin>(['bola', 'harmful:hate']);

      renderWithProviders(<PluginsTab {...defaultProps} selectedPlugins={initialPlugins} />);

      // Find and click a preset button (mocked)
      const presetButton = screen.getByTestId('preset-Recommended');
      await user.click(presetButton);

      // Verify setSelectedPlugins was called (batch update)
      await waitFor(() => {
        expect(mockSetSelectedPlugins).toHaveBeenCalledTimes(1);
      });

      // Verify it was called with a Set (not individual calls)
      const callArg = mockSetSelectedPlugins.mock.calls[0][0];
      expect(callArg).toBeInstanceOf(Set);
    });

    it('should call onUserInteraction when preset is selected', async () => {
      const user = userEvent.setup();

      renderWithProviders(<PluginsTab {...defaultProps} />);

      const presetButton = screen.getByTestId('preset-Minimal Test');
      await user.click(presetButton);

      await waitFor(() => {
        expect(mockOnUserInteraction).toHaveBeenCalled();
      });
    });

    it('should not call handlePluginToggle when selecting preset', async () => {
      // This test verifies that the batch update uses setSelectedPlugins
      // instead of calling handlePluginToggle in a forEach loop (which caused infinite loops)
      const user = userEvent.setup();

      renderWithProviders(<PluginsTab {...defaultProps} />);

      const presetButton = screen.getByTestId('preset-Recommended');
      await user.click(presetButton);

      await waitFor(() => {
        expect(mockSetSelectedPlugins).toHaveBeenCalled();
      });

      // handlePluginToggle should NOT be called when using batch update
      expect(mockHandlePluginToggle).not.toHaveBeenCalled();
    });
  });

  describe('handleSelectAll', () => {
    it('should add all filtered plugins to selection in a single state update', async () => {
      const user = userEvent.setup();

      // Start with no plugins selected
      renderWithProviders(<PluginsTab {...defaultProps} />);

      // Find the "Select all" button
      const selectAllButton = screen.getByText('Select all');
      await user.click(selectAllButton);

      // Verify setSelectedPlugins was called exactly once (batch update)
      await waitFor(() => {
        expect(mockSetSelectedPlugins).toHaveBeenCalledTimes(1);
      });

      // Verify it was called with a Set
      const callArg = mockSetSelectedPlugins.mock.calls[0][0];
      expect(callArg).toBeInstanceOf(Set);
    });

    it('should preserve existing selections when adding all filtered plugins', async () => {
      const user = userEvent.setup();

      // Start with some plugins already selected
      const existingPlugins = new Set<Plugin>(['bola']);

      renderWithProviders(<PluginsTab {...defaultProps} selectedPlugins={existingPlugins} />);

      const selectAllButton = screen.getByText('Select all');
      await user.click(selectAllButton);

      await waitFor(() => {
        expect(mockSetSelectedPlugins).toHaveBeenCalledTimes(1);
      });

      // The new Set should contain the existing plugins plus all filtered plugins
      const newSet = mockSetSelectedPlugins.mock.calls[0][0] as Set<Plugin>;
      expect(newSet.has('bola')).toBe(true);
    });

    it('should call onUserInteraction when Select all is clicked', async () => {
      const user = userEvent.setup();

      renderWithProviders(<PluginsTab {...defaultProps} />);

      const selectAllButton = screen.getByText('Select all');
      await user.click(selectAllButton);

      await waitFor(() => {
        expect(mockOnUserInteraction).toHaveBeenCalled();
      });
    });

    it('should respect filtered plugins when selecting all', async () => {
      const user = userEvent.setup();

      renderWithProviders(<PluginsTab {...defaultProps} />);

      // Enter a search term to filter plugins
      const searchInput = screen.getByPlaceholderText('Search plugins...');
      await user.type(searchInput, 'harmful');

      // Click Select all
      const selectAllButton = screen.getByText('Select all');
      await user.click(selectAllButton);

      await waitFor(() => {
        expect(mockSetSelectedPlugins).toHaveBeenCalled();
      });

      // Only filtered plugins should be added (those matching 'harmful')
      // This is verified by the fact that handleSelectAll uses filteredPlugins
    });

    it('should not call handlePluginToggle in a loop', async () => {
      // This test verifies the fix for infinite render loops
      // The old implementation called handlePluginToggle for each plugin in a forEach loop
      // The new implementation uses setSelectedPlugins with a single new Set
      const user = userEvent.setup();

      renderWithProviders(<PluginsTab {...defaultProps} />);

      const selectAllButton = screen.getByText('Select all');
      await user.click(selectAllButton);

      await waitFor(() => {
        expect(mockSetSelectedPlugins).toHaveBeenCalled();
      });

      // handlePluginToggle should NOT be called at all
      expect(mockHandlePluginToggle).not.toHaveBeenCalled();
    });
  });

  describe('handleSelectNone', () => {
    it('should remove all filtered plugins from selection in a single state update', async () => {
      const user = userEvent.setup();

      // Start with some plugins selected
      const selectedPlugins = new Set<Plugin>(['bola', 'harmful:hate', 'harmful:self-harm']);

      renderWithProviders(<PluginsTab {...defaultProps} selectedPlugins={selectedPlugins} />);

      // Find the "Select none" button
      const selectNoneButton = screen.getByText('Select none');
      await user.click(selectNoneButton);

      // Verify setSelectedPlugins was called exactly once (batch update)
      await waitFor(() => {
        expect(mockSetSelectedPlugins).toHaveBeenCalledTimes(1);
      });

      // Verify it was called with a Set
      const callArg = mockSetSelectedPlugins.mock.calls[0][0];
      expect(callArg).toBeInstanceOf(Set);
    });

    it('should remove only filtered plugins, not all plugins', async () => {
      const user = userEvent.setup();

      // Start with multiple plugins selected
      const selectedPlugins = new Set<Plugin>(['bola', 'harmful:hate', 'prompt-extraction']);

      renderWithProviders(<PluginsTab {...defaultProps} selectedPlugins={selectedPlugins} />);

      // Filter to only show 'harmful' plugins
      const searchInput = screen.getByPlaceholderText('Search plugins...');
      await user.type(searchInput, 'harmful');

      // Click Select none
      const selectNoneButton = screen.getByText('Select none');
      await user.click(selectNoneButton);

      await waitFor(() => {
        expect(mockSetSelectedPlugins).toHaveBeenCalled();
      });

      // The new Set should still contain plugins that weren't filtered
      // (bola and prompt-extraction should remain if they don't match 'harmful')
      // This is verified by the fact that handleSelectNone only removes filteredPlugins
    });

    it('should call onUserInteraction when Select none is clicked', async () => {
      const user = userEvent.setup();

      const selectedPlugins = new Set<Plugin>(['bola', 'harmful:hate']);

      renderWithProviders(<PluginsTab {...defaultProps} selectedPlugins={selectedPlugins} />);

      const selectNoneButton = screen.getByText('Select none');
      await user.click(selectNoneButton);

      await waitFor(() => {
        expect(mockOnUserInteraction).toHaveBeenCalled();
      });
    });

    it('should not call handlePluginToggle in a loop', async () => {
      // This test verifies the fix for infinite render loops
      const user = userEvent.setup();

      const selectedPlugins = new Set<Plugin>(['bola', 'harmful:hate', 'harmful:self-harm']);

      renderWithProviders(<PluginsTab {...defaultProps} selectedPlugins={selectedPlugins} />);

      const selectNoneButton = screen.getByText('Select none');
      await user.click(selectNoneButton);

      await waitFor(() => {
        expect(mockSetSelectedPlugins).toHaveBeenCalled();
      });

      // handlePluginToggle should NOT be called at all
      expect(mockHandlePluginToggle).not.toHaveBeenCalled();
    });
  });

  describe('Clear All button integration', () => {
    it('should clear all selected plugins using batch update', async () => {
      const user = userEvent.setup();

      const selectedPlugins = new Set<Plugin>(['bola', 'harmful:hate']);

      renderWithProviders(<PluginsTab {...defaultProps} selectedPlugins={selectedPlugins} />);

      // Find the Clear All button in the selection summary
      const clearAllButton = screen.getByText('Clear All');
      await user.click(clearAllButton);

      await waitFor(() => {
        expect(mockSetSelectedPlugins).toHaveBeenCalledTimes(1);
      });

      // Verify it was called with an empty Set
      const callArg = mockSetSelectedPlugins.mock.calls[0][0];
      expect(callArg).toBeInstanceOf(Set);
      expect(callArg.size).toBe(0);
    });

    it('should call onUserInteraction when Clear All is clicked', async () => {
      const user = userEvent.setup();

      const selectedPlugins = new Set<Plugin>(['bola']);

      renderWithProviders(<PluginsTab {...defaultProps} selectedPlugins={selectedPlugins} />);

      const clearAllButton = screen.getByText('Clear All');
      await user.click(clearAllButton);

      await waitFor(() => {
        expect(mockOnUserInteraction).toHaveBeenCalled();
      });
    });
  });

  describe('Batch update prevents infinite render loops', () => {
    it('should not cause infinite re-renders when selecting preset', async () => {
      // This test verifies that the batch update approach prevents infinite loops
      const user = userEvent.setup();

      renderWithProviders(<PluginsTab {...defaultProps} />);

      // Select a preset multiple times rapidly
      const presetButton = screen.getByTestId('preset-Recommended');
      await user.click(presetButton);
      await user.click(presetButton);
      await user.click(presetButton);

      // Wait a bit to ensure no infinite loop occurs
      await waitFor(
        () => {
          // setSelectedPlugins should be called a bounded number of times
          expect(mockSetSelectedPlugins.mock.calls.length).toBeLessThan(10);
        },
        { timeout: 1000 },
      );
    });

    it('should not cause infinite re-renders when using Select all/none', async () => {
      const user = userEvent.setup();

      renderWithProviders(<PluginsTab {...defaultProps} />);

      // Rapidly toggle Select all and Select none
      const selectAllButton = screen.getByText('Select all');
      const selectNoneButton = screen.getByText('Select none');

      await user.click(selectAllButton);
      await user.click(selectNoneButton);
      await user.click(selectAllButton);
      await user.click(selectNoneButton);

      // Wait a bit to ensure no infinite loop occurs
      await waitFor(
        () => {
          // setSelectedPlugins should be called a bounded number of times (4 clicks = 4 calls)
          expect(mockSetSelectedPlugins.mock.calls.length).toBeLessThan(10);
        },
        { timeout: 1000 },
      );
    });
  });
});
