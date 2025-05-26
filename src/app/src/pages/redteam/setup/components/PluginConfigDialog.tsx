import { useState, useEffect } from 'react';
import AddIcon from '@mui/icons-material/Add';
import InfoIcon from '@mui/icons-material/Info';
import RemoveIcon from '@mui/icons-material/Remove';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
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
import type { LocalPluginConfig } from '../types';

// Dataset information for better UX
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
      const currentArray = Array.isArray(prev[key]) ? [...(prev[key] as string[])] : [''];
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
      [key]: [...(Array.isArray(prev[key]) ? (prev[key] as string[]) : []), ''],
    }));
  };

  const removeArrayItem = (key: string, index: number) => {
    setLocalConfig((prev) => {
      const currentArray = Array.isArray(prev[key]) ? [...(prev[key] as string[])] : [''];
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
        const isFullDataset = Boolean(localConfig.fullDataset);
        const numTests = localConfig.numTests || '';

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
                  {datasetInfo.size}
                </Typography>
              </Box>

              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {datasetInfo.description}
              </Typography>
            </Box>

            {/* Test Configuration */}
            <FormControl component="fieldset">
              <FormLabel component="legend" sx={{ mb: 1, fontWeight: 'medium' }}>
                Test Configuration
              </FormLabel>
              <RadioGroup
                value={isFullDataset ? 'full' : 'custom'}
                onChange={(e) => {
                  const isFull = e.target.value === 'full';
                  setLocalConfig({
                    ...localConfig,
                    fullDataset: isFull,
                    ...(isFull ? {} : { numTests: numTests || '25' }),
                  });
                }}
              >
                <FormControlLabel
                  value="custom"
                  control={<Radio />}
                  label="Custom number of test cases"
                />
                <FormControlLabel
                  value="full"
                  control={<Radio />}
                  label={`Run complete dataset (${datasetInfo.size})`}
                />
              </RadioGroup>
            </FormControl>

            {/* Custom Number Input */}
            {!isFullDataset && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <TextField
                  fullWidth
                  label="Number of test cases"
                  type="number"
                  variant="outlined"
                  value={numTests}
                  onChange={(e) => setLocalConfig({ ...localConfig, numTests: e.target.value })}
                  inputProps={{ min: 1, max: datasetInfo.exactCount }}
                  helperText={
                    numTests && Number.parseInt(numTests) > 0
                      ? `${numTests} test cases selected`
                      : 'Recommended: 25-100 for development'
                  }
                />

                {/* Quick Preset Buttons */}
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {(() => {
                    const maxSize = datasetInfo.exactCount;
                    const presets = [10, 25, 50, 100].filter((p) => p <= maxSize);
                    if (maxSize <= 500) {
                      presets.push(maxSize);
                    }

                    return presets.map((preset) => (
                      <Button
                        key={preset}
                        size="small"
                        variant={numTests === preset.toString() ? 'contained' : 'outlined'}
                        onClick={() =>
                          setLocalConfig({ ...localConfig, numTests: preset.toString() })
                        }
                        sx={{ minWidth: 'auto', px: 2 }}
                      >
                        {preset === maxSize ? `All` : preset}
                      </Button>
                    ));
                  })()}
                </Box>
              </Box>
            )}

            {/* Performance Warning for Full Dataset */}
            {isFullDataset && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                <Typography variant="body2">
                  Running the full dataset ({datasetInfo.exactCount} test cases) may take a long
                  time and consume significant API credits.
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

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{getDialogTitle()}</DialogTitle>
      <DialogContent>{renderConfigInputs()}</DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={!hasChanges}>
          {hasChanges ? 'Save Changes' : 'No Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
