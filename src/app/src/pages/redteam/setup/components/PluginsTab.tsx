import { useCallback, useMemo, useState } from 'react';

import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import { Checkbox } from '@app/components/ui/checkbox';
import { Input } from '@app/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { useApiHealth } from '@app/hooks/useApiHealth';
import useCloudConfig from '@app/hooks/useCloudConfig';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { useToast } from '@app/hooks/useToast';
import { cn } from '@app/lib/utils';
import {
  categoryAliases,
  DEFAULT_PLUGINS,
  displayNameOverrides,
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
  PLUGIN_PRESET_DESCRIPTIONS,
  type Plugin,
  RAG_PLUGINS,
  riskCategories,
  subCategoryDescriptions,
  UI_DISABLED_WHEN_REMOTE_UNAVAILABLE,
} from '@promptfoo/redteam/constants';
import { AlertCircle, HelpCircle, Minus, Search, Settings } from 'lucide-react';
import { ErrorBoundary } from 'react-error-boundary';
import { requiresPluginConfig } from '../constants';
import PluginConfigDialog from './PluginConfigDialog';
import PresetCard from './PresetCard';
import {
  getPluginDocumentationUrl,
  hasSpecificPluginDocumentation,
} from './pluginDocumentationMap';
import { TestCaseGenerateButton } from './TestCaseDialog';
import { useTestCaseGeneration } from './TestCaseGenerationProvider';
import VerticalSuiteCard from './VerticalSuiteCard';
import { DOMAIN_SPECIFIC_PLUGINS, VERTICAL_SUITES } from './verticalSuites';
import type { PluginConfig } from '@promptfoo/redteam/types';

import type { LocalPluginConfig } from '../types';

const ErrorFallback = ({ error }: { error: unknown }) => (
  <div role="alert">
    <p>Something went wrong:</p>
    <pre>{error instanceof Error ? error.message : String(error)}</pre>
  </div>
);

export interface PluginsTabProps {
  selectedPlugins: Set<Plugin>;
  handlePluginToggle: (plugin: Plugin) => void;
  setSelectedPlugins: (plugins: Set<Plugin>) => void;
  pluginConfig: LocalPluginConfig;
  updatePluginConfig: (plugin: string, newConfig: Partial<LocalPluginConfig[string]>) => void;
  recentlyUsedPlugins: Plugin[];
  isRemoteGenerationDisabled: boolean;
}

export default function PluginsTab({
  selectedPlugins,
  handlePluginToggle,
  setSelectedPlugins,
  pluginConfig,
  updatePluginConfig,
  recentlyUsedPlugins,
  isRemoteGenerationDisabled,
}: PluginsTabProps): React.ReactElement {
  const { recordEvent } = useTelemetry();
  const toast = useToast();

  const isPluginDisabled = useCallback(
    (plugin: Plugin) => {
      return (
        isRemoteGenerationDisabled &&
        UI_DISABLED_WHEN_REMOTE_UNAVAILABLE.includes(
          plugin as (typeof UI_DISABLED_WHEN_REMOTE_UNAVAILABLE)[number],
        )
      );
    },
    [isRemoteGenerationDisabled],
  );

  // Internal state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [selectedConfigPlugin, setSelectedConfigPlugin] = useState<Plugin | null>(null);
  const [isCustomMode, setIsCustomMode] = useState(true);

  const {
    data: { status: apiHealthStatus },
  } = useApiHealth();

  // Check if user has enterprise access (cloud enabled)
  const { data: cloudConfig } = useCloudConfig();
  const hasEnterpriseAccess = cloudConfig?.isEnabled ?? false;

  // Test case generation state - now from context
  const {
    generateTestCase,
    isGenerating: generatingTestCase,
    plugin: generatingPlugin,
  } = useTestCaseGeneration();

  // Presets
  const presets: {
    name: keyof typeof PLUGIN_PRESET_DESCRIPTIONS;
    plugins: Set<Plugin> | ReadonlySet<Plugin>;
  }[] = useMemo(
    () => [
      {
        name: 'Recommended',
        plugins: DEFAULT_PLUGINS,
      },
      {
        name: 'Minimal Test',
        plugins: MINIMAL_TEST_PLUGINS,
      },
      {
        name: 'RAG',
        plugins: RAG_PLUGINS,
      },
      {
        name: 'Foundation',
        plugins: new Set(FOUNDATION_PLUGINS),
      },
      {
        name: 'Guardrails Evaluation',
        plugins: new Set(GUARDRAILS_EVALUATION_PLUGINS),
      },
      {
        name: 'MCP',
        plugins: new Set(MCP_PLUGINS),
      },
      {
        name: 'Harmful',
        plugins: new Set(Object.keys(HARM_PLUGINS) as Plugin[]),
      },
      {
        name: 'NIST',
        plugins: new Set(Object.values(NIST_AI_RMF_MAPPING).flatMap((v) => v.plugins)),
      },
      {
        name: 'OWASP LLM Top 10',
        plugins: new Set(Object.values(OWASP_LLM_TOP_10_MAPPING).flatMap((v) => v.plugins)),
      },
      {
        name: 'OWASP Gen AI Red Team',
        plugins: new Set(Object.values(OWASP_LLM_RED_TEAM_MAPPING).flatMap((v) => v.plugins)),
      },
      {
        name: 'OWASP API Top 10',
        plugins: new Set(Object.values(OWASP_API_TOP_10_MAPPING).flatMap((v) => v.plugins)),
      },
      {
        name: 'OWASP Top 10 for Agentic Applications',
        plugins: new Set(Object.values(OWASP_AGENTIC_TOP_10_MAPPING).flatMap((v) => v.plugins)),
      },
      {
        name: 'MITRE',
        plugins: new Set(Object.values(MITRE_ATLAS_MAPPING).flatMap((v) => v.plugins)),
      },
      {
        name: 'EU AI Act',
        plugins: new Set(Object.values(EU_AI_ACT_MAPPING).flatMap((v) => v.plugins)),
      },
      {
        name: 'ISO 42001',
        plugins: new Set(Object.values(ISO_42001_MAPPING).flatMap((v) => v.plugins)),
      },
      {
        name: 'GDPR',
        plugins: new Set(Object.values(GDPR_MAPPING).flatMap((v) => v.plugins)),
      },
    ],
    [],
  );

  // Helper functions
  const isPluginConfigured = useCallback(
    (plugin: Plugin) => {
      if (plugin === 'policy' || !requiresPluginConfig(plugin)) {
        return true;
      }
      const config = pluginConfig[plugin];
      if (!config || Object.keys(config).length === 0) {
        return false;
      }

      for (const key in config) {
        const value = config[key as keyof PluginConfig];
        if (Array.isArray(value) && value.length === 0) {
          return false;
        }
        if (typeof value === 'string' && value.trim() === '') {
          return false;
        }
      }
      return true;
    },
    [pluginConfig],
  );

  // Category filters with plugin counts
  const categoryFilters = useMemo(
    () =>
      Object.entries(riskCategories).map(([category, plugins]) => ({
        key: category,
        label: category,
        count: plugins.filter((p) => p !== 'intent' && p !== 'policy').length,
      })),
    [],
  );

  const allCategoryFilters = useMemo(
    () => [
      ...(recentlyUsedPlugins.length > 0
        ? [{ key: 'Recently Used', label: 'Recently Used', count: recentlyUsedPlugins.length }]
        : []),
      ...(selectedPlugins.size > 0
        ? [{ key: 'Selected', label: 'Selected', count: selectedPlugins.size }]
        : []),
      ...categoryFilters,
    ],
    [recentlyUsedPlugins.length, selectedPlugins.size, categoryFilters],
  );

  // Check if we're showing domain-specific category
  const showingDomainSpecific = useMemo(
    () => selectedCategory === 'Domain-Specific Risks',
    [selectedCategory],
  );

  // Get all plugins with categories
  const allPluginsWithCategories = useMemo(() => {
    const pluginsWithCategories: Array<{ plugin: Plugin; category: string }> = [];

    if (selectedCategory === 'Selected') {
      Array.from(selectedPlugins).forEach((plugin) => {
        let originalCategory = 'Other';
        if (recentlyUsedPlugins.includes(plugin)) {
          originalCategory = 'Recently Used';
        } else {
          for (const [category, plugins] of Object.entries(riskCategories)) {
            if (plugins.includes(plugin)) {
              originalCategory = category;
              break;
            }
          }
        }
        pluginsWithCategories.push({ plugin, category: originalCategory });
      });
      return pluginsWithCategories;
    }

    if (
      recentlyUsedPlugins.length > 0 &&
      (!selectedCategory || selectedCategory === 'Recently Used')
    ) {
      recentlyUsedPlugins.forEach((plugin) => {
        pluginsWithCategories.push({ plugin, category: 'Recently Used' });
      });
    }

    if (
      !selectedCategory ||
      (selectedCategory !== 'Recently Used' && selectedCategory !== 'Selected')
    ) {
      Object.entries(riskCategories).forEach(([category, plugins]) => {
        if (!selectedCategory || selectedCategory === category) {
          plugins
            .filter((plugin) => plugin !== 'intent' && plugin !== 'policy')
            .forEach((plugin) => {
              // Skip domain-specific plugins when rendering flat list
              if (!DOMAIN_SPECIFIC_PLUGINS.includes(plugin)) {
                if (!pluginsWithCategories.some((p) => p.plugin === plugin)) {
                  pluginsWithCategories.push({ plugin, category });
                }
              }
            });
        }
      });
    }

    return pluginsWithCategories;
  }, [selectedCategory, recentlyUsedPlugins, selectedPlugins]);

  // Filter plugins based on search term
  const filteredPlugins = useMemo(() => {
    let plugins = allPluginsWithCategories;

    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      plugins = plugins.filter(({ plugin }) => {
        return (
          plugin.toLowerCase().includes(lowerSearchTerm) ||
          HARM_PLUGINS[plugin as keyof typeof HARM_PLUGINS]
            ?.toLowerCase()
            .includes(lowerSearchTerm) ||
          displayNameOverrides[plugin as keyof typeof displayNameOverrides]
            ?.toLowerCase()
            .includes(lowerSearchTerm) ||
          categoryAliases[plugin as keyof typeof categoryAliases]
            ?.toLowerCase()
            .includes(lowerSearchTerm) ||
          subCategoryDescriptions[plugin]?.toLowerCase().includes(lowerSearchTerm)
        );
      });
    }

    // Sort plugins alphabetically by display name (case-insensitive)
    const getDisplayName = (plugin: Plugin) => {
      return (displayNameOverrides[plugin] || categoryAliases[plugin] || plugin).toLowerCase();
    };

    return plugins.sort((a, b) => {
      const displayNameA = getDisplayName(a.plugin);
      const displayNameB = getDisplayName(b.plugin);

      return displayNameA.localeCompare(displayNameB);
    });
  }, [searchTerm, allPluginsWithCategories]);

  const currentlySelectedPreset = useMemo(
    () =>
      presets.find(
        (p) =>
          Array.from(p.plugins as Set<Plugin>).every((plugin) => selectedPlugins.has(plugin)) &&
          p.plugins.size === selectedPlugins.size,
      ),
    [presets, selectedPlugins],
  );

  // Split selected plugins into configured vs needing configuration
  const { pluginsNeedingConfig, configuredPlugins } = useMemo(() => {
    const needsConfig: Plugin[] = [];
    const configured: Plugin[] = [];

    for (const plugin of selectedPlugins) {
      if (requiresPluginConfig(plugin) && !isPluginConfigured(plugin)) {
        needsConfig.push(plugin);
      } else {
        configured.push(plugin);
      }
    }

    return { pluginsNeedingConfig: needsConfig, configuredPlugins: configured };
  }, [selectedPlugins, isPluginConfigured]);

  // Event handlers
  const handleCategoryToggle = useCallback((category: string) => {
    setSelectedCategory((prev) => (prev === category ? undefined : category));
  }, []);

  const handlePresetSelect = useCallback(
    (preset: { name: string; plugins: Set<Plugin> | ReadonlySet<Plugin> }) => {
      recordEvent('feature_used', {
        feature: 'redteam_config_plugins_preset_selected',
        preset: preset.name,
      });
      if (preset.name === 'Custom') {
        setIsCustomMode(true);
      } else {
        // Use setSelectedPlugins for efficient bulk update
        setSelectedPlugins(new Set(preset.plugins as Set<Plugin>));
        setIsCustomMode(false);
      }
    },
    [recordEvent, setSelectedPlugins],
  );

  const handleGenerateTestCase = useCallback(
    async (plugin: Plugin) => {
      // For plugins that require config, we need to show config dialog first
      if (requiresPluginConfig(plugin)) {
        setSelectedConfigPlugin(plugin);
        setConfigDialogOpen(true);
      }
      // Directly generate test case
      else {
        await generateTestCase(
          { id: plugin, config: pluginConfig[plugin] ?? {}, isStatic: false },
          { id: 'basic', config: {}, isStatic: true },
        );
      }
    },
    [pluginConfig, generateTestCase],
  );

  const handleConfigClick = useCallback((plugin: Plugin) => {
    setSelectedConfigPlugin(plugin);
    setConfigDialogOpen(true);
  }, []);

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <div className="flex w-full items-start gap-6" data-testid="plugins-tab-container">
        {/* Main content */}
        <div className="min-w-0 flex-1">
          {/* Presets section */}
          <div className="mb-6">
            <h3 className="mb-4 text-lg font-semibold">Presets</h3>

            <div className="mb-6 grid auto-rows-fr grid-cols-[repeat(auto-fill,230px)] gap-3">
              {presets.map((preset) => {
                const isSelected =
                  preset.name === 'Custom'
                    ? isCustomMode
                    : preset.name === currentlySelectedPreset?.name;
                return (
                  <PresetCard
                    key={preset.name}
                    name={preset.name}
                    description={PLUGIN_PRESET_DESCRIPTIONS[preset.name] || ''}
                    isSelected={isSelected}
                    onClick={() => handlePresetSelect(preset)}
                  />
                );
              })}
            </div>
          </div>

          {/* Filter by category */}
          <div className="mb-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedCategory(undefined)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1.5 text-sm font-medium transition-all',
                  selectedCategory === undefined
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:bg-muted/50 hover:text-foreground',
                )}
              >
                All
              </button>
              {allCategoryFilters.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => handleCategoryToggle(filter.key)}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1.5 text-sm font-medium transition-all',
                    selectedCategory === filter.key
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:bg-muted/50 hover:text-foreground',
                  )}
                >
                  {filter.label}
                  <span
                    className={cn(
                      'inline-flex size-5 items-center justify-center rounded-full text-xs',
                      selectedCategory === filter.key
                        ? 'bg-primary-foreground/20 text-primary-foreground'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {filter.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Search */}
          <div className="mb-6">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                data-testid="plugin-search-input"
                placeholder="Search plugins..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Bulk selection actions - hide for domain-specific view */}
          {!showingDomainSpecific && (
            <div className="mb-4 flex justify-end gap-4">
              <button
                type="button"
                className="text-sm text-primary hover:underline"
                onClick={() => {
                  // Collect all filtered plugins and merge with existing selection
                  setSelectedPlugins(
                    new Set([...selectedPlugins, ...filteredPlugins.map(({ plugin }) => plugin)]),
                  );
                }}
              >
                Select all
              </button>
              <button
                type="button"
                className="text-sm text-primary hover:underline"
                onClick={() => {
                  // Remove only the filtered plugins from selection
                  const filteredPluginIds = new Set(filteredPlugins.map((p) => p.plugin));
                  const newSelected = new Set(
                    [...selectedPlugins].filter((p) => !filteredPluginIds.has(p)),
                  );
                  setSelectedPlugins(newSelected);
                }}
              >
                Select none
              </button>
            </div>
          )}

          {/* Domain-Specific Vertical Suites */}
          {showingDomainSpecific && (
            <div className="mb-6 space-y-6">
              {VERTICAL_SUITES.map((suite) => (
                <VerticalSuiteCard
                  key={suite.id}
                  suite={suite}
                  selectedPlugins={selectedPlugins}
                  onPluginToggle={handlePluginToggle}
                  setSelectedPlugins={setSelectedPlugins}
                  onConfigClick={handleConfigClick}
                  onGenerateTestCase={handleGenerateTestCase}
                  isPluginConfigured={isPluginConfigured}
                  isPluginDisabled={isPluginDisabled}
                  hasEnterpriseAccess={hasEnterpriseAccess}
                  onUpgradeClick={() => {
                    recordEvent('feature_used', {
                      feature: 'redteam_config_enterprise_upgrade_clicked',
                      source: 'vertical_suite_card',
                    });
                    window.open('https://www.promptfoo.dev/pricing/', '_blank');
                  }}
                />
              ))}
            </div>
          )}

          {/* Plugin list */}
          {!showingDomainSpecific && (
            <div className="mb-6 space-y-2">
              {filteredPlugins.map(({ plugin, category }) => {
                const pluginDisabled = isPluginDisabled(plugin);
                const isSelected = selectedPlugins.has(plugin);
                const requiresConfig = requiresPluginConfig(plugin);
                const hasConfigError = requiresConfig && isSelected && !isPluginConfigured(plugin);

                return (
                  <div
                    key={plugin}
                    data-testid={`plugin-list-item-${plugin}`}
                    onClick={() => {
                      if (pluginDisabled) {
                        toast.showToast(
                          'This plugin requires remote generation to be enabled. Unset PROMPTFOO_DISABLE_REMOTE_GENERATION or PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION.',
                          'error',
                        );
                        return;
                      }
                      handlePluginToggle(plugin);
                    }}
                    className={cn(
                      'flex w-full cursor-pointer items-center rounded-lg border p-4 transition-all',
                      pluginDisabled && 'cursor-not-allowed opacity-50',
                      isSelected && !hasConfigError && 'border-primary bg-primary/5 shadow-sm',
                      hasConfigError && 'border-destructive bg-destructive/5 shadow-sm',
                      !isSelected && !pluginDisabled && 'border-border hover:bg-muted/50',
                    )}
                  >
                    <div className="mr-4 flex shrink-0 items-center gap-2">
                      <Checkbox
                        checked={isSelected}
                        disabled={pluginDisabled}
                        onCheckedChange={() => {
                          handlePluginToggle(plugin);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        aria-label={
                          displayNameOverrides[plugin] || categoryAliases[plugin] || plugin
                        }
                      />
                      <TestCaseGenerateButton
                        onClick={() => handleGenerateTestCase(plugin)}
                        disabled={
                          pluginDisabled ||
                          apiHealthStatus !== 'connected' ||
                          (generatingTestCase && generatingPlugin === plugin)
                        }
                        isGenerating={generatingTestCase && generatingPlugin === plugin}
                        tooltipTitle={
                          pluginDisabled
                            ? 'This plugin requires remote generation'
                            : apiHealthStatus === 'connected'
                              ? `Generate a test case for ${displayNameOverrides[plugin] || categoryAliases[plugin] || plugin}`
                              : 'Promptfoo Cloud connection is required for test generation'
                        }
                      />
                      {/* Config button - available for all plugins (gradingGuidance is universal) */}
                      {isSelected && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn(
                                'size-8',
                                hasConfigError ? 'text-destructive' : 'text-muted-foreground',
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleConfigClick(plugin);
                              }}
                            >
                              <Settings className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            Configure{' '}
                            {displayNameOverrides[plugin] || categoryAliases[plugin] || plugin}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex items-center gap-2">
                        <span className="font-medium">
                          {displayNameOverrides[plugin] || categoryAliases[plugin] || plugin}
                        </span>

                        {/* Badge for plugins requiring remote generation */}
                        {pluginDisabled && isRemoteGenerationDisabled && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="rounded border border-destructive/30 bg-destructive/10 px-1 py-0.5 text-xs font-medium text-destructive">
                                Remote generation required
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              This plugin requires remote generation. Unset
                              PROMPTFOO_DISABLE_REMOTE_GENERATION or
                              PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION to enable.
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      {subCategoryDescriptions[plugin] && (
                        <p className="line-clamp-2 break-words text-sm text-muted-foreground">
                          {subCategoryDescriptions[plugin]}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0">
                      {category === 'Recently Used' && (
                        <Badge variant="secondary" className="mr-2">
                          Recently Used
                        </Badge>
                      )}
                      {hasSpecificPluginDocumentation(plugin) && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(getPluginDocumentationUrl(plugin), '_blank');
                              }}
                            >
                              <HelpCircle className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>View documentation</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Plugin config dialog */}
          <PluginConfigDialog
            open={configDialogOpen}
            onClose={() => {
              setConfigDialogOpen(false);
              setSelectedConfigPlugin(null);
            }}
            plugin={selectedConfigPlugin}
            config={pluginConfig[selectedConfigPlugin as string] || {}}
            onSave={(plugin, newConfig) => {
              updatePluginConfig(plugin, newConfig);
              setConfigDialogOpen(false);
              setSelectedConfigPlugin(null);
            }}
          />
        </div>

        {/* Selected Plugins Sidebar */}
        <div
          className="sticky top-[72px] w-80 max-h-[60vh] overflow-y-auto"
          data-testid="selected-plugins-sidebar"
        >
          <div className="rounded-lg border border-border bg-background p-4">
            <h3 className="mb-4 text-lg font-semibold" data-testid="selected-plugins-header">
              Selected Plugins ({selectedPlugins.size})
            </h3>

            {selectedPlugins.size === 0 ? (
              <p
                className="py-8 text-center text-sm text-muted-foreground"
                data-testid="selected-plugins-empty-state"
              >
                No plugins selected yet.
                <br />
                Click on plugins to add them here.
              </p>
            ) : (
              <div className="max-h-[400px] space-y-2 overflow-y-auto">
                {/* Plugins requiring configuration - shown first */}
                {pluginsNeedingConfig.length > 0 && (
                  <div className="mb-3" data-testid="plugins-needing-config-section">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-destructive">
                      Needs Configuration
                    </p>
                    <div className="space-y-2">
                      {pluginsNeedingConfig.map((plugin) => (
                        <div
                          key={plugin}
                          data-testid={`selected-plugin-needs-config-${plugin}`}
                          onClick={() => handleConfigClick(plugin)}
                          className={cn(
                            'flex cursor-pointer items-center rounded-lg border-2 border-destructive bg-destructive/10 p-3 transition-colors',
                            'hover:bg-destructive/20',
                          )}
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <AlertCircle className="size-4 shrink-0 text-destructive" />
                            <span className="text-sm font-medium text-destructive">
                              {displayNameOverrides[plugin] || categoryAliases[plugin] || plugin}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-6 text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleConfigClick(plugin);
                              }}
                            >
                              <Settings className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-6"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePluginToggle(plugin);
                              }}
                            >
                              <Minus className="size-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Configured plugins */}
                {configuredPlugins.length > 0 && (
                  <div data-testid="configured-plugins-section">
                    {pluginsNeedingConfig.length > 0 && (
                      <div className="my-3 border-t border-border" />
                    )}
                    <div className="space-y-2">
                      {configuredPlugins.map((plugin) => (
                        <div
                          key={plugin}
                          data-testid={`selected-plugin-${plugin}`}
                          className="flex items-center rounded-lg border border-primary/20 bg-primary/5 p-3"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {displayNameOverrides[plugin] || categoryAliases[plugin] || plugin}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="ml-2 size-6"
                            onClick={() => handlePluginToggle(plugin)}
                          >
                            <Minus className="size-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {selectedPlugins.size > 0 && (
              <div className="mt-4 border-t border-border pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  data-testid="clear-all-plugins-button"
                  onClick={() => {
                    setSelectedPlugins(new Set());
                  }}
                >
                  Clear All
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
