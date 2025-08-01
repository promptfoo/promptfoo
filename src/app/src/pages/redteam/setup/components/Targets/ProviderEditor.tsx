import React, { useEffect, useRef, useState } from 'react';

import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { getProviderType } from './helpers';
import ProviderConfigEditor from './ProviderConfigEditor';
import ProviderTypeSelector from './ProviderTypeSelector';

import type { ProviderOptions } from '../../types';
import type { ProviderConfigEditorRef } from './ProviderConfigEditor';

export function defaultHttpTarget(): ProviderOptions {
  return {
    id: 'http',
    config: {
      url: '',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: '{{prompt}}',
      }),
    },
  };
}

interface ProviderProps {
  onActionButtonClick?: () => void;
  onBack?: () => void;
  provider: ProviderOptions | undefined;
  setProvider: (provider: ProviderOptions) => void;
  extensions?: string[];
  onExtensionsChange?: (extensions: string[]) => void;
  opts?: {
    availableProviderIds?: string[];
    description?: React.ReactNode;
    disableNameField?: boolean;
    disableTitle?: boolean;
    actionButtonText?: string;
    defaultRequestTransform?: string;
    hideErrors?: boolean;
    disableModelSelection?: boolean;
  };
  setError?: (error: string | null) => void;
  validateAll?: boolean; // Flag to force validation of all fields
}

export default function ProviderEditor({
  onActionButtonClick,
  onBack,
  provider,
  setProvider,
  extensions,
  onExtensionsChange,
  opts = {},
  setError,
  validateAll = false,
}: ProviderProps) {
  const theme = useTheme();
  const {
    disableNameField = false,
    description,
    disableTitle = false,
    actionButtonText,
    availableProviderIds,
    defaultRequestTransform,
    disableModelSelection = false,
    hideErrors = false,
  } = opts;

  const configEditorRef = useRef<ProviderConfigEditorRef>(null);
  const [validationErrors, setValidationErrors] = useState<string | null>(null);
  const [shouldValidate, setShouldValidate] = useState<boolean>(false);
  const [providerType, setProviderType] = useState<string | undefined>(
    getProviderType(provider?.id) ?? availableProviderIds?.[0],
  );

  // Sync providerType with provider changes
  useEffect(() => {
    setProviderType(getProviderType(provider?.id) ?? availableProviderIds?.[0]);
  }, [provider?.id, availableProviderIds]);

  // Handle errors from child components
  const handleError = (error: string | null) => {
    setValidationErrors(error);
    setError?.(error);
  };

  // Handle provider changes and update provider type
  const handleProviderChange = (newProvider: ProviderOptions, newProviderType: string) => {
    setProvider(newProvider);
    setProviderType(newProviderType);
  };

  if (!provider) {
    return null;
  }

  return (
    <Stack direction="column" spacing={3}>
      {!disableTitle && (
        <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold', mb: 3 }}>
          Select Red Team Provider
        </Typography>
      )}

      <Typography variant="body1">
        {description ||
          'A target is the specific LLM or endpoint you want to evaluate in your red teaming process.'}{' '}
        For more information on available targets and how to configure them, please visit our{' '}
        <Link href="https://www.promptfoo.dev/docs/providers/" target="_blank" rel="noopener">
          documentation
        </Link>
        .
      </Typography>

      {!disableNameField && (
        <TextField
          fullWidth
          sx={{ mb: 2 }}
          label="Provider Name"
          value={provider?.label ?? ''}
          placeholder="e.g. 'customer-service-agent'"
          onChange={(e) => {
            if (provider) {
              setProvider({ ...provider, label: e.target.value });
            }
          }}
          margin="normal"
          required
          autoFocus
          InputLabelProps={{
            shrink: true,
          }}
        />
      )}

      {/* Provider Type Selection Section */}
      <ProviderTypeSelector
        provider={provider}
        setProvider={handleProviderChange}
        availableProviderIds={availableProviderIds}
        disableModelSelection={disableModelSelection}
        providerType={providerType}
      />

      {/* Provider Configuration Section */}
      <ProviderConfigEditor
        ref={configEditorRef}
        provider={provider}
        setProvider={setProvider}
        extensions={extensions}
        onExtensionsChange={onExtensionsChange}
        opts={{
          defaultRequestTransform,
          hideErrors,
          disableModelSelection,
        }}
        setError={handleError}
        validateAll={validateAll || shouldValidate}
        onValidate={(isValid) => {
          // Validation errors will be displayed through the handleError function
        }}
        providerType={providerType}
      />

      <Box
        sx={{
          display: 'flex',
          justifyContent: validationErrors ? 'space-between' : 'flex-end',
          mt: 4,
          width: '100%',
          position: 'relative',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            gap: 2,
            ...(validationErrors && {
              width: '100%',
              justifyContent: 'space-between',
            }),
          }}
        >
          {onBack && (
            <Button
              variant="outlined"
              startIcon={<KeyboardArrowLeftIcon />}
              onClick={onBack}
              sx={{ px: 4, py: 1 }}
            >
              Back
            </Button>
          )}
          {onActionButtonClick && (
            <Button
              variant="contained"
              onClick={() => {
                // Enable validation when button is clicked
                setShouldValidate(true);

                // Use the ref to validate
                const isValid = configEditorRef.current?.validate() ?? false;

                // Only proceed if there are no errors
                if (isValid && !validationErrors) {
                  onActionButtonClick();
                }
              }}
              endIcon={<KeyboardArrowRightIcon />}
              sx={{
                backgroundColor: theme.palette.primary.main,
                '&:hover': { backgroundColor: theme.palette.primary.dark },
                '&:disabled': { backgroundColor: theme.palette.action.disabledBackground },
                px: 4,
                py: 1,
              }}
            >
              {actionButtonText || 'Next'}
            </Button>
          )}
        </Box>
      </Box>
    </Stack>
  );
}
