import { useCallback, useEffect, useMemo, useState } from 'react';

import { useApiHealth } from '@app/hooks/useApiHealth';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { useToast } from '@app/hooks/useToast';
import { callApi } from '@app/utils/api';
import ErrorIcon from '@mui/icons-material/Error';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import RemoveIcon from '@mui/icons-material/Remove';
import SearchIcon from '@mui/icons-material/Search';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { alpha, useTheme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  AGENTIC_EXEMPT_PLUGINS,
  categoryAliases,
  DATASET_EXEMPT_PLUGINS,
  DEFAULT_PLUGINS,
  displayNameOverrides,
  EU_AI_ACT_MAPPING,
  FOUNDATION_PLUGINS,
  GUARDRAILS_EVALUATION_PLUGINS,
  HARM_PLUGINS,
  HUGGINGFACE_GATED_PLUGINS,
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
import { ErrorBoundary } from 'react-error-boundary';
import { Link as RouterLink } from 'react-router-dom';
import { useDebounce } from 'use-debounce';
import { useRecentlyUsedPlugins, useRedTeamConfig } from '../hooks/useRedTeamConfig';
import CustomIntentSection from './CustomIntentPluginSection';
import PageWrapper from './PageWrapper';
import PluginConfigDialog from './PluginConfigDialog';
import PresetCard from './PresetCard';
import {
  getPluginDocumentationUrl,
  hasSpecificPluginDocumentation,
} from './pluginDocumentationMap';
import { CustomPoliciesSection } from './Targets/CustomPoliciesSection';
import type { PluginConfig } from '@promptfoo/redteam/types';
import { TestCaseGenerateButton, TestCaseDialog } from './TestCaseDialog';
import type { LocalPluginConfig } from '../types';

interface PluginsProps {
  onNext: () => void;
  onBack: () => void;
}

const ErrorFallback = ({ error }: { error: Error }) => (
  <div role="alert">
    <p>Something went wrong:</p>
    <pre>{error.message}</pre>
  </div>
);

const PLUGINS_REQUIRING_CONFIG = ['indirect-prompt-injection', 'prompt-extraction'];

const PLUGINS_SUPPORTING_CONFIG = ['bfla', 'bola', 'ssrf', ...PLUGINS_REQUIRING_CONFIG];

export default function Plugins({ onNext, onBack }: PluginsProps) {
  const theme = useTheme();
  const { config, updatePlugins } = useRedTeamConfig();
  const { plugins: recentlyUsedPlugins, addPlugin } = useRecentlyUsedPlugins();
  const { recordEvent } = useTelemetry();
  const toast = useToast();
  const { status: apiHealthStatus, checkHealth } = useApiHealth();
  const [isCustomMode, setIsCustomMode] = useState(true);
  const [recentlyUsedSnapshot] = useState<Plugin[]>(() => [...recentlyUsedPlugins]);
  const [selectedPlugins, setSelectedPlugins] = useState<Set<Plugin>>(() => {
    return new Set(
      config.plugins
        .map((plugin) => (typeof plugin === 'string' ? plugin : plugin.id))
        .filter((id) => id !== 'policy' && id !== 'intent') as Plugin[],
    );
  });

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
  // Test running state
  const [targetResponse, setTargetResponse] = useState<{ output: string; error?: string } | null>(
    null,
  );
  const [isRunningTest, setIsRunningTest] = useState(false);

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
    checkHealth();
  }, [checkHealth]);

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

  const handleConfigClick = (plugin: Plugin) => {
    setSelectedConfigPlugin(plugin);
    setConfigDialogOpen(true);
  };

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
        timeout: 10000, // 10 second timeout
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

      // Run the test case against the target using the providers/test endpoint
      if (!config.target || !config.target.id) {
        console.warn('[Plugins] Skipping test execution - no target configured');
        return;
      }

      setIsRunningTest(true);
      setTargetResponse(null);
      try {
        const testResponse = await callApi('/providers/test', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            providerOptions: config.target,
            prompt: data.prompt,
          }),
          timeout: 30000, // 30 second timeout
        });

        if (!testResponse.ok) {
          const errorData = await testResponse.json();
          throw new Error(errorData.error || 'Failed to run test');
        }

        const testData = await testResponse.json();
        setTargetResponse({
          output: testData.providerResponse?.output || '',
          error: testData.providerResponse?.error || testData.testResult?.error,
        });
      } catch (error) {
        console.error('Failed to run test against target:', error);
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to run test against target';
        setTargetResponse({
          output: '',
          error: errorMessage,
        });
      } finally {
        setIsRunningTest(false);
      }
    } catch (error) {
      console.error('Failed to generate test case:', error);
      // Provide specific message for timeout errors
      const errorMessage =
        error instanceof Error
          ? error.message.includes('timed out')
            ? 'Test generation timed out. Please try again or check your connection.'
            : error.message
          : 'Failed to generate test case';
      toast.showToast(errorMessage, 'error');
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
      {/* Warning banner when all/most plugins are selected - full width sticky */}
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

      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
          {/* Main content */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {/* Presets section */}
            <Box sx={{ mb: 3 }}>
              <Typography
                variant="h6"
                sx={{
                  mb: 2,
                  fontWeight: 600,
                  color: 'text.primary',
                }}
              >
                Presets
              </Typography>

              <Grid spacing={2} container sx={{ mb: 3 }}>
                {presets.map((preset) => {
                  const isSelected =
                    preset.name === 'Custom'
                      ? isCustomMode
                      : preset.name === currentlySelectedPreset?.name;
                  return (
                    <Box key={preset.name}>
                      <PresetCard
                        name={preset.name}
                        description={PLUGIN_PRESET_DESCRIPTIONS[preset.name] || ''}
                        isSelected={isSelected}
                        onClick={() => handlePresetSelect(preset)}
                      />
                    </Box>
                  );
                })}
              </Grid>
            </Box>

            {/* Search and Filter section */}
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
              <TextField
                variant="outlined"
                placeholder="Search plugins..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
                sx={{ minWidth: 300, flexShrink: 0 }}
              />

              <Box sx={{ flex: 1 }}>
                <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
                  <Chip
                    label="All Categories"
                    variant={selectedCategory === undefined ? 'filled' : 'outlined'}
                    color={selectedCategory === undefined ? 'primary' : 'default'}
                    onClick={() => setSelectedCategory(undefined)}
                    sx={{
                      cursor: 'pointer',
                      '&:hover': {
                        bgcolor: selectedCategory === undefined ? 'primary.dark' : 'action.hover',
                      },
                    }}
                  />
                  {allCategoryFilters.map((filter) => (
                    <Chip
                      key={filter.key}
                      label={filter.label}
                      variant={selectedCategory === filter.key ? 'filled' : 'outlined'}
                      color={selectedCategory === filter.key ? 'primary' : 'default'}
                      onClick={() => handleCategoryToggle(filter.key)}
                      sx={{
                        cursor: 'pointer',
                        '&:hover': {
                          bgcolor:
                            selectedCategory === filter.key ? 'primary.dark' : 'action.hover',
                        },
                      }}
                    />
                  ))}
                </Stack>
              </Box>
            </Stack>

            {/* Bulk selection actions */}
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 2,
                mb: 2,
                '& > *': {
                  color: 'primary.main',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  textDecoration: 'none',
                  '&:hover': {
                    textDecoration: 'underline',
                  },
                },
              }}
            >
              <Box
                component="span"
                onClick={() => {
                  setHasUserInteracted(true);
                  filteredPlugins.forEach(({ plugin }) => {
                    if (!selectedPlugins.has(plugin)) {
                      handlePluginToggle(plugin);
                    }
                  });
                }}
              >
                Select all
              </Box>
              <Box
                component="span"
                onClick={() => {
                  setHasUserInteracted(true);
                  filteredPlugins.forEach(({ plugin }) => {
                    if (selectedPlugins.has(plugin)) {
                      handlePluginToggle(plugin);
                    }
                  });
                }}
              >
                Select none
              </Box>
            </Box>

            {/* Plugin list */}
            <Stack spacing={1} sx={{ mb: 3 }}>
              {filteredPlugins.map(({ plugin, category }) => (
                <Paper
                  key={plugin}
                  variant="outlined"
                  onClick={() => handlePluginToggle(plugin)}
                  sx={{
                    border: '1px solid',
                    borderColor: (() => {
                      if (selectedPlugins.has(plugin)) {
                        // Show red border if missing required config
                        if (
                          PLUGINS_REQUIRING_CONFIG.includes(plugin) &&
                          !isPluginConfigured(plugin)
                        ) {
                          return 'error.main';
                        }
                        return 'primary.main';
                      }
                      return theme.palette.divider;
                    })(),
                    borderRadius: 1,
                    cursor: 'pointer',
                    bgcolor: (() => {
                      if (selectedPlugins.has(plugin)) {
                        // Show red background if plugin is selected but missing required config
                        if (
                          PLUGINS_REQUIRING_CONFIG.includes(plugin) &&
                          !isPluginConfigured(plugin)
                        ) {
                          return 'rgba(211, 47, 47, 0.08)'; // error red with transparency
                        }
                        return 'rgba(25, 118, 210, 0.08)'; // primary blue with transparency
                      }
                      return 'transparent';
                    })(),
                    '&:hover': {
                      bgcolor: (() => {
                        if (selectedPlugins.has(plugin)) {
                          // Show red hover if plugin is selected but missing required config
                          if (
                            PLUGINS_REQUIRING_CONFIG.includes(plugin) &&
                            !isPluginConfigured(plugin)
                          ) {
                            return 'rgba(211, 47, 47, 0.12)'; // error red with more transparency
                          }
                          return 'rgba(25, 118, 210, 0.12)'; // primary blue with more transparency
                        }
                        return 'rgba(0, 0, 0, 0.04)';
                      })(),
                      cursor: 'pointer',
                      borderColor: (() => {
                        if (selectedPlugins.has(plugin)) {
                          // Keep red border on hover if missing config
                          if (
                            PLUGINS_REQUIRING_CONFIG.includes(plugin) &&
                            !isPluginConfigured(plugin)
                          ) {
                            return 'error.main';
                          }
                          return 'primary.main';
                        }
                        return theme.palette.action.hover;
                      })(),
                    },
                    p: 2,
                    transition: 'all 0.2s ease-in-out',
                    display: 'flex',
                    alignItems: 'center',
                    width: '100%',
                    ...(selectedPlugins.has(plugin) && {
                      boxShadow:
                        PLUGINS_REQUIRING_CONFIG.includes(plugin) && !isPluginConfigured(plugin)
                          ? '0 2px 8px rgba(211, 47, 47, 0.15)' // red shadow for missing config
                          : '0 2px 8px rgba(25, 118, 210, 0.15)', // blue shadow for normal selection
                    }),
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', mr: 2, flexShrink: 0 }}>
                    <Checkbox
                      checked={selectedPlugins.has(plugin)}
                      onChange={(e) => {
                        e.stopPropagation();
                        handlePluginToggle(plugin);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                      color="primary"
                      size="small"
                      aria-label={displayNameOverrides[plugin] || categoryAliases[plugin] || plugin}
                    />
                    <TestCaseGenerateButton
                      onClick={() => handleGenerateTestCase(plugin)}
                      disabled={
                        apiHealthStatus !== 'connected' ||
                        (generatingTestCase && generatingPlugin === plugin)
                      }
                      isGenerating={generatingTestCase && generatingPlugin === plugin}
                      tooltipTitle={
                        apiHealthStatus === 'connected'
                          ? `Generate a test case for ${displayNameOverrides[plugin] || categoryAliases[plugin] || plugin}`
                          : 'Promptfoo Cloud connection is required for test generation'
                      }
                    />
                  </Box>

                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Typography
                        variant="subtitle1"
                        sx={{
                          fontWeight: selectedPlugins.has(plugin) ? 600 : 500,
                          color: selectedPlugins.has(plugin) ? 'primary.main' : 'text.primary',
                        }}
                      >
                        {displayNameOverrides[plugin] || categoryAliases[plugin] || plugin}
                      </Typography>

                      {/* Category badge for "Recently Used" plugins */}
                      {category === 'Recently Used' && (
                        <Typography
                          variant="caption"
                          sx={{
                            backgroundColor: 'action.hover',
                            px: 1,
                            py: 0.25,
                            borderRadius: 1,
                            color: 'text.secondary',
                            fontSize: '0.7rem',
                            textAlign: 'center',
                          }}
                        >
                          Recently Used
                        </Typography>
                      )}

                      {AGENTIC_EXEMPT_PLUGINS.includes(plugin as any) && (
                        <Typography
                          variant="caption"
                          sx={{
                            fontSize: '0.7rem',
                            color: 'text.secondary',
                            fontWeight: 400,
                            backgroundColor: 'action.hover',
                            px: 0.5,
                            py: 0.25,
                            borderRadius: 0.5,
                          }}
                        >
                          agentic
                        </Typography>
                      )}
                      {DATASET_EXEMPT_PLUGINS.includes(plugin as any) && (
                        <Typography
                          variant="caption"
                          sx={{
                            fontSize: '0.7rem',
                            color: 'text.secondary',
                            fontWeight: 400,
                            backgroundColor: 'action.hover',
                            px: 0.5,
                            py: 0.25,
                            borderRadius: 0.5,
                          }}
                        >
                          no strategies
                        </Typography>
                      )}
                      {HUGGINGFACE_GATED_PLUGINS.includes(plugin as any) && (
                        <Tooltip title="This dataset requires a HuggingFace API key to access. Set HF_TOKEN environment variable.">
                          <Typography
                            variant="caption"
                            sx={(theme) => ({
                              fontSize: '0.7rem',
                              color: 'warning.main',
                              fontWeight: 500,
                              backgroundColor: alpha(theme.palette.warning.main, 0.08),
                              px: 0.5,
                              py: 0.25,
                              borderRadius: 0.5,
                              border: `1px solid ${alpha(theme.palette.warning.main, 0.3)}`,
                            })}
                          >
                            🤗 API key required
                          </Typography>
                        </Tooltip>
                      )}
                    </Box>
                    <Typography
                      variant="body2"
                      sx={{
                        color: 'text.secondary',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {subCategoryDescriptions[plugin]}
                    </Typography>
                  </Box>

                  <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0, ml: 2 }}>
                    {/* Settings/Configuration button */}
                    {selectedPlugins.has(plugin) && PLUGINS_SUPPORTING_CONFIG.includes(plugin) && (
                      <IconButton
                        size="small"
                        title={
                          isPluginConfigured(plugin)
                            ? 'Edit Configuration'
                            : 'Configuration Required'
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          handleConfigClick(plugin);
                        }}
                        sx={{
                          mr: 1,
                          opacity: 0.6,
                          '&:hover': {
                            opacity: 1,
                            backgroundColor: alpha(theme.palette.primary.main, 0.08),
                          },
                          ...(PLUGINS_REQUIRING_CONFIG.includes(plugin) &&
                            !isPluginConfigured(plugin) && {
                              color: 'error.main',
                              opacity: 1,
                            }),
                        }}
                      >
                        <SettingsOutlinedIcon fontSize="small" />
                      </IconButton>
                    )}

                    {/* Documentation link */}
                    {hasSpecificPluginDocumentation(plugin) && (
                      <Tooltip
                        title={`View ${displayNameOverrides[plugin] || categoryAliases[plugin] || plugin} documentation`}
                      >
                        <IconButton
                          size="small"
                          component={Link}
                          href={getPluginDocumentationUrl(plugin)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          sx={{ color: 'text.secondary' }}
                        >
                          <HelpOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </Paper>
              ))}
            </Stack>

            {/* Custom sections */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 'medium', mb: 2 }}>
                Custom Configurations
              </Typography>

              <Paper variant="outlined" sx={{ p: 3, mb: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 500, mb: 2 }}>
                  Custom Prompts (
                  {config.plugins.filter(
                    (p): p is { id: string; config: any } =>
                      typeof p === 'object' && 'id' in p && p.id === 'intent' && 'config' in p,
                  )[0]?.config?.intent?.length || 0}
                  )
                </Typography>
                <CustomIntentSection />
              </Paper>

              <Paper variant="outlined" sx={{ p: 3 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 500, mb: 2 }}>
                  Custom Policies (
                  {config.plugins.filter(
                    (p) => typeof p === 'object' && 'id' in p && p.id === 'policy',
                  ).length || 0}
                  )
                </Typography>
                <CustomPoliciesSection />
              </Paper>
            </Box>

            <PluginConfigDialog
              open={configDialogOpen}
              plugin={selectedConfigPlugin}
              config={selectedConfigPlugin ? pluginConfig[selectedConfigPlugin] || {} : {}}
              onClose={() => {
                setConfigDialogOpen(false);
                setSelectedConfigPlugin(null);
              }}
              onSave={(plugin, newConfig) => {
                updatePluginConfig(plugin, newConfig);
              }}
            />

            {/* Test Case Generation Dialog */}
            <TestCaseDialog
              open={testCaseDialogOpen}
              onClose={() => {
                setTestCaseDialogOpen(false);
                setGeneratedTestCase(null);
                setGeneratingPlugin(null);
                setTestCaseDialogMode('config');
                setTempTestCaseConfig({});
                setTargetResponse(null);
                setIsRunningTest(false);
              }}
              plugin={generatingPlugin}
              isGenerating={generatingTestCase}
              generatedTestCase={generatedTestCase}
              targetResponse={targetResponse}
              isRunningTest={isRunningTest}
              mode={testCaseDialogMode}
              config={tempTestCaseConfig}
              onConfigChange={setTempTestCaseConfig}
              onGenerate={(configForGeneration) => {
                if (generatingPlugin) {
                  generateTestCaseWithConfig(generatingPlugin, configForGeneration);
                }
              }}
              requiresConfig={
                generatingPlugin ? PLUGINS_REQUIRING_CONFIG.includes(generatingPlugin) : false
              }
              supportsConfig={
                generatingPlugin ? PLUGINS_SUPPORTING_CONFIG.includes(generatingPlugin) : false
              }
              isConfigValid={
                generatingPlugin
                  ? isTestCaseConfigValid(generatingPlugin, tempTestCaseConfig)
                  : true
              }
            />
          </Box>

          {/* Selected Plugins Sidebar */}
          <Box
            sx={{
              width: 320,
              position: 'sticky',
              top: 72,
              maxHeight: '60vh',
              overflowY: 'auto',
            }}
          >
            <Paper
              variant="outlined"
              sx={{
                p: 2,
                backgroundColor: 'background.paper',
              }}
            >
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                Selected Plugins ({selectedPlugins.size})
              </Typography>

              {selectedPlugins.size === 0 ? (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ textAlign: 'center', py: 4 }}
                >
                  No plugins selected yet.
                  <br />
                  Click on plugins to add them here.
                </Typography>
              ) : (
                <Stack sx={{ maxHeight: '400px', overflowY: 'auto' }} spacing={1}>
                  {Array.from(selectedPlugins).map((plugin) => {
                    const requiresConfig = PLUGINS_REQUIRING_CONFIG.includes(plugin);
                    const hasError = requiresConfig && !isPluginConfigured(plugin);

                    return (
                      <Paper
                        key={plugin}
                        variant="outlined"
                        sx={{
                          p: 1.5,
                          display: 'flex',
                          alignItems: 'center',
                          backgroundColor: hasError ? 'error.50' : 'primary.50',
                          borderColor: hasError ? 'error.main' : 'primary.200',
                          borderWidth: hasError ? 2 : 1,
                        }}
                      >
                        <Box
                          sx={{
                            flex: 1,
                            minWidth: 0,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                          }}
                        >
                          {hasError && (
                            <ErrorIcon
                              fontSize="small"
                              sx={{
                                color: 'error.main',
                                flexShrink: 0,
                              }}
                            />
                          )}
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 500,
                              fontSize: '0.875rem',
                              color: hasError ? 'error.main' : 'text.primary',
                            }}
                          >
                            {displayNameOverrides[plugin] || categoryAliases[plugin] || plugin}
                          </Typography>
                        </Box>
                        <IconButton
                          size="small"
                          onClick={() => handlePluginToggle(plugin)}
                          sx={{ color: 'text.secondary', ml: 1 }}
                        >
                          <RemoveIcon fontSize="small" />
                        </IconButton>
                      </Paper>
                    );
                  })}
                </Stack>
              )}

              {selectedPlugins.size > 0 && (
                <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                  <Button
                    variant="outlined"
                    size="small"
                    fullWidth
                    onClick={() => {
                      setHasUserInteracted(true);
                      selectedPlugins.forEach((plugin) => handlePluginToggle(plugin));
                    }}
                    sx={{ fontSize: '0.875rem' }}
                  >
                    Clear All
                  </Button>
                </Box>
              )}
            </Paper>
          </Box>
        </Box>
      </ErrorBoundary>
    </PageWrapper>
  );
}
