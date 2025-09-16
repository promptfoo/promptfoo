import { useEffect, useState, useMemo } from 'react';

import JsonTextField from '@app/components/JsonTextField';
import {
  getProviderSchema,
  validateProviderConfig,
  type FieldSchema,
} from '@app/schemas/providerSchemas';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Switch from '@mui/material/Switch';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

/**
 * Dialog for configuring provider settings with validation
 */
interface ProviderConfigDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** The ID of the provider being configured (e.g., 'openai:gpt-4') */
  providerId: string;
  /** Current configuration object */
  config?: Record<string, any>;
  /** Callback when dialog is closed */
  onClose: () => void;
  /** Callback when configuration is saved */
  onSave: (providerId: string, config: Record<string, any>) => void;
}

const ProviderConfigDialog = ({
  open,
  providerId,
  config = {},
  onClose,
  onSave,
}: ProviderConfigDialogProps) => {
  const [localConfig, setLocalConfig] = useState<Record<string, any>>({});
  const [tabValue, setTabValue] = useState(0);
  const [showSensitive, setShowSensitive] = useState<Record<string, boolean>>({});
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Get schema for current provider
  const schema = useMemo(() => getProviderSchema(providerId), [providerId]);
  const hasSchema = !!schema;

  // Validate configuration
  const validateConfig = (configToValidate: Record<string, any>) => {
    const { errors } = validateProviderConfig(providerId, configToValidate);
    setValidationErrors(errors);
    return errors.length === 0;
  };

  // Initialize config when dialog opens or provider changes
  useEffect(() => {
    if (!open) {
      return;
    }

    // If we have a schema, initialize with defaults
    if (schema) {
      const initialConfig: Record<string, any> = {};
      schema.fields.forEach((field) => {
        // Always include the field in config so it shows in the form
        const value = config[field.name] ?? field.defaultValue ?? '';
        initialConfig[field.name] = value;
      });
      setLocalConfig(initialConfig);
      // Validate initial config
      validateConfig(initialConfig);
    } else {
      // No schema, just use the provided config
      setLocalConfig(config);
      setValidationErrors([]);
    }

    setJsonError(null);
    setTabValue(hasSchema ? 0 : 1); // Default to JSON tab if no schema
  }, [open, providerId, config, schema, hasSchema]);

  // Handle field change
  const handleFieldChange = (fieldName: string, value: any) => {
    const newConfig = { ...localConfig, [fieldName]: value };
    setLocalConfig(newConfig);

    // Clear validation errors as user types
    if (validationErrors.length > 0) {
      validateConfig(newConfig);
    }
  };

  // Handle save
  const handleSave = () => {
    let configToSave = localConfig;

    if (tabValue === 1) {
      // In JSON mode, localConfig is already the parsed JSON
      configToSave = localConfig;
    }

    // Clean up empty values
    const cleanedConfig = Object.entries(configToSave).reduce(
      (acc, [key, value]) => {
        if (value !== '' && value !== undefined && value !== null) {
          acc[key] = value;
        }
        return acc;
      },
      {} as Record<string, any>,
    );

    // Validate before saving
    if (!validateConfig(cleanedConfig)) {
      return;
    }

    onSave(providerId, cleanedConfig);
    onClose();
  };

  // Toggle sensitive field visibility
  const toggleSensitiveVisibility = (fieldName: string) => {
    setShowSensitive((prev) => ({ ...prev, [fieldName]: !prev[fieldName] }));
  };

  // Render field based on schema
  const renderField = (field: FieldSchema) => {
    const rawValue = localConfig[field.name];
    // Ensure we have a controlled value
    const value = rawValue === undefined || rawValue === null ? '' : rawValue;
    const error = validationErrors.find((err) => err.includes(field.label));

    switch (field.type) {
      case 'boolean':
        return (
          <FormControlLabel
            control={
              <Switch
                checked={!!value}
                onChange={(e) => handleFieldChange(field.name, e.target.checked)}
              />
            }
            label={field.label}
          />
        );

      case 'number':
        return (
          <TextField
            fullWidth
            label={field.label}
            type="number"
            value={value}
            onChange={(e) =>
              handleFieldChange(field.name, e.target.value ? Number(e.target.value) : '')
            }
            error={!!error}
            helperText={error || field.description}
            required={field.required}
            InputProps={{
              inputProps: {
                min: field.validation?.min,
                max: field.validation?.max,
              },
            }}
          />
        );

      case 'object':
      case 'array':
        return (
          <JsonTextField
            label={field.label}
            defaultValue={JSON.stringify(value || (field.type === 'array' ? [] : {}))}
            onChange={(parsed, error) => {
              if (!error) {
                handleFieldChange(field.name, parsed);
              }
            }}
            fullWidth
            multiline
            minRows={3}
            error={!!error}
            helperText={error || field.description}
          />
        );

      default: // string
        return (
          <TextField
            fullWidth
            label={field.label}
            value={value}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            error={!!error}
            helperText={error || field.description}
            required={field.required}
            type={field.sensitive && !showSensitive[field.name] ? 'password' : 'text'}
            InputProps={
              field.sensitive
                ? {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => toggleSensitiveVisibility(field.name)}
                          edge="end"
                          size="small"
                        >
                          {showSensitive[field.name] ? <VisibilityOffIcon /> : <VisibilityIcon />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }
                : undefined
            }
          />
        );
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>
        <Box>
          <Typography variant="h6">Provider Configuration</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
            {providerId}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        {hasSchema && (
          <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)} sx={{ mb: 2 }}>
            <Tab label="Form" />
            <Tab label="JSON" />
          </Tabs>
        )}

        {!hasSchema && (
          <Alert severity="info" sx={{ mb: 2 }}>
            No configuration schema available for this provider. Use JSON editor to configure.
          </Alert>
        )}

        {validationErrors.length > 0 && (
          <Alert severity="error" sx={{ mb: 2 }}>
            <Typography variant="body2" fontWeight="bold">
              Please fix the following errors:
            </Typography>
            <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
              {validationErrors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </Alert>
        )}

        {tabValue === 0 && schema ? (
          <Box>
            {schema.fields.map((field) => (
              <Box key={field.name} mb={2}>
                {renderField(field)}
              </Box>
            ))}
          </Box>
        ) : (
          <Box>
            {jsonError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {jsonError}
              </Alert>
            )}
            <JsonTextField
              label="Configuration JSON"
              defaultValue={JSON.stringify(localConfig, null, 2)}
              onChange={(parsed, error) => {
                if (error) {
                  setJsonError(error);
                } else {
                  setJsonError(null);
                  setLocalConfig(parsed);
                  // Validate JSON in real-time
                  if (hasSchema) {
                    validateConfig(parsed);
                  }
                }
              }}
              fullWidth
              multiline
              minRows={15}
              maxRows={25}
              error={!!jsonError}
              helperText={hasSchema ? undefined : 'Enter your provider configuration as JSON'}
            />
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={validationErrors.length > 0 || !!jsonError}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ProviderConfigDialog;
