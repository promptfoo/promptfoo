import { useCallback, useMemo, useState } from 'react';
import MagicWandIcon from '@mui/icons-material/AutoFixHigh';
import ErrorIcon from '@mui/icons-material/Error';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import RemoveIcon from '@mui/icons-material/Remove';
import SearchIcon from '@mui/icons-material/Search';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import Alert from '@mui/material/Alert';
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
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
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
import type { PluginConfig } from '@promptfoo/redteam/types';
import { ErrorBoundary } from 'react-error-boundary';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { useToast } from '@app/hooks/useToast';
import { callApi } from '@app/utils/api';
import PluginConfigDialog from './PluginConfigDialog';
import PresetCard from './PresetCard';
import {
  getPluginDocumentationUrl,
  hasSpecificPluginDocumentation,
} from './pluginDocumentationMap';

import type { ApplicationDefinition, LocalPluginConfig } from '../types';

const ErrorFallback = ({ error }: { error: Error }) => (
  <div role="alert">
    <p>Something went wrong:</p>
    <pre>{error.message}</pre>
  </div>
);

// Constants
const PLUGINS_REQUIRING_CONFIG = ['indirect-prompt-injection', 'prompt-extraction'];
const PLUGINS_SUPPORTING_CONFIG = ['bfla', 'bola', 'ssrf', ...PLUGINS_REQUIRING_CONFIG];

export interface PluginsTabProps {
  selectedPlugins: Set<Plugin>;
  handlePluginToggle: (plugin: Plugin) => void;
  pluginConfig: LocalPluginConfig;
  updatePluginConfig: (plugin: string, newConfig: Partial<LocalPluginConfig[string]>) => void;
  recentlyUsedPlugins: Plugin[];
  applicationDefinition?: ApplicationDefinition;
  onUserInteraction: () => void;
}

export default function PluginsTab({
  selectedPlugins,
  handlePluginToggle,
  pluginConfig,
  updatePluginConfig,
  recentlyUsedPlugins,
  applicationDefinition,
  onUserInteraction,
}: PluginsTabProps): JSX.Element {
  const theme = useTheme();
  const { recordEvent } = useTelemetry();
  const toast = useToast();

  // Internal state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [selectedConfigPlugin, setSelectedConfigPlugin] = useState<Plugin | null>(null);
  const [testCaseDialogOpen, setTestCaseDialogOpen] = useState(false);
  const [generatingPlugin, setGeneratingPlugin] = useState<Plugin | null>(null);
  const [generatedTestCase, setGeneratedTestCase] = useState<{
    prompt: string;
    context: string;
    metadata?: any;
  } | null>(null);
  const [generatingTestCase, setGeneratingTestCase] = useState(false);
  const [testCaseDialogMode, setTestCaseDialogMode] = useState<'config' | 'result'>('config');
  const [tempTestCaseConfig, setTempTestCaseConfig] = useState<any>({});
  const [isCustomMode, setIsCustomMode] = useState(true);

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

  const isTestCaseConfigValid = useCallback((plugin: Plugin, config: any) => {
    if (!PLUGINS_REQUIRING_CONFIG.includes(plugin)) {
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
    return true;
  }, []);

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

    return plugins;
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
      const supportsConfig = PLUGINS_SUPPORTING_CONFIG.includes(plugin);

      setGeneratingPlugin(plugin);
      setGeneratedTestCase(null);
      setGeneratingTestCase(false);

      if (supportsConfig) {
        setTempTestCaseConfig(pluginConfig[plugin] || {});
        setTestCaseDialogMode('config');
        setTestCaseDialogOpen(true);
      } else {
        await generateTestCaseWithConfig(plugin, {});
      }
    },
    [pluginConfig],
  );

  const generateTestCaseWithConfig = useCallback(
    async (plugin: Plugin, configForGeneration: any) => {
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
              applicationDefinition,
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
        setTestCaseDialogOpen(false);
        setGeneratingPlugin(null);
      } finally {
        setGeneratingTestCase(false);
      }
    },
    [recordEvent, applicationDefinition, testCaseDialogOpen, toast],
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
                      sx={{ color: 'text.secondary', ml: 0.5 }}
                    >
                      {generatingTestCase && generatingPlugin === plugin ? (
                        <CircularProgress size={16} />
                      ) : (
                        <MagicWandIcon fontSize="small" />
                      )}
                    </IconButton>
                  </Tooltip>
                  {/* Config button for plugins that support config */}
                  {PLUGINS_SUPPORTING_CONFIG.includes(plugin) && (
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
                            selectedPlugins.has(plugin) &&
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
                  <Typography
                    variant="body1"
                    sx={{
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {displayNameOverrides[plugin] || categoryAliases[plugin] || plugin}
                  </Typography>
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
            ))}
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

          {/* Test Case Generation Dialog */}
          <Dialog
            open={testCaseDialogOpen}
            onClose={() => {
              setTestCaseDialogOpen(false);
              setTempTestCaseConfig({});
            }}
            maxWidth="md"
            fullWidth
          >
            <DialogTitle>
              {testCaseDialogMode === 'config'
                ? `Configure Test Case for ${generatingPlugin ? displayNameOverrides[generatingPlugin] || categoryAliases[generatingPlugin] || generatingPlugin : ''}`
                : `Generated Test Case for ${generatingPlugin ? displayNameOverrides[generatingPlugin] || categoryAliases[generatingPlugin] || generatingPlugin : ''}`}
            </DialogTitle>
            <DialogContent>
              {testCaseDialogMode === 'config' && generatingPlugin && (
                <Box>
                  <Typography variant="body2" sx={{ mb: 2 }}>
                    Configure parameters for the test case generation. These settings will be used
                    only for generating this test case.
                  </Typography>
                  {generatingPlugin === 'indirect-prompt-injection' && (
                    <TextField
                      label="Indirect Injection Variable"
                      fullWidth
                      margin="normal"
                      value={tempTestCaseConfig.indirectInjectionVar || ''}
                      onChange={(e) =>
                        setTempTestCaseConfig({
                          ...tempTestCaseConfig,
                          indirectInjectionVar: e.target.value,
                        })
                      }
                      helperText="The variable name to inject content into"
                      required
                    />
                  )}
                  {generatingPlugin === 'prompt-extraction' && (
                    <TextField
                      label="System Prompt"
                      fullWidth
                      multiline
                      rows={4}
                      margin="normal"
                      value={tempTestCaseConfig.systemPrompt || ''}
                      onChange={(e) =>
                        setTempTestCaseConfig({
                          ...tempTestCaseConfig,
                          systemPrompt: e.target.value,
                        })
                      }
                      helperText="The system prompt that the attacker is trying to extract"
                      required
                    />
                  )}
                  {(generatingPlugin === 'bfla' ||
                    generatingPlugin === 'bola' ||
                    generatingPlugin === 'ssrf') && (
                    <>
                      <Alert severity="info" sx={{ mb: 2 }}>
                        These settings are optional and will enhance the test case generation if
                        provided.
                      </Alert>
                      <TextField
                        label="Request Templates"
                        fullWidth
                        multiline
                        rows={3}
                        margin="normal"
                        value={tempTestCaseConfig.requestTemplates?.join('\n') || ''}
                        onChange={(e) =>
                          setTempTestCaseConfig({
                            ...tempTestCaseConfig,
                            requestTemplates: e.target.value.split('\n').filter((t) => t.trim()),
                          })
                        }
                        helperText="Enter request templates (one per line) for more targeted test generation"
                      />
                    </>
                  )}
                </Box>
              )}
              {testCaseDialogMode === 'result' &&
                (generatingTestCase ? (
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      py: 4,
                    }}
                  >
                    <CircularProgress size={48} />
                    <Typography variant="body1" sx={{ mt: 2 }}>
                      Generating test case...
                    </Typography>
                  </Box>
                ) : generatedTestCase ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box>
                      <Typography variant="subtitle2" gutterBottom>
                        Prompt:
                      </Typography>
                      <Paper
                        variant="outlined"
                        sx={{
                          p: 2,
                          backgroundColor: 'background.paper',
                          fontFamily: 'monospace',
                          fontSize: '0.875rem',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {generatedTestCase.prompt}
                      </Paper>
                    </Box>
                    {generatedTestCase.context && (
                      <Box>
                        <Typography variant="subtitle2" gutterBottom>
                          Context:
                        </Typography>
                        <Paper
                          variant="outlined"
                          sx={{
                            p: 2,
                            backgroundColor: 'background.paper',
                            fontFamily: 'monospace',
                            fontSize: '0.875rem',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {generatedTestCase.context}
                        </Paper>
                      </Box>
                    )}
                    <Alert severity="info">
                      <Typography variant="body2">
                        This is an example test case. When you run the evaluation, multiple
                        variations will be generated automatically.
                      </Typography>
                    </Alert>
                  </Box>
                ) : (
                  <Alert severity="error">
                    <Typography variant="body2">Failed to generate test case.</Typography>
                  </Alert>
                ))}
            </DialogContent>
            <DialogActions>
              <Button
                onClick={() => {
                  setTestCaseDialogOpen(false);
                  setTempTestCaseConfig({});
                }}
              >
                {testCaseDialogMode === 'config' ? 'Cancel' : 'Close'}
              </Button>
              {testCaseDialogMode === 'config' &&
                generatingPlugin &&
                PLUGINS_SUPPORTING_CONFIG.includes(generatingPlugin) && (
                  <>
                    {PLUGINS_REQUIRING_CONFIG.includes(generatingPlugin) && (
                      <Button
                        onClick={() => generateTestCaseWithConfig(generatingPlugin, {})}
                        variant="outlined"
                      >
                        Skip Configuration
                      </Button>
                    )}
                    <Button
                      onClick={() =>
                        generateTestCaseWithConfig(generatingPlugin, tempTestCaseConfig)
                      }
                      variant="contained"
                      disabled={!isTestCaseConfigValid(generatingPlugin, tempTestCaseConfig)}
                    >
                      Generate Test Case
                    </Button>
                  </>
                )}
            </DialogActions>
          </Dialog>
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
