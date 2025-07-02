import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Editor from 'react-simple-code-editor';
import JsonTextField from '@app/components/JsonTextField';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import InfoIcon from '@mui/icons-material/Info';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Switch from '@mui/material/Switch';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import yaml from 'js-yaml';
// @ts-expect-error: No types available
import { highlight, languages } from 'prismjs/components/prism-core';
import 'prismjs/components/prism-yaml';
import './ProviderConfigDialog.css';

interface ProviderConfigDialogProps {
  open: boolean;
  providerId: string;
  config?: Record<string, any>;
  onClose: () => void;
  onSave: (providerId: string, config: Record<string, any>) => void;
}

// Common fields that should always be visible
const COMMON_FIELDS = {
  apiKey: { type: 'string', label: 'API Key', description: 'Authentication key for the provider' },
  apiBaseUrl: { type: 'string', label: 'API Base URL', description: 'Base URL for API requests' },
  apiHost: { type: 'string', label: 'API Host', description: 'Hostname for the API' },
  temperature: { type: 'number', label: 'Temperature', description: 'Controls randomness (0-2)' },
  max_tokens: { type: 'number', label: 'Max Tokens', description: 'Maximum tokens in response' },
  timeout: {
    type: 'number',
    label: 'Timeout (ms)',
    description: 'Request timeout in milliseconds',
  },
  headers: { type: 'object', label: 'Headers', description: 'Custom HTTP headers' },
};

const ProviderConfigDialog: React.FC<ProviderConfigDialogProps> = ({
  open,
  providerId,
  config = {},
  onClose,
  onSave,
}) => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const [localConfig, setLocalConfig] = useState<Record<string, any>>(config);
  const [customFields, setCustomFields] = useState<Array<{ key: string; value: any }>>([]);
  const [newFieldKey, setNewFieldKey] = useState('');
  const [tabValue, setTabValue] = useState(0);
  const [yamlConfig, setYamlConfig] = useState('');
  const [yamlError, setYamlError] = useState<string | null>(null);
  const [autoSaveTimer, setAutoSaveTimer] = useState<NodeJS.Timeout | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const isAzureProvider = providerId.startsWith('azure:');

  // Helper function to check if a value has content
  const hasContent = (val: any): boolean => {
    return val !== undefined && val !== null && val !== '';
  };

  const isDeploymentIdValid = !isAzureProvider || hasContent(localConfig.deployment_id);

  // Convert config to YAML
  const configToYaml = useCallback((configObj: Record<string, any>) => {
    return yaml.dump(configObj, { skipInvalid: true });
  }, []);

  // Merge all configuration into a single object
  const getMergedConfig = useCallback(() => {
    const merged = { ...localConfig };
    customFields.forEach(({ key, value }) => {
      if (key && value !== undefined && value !== '') {
        merged[key] = value;
      }
    });
    return merged;
  }, [localConfig, customFields]);

  // Sync form state to YAML when in form editor mode
  useEffect(() => {
    if (tabValue === 0) {
      const mergedConfig = getMergedConfig();
      setYamlConfig(configToYaml(mergedConfig));
    }
  }, [localConfig, customFields, tabValue, configToYaml, getMergedConfig]);

  // Auto-save functionality
  const debouncedAutoSave = useCallback(() => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
    }
    
    const timer = setTimeout(() => {
      if (hasUnsavedChanges) {
        handleSave(true); // Silent save
      }
    }, 2000); // 2 second debounce
    
    setAutoSaveTimer(timer);
  }, [hasUnsavedChanges, autoSaveTimer]);

  // Trigger auto-save on changes
  useEffect(() => {
    if (hasUnsavedChanges) {
      debouncedAutoSave();
    }
    
    return () => {
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
      }
    };
  }, [hasUnsavedChanges, debouncedAutoSave]);

  // Reset local config when the dialog opens or providerId changes
  useEffect(() => {
    setLocalConfig(config);
    // Extract custom fields (fields not in COMMON_FIELDS)
    const customFieldsList: Array<{ key: string; value: any }> = [];
    Object.entries(config).forEach(([key, value]) => {
      if (!COMMON_FIELDS[key as keyof typeof COMMON_FIELDS] && key !== 'deployment_id') {
        // Only add simple values to custom fields, not nested objects
        if (typeof value !== 'object' || value === null) {
          customFieldsList.push({ key, value });
        }
      }
    });
    setCustomFields(customFieldsList);
    setYamlConfig(configToYaml(config));
    setHasUnsavedChanges(false);
  }, [open, providerId, config, configToYaml]);

  const handleSave = (silent = false) => {
    let configToSave: Record<string, any>;
    
    if (tabValue === 1) {
      // Save from YAML editor
      try {
        configToSave = yaml.load(yamlConfig) as Record<string, any>;
      } catch (err) {
        if (!silent) {
          setYamlError(`Invalid YAML: ${err instanceof Error ? err.message : String(err)}`);
        }
        return;
      }
    } else {
      // Save from form editor
      configToSave = getMergedConfig();
    }
    
    onSave(providerId, configToSave);
    setHasUnsavedChanges(false);
    
    if (!silent) {
      onClose();
    }
  };

  const handleYamlChange = (code: string) => {
    setYamlConfig(code);
    setYamlError(null);
    setHasUnsavedChanges(true);
    
    // Try to parse and sync to form if valid
    try {
      const parsed = yaml.load(code) as Record<string, any>;
      
      // Update localConfig with common fields and deployment_id
      const newLocalConfig: Record<string, any> = {};
      Object.keys(COMMON_FIELDS).forEach(key => {
        if (parsed[key] !== undefined) {
          newLocalConfig[key] = parsed[key];
        }
      });
      if (isAzureProvider && parsed.deployment_id !== undefined) {
        newLocalConfig.deployment_id = parsed.deployment_id;
      }
      
      // Update custom fields with remaining simple fields
      const newCustomFields: Array<{ key: string; value: any }> = [];
      Object.entries(parsed).forEach(([key, value]) => {
        if (!COMMON_FIELDS[key as keyof typeof COMMON_FIELDS] && 
            key !== 'deployment_id' && 
            (typeof value !== 'object' || value === null)) {
          newCustomFields.push({ key, value });
        }
      });
      
      setLocalConfig(newLocalConfig);
      setCustomFields(newCustomFields);
    } catch {
      // Invalid YAML, don't sync
    }
  };

  const handleAddCustomField = () => {
    if (
      newFieldKey &&
      !localConfig[newFieldKey] &&
      !customFields.find((f) => f.key === newFieldKey)
    ) {
      setCustomFields([...customFields, { key: newFieldKey, value: '' }]);
      setNewFieldKey('');
      setHasUnsavedChanges(true);
    }
  };

  const handleRemoveCustomField = (index: number) => {
    const newCustomFields = [...customFields];
    newCustomFields.splice(index, 1);
    setCustomFields(newCustomFields);
    setHasUnsavedChanges(true);
  };

  const updateCustomField = (index: number, field: 'key' | 'value', newValue: any) => {
    const newCustomFields = [...customFields];
    newCustomFields[index] = { ...newCustomFields[index], [field]: newValue };
    setCustomFields(newCustomFields);
    setHasUnsavedChanges(true);
  };

  const updateLocalConfigField = (key: string, value: any) => {
    setLocalConfig({ ...localConfig, [key]: value });
    setHasUnsavedChanges(true);
  };

  const renderFieldInput = (
    key: string,
    value: any,
    onChange: (value: any) => void,
    isRequired = false,
  ) => {
    if (
      typeof value === 'number' ||
      (COMMON_FIELDS[key as keyof typeof COMMON_FIELDS]?.type === 'number' && value === undefined)
    ) {
      return (
        <TextField
          label={COMMON_FIELDS[key as keyof typeof COMMON_FIELDS]?.label || key}
          value={value === undefined ? '' : value}
          onChange={(e) =>
            onChange(e.target.value === '' ? undefined : Number.parseFloat(e.target.value))
          }
          fullWidth
          required={isRequired}
          type="number"
          InputLabelProps={{ shrink: true }}
          helperText={COMMON_FIELDS[key as keyof typeof COMMON_FIELDS]?.description}
        />
      );
    } else if (typeof value === 'boolean') {
      return (
        <FormControlLabel
          control={<Switch checked={value || false} onChange={(e) => onChange(e.target.checked)} />}
          label={COMMON_FIELDS[key as keyof typeof COMMON_FIELDS]?.label || key}
        />
      );
    } else if (
      typeof value === 'object' ||
      COMMON_FIELDS[key as keyof typeof COMMON_FIELDS]?.type === 'object'
    ) {
      return (
        <JsonTextField
          label={COMMON_FIELDS[key as keyof typeof COMMON_FIELDS]?.label || key}
          defaultValue={JSON.stringify(value || {})}
          onChange={(parsed) => onChange(parsed)}
          fullWidth
          multiline
          minRows={2}
          InputLabelProps={{ shrink: true }}
          helperText={COMMON_FIELDS[key as keyof typeof COMMON_FIELDS]?.description}
        />
      );
    } else {
      return (
        <TextField
          label={COMMON_FIELDS[key as keyof typeof COMMON_FIELDS]?.label || key}
          value={value === undefined ? '' : value}
          onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
          fullWidth
          required={isRequired}
          InputLabelProps={{ shrink: true }}
          helperText={COMMON_FIELDS[key as keyof typeof COMMON_FIELDS]?.description}
        />
      );
    }
  };

  // Create an ordered list of keys with deployment_id first for Azure providers
  const configKeys = React.useMemo(() => {
    const existingKeys = Object.keys(localConfig);
    const commonKeys = Object.keys(COMMON_FIELDS);
    const allKeys = new Set([...existingKeys, ...commonKeys]);

    if (isAzureProvider) {
      return ['deployment_id', ...Array.from(allKeys).filter((key) => key !== 'deployment_id')];
    }
    return Array.from(allKeys);
  }, [localConfig, isAzureProvider]);

  // Check if there are complex fields that can't be edited in form mode
  const hasComplexFields = useMemo(() => {
    const mergedConfig = getMergedConfig();
    return Object.entries(mergedConfig).some(([key, value]) => {
      return !COMMON_FIELDS[key as keyof typeof COMMON_FIELDS] && 
             key !== 'deployment_id' &&
             typeof value === 'object' && 
             value !== null &&
             !customFields.find(f => f.key === key);
    });
  }, [getMergedConfig, customFields]);

  return (
    <Dialog open={open} onClose={() => handleSave(true)} fullWidth maxWidth="md">
      <DialogTitle>
        Provider Configuration
        <Typography
          variant="subtitle1"
          color="text.secondary"
          sx={{ mt: 1, fontSize: '0.9rem', fontFamily: 'monospace' }}
        >
          {providerId}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)} sx={{ mb: 2 }}>
          <Tab label="Form" />
          <Tab label="YAML" />
        </Tabs>

        {tabValue === 0 ? (
          <>
            {isAzureProvider && (
              <Box mb={2}>
                <Alert severity={isDeploymentIdValid ? 'info' : 'warning'}>
                  {isDeploymentIdValid
                    ? 'Azure OpenAI requires a deployment ID that matches your deployment name in the Azure portal.'
                    : 'You must specify a deployment ID for Azure OpenAI models. This is the name you gave your model deployment in the Azure portal.'}
                </Alert>
              </Box>
            )}

            {hasComplexFields && (
              <Alert 
                severity="info" 
                sx={{ mb: 2 }} 
                icon={<InfoIcon />}
                action={
                  <Button size="small" onClick={() => setTabValue(1)}>
                    Switch to YAML
                  </Button>
                }
              >
                Complex fields detected. Use YAML editor for full control.
              </Alert>
            )}

            {configKeys.map((key) => {
              if (customFields.find((f) => f.key === key)) {
                return null; // Skip if it's in custom fields
              }

              const value = localConfig[key];
              const isDeploymentId = isAzureProvider && key === 'deployment_id';
              const isRequired = isDeploymentId;

              return (
                <Box key={key} my={2}>
                  {renderFieldInput(
                    key,
                    value,
                    (newValue) => updateLocalConfigField(key, newValue),
                    isRequired,
                  )}
                </Box>
              );
            })}

            {(customFields.length > 0 || newFieldKey) && <Divider sx={{ my: 3 }} />}

            {customFields.map((field, index) => (
              <Box key={index} my={2} display="flex" gap={1} alignItems="flex-start">
                <TextField
                  label="Field"
                  value={field.key}
                  onChange={(e) => updateCustomField(index, 'key', e.target.value)}
                  sx={{ flex: 1 }}
                  size="small"
                />
                <Box sx={{ flex: 2 }}>
                  {renderFieldInput(field.key, field.value, (newValue) =>
                    updateCustomField(index, 'value', newValue),
                  )}
                </Box>
                <IconButton 
                  onClick={() => handleRemoveCustomField(index)} 
                  size="small"
                  sx={{ mt: 0.5 }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}

            <Box display="flex" gap={1} mt={2}>
              <TextField
                placeholder="Add custom field..."
                value={newFieldKey}
                onChange={(e) => setNewFieldKey(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomField();
                  }
                }}
                size="small"
                sx={{ flex: 1 }}
              />
              <IconButton
                onClick={handleAddCustomField}
                disabled={!newFieldKey}
                size="small"
                color="primary"
              >
                <AddIcon />
              </IconButton>
            </Box>
          </>
        ) : (
          <Box>
            {yamlError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {yamlError}
              </Alert>
            )}
            <Editor
              value={yamlConfig}
              onValueChange={handleYamlChange}
              highlight={(code) => highlight(code, languages.yaml)}
              padding={10}
              style={{
                fontFamily: '"Fira code", "Fira Mono", monospace',
                fontSize: 14,
                backgroundColor: isDarkMode ? '#1e1e1e' : '#f5f5f5',
                border: `1px solid ${isDarkMode ? '#444' : '#e0e0e0'}`,
                borderRadius: 4,
                minHeight: 400,
                color: isDarkMode ? '#d4d4d4' : '#333',
              }}
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={() => handleSave(false)} disabled={!isDeploymentIdValid}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ProviderConfigDialog;
