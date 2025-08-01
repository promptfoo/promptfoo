import { useCallback, useEffect, useMemo, useState } from 'react';

import { useTelemetry } from '@app/hooks/useTelemetry';
import { useToast } from '@app/hooks/useToast';
import { callApi } from '@app/utils/api';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RemoveIcon from '@mui/icons-material/Remove';
import SearchIcon from '@mui/icons-material/Search';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
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
  const [isCustomMode, setIsCustomMode] = useState(true);
  const [recentlyUsedSnapshot] = useState<Plugin[]>(() => [...recentlyUsedPlugins]);
  const [selectedPlugins, setSelectedPlugins] = useState<Set<Plugin>>(() => {
    return new Set(
      config.plugins
        .map((plugin) => (typeof plugin === 'string' ? plugin : plugin.id))
        .filter((id) => id !== 'policy' && id !== 'intent') as Plugin[],
    );
  });
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
    1000,
  );

  useEffect(() => {
    recordEvent('webui_page_view', { page: 'redteam_config_plugins' });
  }, []);

  useEffect(() => {
    if (debouncedPlugins) {
      updatePlugins(debouncedPlugins);
    }
  }, [debouncedPlugins, updatePlugins]);

  const handlePluginToggle = useCallback(
    (plugin: Plugin) => {
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

  const handleConfigClick = (plugin: Plugin) => {
    setSelectedConfigPlugin(plugin);
    setConfigDialogOpen(true);
  };

  const handleGenerateTestCase = async (plugin: Plugin) => {
    setGeneratingTestCase(true);
    setGeneratingPlugin(plugin);

    try {
      recordEvent('feature_used', {
        feature: 'redteam_plugin_generate_test_case',
        plugin: plugin,
      });

      const response = await callApi('/redteam/generate-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pluginId: plugin,
          config: {
            applicationDefinition: config.applicationDefinition,
            injectVar: 'query',
            language: 'en',
            modifiers: {},
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
      setTestCaseDialogOpen(true);
    } catch (error) {
      console.error('Failed to generate test case:', error);
      toast.showToast(
        error instanceof Error ? error.message : 'Failed to generate test case',
        'error',
      );
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
    >
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
          {/* Main content */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {/* Presets section */}
            <Box sx={{ mb: 4 }}>
              <Typography
                variant="h5"
                sx={{
                  mb: 3,
                  fontWeight: 500,
                  color: 'text.primary',
                }}
              >
                Available presets
              </Typography>

              <Box>
                <Grid
                  container
                  spacing={3}
                  sx={{
                    mb: 4,
                    justifyContent: {
                      xs: 'center',
                      sm: 'flex-start',
                    },
                  }}
                >
                  {presets.map((preset) => {
                    const isSelected =
                      preset.name === 'Custom'
                        ? isCustomMode
                        : preset.name === currentlySelectedPreset?.name;
                    return (
                      <Grid
                        item
                        xs={12}
                        sm={6}
                        md={4}
                        lg={3}
                        key={preset.name}
                        sx={{
                          minWidth: { xs: '280px', sm: '320px' },
                          maxWidth: { xs: '100%', sm: '380px' },
                        }}
                      >
                        <PresetCard
                          name={preset.name}
                          description={PLUGIN_PRESET_DESCRIPTIONS[preset.name] || ''}
                          isSelected={isSelected}
                          onClick={() => handlePresetSelect(preset)}
                        />
                      </Grid>
                    );
                  })}
                </Grid>
              </Box>
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
                  onClick={(e) => {
                    // Don't toggle if clicking on checkbox, buttons, or other interactive elements
                    if (
                      e.target instanceof Element &&
                      (e.target.closest('input[type="checkbox"]') ||
                        e.target.closest('button') ||
                        e.target.closest('[role="checkbox"]'))
                    ) {
                      return;
                    }
                    handlePluginToggle(plugin);
                  }}
                  sx={{
                    border: '2px solid',
                    borderColor: selectedPlugins.has(plugin) ? 'primary.main' : 'divider',
                    borderRadius: 2,
                    bgcolor: selectedPlugins.has(plugin)
                      ? 'rgba(25, 118, 210, 0.08)'
                      : 'transparent',
                    '&:hover': {
                      bgcolor: selectedPlugins.has(plugin)
                        ? 'rgba(25, 118, 210, 0.12)'
                        : 'rgba(0, 0, 0, 0.04)',
                      cursor: 'pointer',
                      borderColor: selectedPlugins.has(plugin)
                        ? 'primary.main'
                        : theme.palette.action.hover,
                    },
                    p: 2,
                    transition: 'all 0.2s ease-in-out',
                    display: 'flex',
                    alignItems: 'center',
                    width: '100%',
                    ...(selectedPlugins.has(plugin) && {
                      boxShadow: '0 2px 8px rgba(25, 118, 210, 0.15)',
                    }),
                  }}
                >
                  <Checkbox
                    checked={selectedPlugins.has(plugin)}
                    onChange={(e) => {
                      e.stopPropagation();
                      handlePluginToggle(plugin);
                    }}
                    color="primary"
                    sx={{ mr: 2, flexShrink: 0 }}
                    size="small"
                  />

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
                          sx={{ mr: 1, color: 'text.secondary' }}
                        >
                          <HelpOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}

                    {/* Generate test case button */}
                    <Tooltip
                      title={`Generate a test case for ${displayNameOverrides[plugin] || categoryAliases[plugin] || plugin}`}
                    >
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleGenerateTestCase(plugin);
                        }}
                        disabled={generatingTestCase && generatingPlugin === plugin}
                        sx={{ mr: 1, color: 'text.secondary' }}
                      >
                        {generatingTestCase && generatingPlugin === plugin ? (
                          <CircularProgress size={16} />
                        ) : (
                          <PlayArrowIcon fontSize="small" />
                        )}
                      </IconButton>
                    </Tooltip>

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
            <Dialog
              open={testCaseDialogOpen}
              onClose={() => {
                setTestCaseDialogOpen(false);
                setGeneratedTestCase(null);
                setGeneratingPlugin(null);
              }}
              maxWidth="md"
              fullWidth
            >
              <DialogTitle>
                Generated Test Case -{' '}
                {generatingPlugin &&
                  (displayNameOverrides[generatingPlugin] ||
                    categoryAliases[generatingPlugin] ||
                    generatingPlugin)}
              </DialogTitle>
              <DialogContent>
                {generatedTestCase && (
                  <Box>
                    <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                      Generated Prompt:
                    </Typography>
                    <Box
                      sx={{
                        p: 2,
                        mb: 3,
                        backgroundColor: 'grey.50',
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: 'grey.300',
                        fontFamily: 'monospace',
                        fontSize: '0.875rem',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {generatedTestCase.prompt}
                    </Box>

                    {generatedTestCase.context && (
                      <Box>
                        <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                          Context:
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          {generatedTestCase.context}
                        </Typography>
                      </Box>
                    )}

                    {generatedTestCase.metadata &&
                      Object.keys(generatedTestCase.metadata).length > 0 && (
                        <Box>
                          <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                            Metadata:
                          </Typography>
                          <Box
                            sx={{
                              p: 2,
                              backgroundColor: 'grey.50',
                              borderRadius: 1,
                              border: '1px solid',
                              borderColor: 'grey.300',
                              fontFamily: 'monospace',
                              fontSize: '0.875rem',
                            }}
                          >
                            {JSON.stringify(generatedTestCase.metadata, null, 2)}
                          </Box>
                        </Box>
                      )}
                  </Box>
                )}
              </DialogContent>
              <DialogActions>
                <Button
                  onClick={() => {
                    setTestCaseDialogOpen(false);
                    setGeneratedTestCase(null);
                    setGeneratingPlugin(null);
                  }}
                >
                  Close
                </Button>
              </DialogActions>
            </Dialog>
          </Box>

          {/* Selected Plugins Sidebar */}
          <Box
            sx={{
              width: 320,
              position: 'sticky',
              top: 20,
              maxHeight: 'calc(100vh - 100px)',
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
                <Stack spacing={1}>
                  {Array.from(selectedPlugins).map((plugin) => (
                    <Paper
                      key={plugin}
                      variant="outlined"
                      sx={{
                        p: 1.5,
                        display: 'flex',
                        alignItems: 'center',
                        backgroundColor: 'primary.50',
                        borderColor: 'primary.200',
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.875rem' }}>
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
                  ))}
                </Stack>
              )}

              {selectedPlugins.size > 0 && (
                <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                  <Button
                    variant="outlined"
                    size="small"
                    fullWidth
                    onClick={() => {
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
