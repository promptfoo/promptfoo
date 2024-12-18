import { useState, useMemo, useCallback, useEffect } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useTelemetry } from '@app/hooks/useTelemetry';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import SearchIcon from '@mui/icons-material/Search';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import {
  HARM_PLUGINS,
  DEFAULT_PLUGINS,
  ALL_PLUGINS,
  NIST_AI_RMF_MAPPING,
  OWASP_LLM_TOP_10_MAPPING,
  OWASP_API_TOP_10_MAPPING,
  MITRE_ATLAS_MAPPING,
  displayNameOverrides,
  subCategoryDescriptions,
  categoryAliases,
  type Plugin,
  riskCategories,
} from '@promptfoo/redteam/constants';
import { useDebounce } from 'use-debounce';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';
import type { LocalPluginConfig } from '../types';
import PluginConfigDialog from './PluginConfigDialog';
import PresetCard from './PresetCard';
import { CustomPoliciesSection } from './Targets/CustomPoliciesSection';

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

const PLUGINS_REQUIRING_CONFIG = ['indirect-prompt-injection', 'intent', 'prompt-extraction'];

const PLUGINS_SUPPORTING_CONFIG = ['bfla', 'bola', 'ssrf', ...PLUGINS_REQUIRING_CONFIG];

export default function Plugins({ onNext, onBack }: PluginsProps) {
  const { config, updatePlugins } = useRedTeamConfig();
  const { recordEvent } = useTelemetry();
  const [isCustomMode, setIsCustomMode] = useState(true);
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

  const handlePluginToggle = useCallback((plugin: Plugin) => {
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

  const filteredPlugins = useMemo(() => {
    if (!searchTerm) {
      return ALL_PLUGINS;
    }
    return ALL_PLUGINS.filter((plugin) => {
      const lowerSearchTerm = searchTerm.toLowerCase();
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
  }, [searchTerm]);

  const presets: { name: string; plugins: Set<Plugin> | ReadonlySet<Plugin> }[] = [
    { name: 'Default', plugins: DEFAULT_PLUGINS },
    {
      name: 'NIST',
      plugins: new Set(Object.values(NIST_AI_RMF_MAPPING).flatMap((v) => v.plugins)),
    },
    {
      name: 'OWASP LLM',
      plugins: new Set(Object.values(OWASP_LLM_TOP_10_MAPPING).flatMap((v) => v.plugins)),
    },
    {
      name: 'OWASP API',
      plugins: new Set(Object.values(OWASP_API_TOP_10_MAPPING).flatMap((v) => v.plugins)),
    },
    {
      name: 'MITRE',
      plugins: new Set(Object.values(MITRE_ATLAS_MAPPING).flatMap((v) => v.plugins)),
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
          const value = config[key];
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

  const handleConfigClick = (plugin: Plugin) => {
    setSelectedConfigPlugin(plugin);
    setConfigDialogOpen(true);
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
      const value = config[key];
      if (Array.isArray(value) && value.length === 0) {
        return false;
      }
      if (typeof value === 'string' && value.trim() === '') {
        return false;
      }
    }
    return true;
  };

  const renderPluginCategory = (category: string, plugins: readonly Plugin[]) => {
    const pluginsToShow = plugins.filter((plugin) => filteredPlugins.includes(plugin));
    if (pluginsToShow.length === 0) {
      return null;
    }

    const isExpanded = expandedCategories.has(category);
    const selectedCount = pluginsToShow.filter((plugin) => selectedPlugins.has(plugin)).length;

    return (
      <Accordion
        key={category}
        expanded={isExpanded}
        onChange={(event, expanded) => {
          setExpandedCategories((prev) => {
            const newSet = new Set(prev);
            if (expanded) {
              newSet.add(category);
            } else {
              newSet.delete(category);
            }
            return newSet;
          });
        }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
            <Typography variant="h6" sx={{ fontWeight: 'medium', flex: 1 }}>
              {category} ({selectedCount}/{pluginsToShow.length})
            </Typography>
            {isExpanded && (
              <Box
                sx={{
                  display: 'flex',
                  gap: 2,
                  mr: 2,
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
                onClick={(e) => e.stopPropagation()}
              >
                <Box
                  component="span"
                  onClick={() => {
                    pluginsToShow.forEach((plugin) => {
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
                    pluginsToShow.forEach((plugin) => {
                      if (selectedPlugins.has(plugin)) {
                        handlePluginToggle(plugin);
                      }
                    });
                  }}
                >
                  Select none
                </Box>
              </Box>
            )}
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            {pluginsToShow.map((plugin) => (
              <Grid item xs={12} sm={6} md={4} key={plugin}>
                <Paper
                  elevation={1}
                  sx={{
                    p: 2,
                    height: '100%',
                    borderRadius: 2,
                    border: (theme) => {
                      if (selectedPlugins.has(plugin)) {
                        if (
                          PLUGINS_REQUIRING_CONFIG.includes(plugin) &&
                          !isPluginConfigured(plugin)
                        ) {
                          return `1px solid ${theme.palette.error.main}`; // Error state border
                        }
                        return `1px solid ${theme.palette.primary.main}`; // Selected state border
                      }
                      return '1px solid transparent';
                    },
                    backgroundColor: (theme) =>
                      selectedPlugins.has(plugin)
                        ? alpha(theme.palette.primary.main, 0.04)
                        : 'background.paper',
                    transition: 'all 0.2s ease-in-out',
                    '&:hover': {
                      backgroundColor: (theme) =>
                        selectedPlugins.has(plugin)
                          ? alpha(theme.palette.primary.main, 0.08)
                          : alpha(theme.palette.action.hover, 0.04),
                    },
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      height: '100%',
                      position: 'relative',
                    }}
                  >
                    <FormControlLabel
                      sx={{ flex: 1 }}
                      control={
                        <Checkbox
                          checked={selectedPlugins.has(plugin)}
                          onChange={() => handlePluginToggle(plugin)}
                          color="primary"
                        />
                      }
                      label={
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            {displayNameOverrides[plugin] || categoryAliases[plugin] || plugin}
                          </Box>
                          <Typography variant="body2" color="text.secondary">
                            {subCategoryDescriptions[plugin]}
                          </Typography>
                        </Box>
                      }
                    />
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
                          position: 'absolute',
                          top: 8,
                          right: 8,
                          opacity: 0.6,
                          '&:hover': {
                            opacity: 1,
                            backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.08),
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
              </Grid>
            ))}
          </Grid>
        </AccordionDetails>
      </Accordion>
    );
  };

  const currentlySelectedPreset = presets.find(
    (p) =>
      Array.from(p.plugins as Set<Plugin>).every((plugin) => selectedPlugins.has(plugin)) &&
      p.plugins.size === selectedPlugins.size,
  );

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <Box sx={{ p: 3 }}>
        <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold', mb: 3 }}>
          Plugin Configuration
        </Typography>

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

          <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
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
                      isSelected={isSelected}
                      onClick={() => handlePresetSelect(preset)}
                    />
                  </Grid>
                );
              })}
            </Grid>
          </Box>
        </Box>

        <TextField
          fullWidth
          variant="outlined"
          label="Filter Plugins"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: <SearchIcon />,
          }}
          sx={{ mb: 3 }}
        />
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
              filteredPlugins.forEach((plugin) => {
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
              filteredPlugins.forEach((plugin) => {
                if (selectedPlugins.has(plugin)) {
                  handlePluginToggle(plugin);
                }
              });
            }}
          >
            Select none
          </Box>
        </Box>
        <Box sx={{ mb: 3 }}>
          {Object.entries(riskCategories).map(([category, plugins]) =>
            renderPluginCategory(category, plugins),
          )}
        </Box>

        {selectedPlugins.has('policy') && (
          <Box sx={{ mb: 4 }}>
            <CustomPoliciesSection />
          </Box>
        )}

        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
          <Button variant="outlined" onClick={onBack} startIcon={<KeyboardArrowLeftIcon />}>
            Back
          </Button>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {selectedPlugins.size === 0 && (
              <Typography variant="body2" color="text.secondary">
                Select at least one plugin to continue.
              </Typography>
            )}
            <Button
              variant="contained"
              onClick={onNext}
              endIcon={<KeyboardArrowRightIcon />}
              disabled={!isConfigValid() || selectedPlugins.size === 0}
            >
              Next
            </Button>
          </Box>
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
      </Box>
    </ErrorBoundary>
  );
}
