import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import type { Plugin } from '@app/pages/redteam/report/components/constants';
import {
  COLLECTIONS,
  HARM_PLUGINS,
  PII_PLUGINS,
  BASE_PLUGINS,
  ADDITIONAL_PLUGINS,
  CONFIG_REQUIRED_PLUGINS,
  DEFAULT_PLUGINS,
  ALL_PLUGINS,
  NIST_AI_RMF_MAPPING,
  OWASP_LLM_TOP_10_MAPPING,
  OWASP_API_TOP_10_MAPPING,
  MITRE_ATLAS_MAPPING,
  displayNameOverrides,
  categoryAliases,
  subCategoryDescriptions,
} from '@app/pages/redteam/report/components/constants';
import AddIcon from '@mui/icons-material/Add';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import RemoveIcon from '@mui/icons-material/Remove';
import SearchIcon from '@mui/icons-material/Search';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Checkbox from '@mui/material/Checkbox';
import Collapse from '@mui/material/Collapse';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';
import type { LocalPluginConfig } from '../types';
import PresetCard from './PresetCard';

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

const PLUGINS_REQUIRING_CONFIG = ['policy', 'prompt-extraction', 'indirect-prompt-injection'];

export default function Plugins({ onNext, onBack }: PluginsProps) {
  const { config, updateConfig } = useRedTeamConfig();
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [selectedPlugins, setSelectedPlugins] = useState<Set<Plugin>>(() => {
    return new Set(config.plugins.map((plugin) => plugin as Plugin));
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [pluginConfig, setPluginConfig] = useState<LocalPluginConfig>({});

  useEffect(() => {
    updateConfig('plugins', Array.from(selectedPlugins));
  }, [selectedPlugins, updateConfig]);

  const handlePluginToggle = useCallback((plugin: Plugin) => {
    setSelectedPlugins((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(plugin)) {
        newSet.delete(plugin);
        setPluginConfig((prevConfig) => {
          const newConfig = { ...prevConfig };
          delete newConfig[plugin as keyof LocalPluginConfig];
          return newConfig;
        });
      } else {
        newSet.add(plugin);
        setPluginConfig((prevConfig) => ({
          ...prevConfig,
          [plugin]: {},
        }));
      }
      return newSet;
    });
  }, []);

  const handlePresetSelect = (preset: {
    name: string;
    plugins: Set<Plugin> | ReadonlySet<Plugin>;
  }) => {
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
    { name: 'Custom', plugins: new Set() },
  ];

  const updatePluginConfig = useCallback(
    (plugin: string, newConfig: Partial<LocalPluginConfig[string]>) => {
      setPluginConfig((prevConfig) => {
        const updatedConfig = {
          ...prevConfig,
          [plugin]: {
            ...prevConfig[plugin],
            ...newConfig,
          },
        };
        updateConfig(
          'plugins',
          Array.from(selectedPlugins).map((p) => {
            const config = updatedConfig[p];
            return config && Object.keys(config).length > 0 ? { id: p, config } : p;
          }),
        );
        return updatedConfig;
      });
    },
    [selectedPlugins, updateConfig],
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

  const handleArrayInputChange = useCallback(
    (plugin: string, key: string, index: number, value: string) => {
      setPluginConfig((prevConfig) => {
        const pluginConfig = prevConfig[plugin] || {};
        const newArray = [...((pluginConfig[key] as string[]) || [])];
        newArray[index] = value;
        return {
          ...prevConfig,
          [plugin]: {
            ...pluginConfig,
            [key]: newArray,
          },
        };
      });
    },
    [],
  );

  const addArrayItem = useCallback((plugin: string, key: string) => {
    setPluginConfig((prevConfig) => {
      const pluginConfig = prevConfig[plugin] || {};
      return {
        ...prevConfig,
        [plugin]: {
          ...pluginConfig,
          [key]: [...((pluginConfig[key] as string[]) || []), ''],
        },
      };
    });
  }, []);

  const removeArrayItem = useCallback((plugin: string, key: string, index: number) => {
    setPluginConfig((prevConfig) => {
      const pluginConfig = prevConfig[plugin] || {};
      const currentArray = pluginConfig[key] as string[] | undefined;
      return {
        ...prevConfig,
        [plugin]: {
          ...pluginConfig,
          [key]: currentArray?.filter((_, i) => i !== index) || [],
        },
      };
    });
  }, []);

  const renderPluginConfig = (plugin: Plugin) => {
    const config = pluginConfig[plugin] || {};

    switch (plugin) {
      case 'policy':
      case 'prompt-extraction':
        const key = plugin === 'policy' ? 'policy' : 'systemPrompt';
        return (
          <TextField
            fullWidth
            multiline
            rows={4}
            label={plugin === 'policy' ? 'Policy' : 'System Prompt'}
            variant="outlined"
            margin="normal"
            value={config[key] || ''}
            onChange={(e) => updatePluginConfig(plugin, { [key]: e.target.value })}
          />
        );
      case 'bfla':
      case 'bola':
      case 'ssrf':
        const arrayKey =
          plugin === 'bfla'
            ? 'targetIdentifiers'
            : plugin === 'bola'
              ? 'targetSystems'
              : 'targetUrls';
        return (
          <>
            {((config[arrayKey] as string[]) || ['']).map((item: string, index: number) => (
              <Box key={index} sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <TextField
                  fullWidth
                  label={`${arrayKey} ${index + 1}`}
                  variant="outlined"
                  value={item}
                  onChange={(e) => handleArrayInputChange(plugin, arrayKey, index, e.target.value)}
                  sx={{ mr: 1 }}
                />
                <IconButton onClick={() => removeArrayItem(plugin, arrayKey, index)} size="small">
                  <RemoveIcon />
                </IconButton>
              </Box>
            ))}
            <Button
              startIcon={<AddIcon />}
              onClick={() => addArrayItem(plugin, arrayKey)}
              variant="outlined"
              size="small"
              sx={{ mt: 1 }}
            >
              Add {arrayKey}
            </Button>
          </>
        );
      case 'indirect-prompt-injection':
        return (
          <TextField
            fullWidth
            label="Indirect Injection Variable"
            variant="outlined"
            margin="normal"
            value={config.indirectInjectionVar || ''}
            onChange={(e) => updatePluginConfig(plugin, { indirectInjectionVar: e.target.value })}
          />
        );
      default:
        return null;
    }
  };

  const renderPluginCategory = (category: string, plugins: readonly Plugin[]) => {
    const pluginsToShow = plugins.filter((plugin) => filteredPlugins.includes(plugin));
    if (pluginsToShow.length === 0) {
      return null;
    }
    return (
      <Accordion key={category} defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6" sx={{ fontWeight: 'medium' }}>
            {category}
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            {pluginsToShow.map((plugin) => (
              <Grid item xs={12} sm={6} md={4} key={plugin}>
                <Paper elevation={1} sx={{ p: 2, height: '100%' }}>
                  <FormControlLabel
                    sx={{ width: '100%' }}
                    control={
                      <Checkbox
                        checked={selectedPlugins.has(plugin)}
                        onChange={() => handlePluginToggle(plugin)}
                        color="primary"
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="subtitle1">
                          {displayNameOverrides[plugin as keyof typeof displayNameOverrides] ||
                            categoryAliases[plugin as keyof typeof categoryAliases] ||
                            plugin}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {subCategoryDescriptions[plugin as keyof typeof subCategoryDescriptions]}
                        </Typography>
                      </Box>
                    }
                  />
                  <Collapse in={selectedPlugins.has(plugin)}>{renderPluginConfig(plugin)}</Collapse>
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

        <Grid container spacing={2} sx={{ mb: 4 }}>
          {presets.map((preset) => {
            const isSelected =
              preset.name === 'Custom'
                ? isCustomMode
                : preset.name === currentlySelectedPreset?.name;
            return (
              <Grid item xs={6} sm={4} md={2} key={preset.name}>
                <PresetCard
                  name={preset.name}
                  isSelected={isSelected}
                  onClick={() => handlePresetSelect(preset)}
                />
              </Grid>
            );
          })}
        </Grid>

        {isCustomMode ? (
          <>
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
            <Box sx={{ mb: 3 }}>
              {renderPluginCategory('Collections', COLLECTIONS)}
              {renderPluginCategory('Harm Plugins', Object.keys(HARM_PLUGINS) as Plugin[])}
              {renderPluginCategory('PII Plugins', PII_PLUGINS)}
              {renderPluginCategory('Base Plugins', BASE_PLUGINS)}
              {renderPluginCategory('Additional Plugins', ADDITIONAL_PLUGINS)}
              {renderPluginCategory('Custom Plugins', CONFIG_REQUIRED_PLUGINS)}
            </Box>
          </>
        ) : (
          <Card variant="outlined" sx={{ mb: 3 }}>
            <CardContent>
              {currentlySelectedPreset && (
                <Typography variant="h6" gutterBottom>
                  Selected Preset: {currentlySelectedPreset.name}
                </Typography>
              )}
              <Typography variant="body2">
                Number of selected plugins: {selectedPlugins.size}
              </Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>
                To customize your plugin selection, choose the "Custom" preset.
              </Typography>
            </CardContent>
          </Card>
        )}

        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
          <Button variant="outlined" onClick={onBack} startIcon={<KeyboardArrowLeftIcon />}>
            Back
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              const updatedPlugins = Array.from(selectedPlugins).map((plugin) => {
                const config = pluginConfig[plugin];
                if (config && Object.keys(config).length > 0) {
                  return { id: plugin, config };
                }
                return plugin;
              });
              updateConfig('plugins', updatedPlugins);
              onNext();
            }}
            endIcon={<KeyboardArrowRightIcon />}
            disabled={!isConfigValid()}
          >
            Next
          </Button>
        </Box>
      </Box>
    </ErrorBoundary>
  );
}
