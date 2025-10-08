import { useCallback, useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
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
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  categoryAliases,
  displayNameOverrides,
  type Plugin,
  subCategoryDescriptions,
} from '@promptfoo/redteam/constants';
import { ErrorBoundary } from 'react-error-boundary';
import PluginConfigDialog from './PluginConfigDialog';
import PresetCard from './PresetCard';
import {
  getPluginDocumentationUrl,
  hasSpecificPluginDocumentation,
} from './pluginDocumentationMap';

import type { LocalPluginConfig } from '../types';

const ErrorFallback = ({ error }: { error: Error }) => (
  <div role="alert">
    <p>Something went wrong:</p>
    <pre>{error.message}</pre>
  </div>
);

export interface PluginsTabProps {
  selectedPlugins: Set<Plugin>;
  setSelectedPlugins: React.Dispatch<React.SetStateAction<Set<Plugin>>>;
  handlePluginToggle: (plugin: Plugin) => void;
  pluginConfig: LocalPluginConfig;
  setPluginConfig: React.Dispatch<React.SetStateAction<LocalPluginConfig>>;
  selectedConfigPlugin: Plugin | null;
  setSelectedConfigPlugin: React.Dispatch<React.SetStateAction<Plugin | null>>;
  configDialogOpen: boolean;
  setConfigDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isPluginConfigured: (plugin: Plugin) => boolean;
  updatePluginConfig: (plugin: string, newConfig: Partial<LocalPluginConfig[string]>) => void;
  handlePresetSelect: (preset: {
    name: string;
    plugins: Set<Plugin> | ReadonlySet<Plugin>;
  }) => void;
  isCustomMode: boolean;
  currentlySelectedPreset: { name: string; plugins: Set<Plugin> | ReadonlySet<Plugin> } | undefined;
  presets: Array<{ name: string; plugins: Set<Plugin> | ReadonlySet<Plugin> }>;
  filteredPlugins: Array<{ plugin: Plugin; category: string }>;
  searchTerm: string;
  setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  selectedCategory: string | undefined;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string | undefined>>;
  allCategoryFilters: Array<{ key: string; label: string }>;
  handleCategoryToggle: (category: string) => void;
  handleGenerateTestCase: (plugin: Plugin) => void;
  generatingTestCase: boolean;
  generatingPlugin: Plugin | null;
  testCaseDialogOpen: boolean;
  setTestCaseDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  testCaseDialogMode: 'config' | 'result';
  tempTestCaseConfig: any;
  setTempTestCaseConfig: React.Dispatch<React.SetStateAction<any>>;
  generatedTestCase: { prompt: string; context: string; metadata?: any } | null;
  generateTestCaseWithConfig: (plugin: Plugin, config: any) => Promise<void>;
  isTestCaseConfigValid: (plugin: Plugin, config: any) => boolean;
  setHasUserInteracted: React.Dispatch<React.SetStateAction<boolean>>;
  PLUGINS_REQUIRING_CONFIG: string[];
  PLUGINS_SUPPORTING_CONFIG: string[];
  PLUGIN_PRESET_DESCRIPTIONS: Record<string, string>;
}

export default function PluginsTab({
  selectedPlugins,
  setSelectedPlugins,
  handlePluginToggle,
  pluginConfig,
  setPluginConfig,
  selectedConfigPlugin,
  setSelectedConfigPlugin,
  configDialogOpen,
  setConfigDialogOpen,
  isPluginConfigured,
  updatePluginConfig,
  handlePresetSelect,
  isCustomMode,
  currentlySelectedPreset,
  presets,
  filteredPlugins,
  searchTerm,
  setSearchTerm,
  selectedCategory,
  setSelectedCategory,
  allCategoryFilters,
  handleCategoryToggle,
  handleGenerateTestCase,
  generatingTestCase,
  generatingPlugin,
  testCaseDialogOpen,
  setTestCaseDialogOpen,
  testCaseDialogMode,
  tempTestCaseConfig,
  setTempTestCaseConfig,
  generatedTestCase,
  generateTestCaseWithConfig,
  isTestCaseConfigValid,
  setHasUserInteracted,
  PLUGINS_REQUIRING_CONFIG,
  PLUGINS_SUPPORTING_CONFIG,
  PLUGIN_PRESET_DESCRIPTIONS,
}: PluginsTabProps) {
  const theme = useTheme();

  const handleConfigClick = (plugin: Plugin) => {
    setSelectedConfigPlugin(plugin);
    setConfigDialogOpen(true);
  };

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
  );
}
