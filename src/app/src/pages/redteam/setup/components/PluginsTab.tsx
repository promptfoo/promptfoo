import { useCallback, useMemo, useState } from 'react';
import ErrorIcon from '@mui/icons-material/Error';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import RemoveIcon from '@mui/icons-material/Remove';
import SearchIcon from '@mui/icons-material/Search';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { alpha, useTheme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
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
  MITRE_ATLAS_MAPPING,
  NIST_AI_RMF_MAPPING,
  OWASP_API_TOP_10_MAPPING,
  OWASP_LLM_RED_TEAM_MAPPING,
  OWASP_LLM_TOP_10_MAPPING,
  PLUGIN_PRESET_DESCRIPTIONS,
  type Plugin,
  riskCategories,
  subCategoryDescriptions,
  UI_DISABLED_WHEN_REMOTE_UNAVAILABLE,
} from '@promptfoo/redteam/constants';
import type { PluginConfig } from '@promptfoo/redteam/types';
import { ErrorBoundary } from 'react-error-boundary';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { useToast } from '@app/hooks/useToast';
import PluginConfigDialog from './PluginConfigDialog';
import PresetCard from './PresetCard';
import {
  getPluginDocumentationUrl,
  hasSpecificPluginDocumentation,
} from './pluginDocumentationMap';

import type { LocalPluginConfig } from '../types';
import { useTestCaseGeneration } from './TestCaseGenerationProvider';
import { TestCaseGenerateButton } from './TestCaseDialog';
import { useApiHealth } from '@app/hooks/useApiHealth';

const ErrorFallback = ({ error }: { error: Error }) => (
  <div role="alert">
    <p>Something went wrong:</p>
    <pre>{error.message}</pre>
  </div>
);

// Constants
const PLUGINS_REQUIRING_CONFIG = ['indirect-prompt-injection', 'prompt-extraction'];

export interface PluginsTabProps {
  selectedPlugins: Set<Plugin>;
  handlePluginToggle: (plugin: Plugin) => void;
  pluginConfig: LocalPluginConfig;
  updatePluginConfig: (plugin: string, newConfig: Partial<LocalPluginConfig[string]>) => void;
  recentlyUsedPlugins: Plugin[];
  onUserInteraction: () => void;
  isRemoteGenerationDisabled: boolean;
}

export default function PluginsTab({
  selectedPlugins,
  handlePluginToggle,
  pluginConfig,
  updatePluginConfig,
  recentlyUsedPlugins,
  onUserInteraction,
  isRemoteGenerationDisabled,
}: PluginsTabProps): JSX.Element {
  const theme = useTheme();
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

  // Test case generation state - now from context
  const {
    generateTestCase,
    isGenerating: generatingTestCase,
    currentPlugin: generatingPlugin,
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
    },
    [pluginConfig],
  );

  // Category filters
  const categoryFilters = useMemo(
    () =>
      Object.keys(riskCategories).map((category) => ({
        key: category,
        label: category,
      })),
    [],
  );

  const allCategoryFilters = useMemo(
    () => [
      ...(recentlyUsedPlugins.length > 0 ? [{ key: 'Recently Used', label: 'Recently Used' }] : []),
      ...(selectedPlugins.size > 0
        ? [{ key: 'Selected', label: `Selected (${selectedPlugins.size})` }]
        : []),
      ...categoryFilters,
    ],
    [recentlyUsedPlugins.length, selectedPlugins.size, categoryFilters],
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
              if (!pluginsWithCategories.some((p) => p.plugin === plugin)) {
                pluginsWithCategories.push({ plugin, category });
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
      onUserInteraction();
      if (preset.name === 'Custom') {
        setIsCustomMode(true);
      } else {
        preset.plugins.forEach((plugin) => {
          if (!selectedPlugins.has(plugin)) {
            handlePluginToggle(plugin);
          }
        });
        // Remove plugins not in preset
        selectedPlugins.forEach((plugin) => {
          if (!preset.plugins.has(plugin)) {
            handlePluginToggle(plugin);
          }
        });
        setIsCustomMode(false);
      }
    },
    [recordEvent, onUserInteraction, selectedPlugins, handlePluginToggle],
  );

  const handleGenerateTestCase = useCallback(
    async (plugin: Plugin) => {
      // For plugins that require config, we need to show config dialog first
      if (PLUGINS_REQUIRING_CONFIG.includes(plugin)) {
        setSelectedConfigPlugin(plugin);
        setConfigDialogOpen(true);
      }
      // Directly generate test case
      else {
        await generateTestCase(plugin, pluginConfig[plugin] || {}, {
          telemetryFeature: 'redteam_plugin_generate_test_case',
          mode: 'result',
        });
      }
    },
    [pluginConfig],
  );

  const handleConfigClick = useCallback((plugin: Plugin) => {
    setSelectedConfigPlugin(plugin);
    setConfigDialogOpen(true);
  }, []);

  return (
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
                        bgcolor: selectedCategory === filter.key ? 'primary.dark' : 'action.hover',
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
                onUserInteraction();
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
                onUserInteraction();
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
            {filteredPlugins.map(({ plugin, category }) => {
              const pluginDisabled = isPluginDisabled(plugin);
              return (
                <Paper
                  key={plugin}
                  variant="outlined"
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
                  sx={{
                    border: '1px solid',
                    borderColor: (() => {
                      if (pluginDisabled) {
                        return 'action.disabled';
                      }
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
                    cursor: pluginDisabled ? 'not-allowed' : 'pointer',
                    opacity: pluginDisabled ? 0.5 : 1,
                    bgcolor: (theme) => {
                      if (pluginDisabled) {
                        return 'action.disabledBackground';
                      }
                      if (selectedPlugins.has(plugin)) {
                        // Show red background if plugin is selected but missing required config
                        if (
                          PLUGINS_REQUIRING_CONFIG.includes(plugin) &&
                          !isPluginConfigured(plugin)
                        ) {
                          return alpha(theme.palette.error.main, 0.08);
                        }
                        return alpha(theme.palette.primary.main, 0.08);
                      }
                      return 'transparent';
                    },
                    '&:hover': {
                      bgcolor: (theme) => {
                        if (pluginDisabled) {
                          return 'action.disabledBackground';
                        }
                        if (selectedPlugins.has(plugin)) {
                          // Show red hover if plugin is selected but missing required config
                          if (
                            PLUGINS_REQUIRING_CONFIG.includes(plugin) &&
                            !isPluginConfigured(plugin)
                          ) {
                            return alpha(theme.palette.error.main, 0.12);
                          }
                          return alpha(theme.palette.primary.main, 0.12);
                        }
                        return alpha(theme.palette.common.black, 0.04);
                      },
                      cursor: pluginDisabled ? 'not-allowed' : 'pointer',
                      borderColor: (() => {
                        if (pluginDisabled) {
                          return 'action.disabled';
                        }
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
                      boxShadow: (theme) =>
                        PLUGINS_REQUIRING_CONFIG.includes(plugin) && !isPluginConfigured(plugin)
                          ? `0 2px 8px ${alpha(theme.palette.error.main, 0.15)}`
                          : `0 2px 8px ${alpha(theme.palette.primary.main, 0.15)}`,
                    }),
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', mr: 2, flexShrink: 0 }}>
                    <Checkbox
                      checked={selectedPlugins.has(plugin)}
                      disabled={pluginDisabled}
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
                        pluginDisabled ||
                        apiHealthStatus !== 'connected' ||
                        (generatingTestCase && generatingPlugin === plugin)
                      }
                      isGenerating={generatingTestCase && generatingPlugin === plugin}
                      tooltipTitle={
                        pluginDisabled
                          ? 'This plugin reqiures remote generation'
                          : apiHealthStatus === 'connected'
                            ? `Generate a test case for ${displayNameOverrides[plugin] || categoryAliases[plugin] || plugin}`
                            : 'Promptfoo Cloud connection is required for test generation'
                      }
                    />
                    {/* Config button - available for all plugins (gradingGuidance is universal) */}
                    {selectedPlugins.has(plugin) && (
                      <Tooltip
                        title={`Configure ${displayNameOverrides[plugin] || categoryAliases[plugin] || plugin}`}
                      >
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleConfigClick(plugin);
                          }}
                          sx={{
                            color:
                              PLUGINS_REQUIRING_CONFIG.includes(plugin) &&
                              !isPluginConfigured(plugin)
                                ? 'error.main'
                                : 'text.secondary',
                            ml: 0.5,
                          }}
                        >
                          <SettingsOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Typography
                        variant="body1"
                        sx={{
                          fontWeight: 500,
                        }}
                      >
                        {displayNameOverrides[plugin] || categoryAliases[plugin] || plugin}
                      </Typography>

                      {/* Badge for plugins requiring remote generation */}
                      {pluginDisabled && isRemoteGenerationDisabled && (
                        <Tooltip title="This plugin requires remote generation. Unset PROMPTFOO_DISABLE_REMOTE_GENERATION or PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION to enable.">
                          <Typography
                            variant="caption"
                            sx={(theme) => ({
                              fontSize: '0.7rem',
                              color: 'error.main',
                              fontWeight: 500,
                              backgroundColor: alpha(theme.palette.error.main, 0.08),
                              px: 0.5,
                              py: 0.25,
                              borderRadius: 0.5,
                              border: `1px solid ${alpha(theme.palette.error.main, 0.3)}`,
                            })}
                          >
                            Remote generation required
                          </Typography>
                        </Tooltip>
                      )}
                    </Box>
                    {subCategoryDescriptions[plugin] && (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {subCategoryDescriptions[plugin]}
                      </Typography>
                    )}
                  </Box>
                  <Box sx={{ flexShrink: 0 }}>
                    {category === 'Recently Used' && (
                      <Chip label="Recently Used" size="small" color="info" variant="outlined" />
                    )}
                    {hasSpecificPluginDocumentation(plugin) && (
                      <Tooltip title="View documentation">
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(getPluginDocumentationUrl(plugin), '_blank');
                          }}
                          sx={{ ml: 1 }}
                        >
                          <HelpOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </Paper>
              );
            })}
          </Stack>

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
                    onUserInteraction();
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
  );
}
