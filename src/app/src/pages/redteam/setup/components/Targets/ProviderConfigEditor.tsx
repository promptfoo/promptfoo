import React, { forwardRef, useImperativeHandle, useEffect, useState } from 'react';

import Box from '@mui/material/Box';
import CustomTargetConfiguration from './CustomTargetConfiguration';
import HttpEndpointConfiguration from './HttpEndpointConfiguration';
import WebSocketEndpointConfiguration from './WebSocketEndpointConfiguration';
import BrowserAutomationConfiguration from './BrowserAutomationConfiguration';
import CommonConfigurationOptions from './CommonConfigurationOptions';
import type { ProviderOptions } from '../../types';

export interface ProviderConfigEditorRef {
  validate: () => boolean;
}

interface ProviderConfigEditorProps {
  provider: ProviderOptions;
  setProvider: (provider: ProviderOptions) => void;
  extensions?: string[];
  onExtensionsChange?: (extensions: string[]) => void;
  opts?: {
    defaultRequestTransform?: string;
    hideErrors?: boolean;
    disableModelSelection?: boolean;
  };
  setError?: (error: string | null) => void;
  validateAll?: boolean;
  onValidate?: (isValid: boolean) => void;
  providerType?: string;
}

const ProviderConfigEditor = forwardRef<ProviderConfigEditorRef, ProviderConfigEditorProps>(
  (
    {
      provider,
      setProvider,
      extensions,
      onExtensionsChange,
      opts = {},
      setError,
      validateAll = false,
      onValidate,
      providerType,
    },
    ref,
  ) => {
    const [bodyError, setBodyError] = useState<string | null>(null);
    const [urlError, setUrlError] = useState<string | null>(null);
    const [rawConfigJson, setRawConfigJson] = useState<string>(
      JSON.stringify(provider.config, null, 2),
    );
    const [extensionErrors, setExtensionErrors] = useState(false);

    const validateUrl = (url: string, type: 'http' | 'websocket' = 'http'): boolean => {
      try {
        const parsedUrl = new URL(url);
        if (type === 'http') {
          return ['http:', 'https:'].includes(parsedUrl.protocol);
        } else if (type === 'websocket') {
          return ['ws:', 'wss:'].includes(parsedUrl.protocol);
        }
        return false;
      } catch {
        return false;
      }
    };

    const updateCustomTarget = (field: string, value: any) => {
      const updatedTarget = { ...provider } as ProviderOptions;

      if (field === 'id') {
        updatedTarget.id = value;
      } else if (field === 'url') {
        updatedTarget.config.url = value;
        if (validateUrl(value)) {
          setUrlError(null);
        } else {
          setUrlError('Invalid URL format');
        }
      } else if (field === 'method') {
        updatedTarget.config.method = value;
      } else if (field === 'body') {
        updatedTarget.config.body = value;
        const bodyStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
        if (bodyStr.includes('{{prompt}}')) {
          setBodyError(null);
        } else if (!updatedTarget.config.request) {
          setBodyError('Request body must contain {{prompt}}');
        }
      } else if (field === 'request') {
        updatedTarget.config.request = value;
        if (value && !value.includes('{{prompt}}')) {
          setBodyError('Raw request must contain {{prompt}} template variable');
        } else {
          setBodyError(null);
        }
      } else if (field === 'transformResponse') {
        updatedTarget.config.transformResponse = value;
      } else if (field === 'label') {
        updatedTarget.label = value;
      } else if (field === 'delay') {
        updatedTarget.delay = value;
      } else if (field === 'config') {
        updatedTarget.config = value;
      } else {
        updatedTarget.config[field] = value;
      }

      setProvider(updatedTarget);
    };

    const updateWebSocketTarget = (field: string, value: any) => {
      const updatedTarget = { ...provider } as ProviderOptions;
      if (field === 'url') {
        updatedTarget.config.url = value;
        if (validateUrl(value, 'websocket')) {
          setUrlError(null);
        } else {
          setUrlError('Please enter a valid WebSocket URL (ws:// or wss://)');
        }
      } else if (field in updatedTarget.config) {
        (updatedTarget.config as any)[field] = value;
      }
      setProvider(updatedTarget);
    };

    const validate = (): boolean => {
      const errors: string[] = [];

      if (providerType === 'http') {
        if (!provider.config.request && (!provider.config.url || !validateUrl(provider.config.url))) {
          errors.push('Valid URL is required');
        }
        if (bodyError) {
          errors.push(bodyError);
        }
      } else if (providerType === 'websocket') {
        if (!provider.config.url || !validateUrl(provider.config.url, 'websocket')) {
          errors.push('Valid WebSocket URL is required');
        }
      }

      if (extensionErrors) {
        errors.push('Extension configuration has errors');
      }

      const hasErrors = errors.length > 0;
      if (setError) {
        setError(hasErrors ? errors.join(', ') : null);
      }
      if (onValidate) {
        onValidate(!hasErrors);
      }
      return !hasErrors;
    };

    useImperativeHandle(ref, () => ({
      validate,
    }));

    useEffect(() => {
      if (validateAll) {
        validate();
      }
    }, [validateAll, provider, bodyError, urlError, extensionErrors]);

    return (
      <Box>
        {providerType === 'custom' && (
          <CustomTargetConfiguration
            selectedTarget={provider}
            updateCustomTarget={updateCustomTarget}
            rawConfigJson={rawConfigJson}
            setRawConfigJson={setRawConfigJson}
            bodyError={bodyError}
          />
        )}

        {providerType === 'http' && (
          <HttpEndpointConfiguration
            selectedTarget={provider}
            updateCustomTarget={updateCustomTarget}
            bodyError={bodyError}
            setBodyError={setBodyError}
            urlError={urlError}
            setUrlError={setUrlError}
            updateFullTarget={setProvider}
          />
        )}

        {providerType === 'websocket' && (
          <WebSocketEndpointConfiguration
            selectedTarget={provider}
            updateWebSocketTarget={updateWebSocketTarget}
            urlError={urlError}
          />
        )}

        {providerType === 'browser' && (
          <BrowserAutomationConfiguration
            selectedTarget={provider}
            updateCustomTarget={updateCustomTarget}
          />
        )}

        <Box sx={{ mt: 3 }}>
          <CommonConfigurationOptions
            selectedTarget={provider}
            updateCustomTarget={updateCustomTarget}
            extensions={extensions}
            onExtensionsChange={onExtensionsChange}
            onValidationChange={(hasErrors) => setExtensionErrors(hasErrors)}
          />
        </Box>
      </Box>
    );
  },
);

ProviderConfigEditor.displayName = 'ProviderConfigEditor';

export default ProviderConfigEditor;