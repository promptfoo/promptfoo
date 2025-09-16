import { useEffect, useState, useMemo, useRef } from 'react';

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
import CircularProgress from '@mui/material/CircularProgress';
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
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const [jsonText, setJsonText] = useState<string>('');
  const [jsonFieldText, setJsonFieldText] = useState<Record<string, string>>({});

  // Get schema for current provider
  const schema = useMemo(() => {
    try {
      return getProviderSchema(providerId);
    } catch (error) {
      setSchemaError(error instanceof Error ? error.message : 'Failed to load provider schema');
      return null;
    }
  }, [providerId]);
  const hasSchema = !!schema;

  // Validate configuration with enhanced feedback
  const validateConfig = (configToValidate: Record<string, any>) => {
    try {
      const result: any = validateProviderConfig(providerId, configToValidate) as any;
      const errors: string[] = result?.errors ?? [];
      const warnings: string[] = result?.warnings ?? [];

      setValidationErrors(errors);
      setValidationWarnings(warnings);
      return errors.length === 0;
    } catch (validationError) {
      console.error('Validation error:', validationError);
      setValidationErrors(['Configuration validation failed. Please check your settings.']);
      setValidationWarnings([]);
      return false;
    }
  };

  // Initialize config when dialog opens or provider changes
  useEffect(() => {
    if (!open) {
      return;
    }

    // If we have a schema, initialize with defaults
    if (schema) {
      const initialConfig: Record<string, any> = {};
      const initialJsonFieldText: Record<string, string> = {};

      schema.fields.forEach((field) => {
        // Always include the field in config so it shows in the form
        const value = config[field.name] ?? field.defaultValue ?? '';
        initialConfig[field.name] = value;

        // Initialize JSON text for object/array fields
        if ((field.type === 'object' || field.type === 'array') && value) {
          initialJsonFieldText[field.name] = JSON.stringify(value, null, 2);
        }
      });

      setLocalConfig(initialConfig);
      setJsonFieldText(initialJsonFieldText);
      setJsonText(JSON.stringify(initialConfig, null, 2));
      // Validate initial config
      validateConfig(initialConfig);
    } else {
      // No schema, just use the provided config
      setLocalConfig(config);
      setJsonFieldText({}); // Clear JSON field text when no schema
      setValidationErrors([]);
      setJsonText(JSON.stringify(config || {}, null, 2));
    }

    setJsonError(null);
    setTabValue(hasSchema ? 0 : 1); // Default to JSON tab if no schema

    // Focus first field when dialog opens
    if (open && hasSchema) {
      setTimeout(() => {
        firstFieldRef.current?.focus();
      }, 100);
    }
  }, [open, providerId, config, schema, hasSchema]);

  // Update JSON text when switching to form tab to sync with form changes
  useEffect(() => {
    if (tabValue === 0) {
      setJsonText(JSON.stringify(localConfig || {}, null, 2));
    }
  }, [localConfig, tabValue]);

  // Handle field change with debounced validation
  const handleFieldChange = (fieldName: string, value: any) => {
    const newConfig = { ...localConfig, [fieldName]: value };
    setLocalConfig(newConfig);

    // Immediate validation for better UX
    validateConfig(newConfig);
  };

  // Handle save
  const handleSave = async () => {
    setIsLoading(true);
    try {
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
    } catch (error) {
      console.error('Error saving configuration:', error);
      setValidationErrors(['Failed to save configuration. Please try again.']);
    } finally {
      setIsLoading(false);
    }
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
            value={jsonFieldText[field.name] || JSON.stringify(value || (field.type === 'array' ? [] : {}))}
            includeRaw
            onChange={(parsed, error, raw) => {
              // Always update the raw text so users can see their keystrokes
              if (raw !== undefined) {
                setJsonFieldText(prev => ({ ...prev, [field.name]: raw }));
              }
              // Only update the config when JSON is valid
              if (!error && parsed !== null) {
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
            inputRef={field.name === schema?.fields[0]?.name ? firstFieldRef : undefined}
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
                          aria-label={showSensitive[field.name] ? 'Hide password' : 'Show password'}
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
        {schemaError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Failed to load provider schema: {schemaError}
          </Alert>
        )}

        {hasSchema && (
          <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)} sx={{ mb: 2 }}>
            <Tab label="Form" />
            <Tab label="JSON" />
          </Tabs>
        )}

        {!hasSchema && !schemaError && (
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

        {validationWarnings.length > 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="body2" fontWeight="bold">
              Configuration warnings:
            </Typography>
            <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
              {validationWarnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </Alert>
        )}

        {validationErrors.length === 0 && validationWarnings.length === 0 && localConfig && Object.keys(localConfig).length > 0 && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Configuration looks good! Ready to save.
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
              value={jsonText}
              includeRaw
              onChange={(parsed, error, raw) => {
                if (raw !== undefined) {
                  setJsonText(raw);
                }
                if (error) {
                  setJsonError(`Invalid JSON: ${error}`);
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
        <Button onClick={onClose} disabled={isLoading}>Cancel</Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={validationErrors.length > 0 || !!jsonError || isLoading || !!schemaError}
          startIcon={isLoading ? <CircularProgress size={16} /> : undefined}
          data-testid="save-button"
        >
          {isLoading ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ProviderConfigDialog;
