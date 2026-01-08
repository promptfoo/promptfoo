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
import {
  DEFAULT_PLUGINS,
  EU_AI_ACT_MAPPING,
  FOUNDATION_PLUGINS,
  GDPR_MAPPING,
  GUARDRAILS_EVALUATION_PLUGINS,
  HARM_PLUGINS,
  ISO_42001_MAPPING,
  MCP_PLUGINS,
  MINIMAL_TEST_PLUGINS,
  MITRE_ATLAS_MAPPING,
  NIST_AI_RMF_MAPPING,
  OWASP_AGENTIC_TOP_10_MAPPING,
  OWASP_API_TOP_10_MAPPING,
  OWASP_LLM_RED_TEAM_MAPPING,
  OWASP_LLM_TOP_10_MAPPING,
  RAG_PLUGINS,
} from '@promptfoo/redteam/constants';
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

    describe('Presets', () => {
      describe('Selection updates the Zustand store with the correct plugins when the store is empty', () => {
        test('Selecting the "Recommended" present', async () => {
          const user = userEvent.setup();

          // Verify initial store state has no plugins
          expect(useRedTeamConfig.getState().config.plugins).toHaveLength(0);

          renderComponent();

          // Find and click the "Recommended" preset card
          const presetCard = screen.getByTestId('preset-card-recommended');
          await user.click(presetCard);

          // Verify the Zustand store was updated with all recommended plugins
          await waitFor(() => {
            const storePlugins = useRedTeamConfig.getState().config.plugins;
            expect(storePlugins.length).toBe(DEFAULT_PLUGINS.size);
          });

          // Verify all plugins from DEFAULT_PLUGINS are present in the store
          const storePlugins = useRedTeamConfig.getState().config.plugins;
          const pluginIds = new Set(storePlugins.map((p) => (typeof p === 'string' ? p : p.id)));

          for (const expectedPlugin of DEFAULT_PLUGINS) {
            expect(pluginIds.has(expectedPlugin)).toBe(true);
          }
        });

        test('Selecting the "Minimal Test" preset', async () => {
          const user = userEvent.setup();

          expect(useRedTeamConfig.getState().config.plugins).toHaveLength(0);

          renderComponent();

          const presetCard = screen.getByTestId('preset-card-minimal-test');
          await user.click(presetCard);

          await waitFor(() => {
            const storePlugins = useRedTeamConfig.getState().config.plugins;
            expect(storePlugins.length).toBe(MINIMAL_TEST_PLUGINS.size);
          });

          const storePlugins = useRedTeamConfig.getState().config.plugins;
          const pluginIds = new Set(storePlugins.map((p) => (typeof p === 'string' ? p : p.id)));

          for (const expectedPlugin of MINIMAL_TEST_PLUGINS) {
            expect(pluginIds.has(expectedPlugin)).toBe(true);
          }
        });

        test('Selecting the "RAG" preset', async () => {
          const user = userEvent.setup();

          expect(useRedTeamConfig.getState().config.plugins).toHaveLength(0);

          renderComponent();

          const presetCard = screen.getByTestId('preset-card-rag');
          await user.click(presetCard);

          await waitFor(() => {
            const storePlugins = useRedTeamConfig.getState().config.plugins;
            expect(storePlugins.length).toBe(RAG_PLUGINS.size);
          });

          const storePlugins = useRedTeamConfig.getState().config.plugins;
          const pluginIds = new Set(storePlugins.map((p) => (typeof p === 'string' ? p : p.id)));

          for (const expectedPlugin of RAG_PLUGINS) {
            expect(pluginIds.has(expectedPlugin)).toBe(true);
          }
        });

        test('Selecting the "Foundation" preset', async () => {
          const user = userEvent.setup();
          const expectedPlugins = new Set(FOUNDATION_PLUGINS);

          expect(useRedTeamConfig.getState().config.plugins).toHaveLength(0);

          renderComponent();

          const presetCard = screen.getByTestId('preset-card-foundation');
          await user.click(presetCard);

          await waitFor(() => {
            const storePlugins = useRedTeamConfig.getState().config.plugins;
            expect(storePlugins.length).toBe(expectedPlugins.size);
          });

          const storePlugins = useRedTeamConfig.getState().config.plugins;
          const pluginIds = new Set(storePlugins.map((p) => (typeof p === 'string' ? p : p.id)));

          for (const expectedPlugin of expectedPlugins) {
            expect(pluginIds.has(expectedPlugin)).toBe(true);
          }
        });

        test('Selecting the "Guardrails Evaluation" preset', async () => {
          const user = userEvent.setup();
          const expectedPlugins = new Set(GUARDRAILS_EVALUATION_PLUGINS);

          expect(useRedTeamConfig.getState().config.plugins).toHaveLength(0);

          renderComponent();

          const presetCard = screen.getByTestId('preset-card-guardrails-evaluation');
          await user.click(presetCard);

          await waitFor(() => {
            const storePlugins = useRedTeamConfig.getState().config.plugins;
            expect(storePlugins.length).toBe(expectedPlugins.size);
          });

          const storePlugins = useRedTeamConfig.getState().config.plugins;
          const pluginIds = new Set(storePlugins.map((p) => (typeof p === 'string' ? p : p.id)));

          for (const expectedPlugin of expectedPlugins) {
            expect(pluginIds.has(expectedPlugin)).toBe(true);
          }
        });

        test('Selecting the "MCP" preset', async () => {
          const user = userEvent.setup();
          const expectedPlugins = new Set(MCP_PLUGINS);

          expect(useRedTeamConfig.getState().config.plugins).toHaveLength(0);

          renderComponent();

          const presetCard = screen.getByTestId('preset-card-mcp');
          await user.click(presetCard);

          await waitFor(() => {
            const storePlugins = useRedTeamConfig.getState().config.plugins;
            expect(storePlugins.length).toBe(expectedPlugins.size);
          });

          const storePlugins = useRedTeamConfig.getState().config.plugins;
          const pluginIds = new Set(storePlugins.map((p) => (typeof p === 'string' ? p : p.id)));

          for (const expectedPlugin of expectedPlugins) {
            expect(pluginIds.has(expectedPlugin)).toBe(true);
          }
        });

        test('Selecting the "Harmful" preset', async () => {
          const user = userEvent.setup();
          const expectedPlugins = new Set(Object.keys(HARM_PLUGINS));

          expect(useRedTeamConfig.getState().config.plugins).toHaveLength(0);

          renderComponent();

          const presetCard = screen.getByTestId('preset-card-harmful');
          await user.click(presetCard);

          await waitFor(() => {
            const storePlugins = useRedTeamConfig.getState().config.plugins;
            expect(storePlugins.length).toBe(expectedPlugins.size);
          });

          const storePlugins = useRedTeamConfig.getState().config.plugins;
          const pluginIds = new Set(storePlugins.map((p) => (typeof p === 'string' ? p : p.id)));

          for (const expectedPlugin of expectedPlugins) {
            expect(pluginIds.has(expectedPlugin)).toBe(true);
          }
        });

        test('Selecting the "NIST" preset', async () => {
          const user = userEvent.setup();
          const expectedPlugins = new Set(
            Object.values(NIST_AI_RMF_MAPPING).flatMap((v) => v.plugins),
          );

          expect(useRedTeamConfig.getState().config.plugins).toHaveLength(0);

          renderComponent();

          const presetCard = screen.getByTestId('preset-card-nist');
          await user.click(presetCard);

          await waitFor(() => {
            const storePlugins = useRedTeamConfig.getState().config.plugins;
            expect(storePlugins.length).toBe(expectedPlugins.size);
          });

          const storePlugins = useRedTeamConfig.getState().config.plugins;
          const pluginIds = new Set(storePlugins.map((p) => (typeof p === 'string' ? p : p.id)));

          for (const expectedPlugin of expectedPlugins) {
            expect(pluginIds.has(expectedPlugin)).toBe(true);
          }
        });

        test('Selecting the "OWASP LLM Top 10" preset', async () => {
          const user = userEvent.setup();
          const expectedPlugins = new Set(
            Object.values(OWASP_LLM_TOP_10_MAPPING).flatMap((v) => v.plugins),
          );

          expect(useRedTeamConfig.getState().config.plugins).toHaveLength(0);

          renderComponent();

          const presetCard = screen.getByTestId('preset-card-owasp-llm-top-10');
          await user.click(presetCard);

          await waitFor(() => {
            const storePlugins = useRedTeamConfig.getState().config.plugins;
            expect(storePlugins.length).toBe(expectedPlugins.size);
          });

          const storePlugins = useRedTeamConfig.getState().config.plugins;
          const pluginIds = new Set(storePlugins.map((p) => (typeof p === 'string' ? p : p.id)));

          for (const expectedPlugin of expectedPlugins) {
            expect(pluginIds.has(expectedPlugin)).toBe(true);
          }
        });

        test('Selecting the "OWASP Gen AI Red Team" preset', async () => {
          const user = userEvent.setup();
          const expectedPlugins = new Set(
            Object.values(OWASP_LLM_RED_TEAM_MAPPING).flatMap((v) => v.plugins),
          );

          expect(useRedTeamConfig.getState().config.plugins).toHaveLength(0);

          renderComponent();

          const presetCard = screen.getByTestId('preset-card-owasp-gen-ai-red-team');
          await user.click(presetCard);

          await waitFor(() => {
            const storePlugins = useRedTeamConfig.getState().config.plugins;
            expect(storePlugins.length).toBe(expectedPlugins.size);
          });

          const storePlugins = useRedTeamConfig.getState().config.plugins;
          const pluginIds = new Set(storePlugins.map((p) => (typeof p === 'string' ? p : p.id)));

          for (const expectedPlugin of expectedPlugins) {
            expect(pluginIds.has(expectedPlugin)).toBe(true);
          }
        });

        test('Selecting the "OWASP API Top 10" preset', async () => {
          const user = userEvent.setup();
          const expectedPlugins = new Set(
            Object.values(OWASP_API_TOP_10_MAPPING).flatMap((v) => v.plugins),
          );

          expect(useRedTeamConfig.getState().config.plugins).toHaveLength(0);

          renderComponent();

          const presetCard = screen.getByTestId('preset-card-owasp-api-top-10');
          await user.click(presetCard);

          await waitFor(() => {
            const storePlugins = useRedTeamConfig.getState().config.plugins;
            expect(storePlugins.length).toBe(expectedPlugins.size);
          });

          const storePlugins = useRedTeamConfig.getState().config.plugins;
          const pluginIds = new Set(storePlugins.map((p) => (typeof p === 'string' ? p : p.id)));

          for (const expectedPlugin of expectedPlugins) {
            expect(pluginIds.has(expectedPlugin)).toBe(true);
          }
        });

        test('Selecting the "OWASP Top 10 for Agentic Applications" preset', async () => {
          const user = userEvent.setup();
          const expectedPlugins = new Set(
            Object.values(OWASP_AGENTIC_TOP_10_MAPPING).flatMap((v) => v.plugins),
          );

          expect(useRedTeamConfig.getState().config.plugins).toHaveLength(0);

          renderComponent();

          const presetCard = screen.getByTestId(
            'preset-card-owasp-top-10-for-agentic-applications',
          );
          await user.click(presetCard);

          await waitFor(() => {
            const storePlugins = useRedTeamConfig.getState().config.plugins;
            expect(storePlugins.length).toBe(expectedPlugins.size);
          });

          const storePlugins = useRedTeamConfig.getState().config.plugins;
          const pluginIds = new Set(storePlugins.map((p) => (typeof p === 'string' ? p : p.id)));

          for (const expectedPlugin of expectedPlugins) {
            expect(pluginIds.has(expectedPlugin)).toBe(true);
          }
        });

        test('Selecting the "MITRE" preset', async () => {
          const user = userEvent.setup();
          const expectedPlugins = new Set(
            Object.values(MITRE_ATLAS_MAPPING).flatMap((v) => v.plugins),
          );

          expect(useRedTeamConfig.getState().config.plugins).toHaveLength(0);

          renderComponent();

          const presetCard = screen.getByTestId('preset-card-mitre');
          await user.click(presetCard);

          await waitFor(() => {
            const storePlugins = useRedTeamConfig.getState().config.plugins;
            expect(storePlugins.length).toBe(expectedPlugins.size);
          });

          const storePlugins = useRedTeamConfig.getState().config.plugins;
          const pluginIds = new Set(storePlugins.map((p) => (typeof p === 'string' ? p : p.id)));

          for (const expectedPlugin of expectedPlugins) {
            expect(pluginIds.has(expectedPlugin)).toBe(true);
          }
        });

        test('Selecting the "EU AI Act" preset', async () => {
          const user = userEvent.setup();
          const expectedPlugins = new Set(
            Object.values(EU_AI_ACT_MAPPING).flatMap((v) => v.plugins),
          );

          expect(useRedTeamConfig.getState().config.plugins).toHaveLength(0);

          renderComponent();

          const presetCard = screen.getByTestId('preset-card-eu-ai-act');
          await user.click(presetCard);

          await waitFor(() => {
            const storePlugins = useRedTeamConfig.getState().config.plugins;
            expect(storePlugins.length).toBe(expectedPlugins.size);
          });

          const storePlugins = useRedTeamConfig.getState().config.plugins;
          const pluginIds = new Set(storePlugins.map((p) => (typeof p === 'string' ? p : p.id)));

          for (const expectedPlugin of expectedPlugins) {
            expect(pluginIds.has(expectedPlugin)).toBe(true);
          }
        });

        test('Selecting the "ISO 42001" preset', async () => {
          const user = userEvent.setup();
          const expectedPlugins = new Set(
            Object.values(ISO_42001_MAPPING).flatMap((v) => v.plugins),
          );

          expect(useRedTeamConfig.getState().config.plugins).toHaveLength(0);

          renderComponent();

          const presetCard = screen.getByTestId('preset-card-iso-42001');
          await user.click(presetCard);

          await waitFor(() => {
            const storePlugins = useRedTeamConfig.getState().config.plugins;
            expect(storePlugins.length).toBe(expectedPlugins.size);
          });

          const storePlugins = useRedTeamConfig.getState().config.plugins;
          const pluginIds = new Set(storePlugins.map((p) => (typeof p === 'string' ? p : p.id)));

          for (const expectedPlugin of expectedPlugins) {
            expect(pluginIds.has(expectedPlugin)).toBe(true);
          }
        });

        test('Selecting the "GDPR" preset', async () => {
          const user = userEvent.setup();
          const expectedPlugins = new Set(Object.values(GDPR_MAPPING).flatMap((v) => v.plugins));

          expect(useRedTeamConfig.getState().config.plugins).toHaveLength(0);

          renderComponent();

          const presetCard = screen.getByTestId('preset-card-gdpr');
          await user.click(presetCard);

          await waitFor(() => {
            const storePlugins = useRedTeamConfig.getState().config.plugins;
            expect(storePlugins.length).toBe(expectedPlugins.size);
          });

          const storePlugins = useRedTeamConfig.getState().config.plugins;
          const pluginIds = new Set(storePlugins.map((p) => (typeof p === 'string' ? p : p.id)));

          for (const expectedPlugin of expectedPlugins) {
            expect(pluginIds.has(expectedPlugin)).toBe(true);
          }
        });
      });
    });

    describe('Plugin List Items', () => {
      // describe('Search', () => {});

      // describe('Category Filtering', () => {});

      // describe('Select All Button', () => {});

      // describe('Select None Button', () => {});

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

    // describe('Selected Plugins List', () => {});
  });
});
