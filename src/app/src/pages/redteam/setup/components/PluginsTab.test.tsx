/**
 * To run:
 *
 * ```sh
 * npm run test:app -- src/pages/redteam/setup/components/PluginsTab.test.tsx
 * ```
 */

import React from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { ToastProvider } from '@app/contexts/ToastContext';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useRecentlyUsedPlugins, useRedTeamConfig } from '../hooks/useRedTeamConfig';
import Plugins from './Plugins';
import type { ApiHealthResult } from '@app/hooks/useApiHealth';
import type { DefinedUseQueryResult } from '@tanstack/react-query';

// ===================================================================
// Mocks
// ===================================================================

const mockRecordEvent = vi.fn();

vi.mock('@app/hooks/useTelemetry', () => ({
  useTelemetry: () => ({
    recordEvent: mockRecordEvent,
  }),
}));

const mockShowToast = vi.fn();

vi.mock('@app/hooks/useToast', () => ({
  useToast: () => ({
    showToast: mockShowToast,
  }),
}));

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

vi.mock('@app/hooks/useCloudConfig', () => ({
  default: vi.fn(() => ({
    data: { isEnabled: false },
  })),
}));

// Mock TestCaseGenerationProvider for PluginsTab isolated tests
vi.mock('./TestCaseGenerationProvider', () => ({
  useTestCaseGeneration: () => ({
    isGenerating: false,
    plugin: null,
    strategy: null,
    generateTestCase: vi.fn(),
    continueGeneration: vi.fn(),
  }),
  TestCaseGenerationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./PluginConfigDialog', () => ({
  default: () => <div data-testid="plugin-config-dialog" />,
}));

vi.mock('react-error-boundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock child tabs used by Plugins.tsx
vi.mock('./CustomIntentsTab', () => ({
  default: () => <div data-testid="custom-intents-tab" />,
}));

vi.mock('./CustomPoliciesTab', () => ({
  default: () => <div data-testid="custom-policies-tab" />,
}));

// ===================================================================
// Test Helpers
// ===================================================================

/**
 * Renders the actual Plugins component which connects to the real Zustand store.
 * This tests the full integration path: store -> Plugins -> PluginsTab -> store update.
 */
const renderComponent = () => {
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <ToastProvider>
          <Plugins onNext={vi.fn()} onBack={vi.fn()} />
        </ToastProvider>
      </TooltipProvider>
    </MemoryRouter>,
  );
};

// Store the initial state for resetting between tests
const initialStoreState = useRedTeamConfig.getState();
const initialRecentPluginsState = useRecentlyUsedPlugins.getState();

// ===================================================================
// Tests
// ===================================================================

describe('PluginsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('Component renders', () => {
    renderComponent();

    // Check that the Presets heading is visible
    expect(screen.getByTestId('plugins-tab-container')).toBeInTheDocument();
  });

  /**
   * Integration tests that verify the underlying Zustand store is updated.
   * Uses the actual Plugins component to test the full integration path.
   * Following the official Zustand testing documentation:
   * https://zustand.docs.pmnd.rs/guides/testing#vitest
   */
  describe('State Management', () => {
    beforeEach(() => {
      // Reset the Zustand stores to initial state before each test
      // This follows the Zustand testing pattern for isolating tests
      act(() => {
        useRedTeamConfig.setState({
          ...initialStoreState,
          config: { ...initialStoreState.config, plugins: [] },
        });
        useRecentlyUsedPlugins.setState(initialRecentPluginsState);
      });
    });

    afterEach(() => {
      // Clean up store state after each test
      act(() => {
        useRedTeamConfig.setState(initialStoreState);
        useRecentlyUsedPlugins.setState(initialRecentPluginsState);
      });
    });

    describe('Plugin List Items', () => {
      test('Selecting a list item updates the underlying Zustand store plugins array', async () => {
        const user = userEvent.setup();

        // Verify initial store state has no plugins
        expect(useRedTeamConfig.getState().config.plugins).toHaveLength(0);

        renderComponent();

        // Find a checkbox in the plugin list
        const checkboxes = await screen.findAllByRole('checkbox');
        expect(checkboxes.length).toBeGreaterThan(0);

        const firstCheckbox = checkboxes[0];
        await user.click(firstCheckbox);

        // Verify the Zustand store was updated with the selected plugin
        await waitFor(() => {
          const storePlugins = useRedTeamConfig.getState().config.plugins;
          expect(storePlugins.length).toBeGreaterThan(0);
        });

        // Verify the plugin in the store is a valid plugin identifier
        const storePlugins = useRedTeamConfig.getState().config.plugins;
        const firstPlugin = storePlugins[0];
        const pluginId = typeof firstPlugin === 'string' ? firstPlugin : firstPlugin.id;
        expect(pluginId.length).toBeGreaterThan(0);
      });

      test('Deselecting a plugin removes it from the Zustand store', async () => {
        const user = userEvent.setup();

        // Verify initial store state has no plugins
        expect(useRedTeamConfig.getState().config.plugins).toHaveLength(0);

        renderComponent();

        // Find a checkbox in the plugin list and click to select
        const checkboxes = await screen.findAllByRole('checkbox');
        expect(checkboxes.length).toBeGreaterThan(0);
        const firstCheckbox = checkboxes[0];
        await user.click(firstCheckbox);

        // Verify the plugin was added to the store
        await waitFor(() => {
          expect(useRedTeamConfig.getState().config.plugins.length).toBeGreaterThan(0);
        });

        // Get the plugin that was added
        const addedPlugins = useRedTeamConfig.getState().config.plugins;
        const addedPlugin = addedPlugins[0];
        const addedPluginId = typeof addedPlugin === 'string' ? addedPlugin : addedPlugin.id;

        // Now click the same checkbox again to deselect
        await user.click(firstCheckbox);

        // Verify the plugin was removed from the store
        await waitFor(() => {
          const storePlugins = useRedTeamConfig.getState().config.plugins;
          const hasPlugin = storePlugins.some(
            (p) => (typeof p === 'string' ? p : p.id) === addedPluginId,
          );
          expect(hasPlugin).toBe(false);
        });
      });
    });
  });
});
