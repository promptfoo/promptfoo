import React, { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@app/components/ui/button';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getProviderType } from './helpers';
import ProviderConfigEditor from './ProviderConfigEditor';
import ProviderTypeSelector from './ProviderTypeSelector';

import type { ProviderOptions } from '../../types';

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
    disableModelSelection?: boolean;
  };
  setError?: (error: string | null) => void;
  validateAll?: boolean; // Flag to force validation of all fields
  onTargetTested?: (success: boolean) => void;
  onSessionTested?: (success: boolean) => void;
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
  onTargetTested,
  onSessionTested,
}: ProviderProps) {
  const {
    disableNameField = false,
    description,
    disableTitle = false,
    actionButtonText,
    availableProviderIds,
    disableModelSelection = false,
  } = opts;

  const validateRef = useRef<(() => boolean) | null>(null);
  const [validationErrors, setValidationErrors] = useState<string | null>(null);
  const [shouldValidate, setShouldValidate] = useState<boolean>(false);
  const [providerType, setProviderType] = useState<string | undefined>(
    getProviderType(provider?.id) ?? availableProviderIds?.[0],
  );

  const handleValidationRequest = useCallback((validator: () => boolean) => {
    validateRef.current = validator;
  }, []);

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
    <div className="flex flex-col gap-6">
      {!disableTitle && <h2 className="mb-6 text-2xl font-bold">Select Red Team Provider</h2>}

      <p className="text-base">
        {description ||
          'A target is the specific LLM or endpoint you want to evaluate in your red teaming process.'}{' '}
        For more information on available targets and how to configure them, please visit our{' '}
        <a
          href="https://www.promptfoo.dev/docs/providers/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          documentation
        </a>
        .
      </p>

      {!disableNameField && (
        <div className="mb-4 mt-4">
          <Label htmlFor="provider-name" className="mb-2 block">
            Provider Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="provider-name"
            value={provider?.label ?? ''}
            placeholder="e.g. 'customer-service-agent'"
            onChange={(e) => {
              if (provider) {
                setProvider({ ...provider, label: e.target.value });
              }
            }}
            autoFocus
          />
        </div>
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
        provider={provider}
        setProvider={setProvider}
        extensions={extensions}
        onExtensionsChange={onExtensionsChange}
        setError={handleError}
        validateAll={validateAll || shouldValidate}
        onValidate={() => {
          // Validation errors will be displayed through the handleError function
        }}
        onValidationRequest={handleValidationRequest}
        providerType={providerType}
        onTargetTested={onTargetTested}
        onSessionTested={onSessionTested}
      />

      <div
        className={`mt-8 flex w-full ${validationErrors ? 'justify-between' : 'justify-end'} relative`}
      >
        <div className={`flex gap-4 ${validationErrors ? 'w-full justify-between' : ''}`}>
          {onBack && (
            <Button variant="outline" onClick={onBack} className="px-6 py-2">
              <ChevronLeft className="mr-2 size-4" />
              Back
            </Button>
          )}
          {onActionButtonClick && (
            <Button
              onClick={() => {
                // Enable validation when button is clicked
                setShouldValidate(true);

                // Call the validation function
                const isValid = validateRef.current?.() ?? false;

                // Only proceed if there are no errors
                if (isValid && !validationErrors) {
                  onActionButtonClick();
                }
              }}
              className="px-6 py-2"
            >
              {actionButtonText || 'Next'}
              <ChevronRight className="ml-2 size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
