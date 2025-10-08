import { useCallback, useEffect, useMemo, useState } from 'react';

import { useTelemetry } from '@app/hooks/useTelemetry';
import { useToast } from '@app/hooks/useToast';
import { callApi } from '@app/utils/api';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import { useTheme } from '@mui/material/styles';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import {
  categoryAliases,
  DEFAULT_PLUGINS,
  displayNameOverrides,
  EU_AI_ACT_MAPPING,
  FOUNDATION_PLUGINS,
  GUARDRAILS_EVALUATION_PLUGINS,
  HARM_PLUGINS,
  ISO_42001_MAPPING,
  MCP_PLUGINS,
  MITRE_ATLAS_MAPPING,
  NIST_AI_RMF_MAPPING,
  OWASP_API_TOP_10_MAPPING,
  OWASP_LLM_RED_TEAM_MAPPING,
  OWASP_LLM_TOP_10_MAPPING,
  PLUGIN_PRESET_DESCRIPTIONS,
  type Plugin,
  riskCategories,
  subCategoryDescriptions,
} from '@promptfoo/redteam/constants';
import { Link as RouterLink } from 'react-router-dom';
import { useDebounce } from 'use-debounce';
import { useRecentlyUsedPlugins, useRedTeamConfig } from '../hooks/useRedTeamConfig';
import PageWrapper from './PageWrapper';
import PluginsTab from './PluginsTab';
import CustomPromptsTab from './CustomPromptsTab';
import CustomPoliciesTab from './CustomPoliciesTab';
import type { PluginConfig } from '@promptfoo/redteam/types';

import type { LocalPluginConfig } from '../types';

interface PluginsProps {
  onNext: () => void;
  onBack: () => void;
}

const PLUGINS_REQUIRING_CONFIG = ['indirect-prompt-injection', 'prompt-extraction'];

const PLUGINS_SUPPORTING_CONFIG = ['bfla', 'bola', 'ssrf', ...PLUGINS_REQUIRING_CONFIG];

// TabPanel component for conditional rendering
interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <Box
      role="tabpanel"
      hidden={value !== index}
      id={`plugins-tabpanel-${index}`}
      aria-labelledby={`plugins-tab-${index}`}
    >
      {value === index && <Box>{children}</Box>}
    </Box>
  );
}

export default function Plugins({ onNext, onBack }: PluginsProps) {
  const theme = useTheme();
  const { config, updatePlugins } = useRedTeamConfig();
  const { plugins: recentlyUsedPlugins, addPlugin } = useRecentlyUsedPlugins();
  const { recordEvent } = useTelemetry();
  const toast = useToast();
  const [isCustomMode, setIsCustomMode] = useState(true);
  const [recentlyUsedSnapshot] = useState<Plugin[]>(() => [...recentlyUsedPlugins]);
  const [selectedPlugins, setSelectedPlugins] = useState<Set<Plugin>>(() => {
    return new Set(
      config.plugins
        .map((plugin) => (typeof plugin === 'string' ? plugin : plugin.id))
        .filter((id) => id !== 'policy' && id !== 'intent') as Plugin[],
    );
  });

  // Tab state management
  const [activeTab, setActiveTab] = useState<number>(0);

  const handleTabChange = useCallback(
    (_event: React.SyntheticEvent, newValue: number) => {
      setActiveTab(newValue);
      recordEvent('feature_used', {
        feature: 'redteam_config_plugins_tab_changed',
        tab: ['plugins', 'custom_prompts', 'custom_policies'][newValue],
      });
    },
    [recordEvent],
  );

  // Track if user has interacted to prevent config updates from overriding user selections
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [pluginConfig, setPluginConfig] = useState<LocalPluginConfig>(() => {
    const initialConfig: LocalPluginConfig = {};
    config.plugins.forEach((plugin) => {
      if (typeof plugin === 'object' && plugin.config) {
        initialConfig[plugin.id] = plugin.config;
      }
    });
    return initialConfig;
  });
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [selectedConfigPlugin, setSelectedConfigPlugin] = useState<Plugin | null>(null);

  // Test case generation state
  const [testCaseDialogOpen, setTestCaseDialogOpen] = useState(false);
  const [generatingPlugin, setGeneratingPlugin] = useState<Plugin | null>(null);
  const [generatedTestCase, setGeneratedTestCase] = useState<{
    prompt: string;
    context: string;
    metadata?: any;
  } | null>(null);
  const [generatingTestCase, setGeneratingTestCase] = useState(false);
  // Add new state for dialog mode and temporary config
  const [testCaseDialogMode, setTestCaseDialogMode] = useState<'config' | 'result'>('config');
  const [tempTestCaseConfig, setTempTestCaseConfig] = useState<any>({});

  // Category filter options based on riskCategories
  const categoryFilters = Object.keys(riskCategories).map((category) => ({
    key: category,
    label: category,
  }));

  // Add "Recently Used" category and "Selected" filter if there are recently used plugins or selected plugins
  const allCategoryFilters = [
    ...(recentlyUsedSnapshot.length > 0 ? [{ key: 'Recently Used', label: 'Recently Used' }] : []),
    ...(selectedPlugins.size > 0
      ? [{ key: 'Selected', label: `Selected (${selectedPlugins.size})` }]
      : []),
    ...categoryFilters,
  ];

  const [debouncedPlugins] = useDebounce(
    useMemo(
      () =>
        Array.from(selectedPlugins)
          .map((plugin): string | { id: string; config: any } | null => {
            if (plugin === 'policy') {
              return null;
            }

            const config = pluginConfig[plugin];
            if (config && Object.keys(config).length > 0) {
              return { id: plugin, config };
            }
            return plugin;
          })
          .filter((plugin): plugin is string | { id: string; config: any } => plugin !== null),
      [selectedPlugins, pluginConfig],
    ),
    100,
  );

  useEffect(() => {
    recordEvent('webui_page_view', { page: 'redteam_config_plugins' });
  }, []);

  useEffect(() => {
    if (debouncedPlugins) {
      updatePlugins(debouncedPlugins);
    }
  }, [debouncedPlugins]);

  // Sync selectedPlugins from config only on initial load or when user hasn't interacted
  useEffect(() => {
    if (!hasUserInteracted) {
      const configPlugins = new Set(
        config.plugins
          .map((plugin) => (typeof plugin === 'string' ? plugin : plugin.id))
          .filter((id) => id !== 'policy' && id !== 'intent') as Plugin[],
      );

      // Only update if the sets are actually different to avoid unnecessary re-renders
      if (
        configPlugins.size !== selectedPlugins.size ||
        !Array.from(configPlugins).every((plugin) => selectedPlugins.has(plugin))
      ) {
        setSelectedPlugins(configPlugins);
      }
    }
  }, [config.plugins, hasUserInteracted, selectedPlugins]);

  const handlePluginToggle = useCallback(
    (plugin: Plugin) => {
      setHasUserInteracted(true);
      setSelectedPlugins((prev) => {
        const newSet = new Set(prev);

        if (plugin === 'policy') {
          if (newSet.has(plugin)) {
            newSet.delete(plugin);
            setPluginConfig((prevConfig) => {
              const newConfig = { ...prevConfig };
              delete newConfig[plugin];
              return newConfig;
            });
          } else {
            newSet.add(plugin);
          }
          return newSet;
        }

        if (newSet.has(plugin)) {
          newSet.delete(plugin);
          setPluginConfig((prevConfig) => {
            const newConfig = { ...prevConfig };
            delete newConfig[plugin as keyof LocalPluginConfig];
            return newConfig;
          });
        } else {
          newSet.add(plugin);
          addPlugin(plugin);
          if (PLUGINS_REQUIRING_CONFIG.includes(plugin)) {
            setSelectedConfigPlugin(plugin);
            setConfigDialogOpen(true);
          }
        }
        return newSet;
      });
    },
    [addPlugin],
  );

  const handlePresetSelect = (preset: {
    name: string;
    plugins: Set<Plugin> | ReadonlySet<Plugin>;
  }) => {
    recordEvent('feature_used', {
      feature: 'redteam_config_plugins_preset_selected',
      preset: preset.name,
    });
    setHasUserInteracted(true);
    if (preset.name === 'Custom') {
      setIsCustomMode(true);
    } else {
      setSelectedPlugins(new Set(preset.plugins));
      setIsCustomMode(false);
    }
  };

  // Handle category filter toggle
  const handleCategoryToggle = (category: string) => {
    setSelectedCategory(selectedCategory === category ? undefined : category);
  };

  // Get all plugins in a flat array with their categories
  const allPluginsWithCategories = useMemo(() => {
    const pluginsWithCategories: Array<{ plugin: Plugin; category: string }> = [];

    // Handle "Selected" filter - show only selected plugins
    if (selectedCategory === 'Selected') {
      Array.from(selectedPlugins).forEach((plugin) => {
        // Find the original category for this plugin
        let originalCategory = 'Other';
        if (recentlyUsedSnapshot.includes(plugin)) {
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

    // Add recently used plugins if selected category is "Recently Used" or no category selected
    if (
      recentlyUsedSnapshot.length > 0 &&
      (!selectedCategory || selectedCategory === 'Recently Used')
    ) {
      recentlyUsedSnapshot.forEach((plugin) => {
        pluginsWithCategories.push({ plugin, category: 'Recently Used' });
      });
    }

    // Add plugins from risk categories
    if (
      !selectedCategory ||
      (selectedCategory !== 'Recently Used' && selectedCategory !== 'Selected')
    ) {
      Object.entries(riskCategories).forEach(([category, plugins]) => {
        if (!selectedCategory || selectedCategory === category) {
          plugins
            .filter((plugin) => plugin !== 'intent' && plugin !== 'policy') // Skip these as they have dedicated sections
            .forEach((plugin) => {
              // Avoid duplicates with recently used
              if (!pluginsWithCategories.some((p) => p.plugin === plugin)) {
                pluginsWithCategories.push({ plugin, category });
              }
            });
        }
      });
    }

    return pluginsWithCategories;
  }, [selectedCategory, recentlyUsedSnapshot, selectedPlugins]);

  // Filter plugins based on search term
  const filteredPlugins = useMemo(() => {
    let plugins = allPluginsWithCategories;

    // Apply search filter if there's a search term
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

    return plugins;
  }, [searchTerm, allPluginsWithCategories]);

  const presets: {
    name: keyof typeof PLUGIN_PRESET_DESCRIPTIONS;
    plugins: Set<Plugin> | ReadonlySet<Plugin>;
  }[] = [
    {
      name: 'Recommended',
      plugins: DEFAULT_PLUGINS,
    },
    {
      name: 'Minimal Test',
      plugins: new Set(['harmful:hate', 'harmful:self-harm']),
    },
    {
      name: 'RAG',
      plugins: new Set([...DEFAULT_PLUGINS, 'bola', 'bfla', 'rbac']),
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
  ];

  const updatePluginConfig = useCallback(
    (plugin: string, newConfig: Partial<LocalPluginConfig[string]>) => {
      setPluginConfig((prevConfig) => {
        const currentConfig = prevConfig[plugin] || {};
        const configChanged = JSON.stringify(currentConfig) !== JSON.stringify(newConfig);

        if (!configChanged) {
          return prevConfig;
        }
        return {
          ...prevConfig,
          [plugin]: {
            ...currentConfig,
            ...newConfig,
          },
        };
      });
    },
    [],
  );

  const isConfigValid = useCallback(() => {
    for (const plugin of selectedPlugins) {
      if (PLUGINS_REQUIRING_CONFIG.includes(plugin)) {
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
      }
    }
    return true;
  }, [selectedPlugins, pluginConfig]);

  const isTestCaseConfigValid = useCallback((plugin: Plugin, config: any) => {
    if (!PLUGINS_REQUIRING_CONFIG.includes(plugin)) {
      // For plugins that don't require config or only support optional config, always allow generation
      return true;
    }
    if (!config) {
      return false;
    }
    if (plugin === 'indirect-prompt-injection') {
      return config.indirectInjectionVar && config.indirectInjectionVar.trim() !== '';
    }
    if (plugin === 'prompt-extraction') {
      return config.systemPrompt && config.systemPrompt.trim() !== '';
    }
    // Note: bfla, bola, ssrf are not in PLUGINS_REQUIRING_CONFIG, so they will return true above
    return true;
  }, []);

  const hasAnyPluginsConfigured = useCallback(() => {
    // Check regular plugins
    if (selectedPlugins.size > 0) {
      return true;
    }

    // Check custom policies with actual content
    const hasPolicies = config.plugins.some(
      (p) =>
        typeof p === 'object' &&
        p.id === 'policy' &&
        p.config?.policy &&
        typeof p.config.policy === 'string' &&
        p.config.policy.trim().length > 0,
    );

    // Check custom intents with actual content
    const hasIntents = config.plugins.some(
      (p) =>
        typeof p === 'object' &&
        p.id === 'intent' &&
        p.config?.intent &&
        Array.isArray(p.config.intent) &&
        p.config.intent.length > 0,
    );

    return hasPolicies || hasIntents;
  }, [selectedPlugins, config.plugins]);

  const getNextButtonTooltip = useCallback(() => {
    if (!hasAnyPluginsConfigured()) {
      return 'Select at least one plugin';
    }

    if (!isConfigValid()) {
      const missingConfigPlugins = Array.from(selectedPlugins).filter(
        (plugin) => PLUGINS_REQUIRING_CONFIG.includes(plugin) && !isPluginConfigured(plugin),
      );

      if (missingConfigPlugins.length === 1) {
        const pluginName =
          displayNameOverrides[missingConfigPlugins[0]] ||
          categoryAliases[missingConfigPlugins[0]] ||
          missingConfigPlugins[0];
        return `Click the settings button (⚙️) to configure ${pluginName}`;
      } else if (missingConfigPlugins.length > 1) {
        const pluginNames = missingConfigPlugins
          .map((plugin) => displayNameOverrides[plugin] || categoryAliases[plugin] || plugin)
          .join(', ');
        return `Click the settings buttons (⚙️) to configure: ${pluginNames}`;
      }
    }

    return '';
  }, [hasAnyPluginsConfigured, isConfigValid, selectedPlugins, pluginConfig]);

  const handleGenerateTestCase = async (plugin: Plugin) => {
    const supportsConfig = PLUGINS_SUPPORTING_CONFIG.includes(plugin);

    setGeneratingPlugin(plugin);
    setGeneratedTestCase(null);
    setGeneratingTestCase(false);

    if (supportsConfig) {
      // Initialize temp config with existing plugin config if available
      setTempTestCaseConfig(pluginConfig[plugin] || {});
      setTestCaseDialogMode('config');
      setTestCaseDialogOpen(true);
    } else {
      // Directly generate test case for plugins that don't support config
      await generateTestCaseWithConfig(plugin, {});
    }
  };

  const generateTestCaseWithConfig = async (plugin: Plugin, configForGeneration: any) => {
    setGeneratingTestCase(true);
    setTestCaseDialogMode('result');

    try {
      recordEvent('feature_used', {
        feature: 'redteam_plugin_generate_test_case',
        plugin: plugin,
      });

      const response = await callApi('/redteam/generate-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
        body: JSON.stringify({
          pluginId: plugin,
          config: {
            applicationDefinition: config.applicationDefinition,
            ...configForGeneration,
          },
        }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setGeneratedTestCase({
        prompt: data.prompt,
        context: data.context,
        metadata: data.metadata,
      });

      if (!testCaseDialogOpen) {
        setTestCaseDialogOpen(true);
      }
    } catch (error) {
      console.error('Failed to generate test case:', error);
      toast.showToast(
        error instanceof Error ? error.message : 'Failed to generate test case',
        'error',
      );
      // Close dialog on error
      setTestCaseDialogOpen(false);
      setGeneratingPlugin(null);
    } finally {
      setGeneratingTestCase(false);
    }
  };

  const isPluginConfigured = (plugin: Plugin) => {
    if (!PLUGINS_REQUIRING_CONFIG.includes(plugin) || plugin === 'policy') {
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
  };

  const currentlySelectedPreset = presets.find(
    (p) =>
      Array.from(p.plugins as Set<Plugin>).every((plugin) => selectedPlugins.has(plugin)) &&
      p.plugins.size === selectedPlugins.size,
  );

  // Check if user has selected all or most plugins
  const hasSelectedMostPlugins = useMemo(() => {
    // Get all unique plugins from risk categories (excluding intent and policy)
    const allAvailablePlugins = new Set<Plugin>();
    Object.values(riskCategories).forEach((plugins) => {
      plugins.forEach((plugin) => {
        if (plugin !== 'intent' && plugin !== 'policy') {
          allAvailablePlugins.add(plugin);
        }
      });
    });

    const totalAvailable = allAvailablePlugins.size;
    const totalSelected = selectedPlugins.size;
    // Show warning if more than 80% of plugins are selected or all plugins are selected
    return totalSelected >= totalAvailable * 0.8 || totalSelected === totalAvailable;
  }, [selectedPlugins]);

  return (
    <PageWrapper
      title="Plugins"
      description={
        <Box sx={{ maxWidth: '1200px' }}>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Plugins are Promptfoo's modular system for testing a variety of risks and
            vulnerabilities in LLM models and LLM-powered applications. Each plugin is a trained
            model that produces malicious payloads targeting specific weaknesses.{' '}
            <RouterLink
              style={{ textDecoration: 'underline' }}
              to="https://www.promptfoo.dev/docs/red-team/plugins/"
              target="_blank"
            >
              Learn More
            </RouterLink>
          </Typography>

          <Typography variant="body1">
            Select the red-team plugins that align with your security testing objectives.
          </Typography>
        </Box>
      }
      onNext={onNext}
      onBack={onBack}
      nextDisabled={!isConfigValid() || !hasAnyPluginsConfigured()}
      warningMessage={
        !isConfigValid() || !hasAnyPluginsConfigured() ? getNextButtonTooltip() : undefined
      }
    >
      {/* Warning banner when all/most plugins are selected - outside tabs, full width sticky */}
      {hasSelectedMostPlugins && (
        <Alert
          severity="warning"
          icon={<WarningAmberIcon />}
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: 9,
            margin: -3,
            marginBottom: 3,
            padding: theme.spacing(2, 3),
            borderRadius: 0,
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            '& .MuiAlert-message': {
              width: '100%',
            },
          }}
        >
          <Box>
            <Typography variant="body2" fontWeight="bold" gutterBottom>
              Performance Warning: Too Many Plugins Selected
            </Typography>
            <Typography variant="body2">
              Selecting many plugins is usually not efficient and will significantly increase
              evaluation time and cost. It's recommended to use the preset configurations or select
              only the plugins specifically needed for your use case.
            </Typography>
          </Box>
        </Alert>
      )}

      {/* Tabs component */}
      <Box sx={{ width: '100%', mb: 3 }}>
        <Tabs value={activeTab} onChange={handleTabChange} aria-label="plugin configuration tabs">
          <Tab label="Plugins" id="plugins-tab-0" aria-controls="plugins-tabpanel-0" />
          <Tab label="Custom Prompts" id="plugins-tab-1" aria-controls="plugins-tabpanel-1" />
          <Tab label="Custom Policies" id="plugins-tab-2" aria-controls="plugins-tabpanel-2" />
        </Tabs>
        <Divider />
      </Box>

      {/* Tab Panel 0: Plugins */}
      <TabPanel value={activeTab} index={0}>
        <PluginsTab
          selectedPlugins={selectedPlugins}
          handlePluginToggle={handlePluginToggle}
          pluginConfig={pluginConfig}
          selectedConfigPlugin={selectedConfigPlugin}
          setSelectedConfigPlugin={setSelectedConfigPlugin}
          configDialogOpen={configDialogOpen}
          setConfigDialogOpen={setConfigDialogOpen}
          isPluginConfigured={isPluginConfigured}
          updatePluginConfig={updatePluginConfig}
          handlePresetSelect={handlePresetSelect}
          isCustomMode={isCustomMode}
          currentlySelectedPreset={currentlySelectedPreset}
          presets={presets}
          filteredPlugins={filteredPlugins}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          allCategoryFilters={allCategoryFilters}
          handleCategoryToggle={handleCategoryToggle}
          handleGenerateTestCase={handleGenerateTestCase}
          generatingTestCase={generatingTestCase}
          generatingPlugin={generatingPlugin}
          testCaseDialogOpen={testCaseDialogOpen}
          setTestCaseDialogOpen={setTestCaseDialogOpen}
          testCaseDialogMode={testCaseDialogMode}
          tempTestCaseConfig={tempTestCaseConfig}
          setTempTestCaseConfig={setTempTestCaseConfig}
          generatedTestCase={generatedTestCase}
          generateTestCaseWithConfig={generateTestCaseWithConfig}
          isTestCaseConfigValid={isTestCaseConfigValid}
          setHasUserInteracted={setHasUserInteracted}
          PLUGINS_REQUIRING_CONFIG={PLUGINS_REQUIRING_CONFIG}
          PLUGINS_SUPPORTING_CONFIG={PLUGINS_SUPPORTING_CONFIG}
          PLUGIN_PRESET_DESCRIPTIONS={PLUGIN_PRESET_DESCRIPTIONS}
        />
      </TabPanel>

      {/* Tab Panel 1: Custom Prompts */}
      <TabPanel value={activeTab} index={1}>
        <CustomPromptsTab />
      </TabPanel>

      {/* Tab Panel 2: Custom Policies */}
      <TabPanel value={activeTab} index={2}>
        <CustomPoliciesTab />
      </TabPanel>
    </PageWrapper>
  );
}
