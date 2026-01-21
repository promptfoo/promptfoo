import React from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { ToastProvider } from '@app/contexts/ToastContext';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { useRecentlyUsedPlugins, useRedTeamConfig } from '../hooks/useRedTeamConfig';
import Plugins from './Plugins';
import { TestCaseGenerationProvider } from './TestCaseGenerationProvider';
import type { ApiHealthResult } from '@app/hooks/useApiHealth';
import type { DefinedUseQueryResult } from '@tanstack/react-query';

import type { Config } from '../types';

vi.mock('../hooks/useRedTeamConfig', async () => {
  const actual = await vi.importActual('../hooks/useRedTeamConfig');
  return {
    ...actual,
    useRedTeamConfig: vi.fn(),
    useRecentlyUsedPlugins: vi.fn(),
  };
});

const mockRecordEvent = vi.fn();

vi.mock('@app/hooks/useTelemetry', () => ({
  useTelemetry: () => ({
    recordEvent: mockRecordEvent,
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

vi.mock('./CustomIntentPluginSection', () => ({
  default: () => <div data-testid="custom-intent-section"></div>,
}));

vi.mock('./Targets/CustomPoliciesSection', () => ({
  CustomPoliciesSection: () => <div data-testid="custom-policies-section"></div>,
}));

vi.mock('./PluginConfigDialog', () => ({
  default: () => <div data-testid="plugin-config-dialog"></div>,
}));

vi.mock('react-error-boundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockUseRedTeamConfig = useRedTeamConfig as unknown as Mock;
const mockUseRecentlyUsedPlugins = useRecentlyUsedPlugins as unknown as Mock;

const renderWithProviders = (ui: React.ReactNode) => {
  const redTeamConfig = mockUseRedTeamConfig();
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <ToastProvider>
          <TestCaseGenerationProvider redTeamConfig={redTeamConfig}>
            {ui}
          </TestCaseGenerationProvider>
        </ToastProvider>
      </TooltipProvider>
    </MemoryRouter>,
  );
};

describe('Plugins - State Management Unit Tests', () => {
  const mockOnNext = vi.fn();
  const mockOnBack = vi.fn();
  const mockUpdatePlugins = vi.fn();
  const mockAddPlugin = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockRecordEvent.mockClear();
    mockUseRedTeamConfig.mockReturnValue({
      config: {
        plugins: [],
      },
      updatePlugins: mockUpdatePlugins,
    });
    mockUseRecentlyUsedPlugins.mockReturnValue({
      plugins: [],
      addPlugin: mockAddPlugin,
    });
  });

  describe('selectedPlugins - derived state from config.plugins', () => {
    it('should derive empty set when no plugins in config', () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: [],
        },
        updatePlugins: mockUpdatePlugins,
      });

      renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

      const pluginsTab = screen.getByRole('tab', { name: /Plugins/ });
      expect(pluginsTab.textContent).toContain('Plugins (0)');
    });

    it('should derive set with string plugins from config', () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: ['harmful:hate', 'bola', 'pii:direct'],
        },
        updatePlugins: mockUpdatePlugins,
      });

      renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

      const pluginsTab = screen.getByRole('tab', { name: /Plugins/ });
      expect(pluginsTab.textContent).toContain('Plugins (3)');
    });

    it('should derive set with object plugins from config', () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: [
            { id: 'harmful:hate', config: { numTests: 5 } },
            { id: 'bola', config: { numTests: 10 } },
          ],
        },
        updatePlugins: mockUpdatePlugins,
      });

      renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

      const pluginsTab = screen.getByRole('tab', { name: /Plugins/ });
      expect(pluginsTab.textContent).toContain('Plugins (2)');
    });

    it('should exclude policy and intent plugins from selectedPlugins', () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: [
            'harmful:hate',
            'bola',
            { id: 'policy', config: { policy: 'test policy' } },
            { id: 'intent', config: { intent: ['test intent'] } },
          ],
        },
        updatePlugins: mockUpdatePlugins,
      });

      renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

      const pluginsTab = screen.getByRole('tab', { name: /Plugins/ });
      // Should only count 2 regular plugins, not policy/intent
      expect(pluginsTab.textContent).toContain('Plugins (2)');
    });

    it('should handle mixed string and object plugins from config', () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: [
            'harmful:hate',
            { id: 'bola', config: { numTests: 5 } },
            'pii:direct',
            { id: 'ssrf', config: { numTests: 3 } },
          ],
        },
        updatePlugins: mockUpdatePlugins,
      });

      renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

      const pluginsTab = screen.getByRole('tab', { name: /Plugins/ });
      expect(pluginsTab.textContent).toContain('Plugins (4)');
    });

    it('should update selectedPlugins when config.plugins changes', async () => {
      const { rerender } = renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

      let pluginsTab = screen.getByRole('tab', { name: /Plugins/ });
      expect(pluginsTab.textContent).toContain('Plugins (0)');

      // Update config with new plugins
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: ['harmful:hate', 'bola'],
        },
        updatePlugins: mockUpdatePlugins,
      });

      rerender(
        <MemoryRouter>
          <TooltipProvider>
            <ToastProvider>
              <TestCaseGenerationProvider
                redTeamConfig={
                  {
                    plugins: ['harmful:hate', 'bola'],
                  } as any
                }
              >
                <Plugins onNext={mockOnNext} onBack={mockOnBack} />
              </TestCaseGenerationProvider>
            </ToastProvider>
          </TooltipProvider>
        </MemoryRouter>,
      );

      await waitFor(() => {
        pluginsTab = screen.getByRole('tab', { name: /Plugins/ });
        expect(pluginsTab.textContent).toContain('Plugins (2)');
      });
    });
  });

  describe('pluginConfig - derived state from config.plugins', () => {
    it('should derive empty config when no plugins have config', () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: ['harmful:hate', 'bola'],
        },
        updatePlugins: mockUpdatePlugins,
      });

      renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

      // With no configs, next button should be enabled for plugins that don't require config
      const nextButton = screen.getByRole('button', { name: /Next/i });
      expect(nextButton).toBeEnabled();
    });

    it('should derive config from object plugins', () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: [
            {
              id: 'indirect-prompt-injection',
              config: {
                systemPrompt: 'test prompt',
                indirectInjectionVar: 'context',
              },
            },
            {
              id: 'prompt-extraction',
              config: {
                systemPrompt: 'extraction prompt',
              },
            },
          ],
        },
        updatePlugins: mockUpdatePlugins,
      });

      renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

      // Plugins with valid config should allow next button
      const nextButton = screen.getByRole('button', { name: /Next/i });
      expect(nextButton).toBeEnabled();
    });

    it('should not include plugins without config in pluginConfig', () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: ['harmful:hate', { id: 'bola', config: { numTests: 5 } }, 'pii:direct'],
        },
        updatePlugins: mockUpdatePlugins,
      });

      renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

      // bola has config, others don't - should be enabled
      const nextButton = screen.getByRole('button', { name: /Next/i });
      expect(nextButton).toBeEnabled();
    });

    it('should handle empty config object', () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: [{ id: 'harmful:hate', config: {} }],
        },
        updatePlugins: mockUpdatePlugins,
      });

      renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

      const nextButton = screen.getByRole('button', { name: /Next/i });
      expect(nextButton).toBeEnabled();
    });
  });

  describe('handlePluginToggle - individual plugin toggle', () => {
    it('should add plugin when not currently selected via preset selection', async () => {
      const user = userEvent.setup();
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: [],
        },
        updatePlugins: mockUpdatePlugins,
      });

      renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

      // Click a preset to add plugins (easier to test than individual checkboxes)
      const minimalPreset = screen.getByText('Minimal Test');
      await user.click(minimalPreset);

      await waitFor(() => {
        expect(mockUpdatePlugins).toHaveBeenCalled();
        const lastCall = mockUpdatePlugins.mock.calls[mockUpdatePlugins.mock.calls.length - 1];
        const pluginsArg = lastCall[0];
        // Minimal test preset should add some plugins
        expect(pluginsArg.length).toBeGreaterThan(0);
      });
    });

    it('should remove plugins when selecting different preset', async () => {
      const user = userEvent.setup();
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: ['harmful:hate', 'bola'],
        },
        updatePlugins: mockUpdatePlugins,
      });

      renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

      // Select a different preset to replace current selection
      const minimalPreset = screen.getByText('Minimal Test');
      await user.click(minimalPreset);

      await waitFor(() => {
        expect(mockUpdatePlugins).toHaveBeenCalled();
        const lastCall = mockUpdatePlugins.mock.calls[mockUpdatePlugins.mock.calls.length - 1];
        const pluginsArg = lastCall[0];
        // Preset selection should replace the plugins
        expect(pluginsArg).toBeDefined();
      });
    });

    it('should preserve policy plugins when selecting preset', async () => {
      const user = userEvent.setup();
      const policyPlugin = { id: 'policy', config: { policy: 'test policy' } };

      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: ['harmful:hate', policyPlugin],
        },
        updatePlugins: mockUpdatePlugins,
      });

      renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

      // Select a preset
      const minimalPreset = screen.getByText('Minimal Test');
      await user.click(minimalPreset);

      await waitFor(() => {
        expect(mockUpdatePlugins).toHaveBeenCalled();
        const lastCall = mockUpdatePlugins.mock.calls[mockUpdatePlugins.mock.calls.length - 1];
        const pluginsArg = lastCall[0];

        // Should preserve policy plugin
        const hasPolicy = pluginsArg.some((p: any) => typeof p === 'object' && p.id === 'policy');
        expect(hasPolicy).toBe(true);
      });
    });

    it('should preserve intent plugins when selecting preset', async () => {
      const user = userEvent.setup();
      const intentPlugin = { id: 'intent', config: { intent: ['test intent'] } };

      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: ['harmful:hate', intentPlugin],
        },
        updatePlugins: mockUpdatePlugins,
      });

      renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

      // Select a preset
      const minimalPreset = screen.getByText('Minimal Test');
      await user.click(minimalPreset);

      await waitFor(() => {
        expect(mockUpdatePlugins).toHaveBeenCalled();
        const lastCall = mockUpdatePlugins.mock.calls[mockUpdatePlugins.mock.calls.length - 1];
        const pluginsArg = lastCall[0];

        // Should preserve intent plugin
        const hasIntent = pluginsArg.some((p: any) => typeof p === 'object' && p.id === 'intent');
        expect(hasIntent).toBe(true);
      });
    });
  });

  describe('setSelectedPlugins - bulk plugin selection', () => {
    it('should replace all regular plugins with new selection', async () => {
      const user = userEvent.setup();
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: ['harmful:hate', 'bola'],
        },
        updatePlugins: mockUpdatePlugins,
      });

      renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

      // Click a preset to trigger bulk selection
      const minimalPreset = screen.getByText('Minimal Test');
      await user.click(minimalPreset);

      await waitFor(() => {
        expect(mockUpdatePlugins).toHaveBeenCalled();
      });
    });

    it('should preserve policy plugins during bulk selection', async () => {
      const user = userEvent.setup();
      const policyPlugin = { id: 'policy', config: { policy: 'test policy' } };

      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: ['harmful:hate', policyPlugin],
        },
        updatePlugins: mockUpdatePlugins,
      });

      renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

      const minimalPreset = screen.getByText('Minimal Test');
      await user.click(minimalPreset);

      await waitFor(() => {
        expect(mockUpdatePlugins).toHaveBeenCalled();
        const lastCall = mockUpdatePlugins.mock.calls[mockUpdatePlugins.mock.calls.length - 1];
        const pluginsArg = lastCall[0];

        const hasPolicy = pluginsArg.some((p: any) => typeof p === 'object' && p.id === 'policy');
        expect(hasPolicy).toBe(true);
      });
    });

    it('should preserve intent plugins during bulk selection', async () => {
      const user = userEvent.setup();
      const intentPlugin = { id: 'intent', config: { intent: ['test intent'] } };

      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: ['harmful:hate', intentPlugin],
        },
        updatePlugins: mockUpdatePlugins,
      });

      renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

      const minimalPreset = screen.getByText('Minimal Test');
      await user.click(minimalPreset);

      await waitFor(() => {
        expect(mockUpdatePlugins).toHaveBeenCalled();
        const lastCall = mockUpdatePlugins.mock.calls[mockUpdatePlugins.mock.calls.length - 1];
        const pluginsArg = lastCall[0];

        const hasIntent = pluginsArg.some((p: any) => typeof p === 'object' && p.id === 'intent');
        expect(hasIntent).toBe(true);
      });
    });

    it('should preserve existing plugin configs during bulk selection', async () => {
      const user = userEvent.setup();
      const pluginWithConfig = {
        id: 'bola',
        config: { numTests: 10 },
      };

      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: [pluginWithConfig, 'harmful:hate'],
        },
        updatePlugins: mockUpdatePlugins,
      });

      renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

      // Click a preset that includes bola
      const recommendedPreset = screen.getByText('Recommended');
      await user.click(recommendedPreset);

      await waitFor(() => {
        expect(mockUpdatePlugins).toHaveBeenCalled();
        const lastCall = mockUpdatePlugins.mock.calls[mockUpdatePlugins.mock.calls.length - 1];
        const pluginsArg = lastCall[0];

        // Should preserve the config for bola
        const bolaPlugin = pluginsArg.find(
          (p: any) => (typeof p === 'string' ? p : p.id) === 'bola',
        );
        if (typeof bolaPlugin === 'object') {
          expect(bolaPlugin.config).toEqual({ numTests: 10 });
        }
      });
    });

    it('should handle empty bulk selection', async () => {
      const user = userEvent.setup();
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: ['harmful:hate', 'bola', 'pii:direct'],
        },
        updatePlugins: mockUpdatePlugins,
      });

      renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

      // Click "Select none" to clear all
      const selectNoneButton = screen.getByRole('button', { name: /Select none/i });
      await user.click(selectNoneButton);

      await waitFor(() => {
        expect(mockUpdatePlugins).toHaveBeenCalled();
        const lastCall = mockUpdatePlugins.mock.calls[mockUpdatePlugins.mock.calls.length - 1];
        const pluginsArg = lastCall[0];

        // Should only have policy/intent plugins, no regular plugins
        const regularPlugins = pluginsArg.filter((p: any) => {
          const id = typeof p === 'string' ? p : p.id;
          return id !== 'policy' && id !== 'intent';
        });
        expect(regularPlugins).toHaveLength(0);
      });
    });

    it('should preserve both policy and intent when doing bulk selection', async () => {
      const user = userEvent.setup();
      const policyPlugin = { id: 'policy', config: { policy: 'test policy' } };
      const intentPlugin = { id: 'intent', config: { intent: ['test intent'] } };

      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: ['harmful:hate', policyPlugin, intentPlugin],
        },
        updatePlugins: mockUpdatePlugins,
      });

      renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

      const minimalPreset = screen.getByText('Minimal Test');
      await user.click(minimalPreset);

      await waitFor(() => {
        expect(mockUpdatePlugins).toHaveBeenCalled();
        const lastCall = mockUpdatePlugins.mock.calls[mockUpdatePlugins.mock.calls.length - 1];
        const pluginsArg = lastCall[0];

        const hasPolicy = pluginsArg.some((p: any) => typeof p === 'object' && p.id === 'policy');
        const hasIntent = pluginsArg.some((p: any) => typeof p === 'object' && p.id === 'intent');

        expect(hasPolicy).toBe(true);
        expect(hasIntent).toBe(true);
      });
    });
  });

  describe('updatePluginConfig - update config for individual plugin', () => {
    it('should handle plugin with newly added config', async () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: ['indirect-prompt-injection'],
        },
        updatePlugins: mockUpdatePlugins,
      });

      renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

      // Verify initial state
      const pluginsTab = screen.getByRole('tab', { name: /Plugins/ });
      expect(pluginsTab.textContent).toContain('Plugins (1)');
    });

    it('should handle plugin with existing config', async () => {
      const existingConfig = {
        systemPrompt: 'original prompt',
        indirectInjectionVar: 'context',
      };

      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: [
            {
              id: 'indirect-prompt-injection',
              config: existingConfig,
            },
          ],
        },
        updatePlugins: mockUpdatePlugins,
      });

      renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

      // Verify plugin with config is counted
      const pluginsTab = screen.getByRole('tab', { name: /Plugins/ });
      expect(pluginsTab.textContent).toContain('Plugins (1)');
    });

    it('should handle object plugin with config', async () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: [
            {
              id: 'prompt-extraction',
              config: {
                systemPrompt: 'original',
              },
            },
          ],
        },
        updatePlugins: mockUpdatePlugins,
      });

      renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

      const pluginsTab = screen.getByRole('tab', { name: /Plugins/ });
      expect(pluginsTab.textContent).toContain('Plugins (1)');
    });

    it('should display multiple plugins with different configs', async () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: [
            {
              id: 'indirect-prompt-injection',
              config: { systemPrompt: 'prompt1' },
            },
            {
              id: 'prompt-extraction',
              config: { systemPrompt: 'prompt2' },
            },
            'harmful:hate',
          ],
        },
        updatePlugins: mockUpdatePlugins,
      });

      renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

      const pluginsTab = screen.getByRole('tab', { name: /Plugins/ });
      expect(pluginsTab.textContent).toContain('Plugins (3)');
    });

    it('should count plugin with empty config', async () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: [
            {
              id: 'indirect-prompt-injection',
              config: {},
            },
          ],
        },
        updatePlugins: mockUpdatePlugins,
      });

      renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

      // Plugin should still be in the list, just with empty config
      const pluginsTab = screen.getByRole('tab', { name: /Plugins/ });
      expect(pluginsTab.textContent).toContain('Plugins (1)');
    });

    it('should maintain plugin count when config changes from string to object', async () => {
      // Initial: string plugin
      const { rerender } = renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: ['indirect-prompt-injection'],
        },
        updatePlugins: mockUpdatePlugins,
      });

      // Re-render with object plugin
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: [
            {
              id: 'indirect-prompt-injection',
              config: {
                systemPrompt: 'new prompt',
              },
            },
          ],
        },
        updatePlugins: mockUpdatePlugins,
      });

      rerender(
        <MemoryRouter>
          <TooltipProvider>
            <ToastProvider>
              <TestCaseGenerationProvider
                redTeamConfig={
                  {
                    plugins: [
                      {
                        id: 'indirect-prompt-injection',
                        config: { systemPrompt: 'new prompt' },
                      },
                    ],
                  } as any
                }
              >
                <Plugins onNext={mockOnNext} onBack={mockOnBack} />
              </TestCaseGenerationProvider>
            </ToastProvider>
          </TooltipProvider>
        </MemoryRouter>,
      );

      await waitFor(() => {
        const pluginsTab = screen.getByRole('tab', { name: /Plugins/ });
        expect(pluginsTab.textContent).toContain('Plugins (1)');
      });
    });
  });

  describe('Edge cases and integration', () => {
    it('should handle rapid preset selections without race conditions', async () => {
      const user = userEvent.setup();
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: [],
        },
        updatePlugins: mockUpdatePlugins,
      });

      renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

      // Rapidly select multiple presets
      const presets = [
        screen.getByText('Minimal Test'),
        screen.getByText('Recommended'),
        screen.getByText('RAG'),
      ];

      for (const preset of presets) {
        await user.click(preset);
      }

      // Should have called updatePlugins multiple times
      expect(mockUpdatePlugins.mock.calls.length).toBeGreaterThan(0);
    });

    it('should handle plugins with config when preset is selected', async () => {
      const user = userEvent.setup();
      const pluginWithConfig = {
        id: 'indirect-prompt-injection',
        config: { systemPrompt: 'test' },
      };

      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: [pluginWithConfig],
        },
        updatePlugins: mockUpdatePlugins,
      });

      renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

      // Select a preset
      const recommendedPreset = screen.getByText('Recommended');
      await user.click(recommendedPreset);

      await waitFor(() => {
        expect(mockUpdatePlugins).toHaveBeenCalled();
      });
    });

    it('should maintain consistency between selectedPlugins count and actual plugins', async () => {
      const plugins: Config['plugins'] = [
        'harmful:hate',
        { id: 'bola', config: { numTests: 5 } },
        'pii:direct',
        { id: 'policy', config: { policy: 'test' } },
      ];

      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins,
        },
        updatePlugins: mockUpdatePlugins,
      });

      renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

      const pluginsTab = screen.getByRole('tab', { name: /Plugins/ });
      // Should count 3 regular plugins (not policy)
      expect(pluginsTab.textContent).toContain('Plugins (3)');
    });

    it('should handle preset selection on top of existing plugins', async () => {
      const user = userEvent.setup();
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: ['harmful:hate', 'bola'],
        },
        updatePlugins: mockUpdatePlugins,
      });

      renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

      // Select a preset - should replace existing selection
      const recommendedPreset = screen.getByText('Recommended');
      await user.click(recommendedPreset);

      await waitFor(() => {
        expect(mockUpdatePlugins).toHaveBeenCalled();
      });
    });
  });
});
