import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Editor from 'react-simple-code-editor';
import JsonTextField from '@app/components/JsonTextField';
import InfoIcon from '@mui/icons-material/Info';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
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
  const [tabValue, setTabValue] = useState(0);
  const [yamlConfig, setYamlConfig] = useState('');
  const [yamlError, setYamlError] = useState<string | null>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const isAzureProvider = providerId.startsWith('azure:');
  const originalConfigRef = useRef(config);

  // Update original config ref when config prop changes
  useEffect(() => {
    originalConfigRef.current = config;
  }, [config]);

  // Helper function to check if a value has content
  const hasContent = (val: any): boolean => {
    return val !== undefined && val !== null && val !== '';
  };

  const isDeploymentIdValid = !isAzureProvider || hasContent(localConfig.deployment_id);

  // Convert config to YAML
  const configToYaml = useCallback((configObj: Record<string, any>) => {
    return yaml.dump(configObj, { skipInvalid: true });
  }, []);

  // Sync form state to YAML when in form editor mode
  useEffect(() => {
    if (tabValue === 0) {
      // When switching to form, update YAML with full config
      // This preserves any fields not shown in the form
      const fullConfig = { ...originalConfigRef.current };
      Object.keys(localConfig).forEach((key) => {
        fullConfig[key] = localConfig[key];
      });
      setYamlConfig(configToYaml(fullConfig));
    }
  }, [localConfig, tabValue, configToYaml]);

  // Handle save functionality
  const handleSave = useCallback(
    (silent = false) => {
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
        // Save from form editor - merge with original config to preserve non-form fields
        configToSave = { ...originalConfigRef.current };
        Object.keys(localConfig).forEach((key) => {
          if (localConfig[key] !== undefined) {
            configToSave[key] = localConfig[key];
          }
        });
      }

      onSave(providerId, configToSave);
      setHasUnsavedChanges(false);

      if (!silent) {
        onClose();
      }
    },
    [tabValue, yamlConfig, localConfig, providerId, onSave, onClose],
  );

  // Auto-save functionality
  useEffect(() => {
    if (hasUnsavedChanges) {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }

      autoSaveTimerRef.current = setTimeout(() => {
        handleSave(true); // Silent save
      }, 2000);
    }

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [hasUnsavedChanges, handleSave]);

  // Reset local config when the dialog opens or providerId changes
  useEffect(() => {
    // Only extract common fields and deployment_id for form view
    const formConfig: Record<string, any> = {};
    Object.keys(COMMON_FIELDS).forEach((key) => {
      if (config[key] !== undefined) {
        formConfig[key] = config[key];
      }
    });
    if (isAzureProvider && config.deployment_id !== undefined) {
      formConfig.deployment_id = config.deployment_id;
    }

    setLocalConfig(formConfig);
    setYamlConfig(configToYaml(config));
    setHasUnsavedChanges(false);
    originalConfigRef.current = config;
  }, [open, providerId, config, configToYaml, isAzureProvider]);

  const handleYamlChange = (code: string) => {
    setYamlConfig(code);
    setYamlError(null);
    setHasUnsavedChanges(true);

    // Try to parse and sync to form if valid
    try {
      const parsed = yaml.load(code) as Record<string, any>;

      // Update localConfig with common fields and deployment_id only
      const newLocalConfig: Record<string, any> = {};
      Object.keys(COMMON_FIELDS).forEach((key) => {
        if (parsed[key] !== undefined) {
          newLocalConfig[key] = parsed[key];
        }
      });
      if (isAzureProvider && parsed.deployment_id !== undefined) {
        newLocalConfig.deployment_id = parsed.deployment_id;
      }

      setLocalConfig(newLocalConfig);
    } catch {
      // Invalid YAML, don't sync
    }
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
    const keys = Object.keys(localConfig);
    if (isAzureProvider) {
      return ['deployment_id', ...keys.filter((key) => key !== 'deployment_id')];
    }
    return keys;
  }, [localConfig, isAzureProvider]);

  // Check if there are additional fields beyond common ones
  const hasAdditionalFields = useMemo(() => {
    return Object.keys(config).some(
      (key) => !COMMON_FIELDS[key as keyof typeof COMMON_FIELDS] && key !== 'deployment_id',
    );
  }, [config]);

  const handleClose = () => {
    if (hasUnsavedChanges) {
      handleSave(true);
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="md">
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

            {hasAdditionalFields && (
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
                Additional configuration detected. Use YAML tab to edit all fields.
              </Alert>
            )}

            {configKeys.map((key) => {
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

            <Box sx={{ mt: 3, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Need more configuration options? Use the{' '}
                <Button size="small" onClick={() => setTabValue(1)} sx={{ textTransform: 'none' }}>
                  YAML tab
                </Button>{' '}
                to add any field.
              </Typography>
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
