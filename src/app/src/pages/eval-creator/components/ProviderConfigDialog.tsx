import React, { useEffect, useState } from 'react';
import Editor from 'react-simple-code-editor';
import JsonTextField from '@app/components/JsonTextField';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
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
  const isAzureProvider = providerId.startsWith('azure:');

  // Helper function to check if a value has content
  const hasContent = (val: any): boolean => {
    return val !== undefined && val !== null && val !== '';
  };

  const isDeploymentIdValid = !isAzureProvider || hasContent(localConfig.deployment_id);

  // Reset local config when the dialog opens or providerId changes
  useEffect(() => {
    setLocalConfig(config);
    // Extract custom fields (fields not in COMMON_FIELDS)
    const customFieldsList: Array<{ key: string; value: any }> = [];
    Object.entries(config).forEach(([key, value]) => {
      if (!COMMON_FIELDS[key as keyof typeof COMMON_FIELDS] && key !== 'deployment_id') {
        customFieldsList.push({ key, value });
      }
    });
    setCustomFields(customFieldsList);
    setYamlConfig(yaml.dump(config));
  }, [open, providerId, config]);

  const handleSave = () => {
    if (tabValue === 1) {
      // Save from YAML editor
      try {
        const parsedConfig = yaml.load(yamlConfig) as Record<string, any>;
        onSave(providerId, parsedConfig);
      } catch (err) {
        setYamlError(`Invalid YAML: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
    } else {
      // Save from form editor
      // Merge config with custom fields
      const finalConfig = { ...localConfig };
      customFields.forEach(({ key, value }) => {
        if (key && value !== undefined) {
          finalConfig[key] = value;
        }
      });
      onSave(providerId, finalConfig);
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
    }
  };

  const handleRemoveCustomField = (index: number) => {
    const newCustomFields = [...customFields];
    newCustomFields.splice(index, 1);
    setCustomFields(newCustomFields);
  };

  const updateCustomField = (index: number, field: 'key' | 'value', newValue: any) => {
    const newCustomFields = [...customFields];
    newCustomFields[index] = { ...newCustomFields[index], [field]: newValue };
    setCustomFields(newCustomFields);
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

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
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
          <Tab label="Form Editor" />
          <Tab label="YAML Editor" />
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

            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
              Common Configuration
            </Typography>

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
                    (newValue) => setLocalConfig({ ...localConfig, [key]: newValue }),
                    isRequired,
                  )}
                </Box>
              );
            })}

            <Divider sx={{ my: 3 }} />

            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
              Custom Configuration
            </Typography>

            {customFields.map((field, index) => (
              <Box key={index} my={2} display="flex" gap={1} alignItems="flex-start">
                <TextField
                  label="Field Name"
                  value={field.key}
                  onChange={(e) => updateCustomField(index, 'key', e.target.value)}
                  sx={{ flex: 1 }}
                />
                <Box sx={{ flex: 2 }}>
                  {renderFieldInput(field.key, field.value, (newValue) =>
                    updateCustomField(index, 'value', newValue),
                  )}
                </Box>
                <IconButton onClick={() => handleRemoveCustomField(index)} sx={{ mt: 1 }}>
                  <DeleteIcon />
                </IconButton>
              </Box>
            ))}

            <Box display="flex" gap={1} mt={2}>
              <TextField
                label="New Field Name"
                value={newFieldKey}
                onChange={(e) => setNewFieldKey(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddCustomField()}
                sx={{ flex: 1 }}
              />
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={handleAddCustomField}
                disabled={!newFieldKey}
              >
                Add Field
              </Button>
            </Box>
          </>
        ) : (
          <Box>
            <Typography variant="body2" sx={{ mb: 2 }}>
              Edit the provider configuration in YAML format. This allows you to set any
              configuration field supported by the provider.
            </Typography>
            {yamlError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {yamlError}
              </Alert>
            )}
            <Editor
              value={yamlConfig}
              onValueChange={(code) => {
                setYamlConfig(code);
                setYamlError(null);
              }}
              highlight={(code) => highlight(code, languages.yaml)}
              padding={10}
              style={{
                fontFamily: '"Fira code", "Fira Mono", monospace',
                fontSize: 14,
                backgroundColor: isDarkMode ? '#1e1e1e' : '#f5f5f5',
                border: `1px solid ${isDarkMode ? '#444' : '#e0e0e0'}`,
                borderRadius: 4,
                minHeight: 300,
                color: isDarkMode ? '#d4d4d4' : '#333',
              }}
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} disabled={!isDeploymentIdValid}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ProviderConfigDialog;
