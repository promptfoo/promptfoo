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
  riskCategories,
} from '@promptfoo/redteam/constants';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useRecentlyUsedPlugins, useRedTeamConfig } from '../hooks/useRedTeamConfig';
import Plugins from './Plugins';
import { DOMAIN_SPECIFIC_PLUGINS } from './verticalSuites';
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

  describe('View Logic', () => {
    test('Plugin search filters the plugin list based on the search query', async () => {
      const user = userEvent.setup();

      renderComponent();

      // Verify that both sql-injection and harmful:hate plugins are visible initially
      expect(screen.getByTestId('plugin-list-item-sql-injection')).toBeInTheDocument();
      expect(screen.getByTestId('plugin-list-item-harmful:hate')).toBeInTheDocument();

      // Find the search input and type a search query
      const searchInput = screen.getByTestId('plugin-search-input');
      await user.type(searchInput, 'SQL');

      // Wait for the filtered results to appear
      await waitFor(() => {
        // Verify that sql-injection is still visible (matches "SQL Injection" display name)
        expect(screen.getByTestId('plugin-list-item-sql-injection')).toBeInTheDocument();
      });

      // Verify that harmful:hate is no longer visible (doesn't match "SQL")
      expect(screen.queryByTestId('plugin-list-item-harmful:hate')).not.toBeInTheDocument();
    });

    describe('Category Filtering', () => {
      beforeEach(() => {
        // Reset stores before each category filtering test
        act(() => {
          useRedTeamConfig.setState({
            ...initialStoreState,
            config: { ...initialStoreState.config, plugins: [] },
          });
          useRecentlyUsedPlugins.setState({ ...initialRecentPluginsState, plugins: [] });
        });
      });

      afterEach(() => {
        act(() => {
          useRedTeamConfig.setState(initialStoreState);
          useRecentlyUsedPlugins.setState(initialRecentPluginsState);
        });
      });

      // Helper to get plugins for a category (excluding intent, policy, and domain-specific plugins)
      const getVisiblePluginsForCategory = (category: string) => {
        return riskCategories[category].filter(
          (plugin) =>
            plugin !== 'intent' && plugin !== 'policy' && !DOMAIN_SPECIFIC_PLUGINS.includes(plugin),
        );
      };

      // Helper to get a sample plugin from a different category for negative assertions
      const getSamplePluginFromOtherCategory = (excludeCategory: string) => {
        const otherCategories = Object.keys(riskCategories).filter((c) => c !== excludeCategory);
        for (const category of otherCategories) {
          const plugins = getVisiblePluginsForCategory(category);
          if (plugins.length > 0) {
            return plugins[0];
          }
        }
        return null;
      };

      test('Defaults to "All Categories" being selected', async () => {
        renderComponent();

        // Find the "All Categories" badge - it should be present
        const allCategoriesBadge = screen.getByText('All Categories');
        expect(allCategoriesBadge).toBeInTheDocument();

        // Check that plugins from multiple categories are visible
        // Get first plugin from each category to verify all are shown
        const securityPlugins = getVisiblePluginsForCategory('Security & Access Control');
        const compliancePlugins = getVisiblePluginsForCategory('Compliance & Legal');
        const trustSafetyPlugins = getVisiblePluginsForCategory('Trust & Safety');
        const brandPlugins = getVisiblePluginsForCategory('Brand');

        expect(screen.getByTestId(`plugin-list-item-${securityPlugins[0]}`)).toBeInTheDocument();
        expect(screen.getByTestId(`plugin-list-item-${compliancePlugins[0]}`)).toBeInTheDocument();
        expect(screen.getByTestId(`plugin-list-item-${trustSafetyPlugins[0]}`)).toBeInTheDocument();
        expect(screen.getByTestId(`plugin-list-item-${brandPlugins[0]}`)).toBeInTheDocument();
      });

      test('Selecting "All Categories" renders correct plugins', async () => {
        const user = userEvent.setup();

        renderComponent();

        // First select a specific category to change state
        const securityBadge = screen.getByText('Security & Access Control');
        await user.click(securityBadge);

        const securityPlugins = getVisiblePluginsForCategory('Security & Access Control');

        // Wait for filtering to apply
        await waitFor(() => {
          expect(screen.getByTestId(`plugin-list-item-${securityPlugins[0]}`)).toBeInTheDocument();
        });

        // Now click "All Categories" to show all plugins again
        const allCategoriesBadge = screen.getByText('All Categories');
        await user.click(allCategoriesBadge);

        // Verify plugins from multiple categories are visible again
        const compliancePlugins = getVisiblePluginsForCategory('Compliance & Legal');
        const trustSafetyPlugins = getVisiblePluginsForCategory('Trust & Safety');
        const brandPlugins = getVisiblePluginsForCategory('Brand');

        await waitFor(() => {
          expect(screen.getByTestId(`plugin-list-item-${securityPlugins[0]}`)).toBeInTheDocument();
          expect(
            screen.getByTestId(`plugin-list-item-${compliancePlugins[0]}`),
          ).toBeInTheDocument();
          expect(
            screen.getByTestId(`plugin-list-item-${trustSafetyPlugins[0]}`),
          ).toBeInTheDocument();
          expect(screen.getByTestId(`plugin-list-item-${brandPlugins[0]}`)).toBeInTheDocument();
        });
      });

      test('Selecting "Recently Used" renders correct plugins', async () => {
        const user = userEvent.setup();

        // Set up recently used plugins in the store using plugins from different categories
        const securityPlugins = riskCategories['Security & Access Control'];
        const brandPlugins = riskCategories['Brand'];
        const recentPlugins = [securityPlugins[0], brandPlugins[0], securityPlugins[1]] as const;
        act(() => {
          useRecentlyUsedPlugins.setState({
            plugins: [...recentPlugins],
          });
        });

        renderComponent();

        // Find the "Recently Used" badge in the category filter area (first one)
        const recentlyUsedBadges = screen.getAllByText('Recently Used');
        // The first badge is in the filter bar
        await user.click(recentlyUsedBadges[0]);

        // Verify only recently used plugins are visible
        await waitFor(() => {
          expect(screen.getByTestId(`plugin-list-item-${recentPlugins[0]}`)).toBeInTheDocument();
          expect(screen.getByTestId(`plugin-list-item-${recentPlugins[1]}`)).toBeInTheDocument();
          expect(screen.getByTestId(`plugin-list-item-${recentPlugins[2]}`)).toBeInTheDocument();
        });

        // Verify plugins NOT in recently used are not visible
        const datasetsPlugins = riskCategories['Datasets'];
        expect(
          screen.queryByTestId(`plugin-list-item-${datasetsPlugins[0]}`),
        ).not.toBeInTheDocument();
      });

      test('Selecting "Security & Access Control" renders correct plugins', async () => {
        const user = userEvent.setup();
        const categoryName = 'Security & Access Control';
        const categoryPlugins = getVisiblePluginsForCategory(categoryName);

        renderComponent();

        // Click the category badge
        const categoryBadge = screen.getByText(categoryName);
        await user.click(categoryBadge);

        // Verify category plugins are visible (check first few)
        await waitFor(() => {
          expect(screen.getByTestId(`plugin-list-item-${categoryPlugins[0]}`)).toBeInTheDocument();
        });

        // Verify at least 3 more plugins from this category are visible
        for (let i = 1; i < Math.min(4, categoryPlugins.length); i++) {
          expect(screen.getByTestId(`plugin-list-item-${categoryPlugins[i]}`)).toBeInTheDocument();
        }

        // Verify plugins from other categories are NOT visible
        const otherPlugin = getSamplePluginFromOtherCategory(categoryName);
        if (otherPlugin) {
          expect(screen.queryByTestId(`plugin-list-item-${otherPlugin}`)).not.toBeInTheDocument();
        }
      });

      test('Selecting "Compliance & Legal" renders correct plugins', async () => {
        const user = userEvent.setup();
        const categoryName = 'Compliance & Legal';
        const categoryPlugins = getVisiblePluginsForCategory(categoryName);

        renderComponent();

        // Click the category badge
        const categoryBadge = screen.getByText(categoryName);
        await user.click(categoryBadge);

        // Verify category plugins are visible (check first few)
        await waitFor(() => {
          expect(screen.getByTestId(`plugin-list-item-${categoryPlugins[0]}`)).toBeInTheDocument();
        });

        // Verify at least 3 more plugins from this category are visible
        for (let i = 1; i < Math.min(4, categoryPlugins.length); i++) {
          expect(screen.getByTestId(`plugin-list-item-${categoryPlugins[i]}`)).toBeInTheDocument();
        }

        // Verify plugins from other categories are NOT visible
        const otherPlugin = getSamplePluginFromOtherCategory(categoryName);
        if (otherPlugin) {
          expect(screen.queryByTestId(`plugin-list-item-${otherPlugin}`)).not.toBeInTheDocument();
        }
      });

      test('Selecting "Trust & Safety" renders correct plugins', async () => {
        const user = userEvent.setup();
        const categoryName = 'Trust & Safety';
        const categoryPlugins = getVisiblePluginsForCategory(categoryName);

        renderComponent();

        // Click the category badge
        const categoryBadge = screen.getByText(categoryName);
        await user.click(categoryBadge);

        // Verify category plugins are visible (check first few)
        await waitFor(() => {
          expect(screen.getByTestId(`plugin-list-item-${categoryPlugins[0]}`)).toBeInTheDocument();
        });

        // Verify at least 3 more plugins from this category are visible
        for (let i = 1; i < Math.min(4, categoryPlugins.length); i++) {
          expect(screen.getByTestId(`plugin-list-item-${categoryPlugins[i]}`)).toBeInTheDocument();
        }

        // Verify plugins from other categories are NOT visible
        const otherPlugin = getSamplePluginFromOtherCategory(categoryName);
        if (otherPlugin) {
          expect(screen.queryByTestId(`plugin-list-item-${otherPlugin}`)).not.toBeInTheDocument();
        }
      });

      test('Selecting "Brand" renders correct plugins', async () => {
        const user = userEvent.setup();
        const categoryName = 'Brand';
        const categoryPlugins = getVisiblePluginsForCategory(categoryName);

        renderComponent();

        // Click the category badge
        const categoryBadge = screen.getByText(categoryName);
        await user.click(categoryBadge);

        // Verify category plugins are visible (check first few)
        await waitFor(() => {
          expect(screen.getByTestId(`plugin-list-item-${categoryPlugins[0]}`)).toBeInTheDocument();
        });

        // Verify at least 3 more plugins from this category are visible
        for (let i = 1; i < Math.min(4, categoryPlugins.length); i++) {
          expect(screen.getByTestId(`plugin-list-item-${categoryPlugins[i]}`)).toBeInTheDocument();
        }

        // Verify plugins from other categories are NOT visible
        const otherPlugin = getSamplePluginFromOtherCategory(categoryName);
        if (otherPlugin) {
          expect(screen.queryByTestId(`plugin-list-item-${otherPlugin}`)).not.toBeInTheDocument();
        }
      });

      test('Selecting "Domain-Specific Risks" renders vertical suite cards instead of plugin list', async () => {
        const user = userEvent.setup();

        renderComponent();

        // Click the "Domain-Specific Risks" badge
        const domainBadge = screen.getByText('Domain-Specific Risks');
        await user.click(domainBadge);

        // Domain-Specific Risks shows vertical suite cards instead of the flat plugin list
        // The standard plugin list items from other categories should not be present
        const securityPlugins = getVisiblePluginsForCategory('Security & Access Control');
        const trustSafetyPlugins = getVisiblePluginsForCategory('Trust & Safety');

        await waitFor(() => {
          expect(
            screen.queryByTestId(`plugin-list-item-${securityPlugins[0]}`),
          ).not.toBeInTheDocument();
          expect(
            screen.queryByTestId(`plugin-list-item-${trustSafetyPlugins[0]}`),
          ).not.toBeInTheDocument();
        });
      });

      test('Selecting "Datasets" renders correct plugins', async () => {
        const user = userEvent.setup();
        const categoryName = 'Datasets';
        const categoryPlugins = getVisiblePluginsForCategory(categoryName);

        renderComponent();

        // Click the category badge
        const categoryBadge = screen.getByText(categoryName);
        await user.click(categoryBadge);

        // Verify category plugins are visible (check first few)
        await waitFor(() => {
          expect(screen.getByTestId(`plugin-list-item-${categoryPlugins[0]}`)).toBeInTheDocument();
        });

        // Verify at least 3 more plugins from this category are visible
        for (let i = 1; i < Math.min(4, categoryPlugins.length); i++) {
          expect(screen.getByTestId(`plugin-list-item-${categoryPlugins[i]}`)).toBeInTheDocument();
        }

        // Verify plugins from other categories are NOT visible
        const otherPlugin = getSamplePluginFromOtherCategory(categoryName);
        if (otherPlugin) {
          expect(screen.queryByTestId(`plugin-list-item-${otherPlugin}`)).not.toBeInTheDocument();
        }
      });
    });

    describe('Selected Plugins List', () => {
      beforeEach(() => {
        // Reset stores before each selected plugins list test
        act(() => {
          useRedTeamConfig.setState({
            ...initialStoreState,
            config: { ...initialStoreState.config, plugins: [] },
          });
          useRecentlyUsedPlugins.setState({ ...initialRecentPluginsState, plugins: [] });
        });
      });

      afterEach(() => {
        act(() => {
          useRedTeamConfig.setState(initialStoreState);
          useRecentlyUsedPlugins.setState(initialRecentPluginsState);
        });
      });

      test('Renders all selected plugins', async () => {
        // Set up the store with selected plugins from different categories
        const testPlugins = ['sql-injection', 'harmful:hate', 'contracts', 'bola'];

        act(() => {
          useRedTeamConfig.setState({
            ...initialStoreState,
            config: {
              ...initialStoreState.config,
              plugins: testPlugins,
            },
          });
        });

        renderComponent();

        // Verify the sidebar is rendered
        expect(screen.getByTestId('selected-plugins-sidebar')).toBeInTheDocument();

        // Verify the sidebar header shows the correct count
        const header = screen.getByTestId('selected-plugins-header');
        expect(header).toHaveTextContent(`Selected Plugins (${testPlugins.length})`);

        // Verify each selected plugin appears in the sidebar using test IDs
        expect(screen.getByTestId('selected-plugin-sql-injection')).toBeInTheDocument();
        expect(screen.getByTestId('selected-plugin-harmful:hate')).toBeInTheDocument();
        expect(screen.getByTestId('selected-plugin-contracts')).toBeInTheDocument();
        expect(screen.getByTestId('selected-plugin-bola')).toBeInTheDocument();

        // Verify the "Clear All" button is visible when plugins are selected
        expect(screen.getByTestId('clear-all-plugins-button')).toBeInTheDocument();
      });

      test('Renders empty state when no plugins are selected', async () => {
        renderComponent();

        // Verify the sidebar header shows zero count
        const header = screen.getByTestId('selected-plugins-header');
        expect(header).toHaveTextContent('Selected Plugins (0)');

        // Verify the empty state message is displayed
        expect(screen.getByTestId('selected-plugins-empty-state')).toBeInTheDocument();

        // Verify "Clear All" button is NOT shown when no plugins are selected
        expect(screen.queryByTestId('clear-all-plugins-button')).not.toBeInTheDocument();
      });

      test('Renders plugins requiring configuration separately with error styling', async () => {
        // Set up the store with plugins that require configuration (without providing config)
        // indirect-prompt-injection and prompt-extraction require config
        const testPlugins = ['sql-injection', 'indirect-prompt-injection'];

        act(() => {
          useRedTeamConfig.setState({
            ...initialStoreState,
            config: {
              ...initialStoreState.config,
              plugins: testPlugins,
            },
          });
        });

        renderComponent();

        // Verify the sidebar header shows the correct total count
        const header = screen.getByTestId('selected-plugins-header');
        expect(header).toHaveTextContent(`Selected Plugins (${testPlugins.length})`);

        // Verify the "Needs Configuration" section is displayed
        expect(screen.getByTestId('plugins-needing-config-section')).toBeInTheDocument();

        // Verify plugins appear in their respective sections
        // sql-injection is configured (doesn't require additional config)
        expect(screen.getByTestId('selected-plugin-sql-injection')).toBeInTheDocument();
        // indirect-prompt-injection requires config and has no config set
        expect(
          screen.getByTestId('selected-plugin-needs-config-indirect-prompt-injection'),
        ).toBeInTheDocument();
      });
    });
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

      describe('Selection updates the Zustand store with the correct plugins when the store is not empty', () => {
        test('Replaces existing plugins with preset plugins', async () => {
          const user = userEvent.setup();

          // Pre-populate the store with a plugin that is NOT in MINIMAL_TEST_PLUGINS
          act(() => {
            useRedTeamConfig.setState({
              ...initialStoreState,
              config: {
                ...initialStoreState.config,
                plugins: ['sql-injection'],
              },
            });
          });

          // Verify initial store state
          const initialPlugins = useRedTeamConfig.getState().config.plugins;
          expect(initialPlugins).toHaveLength(1);
          expect(initialPlugins[0]).toBe('sql-injection');

          renderComponent();

          // Click the "Minimal Test" preset which contains 'harmful:hate' and 'harmful:self-harm'
          const presetCard = screen.getByTestId('preset-card-minimal-test');
          await user.click(presetCard);

          // Wait for store update
          await waitFor(() => {
            const storePlugins = useRedTeamConfig.getState().config.plugins;
            expect(storePlugins.length).toBe(MINIMAL_TEST_PLUGINS.size);
          });

          // Verify only preset plugins are present (sql-injection should be removed)
          const storePlugins = useRedTeamConfig.getState().config.plugins;
          const pluginIds = storePlugins.map((p) => (typeof p === 'string' ? p : p.id));
          const pluginIdSet = new Set(pluginIds);

          // All preset plugins should be present
          for (const expectedPlugin of MINIMAL_TEST_PLUGINS) {
            expect(pluginIdSet.has(expectedPlugin)).toBe(true);
          }

          // The original plugin should be removed
          expect(pluginIdSet.has('sql-injection')).toBe(false);
        });

        test('Preserves custom config for plugins that overlap with preset', async () => {
          const user = userEvent.setup();

          // Pre-populate the store with a plugin that has custom config
          // harmful:hate is in the preset, so its config should be preserved
          const customConfig = { numTests: 10 };
          act(() => {
            useRedTeamConfig.setState({
              ...initialStoreState,
              config: {
                ...initialStoreState.config,
                plugins: [{ id: 'harmful:hate', config: customConfig }],
              },
            });
          });

          // Verify initial store state has plugin with config
          const initialPlugins = useRedTeamConfig.getState().config.plugins;
          expect(initialPlugins).toHaveLength(1);
          expect(typeof initialPlugins[0]).toBe('object');

          renderComponent();

          // Click the "Minimal Test" preset which contains 'harmful:hate' and 'harmful:self-harm'
          const presetCard = screen.getByTestId('preset-card-minimal-test');
          await user.click(presetCard);

          // Wait for store update
          await waitFor(() => {
            const storePlugins = useRedTeamConfig.getState().config.plugins;
            expect(storePlugins.length).toBe(MINIMAL_TEST_PLUGINS.size);
          });

          // Verify all preset plugins are present
          const storePlugins = useRedTeamConfig.getState().config.plugins;
          const pluginIds = storePlugins.map((p) => (typeof p === 'string' ? p : p.id));
          const pluginIdSet = new Set(pluginIds);
          for (const expectedPlugin of MINIMAL_TEST_PLUGINS) {
            expect(pluginIdSet.has(expectedPlugin)).toBe(true);
          }

          // Verify harmful:hate preserves its custom config since it's in both
          // the original selection and the preset
          const harmfulHatePlugin = storePlugins.find(
            (p) => (typeof p === 'string' ? p : p.id) === 'harmful:hate',
          );
          expect(harmfulHatePlugin).toEqual({ id: 'harmful:hate', config: customConfig });
        });

        test('Results in exactly the preset plugins with no duplicates', async () => {
          const user = userEvent.setup();

          // Pre-populate the store with multiple plugins, some overlapping with preset
          act(() => {
            useRedTeamConfig.setState({
              ...initialStoreState,
              config: {
                ...initialStoreState.config,
                plugins: ['harmful:hate', 'sql-injection', 'bola'],
              },
            });
          });

          // Verify initial store state
          expect(useRedTeamConfig.getState().config.plugins).toHaveLength(3);

          renderComponent();

          // Click the "Minimal Test" preset which contains 'harmful:hate' and 'harmful:self-harm'
          const presetCard = screen.getByTestId('preset-card-minimal-test');
          await user.click(presetCard);

          // Wait for store update
          await waitFor(() => {
            const storePlugins = useRedTeamConfig.getState().config.plugins;
            // Should be exactly MINIMAL_TEST_PLUGINS.size (2)
            expect(storePlugins.length).toBe(MINIMAL_TEST_PLUGINS.size);
          });

          // Verify exactly the preset plugins are present, no extras, no duplicates
          const storePlugins = useRedTeamConfig.getState().config.plugins;
          const pluginIds = storePlugins.map((p) => (typeof p === 'string' ? p : p.id));

          // Check for duplicates
          const uniqueIds = new Set(pluginIds);
          expect(uniqueIds.size).toBe(pluginIds.length);

          // Check exact match with preset
          for (const expectedPlugin of MINIMAL_TEST_PLUGINS) {
            expect(uniqueIds.has(expectedPlugin)).toBe(true);
          }
          expect(uniqueIds.size).toBe(MINIMAL_TEST_PLUGINS.size);
        });
      });
    });

    describe('Plugin List Items', () => {
      describe('Select All Button', () => {
        test('Selects all visible plugins when no category filter is applied', async () => {
          const user = userEvent.setup();

          // Verify initial store state has no plugins
          expect(useRedTeamConfig.getState().config.plugins).toHaveLength(0);

          renderComponent();

          // Click the "Select all" button
          const selectAllButton = screen.getByText('Select all');
          await user.click(selectAllButton);

          // Get all visible plugin list items to count expected plugins
          const pluginListItems = screen.getAllByTestId(/^plugin-list-item-/);
          const expectedPluginCount = pluginListItems.length;

          // Verify the Zustand store was updated with all visible plugins
          await waitFor(() => {
            const storePlugins = useRedTeamConfig.getState().config.plugins;
            expect(storePlugins.length).toBe(expectedPluginCount);
          });

          // Verify specific plugins are in the store (from different categories)
          const storePlugins = useRedTeamConfig.getState().config.plugins;
          const pluginIds = new Set(storePlugins.map((p) => (typeof p === 'string' ? p : p.id)));

          // Check plugins from different categories exist in the store
          expect(pluginIds.has('sql-injection')).toBe(true); // Security & Access Control
          expect(pluginIds.has('harmful:hate')).toBe(true); // Trust & Safety
          expect(pluginIds.has('contracts')).toBe(true); // Compliance & Legal
        });

        test('Selects all visible plugins when a category filter is applied', async () => {
          const user = userEvent.setup();

          // Verify initial store state has no plugins
          expect(useRedTeamConfig.getState().config.plugins).toHaveLength(0);

          renderComponent();

          // Select "Trust & Safety" category
          const trustSafetyBadge = screen.getByText('Trust & Safety');
          await user.click(trustSafetyBadge);

          // Wait for filter to apply
          await waitFor(() => {
            expect(screen.getByTestId('plugin-list-item-harmful:hate')).toBeInTheDocument();
          });

          // Verify plugins from other categories are NOT visible
          expect(screen.queryByTestId('plugin-list-item-sql-injection')).not.toBeInTheDocument();

          // Get the count of visible plugins in this category
          const pluginListItems = screen.getAllByTestId(/^plugin-list-item-/);
          const expectedPluginCount = pluginListItems.length;

          // Click the "Select all" button
          const selectAllButton = screen.getByText('Select all');
          await user.click(selectAllButton);

          // Verify only the filtered category plugins were added
          await waitFor(() => {
            const storePlugins = useRedTeamConfig.getState().config.plugins;
            expect(storePlugins.length).toBe(expectedPluginCount);
          });

          // Verify Trust & Safety plugins are in the store
          const storePlugins = useRedTeamConfig.getState().config.plugins;
          const pluginIds = new Set(storePlugins.map((p) => (typeof p === 'string' ? p : p.id)));
          expect(pluginIds.has('harmful:hate')).toBe(true);
          expect(pluginIds.has('harmful:self-harm')).toBe(true);

          // Verify plugins from other categories are NOT in the store
          expect(pluginIds.has('sql-injection')).toBe(false);
          expect(pluginIds.has('contracts')).toBe(false);
        });

        test('Does not duplicate already selected plugins', async () => {
          const user = userEvent.setup();

          // Pre-populate the store with a plugin
          act(() => {
            useRedTeamConfig.setState({
              ...initialStoreState,
              config: {
                ...initialStoreState.config,
                plugins: ['harmful:hate'],
              },
            });
          });

          // Verify initial store state
          expect(useRedTeamConfig.getState().config.plugins).toHaveLength(1);

          renderComponent();

          // Get count of visible plugins before selecting all
          const pluginListItems = screen.getAllByTestId(/^plugin-list-item-/);
          const expectedPluginCount = pluginListItems.length;

          // Click the "Select all" button
          const selectAllButton = screen.getByText('Select all');
          await user.click(selectAllButton);

          // Verify no duplicates - count should match visible plugins
          await waitFor(() => {
            const storePlugins = useRedTeamConfig.getState().config.plugins;
            expect(storePlugins.length).toBe(expectedPluginCount);
          });

          // Verify harmful:hate appears only once
          const storePlugins = useRedTeamConfig.getState().config.plugins;
          const harmfulHatePlugins = storePlugins.filter(
            (p) => (typeof p === 'string' ? p : p.id) === 'harmful:hate',
          );
          expect(harmfulHatePlugins.length).toBe(1);
        });
      });

      describe('Select None Button', () => {
        test('Deselects all visible plugins', async () => {
          const user = userEvent.setup();

          // Pre-populate the store with several plugins
          act(() => {
            useRedTeamConfig.setState({
              ...initialStoreState,
              config: {
                ...initialStoreState.config,
                plugins: ['sql-injection', 'harmful:hate', 'contracts', 'bola'],
              },
            });
          });

          // Verify initial store state
          expect(useRedTeamConfig.getState().config.plugins).toHaveLength(4);

          renderComponent();

          // Click the "Select none" button
          const selectNoneButton = screen.getByText('Select none');
          await user.click(selectNoneButton);

          // Verify the Zustand store was emptied
          await waitFor(() => {
            const storePlugins = useRedTeamConfig.getState().config.plugins;
            expect(storePlugins.length).toBe(0);
          });
        });

        test('Only deselects visible plugins when a category filter is applied', async () => {
          const user = userEvent.setup();

          // Pre-populate the store with plugins from different categories
          act(() => {
            useRedTeamConfig.setState({
              ...initialStoreState,
              config: {
                ...initialStoreState.config,
                plugins: ['sql-injection', 'harmful:hate', 'harmful:self-harm', 'contracts'],
              },
            });
          });

          // Verify initial store state
          expect(useRedTeamConfig.getState().config.plugins).toHaveLength(4);

          renderComponent();

          // Select "Trust & Safety" category
          const trustSafetyBadge = screen.getByText('Trust & Safety');
          await user.click(trustSafetyBadge);

          // Wait for filter to apply
          await waitFor(() => {
            expect(screen.getByTestId('plugin-list-item-harmful:hate')).toBeInTheDocument();
          });

          // Click the "Select none" button
          const selectNoneButton = screen.getByText('Select none');
          await user.click(selectNoneButton);

          // Verify only Trust & Safety plugins were removed
          // sql-injection and contracts (other categories) should remain
          await waitFor(() => {
            const storePlugins = useRedTeamConfig.getState().config.plugins;
            const pluginIds = new Set(storePlugins.map((p) => (typeof p === 'string' ? p : p.id)));

            // These should be removed (Trust & Safety)
            expect(pluginIds.has('harmful:hate')).toBe(false);
            expect(pluginIds.has('harmful:self-harm')).toBe(false);

            // These should remain (other categories)
            expect(pluginIds.has('sql-injection')).toBe(true);
            expect(pluginIds.has('contracts')).toBe(true);
          });

          // Final count should be 2
          const storePlugins = useRedTeamConfig.getState().config.plugins;
          expect(storePlugins.length).toBe(2);
        });

        test('Has no effect when no plugins are selected', async () => {
          const user = userEvent.setup();

          // Verify initial store state has no plugins
          expect(useRedTeamConfig.getState().config.plugins).toHaveLength(0);

          renderComponent();

          // Click the "Select none" button
          const selectNoneButton = screen.getByText('Select none');
          await user.click(selectNoneButton);

          // Verify store is still empty
          await waitFor(() => {
            const storePlugins = useRedTeamConfig.getState().config.plugins;
            expect(storePlugins.length).toBe(0);
          });
        });
      });

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

    describe('Selected Plugins', () => {
      test('"Clear All" button clears all selected plugins', async () => {
        const user = userEvent.setup();

        // Pre-populate the store with plugins from different categories
        act(() => {
          useRedTeamConfig.setState({
            ...initialStoreState,
            config: {
              ...initialStoreState.config,
              plugins: ['sql-injection', 'harmful:hate', 'contracts', 'bola'],
            },
          });
        });

        // Verify initial store state
        expect(useRedTeamConfig.getState().config.plugins).toHaveLength(4);

        renderComponent();

        // Verify the "Clear All" button is visible
        const clearAllButton = screen.getByRole('button', { name: /clear all/i });
        expect(clearAllButton).toBeInTheDocument();

        // Click the "Clear All" button
        await user.click(clearAllButton);

        // Verify the Zustand store was completely emptied
        await waitFor(() => {
          const storePlugins = useRedTeamConfig.getState().config.plugins;
          expect(storePlugins.length).toBe(0);
        });
      });

      test('"Clear All" button is not shown when no plugins are selected', async () => {
        // Verify initial store state has no plugins
        expect(useRedTeamConfig.getState().config.plugins).toHaveLength(0);

        renderComponent();

        // Verify the "Clear All" button is not visible
        expect(screen.queryByRole('button', { name: /clear all/i })).not.toBeInTheDocument();
      });

      test('"Clear All" button clears all plugins regardless of category filter', async () => {
        const user = userEvent.setup();

        // Pre-populate the store with plugins from different categories
        act(() => {
          useRedTeamConfig.setState({
            ...initialStoreState,
            config: {
              ...initialStoreState.config,
              plugins: ['sql-injection', 'harmful:hate', 'contracts', 'bola'],
            },
          });
        });

        // Verify initial store state
        expect(useRedTeamConfig.getState().config.plugins).toHaveLength(4);

        renderComponent();

        // Apply a category filter that shows only some selected plugins
        const trustSafetyBadge = screen.getByText('Trust & Safety');
        await user.click(trustSafetyBadge);

        // Wait for filter to apply
        await waitFor(() => {
          expect(screen.getByTestId('plugin-list-item-harmful:hate')).toBeInTheDocument();
        });

        // Verify sql-injection is NOT visible in the list (different category)
        expect(screen.queryByTestId('plugin-list-item-sql-injection')).not.toBeInTheDocument();

        // Click the "Clear All" button in the sidebar
        const clearAllButton = screen.getByRole('button', { name: /clear all/i });
        await user.click(clearAllButton);

        // Verify ALL plugins were cleared, not just the visible ones
        await waitFor(() => {
          const storePlugins = useRedTeamConfig.getState().config.plugins;
          expect(storePlugins.length).toBe(0);
        });
      });
    });
  });
});
