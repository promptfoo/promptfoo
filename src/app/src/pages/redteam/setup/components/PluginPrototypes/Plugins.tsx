import { useCallback, useEffect, useMemo, useState } from 'react';

import { useTelemetry } from '@app/hooks/useTelemetry';
import { callApi } from '@app/utils/api';
import AddIcon from '@mui/icons-material/Add';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ClearIcon from '@mui/icons-material/Clear';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import RemoveIcon from '@mui/icons-material/Remove';
import SearchIcon from '@mui/icons-material/Search';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid2';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemSecondaryAction from '@mui/material/ListItemSecondaryAction';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import { alpha } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  ALL_PLUGINS,
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
import { useDebounce } from 'use-debounce';
import { useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import CustomIntentSection from '../CustomIntentPluginSection';
import PluginConfigDialog from '../PluginConfigDialog';
import PresetCard from '../PresetCard';
import { CustomPoliciesSection } from '../Targets/CustomPoliciesSection';

import type { LocalPluginConfig } from '../../types';

interface PluginsProps {
  onNext: () => void;
  onBack: () => void;
}

const PLUGINS_REQUIRING_CONFIG = ['indirect-prompt-injection', 'prompt-extraction'];
const PLUGINS_SUPPORTING_CONFIG = [
  'bfla',
  'bola',
  'ssrf',
  'policy',
  'intent',
  ...PLUGINS_REQUIRING_CONFIG,
];

export default function Plugins({ onNext, onBack }: PluginsProps) {
  const { config, updatePlugins } = useRedTeamConfig();
  const { recordEvent } = useTelemetry();
  const [selectedPlugins, setSelectedPlugins] = useState<Set<Plugin>>(() => {
    return new Set(
      config.plugins.map((plugin) => (typeof plugin === 'string' ? plugin : plugin.id)) as Plugin[],
    );
  });
  const [searchTerm, setSearchTerm] = useState('');
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
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testDialogPlugin, setTestDialogPlugin] = useState<Plugin | null>(null);
  const [generatedTest, setGeneratedTest] = useState<{
    prompt: string;
    context?: string;
    metadata?: any;
  } | null>(null);
  const [isGeneratingTest, setIsGeneratingTest] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  const [debouncedPlugins] = useDebounce(
    useMemo(
      () =>
        Array.from(selectedPlugins)
          .map((plugin): string | { id: string; config: any } | null => {
            if (plugin === 'policy' || plugin === 'intent') {
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
    50,
  );

  useEffect(() => {
    recordEvent('webui_page_view', { page: 'redteam_config_plugins' });
  }, []);

  useEffect(() => {
    if (debouncedPlugins) {
      updatePlugins(debouncedPlugins);
    }
  }, [debouncedPlugins, updatePlugins]);

  // Keep selectedPlugins in sync with config changes from custom sections
  useEffect(() => {
    const configOnlyPlugins = config.plugins
      .filter(
        (plugin): plugin is { id: string; config: any } =>
          typeof plugin === 'object' && 'id' in plugin && ['intent', 'policy'].includes(plugin.id),
      )
      .map((plugin) => plugin.id as Plugin);

    setSelectedPlugins((prev) => {
      const newSet = new Set(prev);

      // Add custom plugins that exist in config
      configOnlyPlugins.forEach((plugin) => newSet.add(plugin));

      // Remove custom plugins that no longer exist in config
      const configCustomPlugins = new Set(configOnlyPlugins);
      ['intent', 'policy'].forEach((customPlugin) => {
        if (
          !configCustomPlugins.has(customPlugin as Plugin) &&
          newSet.has(customPlugin as Plugin)
        ) {
          newSet.delete(customPlugin as Plugin);
        }
      });

      return newSet;
    });
  }, [config.plugins]);

  const handlePluginToggle = useCallback((plugin: Plugin) => {
    setSelectedPlugins((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(plugin)) {
        newSet.delete(plugin);
      } else {
        newSet.add(plugin);
        if (PLUGINS_REQUIRING_CONFIG.includes(plugin)) {
          setSelectedConfigPlugin(plugin);
          setConfigDialogOpen(true);
        }
      }
      return newSet;
    });
  }, []);

  const handlePresetSelect = (preset: {
    name: string;
    plugins: Set<Plugin> | ReadonlySet<Plugin>;
  }) => {
    setSelectedPlugins(new Set(preset.plugins));

    // Find which categories contain the plugins from this preset
    const categoriesToExpand = new Set<string>();
    const presetPluginArray = Array.from(preset.plugins);

    Object.entries(riskCategories).forEach(([category, categoryPlugins]) => {
      const hasPluginsInCategory = presetPluginArray.some((plugin) =>
        categoryPlugins.includes(plugin),
      );
      if (hasPluginsInCategory) {
        categoriesToExpand.add(category);
      }
    });

    // Also expand Custom sections if they contain relevant plugins
    if (presetPluginArray.includes('intent' as Plugin)) {
      categoriesToExpand.add('Custom Prompts');
    }
    if (presetPluginArray.includes('policy' as Plugin)) {
      categoriesToExpand.add('Custom Policies');
    }

    // Update expanded categories to show relevant sections
    setExpandedCategories(categoriesToExpand);
  };

  const clearAllPlugins = () => {
    setSelectedPlugins(new Set());
  };

  const filteredPlugins = useMemo(() => {
    if (!searchTerm) {
      return ALL_PLUGINS;
    }
    return ALL_PLUGINS.filter((plugin) => {
      const lowerSearchTerm = searchTerm.toLowerCase();
      return (
        plugin.toLowerCase().includes(lowerSearchTerm) ||
        displayNameOverrides[plugin]?.toLowerCase().includes(lowerSearchTerm) ||
        subCategoryDescriptions[plugin]?.toLowerCase().includes(lowerSearchTerm)
      );
    });
  }, [searchTerm]);

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

  const isPluginConfigured = (plugin: Plugin) => {
    if (plugin === 'policy') {
      return config.plugins.some(
        (p: any) => typeof p === 'object' && 'id' in p && p.id === 'policy',
      );
    }
    if (plugin === 'intent') {
      return config.plugins.some(
        (p: any) => typeof p === 'object' && 'id' in p && p.id === 'intent',
      );
    }
    if (!PLUGINS_REQUIRING_CONFIG.includes(plugin)) {
      return true;
    }
    const pluginConf = pluginConfig[plugin];
    return pluginConf && Object.keys(pluginConf).length > 0;
  };

  const selectedPluginsList = Array.from(selectedPlugins).sort((a, b) => {
    const nameA = displayNameOverrides[a] || a;
    const nameB = displayNameOverrides[b] || b;
    return nameA.localeCompare(nameB);
  });

  const getPluginPreview = (plugin: Plugin): string => {
    if (plugin === 'intent') {
      const intentPlugin = config.plugins.find(
        (p): p is { id: string; config: any } =>
          typeof p === 'object' && 'id' in p && p.id === 'intent',
      );
      if (intentPlugin?.config?.intent) {
        const intents = intentPlugin.config.intent;
        // Flatten nested arrays and filter out empty strings
        const flatIntents = intents
          .flat()
          .filter((intent: any) => typeof intent === 'string' && intent.trim());

        if (flatIntents.length > 0) {
          const firstIntent = flatIntents[0];
          const preview =
            firstIntent.length > 80 ? `${firstIntent.substring(0, 80)}...` : firstIntent;
          return `${flatIntents.length} custom prompt${flatIntents.length !== 1 ? 's' : ''}: "${preview}"`;
        }
      }
      return 'No custom prompts configured';
    }

    if (plugin === 'policy') {
      const policyPlugins = config.plugins.filter(
        (p): p is { id: string; config: any } =>
          typeof p === 'object' && 'id' in p && p.id === 'policy',
      );

      const validPolicies = policyPlugins.filter((p) => p.config?.policy?.trim());
      if (validPolicies.length > 0) {
        const firstPolicy = validPolicies[0].config.policy;
        const preview =
          firstPolicy.length > 80 ? `${firstPolicy.substring(0, 80)}...` : firstPolicy;
        return `${validPolicies.length} custom polic${validPolicies.length !== 1 ? 'ies' : 'y'}: "${preview}"`;
      }
      return 'No custom policies configured';
    }

    return subCategoryDescriptions[plugin] || '';
  };

  const generateTest = async (plugin: Plugin) => {
    setIsGeneratingTest(true);
    setTestError(null);
    setGeneratedTest(null);

    try {
      const response = await callApi('/redteam/generate-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pluginId: plugin,
          config: config,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();

      setGeneratedTest({
        prompt: data.prompt,
        context: data.context,
        metadata: data.metadata,
      });
    } catch (error) {
      console.error('Error generating test:', error);
      setTestError(error instanceof Error ? error.message : 'Failed to generate test example');
    } finally {
      setIsGeneratingTest(false);
    }
  };

  const handleGenerateTest = (plugin: Plugin) => {
    setTestDialogPlugin(plugin);
    setTestDialogOpen(true);
    generateTest(plugin);
  };

  const handleCopyTest = () => {
    if (generatedTest) {
      navigator.clipboard.writeText(generatedTest.prompt);
      recordEvent('feature_used', { feature: 'redteam_copy_generated_test' });
    }
  };

  return (
    <Box sx={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold', mb: 3 }}>
        Plugin Configuration
      </Typography>

      {/* Preset Selection */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 500 }}>
          Quick Start with Presets
        </Typography>
        <Grid container spacing={2}>
          {presets.map((preset) => {
            const isSelected =
              Array.from(preset.plugins).every((p) => selectedPlugins.has(p)) &&
              preset.plugins.size === selectedPlugins.size;
            return (
              <Grid key={preset.name}>
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

      {/* Main Content - Dual Panel */}
      <Grid container spacing={3}>
        {/* Left Panel - Available Plugins */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Paper elevation={1} sx={{ p: 3, height: '100%' }}>
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Available Plugins
              </Typography>
              <TextField
                fullWidth
                variant="outlined"
                label="Search plugins"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                }}
                size="small"
              />
            </Box>

            <Box sx={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {Object.entries(riskCategories).map(([category, plugins]) => {
                const categoryPlugins = plugins.filter((p) => filteredPlugins.includes(p));
                if (categoryPlugins.length === 0) {
                  return null;
                }

                const isExpanded = expandedCategories.has(category);
                const selectedCount = categoryPlugins.filter((p) => selectedPlugins.has(p)).length;

                return (
                  <Accordion
                    key={category}
                    expanded={isExpanded}
                    onChange={(_, expanded) => {
                      setExpandedCategories((prev) => {
                        const newSet = new Set(prev);
                        expanded ? newSet.add(category) : newSet.delete(category);
                        return newSet;
                      });
                    }}
                    sx={{ mb: 1 }}
                  >
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                        <Typography variant="subtitle1" sx={{ flex: 1 }}>
                          {category}
                        </Typography>
                        <Chip
                          size="small"
                          label={`${selectedCount}/${categoryPlugins.length}`}
                          color={selectedCount > 0 ? 'primary' : 'default'}
                          sx={{ mr: 1 }}
                        />
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails>
                      <List dense>
                        {categoryPlugins.map((plugin) => {
                          const isSelected = selectedPlugins.has(plugin);
                          const requiresConfig = PLUGINS_REQUIRING_CONFIG.includes(plugin);
                          const hasConfig = isPluginConfigured(plugin);

                          return (
                            <ListItem
                              key={plugin}
                              disablePadding
                              sx={{
                                backgroundColor: isSelected ? alpha('#1976d2', 0.08) : undefined,
                                borderRadius: 1,
                                mb: 0.5,
                              }}
                            >
                              <ListItemButton onClick={() => handlePluginToggle(plugin)}>
                                <ListItemText
                                  primary={displayNameOverrides[plugin] || plugin}
                                  secondary={subCategoryDescriptions[plugin]}
                                  secondaryTypographyProps={{
                                    sx: { fontSize: '0.75rem' },
                                  }}
                                />
                                <ListItemSecondaryAction>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    {isSelected && requiresConfig && !hasConfig && (
                                      <Tooltip title="Configuration required">
                                        <InfoOutlinedIcon color="error" fontSize="small" />
                                      </Tooltip>
                                    )}
                                    <Tooltip title="Generate sample test">
                                      <IconButton
                                        size="small"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleGenerateTest(plugin);
                                        }}
                                        color="secondary"
                                      >
                                        <PlayArrowIcon fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                    <IconButton
                                      edge="end"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handlePluginToggle(plugin);
                                      }}
                                      size="small"
                                      color={isSelected ? 'primary' : 'default'}
                                    >
                                      {isSelected ? <RemoveIcon /> : <AddIcon />}
                                    </IconButton>
                                  </Box>
                                </ListItemSecondaryAction>
                              </ListItemButton>
                            </ListItem>
                          );
                        })}
                      </List>
                    </AccordionDetails>
                  </Accordion>
                );
              })}

              {/* Custom Prompts Section */}
              <Accordion
                expanded={expandedCategories.has('Custom Prompts')}
                onChange={(_, expanded) => {
                  setExpandedCategories((prev) => {
                    const newSet = new Set(prev);
                    expanded ? newSet.add('Custom Prompts') : newSet.delete('Custom Prompts');
                    return newSet;
                  });
                }}
                sx={{ mb: 1 }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                    <Typography variant="subtitle1" sx={{ flex: 1 }}>
                      Custom Prompts
                    </Typography>
                    <Chip
                      size="small"
                      label={
                        config.plugins.filter(
                          (p): p is { id: string; config: any } =>
                            typeof p === 'object' &&
                            'id' in p &&
                            p.id === 'intent' &&
                            'config' in p,
                        )[0]?.config?.intent?.length || 0
                      }
                      color="primary"
                      sx={{ mr: 1 }}
                    />
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <CustomIntentSection />
                </AccordionDetails>
              </Accordion>

              {/* Custom Policies Section */}
              <Accordion
                expanded={expandedCategories.has('Custom Policies')}
                onChange={(_, expanded) => {
                  setExpandedCategories((prev) => {
                    const newSet = new Set(prev);
                    expanded ? newSet.add('Custom Policies') : newSet.delete('Custom Policies');
                    return newSet;
                  });
                }}
                sx={{ mb: 1 }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                    <Typography variant="subtitle1" sx={{ flex: 1 }}>
                      Custom Policies
                    </Typography>
                    <Chip
                      size="small"
                      label={
                        config.plugins.filter(
                          (p) => typeof p === 'object' && 'id' in p && p.id === 'policy',
                        ).length || 0
                      }
                      color="primary"
                      sx={{ mr: 1 }}
                    />
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <CustomPoliciesSection />
                </AccordionDetails>
              </Accordion>
            </Box>
          </Paper>
        </Grid>

        {/* Right Panel - Selected Plugins */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper
            elevation={2}
            sx={{
              p: 3,
              height: '100%',
              backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.02),
            }}
          >
            <Box
              sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}
            >
              <Typography sx={{ display: 'flex', alignItems: 'center', gap: 1 }} variant="h6">
                Selected Plugins
                <Badge
                  badgeContent={selectedPlugins.size}
                  color="primary"
                  sx={{ ml: 2 }}
                  showZero
                />
              </Typography>
              {selectedPlugins.size > 0 && (
                <Button
                  size="small"
                  startIcon={<ClearIcon />}
                  onClick={clearAllPlugins}
                  color="error"
                >
                  Clear All
                </Button>
              )}
            </Box>

            <Divider sx={{ mb: 2 }} />

            {selectedPlugins.size === 0 ? (
              <Alert severity="info" sx={{ mt: 2 }}>
                No plugins selected. Choose from the available plugins or select a preset to get
                started.
              </Alert>
            ) : (
              <List sx={{ maxHeight: '55vh', overflowY: 'auto' }}>
                {selectedPluginsList.map((plugin) => {
                  const requiresConfig = PLUGINS_REQUIRING_CONFIG.includes(plugin);
                  const supportsConfig = PLUGINS_SUPPORTING_CONFIG.includes(plugin);
                  const hasConfig = isPluginConfigured(plugin);

                  return (
                    <ListItem
                      key={plugin}
                      sx={{
                        backgroundColor: 'background.paper',
                        borderRadius: 1,
                        mb: 1,
                        border: (theme) =>
                          requiresConfig && !hasConfig
                            ? `1px solid ${theme.palette.error.main}`
                            : `1px solid ${theme.palette.divider}`,
                      }}
                      secondaryAction={
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <Tooltip title="Generate sample test">
                            <IconButton
                              size="small"
                              onClick={() => handleGenerateTest(plugin)}
                              color="secondary"
                            >
                              <AutoAwesomeIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {supportsConfig && (
                            <Tooltip title={hasConfig ? 'Edit configuration' : 'Configure plugin'}>
                              <IconButton
                                size="small"
                                onClick={() => {
                                  setSelectedConfigPlugin(plugin);
                                  setConfigDialogOpen(true);
                                }}
                                color={requiresConfig && !hasConfig ? 'error' : 'default'}
                              >
                                <SettingsOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          <Tooltip title="Remove plugin">
                            <IconButton
                              size="small"
                              onClick={() => handlePluginToggle(plugin)}
                              color="error"
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      }
                    >
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="subtitle2">
                              {displayNameOverrides[plugin] || plugin}
                            </Typography>
                            {requiresConfig && !hasConfig && (
                              <Chip size="small" label="Config needed" color="error" />
                            )}
                          </Box>
                        }
                        secondary={getPluginPreview(plugin)}
                        secondaryTypographyProps={{
                          sx: {
                            fontSize: '0.75rem',
                            mt: 0.5,
                            wordBreak: 'break-word',
                            lineHeight: 1.3,
                            maxHeight: '5em',
                            overflow: 'hidden',
                            maxWidth: '200px',
                          },
                        }}
                      />
                    </ListItem>
                  );
                })}
              </List>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Navigation */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
        <Button
          variant="outlined"
          onClick={onBack}
          startIcon={<KeyboardArrowLeftIcon />}
          sx={{ px: 4, py: 1 }}
        >
          Back
        </Button>
        <Button
          variant="contained"
          onClick={onNext}
          endIcon={<KeyboardArrowRightIcon />}
          disabled={selectedPlugins.size === 0}
          sx={{ px: 4, py: 1 }}
        >
          Next
        </Button>
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
          setPluginConfig((prev) => ({ ...prev, [plugin]: newConfig }));
        }}
      />

      {/* Test Generation Dialog */}
      <Dialog
        open={testDialogOpen}
        onClose={() => {
          setTestDialogOpen(false);
          setTestDialogPlugin(null);
          setGeneratedTest(null);
          setTestError(null);
        }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AutoAwesomeIcon color="primary" />
            <Typography variant="h6">
              Sample Test Generation
              {testDialogPlugin &&
                ` - ${displayNameOverrides[testDialogPlugin] || testDialogPlugin}`}
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ py: 2 }}>
            {isGeneratingTest && (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <CircularProgress />
                <Typography variant="body2" color="text.secondary">
                  Generating test based on your application context...
                </Typography>
              </Box>
            )}

            {testError && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                Unable to generate test: {testError}. Please try again.
              </Alert>
            )}

            {generatedTest && !isGeneratingTest && (
              <Box>
                <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
                  Generated Attack Prompt:
                </Typography>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    backgroundColor: (theme) => alpha(theme.palette.error.main, 0.02),
                    borderColor: (theme) => alpha(theme.palette.error.main, 0.2),
                    position: 'relative',
                  }}
                >
                  <Typography
                    variant="body1"
                    sx={{
                      fontFamily: 'monospace',
                      fontSize: '0.9rem',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      pr: 4,
                    }}
                  >
                    {generatedTest.prompt}
                  </Typography>
                  <Tooltip title="Copy to clipboard">
                    <IconButton
                      size="small"
                      onClick={handleCopyTest}
                      sx={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        opacity: 0.6,
                        '&:hover': { opacity: 1 },
                      }}
                    >
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Paper>

                {generatedTest.context && (
                  <Alert severity="info" sx={{ mt: 2 }}>
                    <Typography variant="caption">{generatedTest.context}</Typography>
                  </Alert>
                )}

                <Box sx={{ mt: 3, display: 'flex', gap: 2, justifyContent: 'center' }}>
                  <Button
                    startIcon={<RefreshIcon />}
                    onClick={() => testDialogPlugin && generateTest(testDialogPlugin)}
                    variant="outlined"
                  >
                    Regenerate
                  </Button>
                  <Button
                    variant="contained"
                    onClick={() => {
                      if (testDialogPlugin && !selectedPlugins.has(testDialogPlugin)) {
                        handlePluginToggle(testDialogPlugin);
                      }
                      setTestDialogOpen(false);
                    }}
                    disabled={!testDialogPlugin}
                  >
                    {testDialogPlugin && selectedPlugins.has(testDialogPlugin)
                      ? 'Close'
                      : 'Add Plugin & Close'}
                  </Button>
                </Box>
              </Box>
            )}
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
