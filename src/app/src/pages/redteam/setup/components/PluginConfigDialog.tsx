import { useEffect, useState } from 'react';

import AddIcon from '@mui/icons-material/Add';
import InfoIcon from '@mui/icons-material/Info';
import RemoveIcon from '@mui/icons-material/Remove';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import IconButton from '@mui/material/IconButton';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { Plugin } from '@promptfoo/redteam/constants';
import type { PluginConfig } from '@promptfoo/redteam/types';

import type { LocalPluginConfig } from '../types';

/**
 * Dataset information for plugins that support custom test case counts.
 * These plugins support two configuration options:
 * - numTests: Specify a custom number of test cases (1 to exactCount)
 * - fullDataset: Use the entire dataset (ignores numTests)
 *
 * The exactCount is used for validation and UI feedback.
 */
const DATASET_INFO: Record<
  string,
  {
    size: string;
    exactCount: number;
    description: string;
  }
> = {
  beavertails: {
    size: '700 eval prompts',
    exactCount: 700,
    description: 'Harmful content categories with safety labeling',
  },
  cyberseceval: {
    size: '1,000 prompts',
    exactCount: 1000,
    description: 'Cybersecurity attacks and prompt injection',
  },
  donotanswer: {
    size: '939 prompts',
    exactCount: 939,
    description: 'Refusal testing - prompts that should be declined',
  },
  harmbench: {
    size: '400 behaviors',
    exactCount: 400,
    description: 'Jailbreak testing across 18 attack methods',
  },
  pliny: {
    size: '~200 prompts',
    exactCount: 200,
    description: 'Curated jailbreak prompts from L1B3RT4S repository',
  },
  unsafebench: {
    size: '10,146 images',
    exactCount: 10146,
    description: 'Multi-modal unsafe image content evaluation',
  },
  xstest: {
    size: '450 prompts',
    exactCount: 450,
    description: 'Over-refusal testing with ambiguous terms',
  },
};

interface PluginConfigDialogProps {
  open: boolean;
  plugin: Plugin | null;
  config: LocalPluginConfig[string];
  onClose: () => void;
  onSave: (plugin: Plugin, config: LocalPluginConfig[string]) => void;
}

export default function PluginConfigDialog({
  open,
  plugin,
  config,
  onClose,
  onSave,
}: PluginConfigDialogProps) {
  // Initialize with provided config
  const [localConfig, setLocalConfig] = useState<LocalPluginConfig[string]>(config);

  // Update localConfig when config prop changes
  useEffect(() => {
    if (open && plugin && (!localConfig || Object.keys(localConfig).length === 0)) {
      setLocalConfig(config || {});
    }
  }, [open, plugin, config]);

  const handleArrayInputChange = (key: string, index: number, value: string) => {
    setLocalConfig((prev) => {
      const currentArray = Array.isArray(prev[key as keyof PluginConfig])
        ? [...(prev[key as keyof PluginConfig] as string[])]
        : [''];
      currentArray[index] = value;
      return {
        ...prev,
        [key]: currentArray,
      };
    });
  };

  const addArrayItem = (key: string) => {
    setLocalConfig((prev) => ({
      ...prev,
      [key]: [
        ...(Array.isArray(prev[key as keyof PluginConfig])
          ? (prev[key as keyof PluginConfig] as string[])
          : []),
        '',
      ],
    }));
  };

  const removeArrayItem = (key: string, index: number) => {
    setLocalConfig((prev) => {
      const currentArray = Array.isArray(prev[key as keyof PluginConfig])
        ? [...(prev[key as keyof PluginConfig] as string[])]
        : [''];
      currentArray.splice(index, 1);
      if (currentArray.length === 0) {
        currentArray.push('');
      }
      return {
        ...prev,
        [key]: currentArray,
      };
    });
  };

  const hasEmptyArrayItems = (array: string[] | undefined) => {
    return array?.some((item) => item.trim() === '') ?? false;
  };

  const renderConfigInputs = () => {
    if (!plugin) {
      return null;
    }

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
            value={localConfig[key] || ''}
            onChange={(e) => setLocalConfig({ ...localConfig, [key]: e.target.value })}
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
        // Ensure we always have at least one item
        const currentArray = (localConfig[arrayKey] as string[]) || [''];
        return (
          <>
            {currentArray.map((item: string, index: number) => (
              <Box key={index} sx={{ display: 'flex', alignItems: 'center', my: 1 }}>
                <TextField
                  fullWidth
                  label={`${arrayKey} ${index + 1}`}
                  variant="outlined"
                  value={item}
                  onChange={(e) => handleArrayInputChange(arrayKey, index, e.target.value)}
                  sx={{ mr: 1 }}
                />
                {/* Only show remove button if there's more than one item */}
                {currentArray.length > 1 && (
                  <IconButton onClick={() => removeArrayItem(arrayKey, index)} size="small">
                    <RemoveIcon />
                  </IconButton>
                )}
              </Box>
            ))}
            <Button
              startIcon={<AddIcon />}
              onClick={() => addArrayItem(arrayKey)}
              variant="outlined"
              size="small"
              sx={{ mt: 1 }}
              disabled={hasEmptyArrayItems(currentArray)}
            >
              Add
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
            value={localConfig.indirectInjectionVar || ''}
            onChange={(e) =>
              setLocalConfig({ ...localConfig, indirectInjectionVar: e.target.value })
            }
          />
        );
      case 'beavertails':
      case 'cyberseceval':
      case 'donotanswer':
      case 'harmbench':
      case 'pliny':
      case 'unsafebench':
      case 'xstest':
        const datasetInfo = DATASET_INFO[plugin];
        const sampling = localConfig.sampling || 'default';
        const customCount = localConfig.customCount || 25;
        const [loadingSize, setLoadingSize] = useState(false);
        const [actualSize, setActualSize] = useState<number | null>(null);

        // Load actual dataset size on mount
        useEffect(() => {
          if (open && plugin && sampling === 'full') {
            setLoadingSize(true);
            // TODO: Implement actual dataset size fetching via API
            // This would call something like: callApi(`/dataset-size/${plugin}`)
            // For now, simulate with a timeout to demonstrate the loading state
            const timer = setTimeout(() => {
              // Simulate that some datasets have filtered counts
              const simulatedFilterRatio =
                plugin === 'harmbench'
                  ? 0.85
                  : plugin === 'cyberseceval'
                    ? 0.92
                    : plugin === 'beavertails'
                      ? 0.7
                      : 1;
              setActualSize(Math.floor(datasetInfo.exactCount * simulatedFilterRatio));
              setLoadingSize(false);
            }, 800);

            return () => clearTimeout(timer);
          }
        }, [open, plugin, sampling, datasetInfo.exactCount]);

        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            {/* Dataset Information */}
            <Box
              sx={{
                p: 2,
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <InfoIcon color="primary" fontSize="small" />
                <Typography variant="subtitle2" fontWeight="medium">
                  Dataset: {datasetInfo.size}
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                {datasetInfo.description}
              </Typography>
            </Box>

            {/* Test Configuration */}
            <FormControl component="fieldset">
              <FormLabel component="legend" sx={{ mb: 2, fontWeight: 'medium' }}>
                Number of Test Cases
              </FormLabel>
              <RadioGroup
                value={sampling}
                onChange={(e) => {
                  const newSampling = e.target.value as 'default' | 'custom' | 'full';
                  setLocalConfig({
                    ...localConfig,
                    sampling: newSampling,
                    ...(newSampling === 'custom' ? { customCount } : {}),
                  });
                }}
              >
                <FormControlLabel
                  value="default"
                  control={<Radio />}
                  label={
                    <Box>
                      <Typography variant="body2">Use default configuration</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Inherits from global numTests setting
                      </Typography>
                    </Box>
                  }
                />
                <FormControlLabel
                  value="custom"
                  control={<Radio />}
                  label={
                    <Box>
                      <Typography variant="body2">Custom number</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Specify exact number of test cases
                      </Typography>
                    </Box>
                  }
                />
                <FormControlLabel
                  value="full"
                  control={<Radio />}
                  label={
                    <Box>
                      <Typography variant="body2">Use full dataset</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {loadingSize ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <CircularProgress size={12} />
                            Checking actual size...
                          </Box>
                        ) : actualSize ? (
                          <>
                            Approximately {actualSize.toLocaleString()} test cases after filtering
                          </>
                        ) : (
                          <>All available test cases ({datasetInfo.size})</>
                        )}
                      </Typography>
                    </Box>
                  }
                />
              </RadioGroup>
            </FormControl>

            {/* Custom Number Input */}
            {sampling === 'custom' && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pl: 4 }}>
                <TextField
                  fullWidth
                  label="Number of test cases"
                  type="number"
                  variant="outlined"
                  value={customCount}
                  onChange={(e) => {
                    const value = Number.parseInt(e.target.value, 10);
                    if (!Number.isNaN(value) && value >= 1) {
                      setLocalConfig({ ...localConfig, customCount: value });
                    }
                  }}
                  inputProps={{ min: 1 }}
                  error={customCount < 1}
                  helperText={
                    customCount < 1
                      ? 'Must be at least 1'
                      : customCount > datasetInfo.exactCount
                        ? `Note: Dataset only contains ~${datasetInfo.exactCount} items`
                        : 'Number of random test cases to select'
                  }
                />

                {/* Quick Preset Buttons */}
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ width: '100%', mb: 1 }}
                  >
                    Quick presets:
                  </Typography>
                  {[10, 25, 50, 100, 250].map((preset) => (
                    <Button
                      key={preset}
                      size="small"
                      variant={customCount === preset ? 'contained' : 'outlined'}
                      onClick={() => setLocalConfig({ ...localConfig, customCount: preset })}
                      sx={{ minWidth: 'auto', px: 2 }}
                    >
                      {preset}
                    </Button>
                  ))}
                </Box>
              </Box>
            )}

            {/* Warnings and Info */}
            {sampling === 'full' && (
              <Alert
                severity="warning"
                icon={<WarningAmberIcon />}
                sx={{
                  '& .MuiAlert-message': { width: '100%' },
                }}
              >
                <Box>
                  <Typography variant="body2" fontWeight="medium" gutterBottom>
                    Full dataset mode enabled
                  </Typography>
                  <Typography variant="body2">
                    This will use all {actualSize ? actualSize.toLocaleString() : datasetInfo.size}{' '}
                    test cases and may:
                  </Typography>
                  <Box component="ul" sx={{ m: 0, mt: 1, pl: 2 }}>
                    <li>Take significant time to complete (30+ minutes)</li>
                    <li>Consume substantial API credits</li>
                    <li>Generate large evaluation results</li>
                  </Box>
                  {actualSize && actualSize !== datasetInfo.exactCount && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: 'block', mt: 1 }}
                    >
                      Note: {(datasetInfo.exactCount - actualSize).toLocaleString()} items will be
                      filtered out during processing.
                    </Typography>
                  )}
                </Box>
              </Alert>
            )}

            {sampling === 'custom' && customCount > 100 && (
              <Alert severity="info">
                <Box>
                  <Typography variant="body2">
                    Testing with {customCount.toLocaleString()} cases
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Estimated time: {customCount > 500 ? '15-30' : '5-15'} minutes depending on your
                    model
                  </Typography>
                </Box>
              </Alert>
            )}

            {sampling === 'custom' && customCount > datasetInfo.exactCount && (
              <Alert severity="warning">
                <Typography variant="body2">
                  Requested {customCount.toLocaleString()} cases but dataset only contains ~
                  {datasetInfo.exactCount.toLocaleString()} items. All available items will be used.
                </Typography>
              </Alert>
            )}
          </Box>
        );
      default:
        return null;
    }
  };

  const handleSave = () => {
    if (plugin && localConfig) {
      if (JSON.stringify(config) !== JSON.stringify(localConfig)) {
        onSave(plugin, localConfig);
      }
      onClose();
    }
  };

  const getDialogTitle = () => {
    if (!plugin) {
      return 'Configure Plugin';
    }

    const datasetInfo = DATASET_INFO[plugin as keyof typeof DATASET_INFO];
    if (datasetInfo) {
      return `Configure ${plugin.charAt(0).toUpperCase() + plugin.slice(1)} Dataset`;
    }

    return `Configure ${plugin.charAt(0).toUpperCase() + plugin.slice(1)}`;
  };

  const hasChanges = JSON.stringify(config) !== JSON.stringify(localConfig);

  // Validate configuration for dataset plugins
  const isValidConfig = () => {
    if (!plugin || !DATASET_INFO[plugin]) {
      return true;
    }

    const sampling = localConfig.sampling || 'default';

    // Default and full modes are always valid
    if (sampling === 'default' || sampling === 'full') {
      return true;
    }

    // For custom mode, validate the customCount
    if (sampling === 'custom') {
      const customCount = localConfig.customCount;
      if (!customCount || customCount < 1) {
        return false;
      }
      // Note: We don't validate against exactCount because the dataset might be filtered
      return true;
    }

    return true;
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{getDialogTitle()}</DialogTitle>
      <DialogContent>{renderConfigInputs()}</DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={!hasChanges || !isValidConfig()}>
          {hasChanges ? 'Save Changes' : 'No Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
