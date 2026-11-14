import { getProviderEditorType } from '@app/pages/redteam/setup/components/Targets/providerCatalog';
// Import Prism for syntax highlighting in provider configurations
import '@app/lib/prism';
import '@app/pages/redteam/setup/components/Targets/syntax-highlighting.css';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import ProviderConfigEditor from '@app/pages/redteam/setup/components/Targets/ProviderConfigEditor';
import ProviderTypeSelector from '@app/pages/redteam/setup/components/Targets/ProviderTypeSelector';
import type { ProviderOptions as RedteamProviderOptions } from '@app/pages/redteam/setup/types';
import type { ProviderOptions } from '@promptfoo/types';

interface AddProviderDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (provider: ProviderOptions) => void;
  initialProvider?: ProviderOptions;
  /** Configured ui-providers.yaml catalog. Null/undefined means unrestricted. */
  availableProviders?: ProviderOptions[] | null;
}

export default function AddProviderDialog({
  open,
  onClose,
  onSave,
  initialProvider,
  availableProviders,
}: AddProviderDialogProps) {
  const isCatalogRestricted = availableProviders != null;
  const [step, setStep] = useState<'select' | 'configure'>('select');
  const [provider, setProvider] = useState<ProviderOptions | undefined>(initialProvider);
  const [providerType, setProviderType] = useState<string | undefined>(
    initialProvider ? getProviderTypeFromId(initialProvider.id, initialProvider.config) : undefined,
  );
  const [error, setError] = useState<string | null>(null);
  const [shouldValidate, setShouldValidate] = useState(false);
  const validateRef = useRef<(() => boolean) | null>(null);

  const handleValidationRequest = useCallback(
    (validator: () => boolean) => {
      validateRef.current = validator;
      if (shouldValidate) {
        validator();
      }
    },
    [shouldValidate],
  );

  useEffect(() => {
    if (open) {
      if (initialProvider) {
        setProvider(initialProvider);
        setProviderType(getProviderTypeFromId(initialProvider.id, initialProvider.config));
        setStep('configure');
      } else {
        // Use placeholder ID to prevent ProviderTypeSelector from auto-selecting HTTP
        // The empty string is falsy and triggers the default, so use a truthy placeholder
        setProvider({ id: '__selecting__', config: {} } as ProviderOptions);
        setProviderType(undefined);
        setStep('select');
      }
      setError(null);
      setShouldValidate(false);
    }
  }, [open, initialProvider]);

  const handleProviderTypeSelect = (newProvider: ProviderOptions, type: string) => {
    // Only move to configure step if user has made an explicit selection
    // (not when ProviderTypeSelector auto-sets a default or we're using placeholder)
    if (newProvider.id && newProvider.id !== '' && newProvider.id !== '__selecting__') {
      validateRef.current = null;
      setError(null);
      setShouldValidate(false);
      setProvider(newProvider);
      setProviderType(type);
      setStep('configure');
    }
  };

  const handleSave = () => {
    setShouldValidate(true);
    if (provider && (validateRef.current?.() ?? false)) {
      // Auto-generate label from ID if not provided
      const providerToSave = provider.label
        ? provider
        : { ...provider, label: typeof provider.id === 'string' ? provider.id : 'Custom Provider' };
      onSave(providerToSave);
      onClose();
    }
  };

  const handleBack = () => {
    if (step === 'configure') {
      setStep('select');
    } else {
      onClose();
    }
  };

  const getDisabledTooltip = () => {
    if (error) {
      return error;
    }
    return undefined;
  };

  return (
    <>
      {/* Ensure MUI Menu components appear above Dialog */}
      <style>
        {`
          .MuiMenu-root,
          .MuiPopover-root {
            z-index: 9999 !important;
          }
        `}
      </style>
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              {initialProvider
                ? 'Edit Provider'
                : isCatalogRestricted || step === 'select'
                  ? 'Select Provider Type'
                  : 'Configure Provider'}
            </DialogTitle>
            <DialogDescription>
              {isCatalogRestricted
                ? 'Choose one of the configured providers'
                : step === 'select'
                  ? 'Choose the type of provider you want to evaluate'
                  : 'Configure the settings for your provider'}
            </DialogDescription>
          </DialogHeader>

          <div
            key={step}
            data-testid="add-provider-dialog-scroll-body"
            className="min-h-0 flex-1 overflow-y-auto py-4"
          >
            {isCatalogRestricted ? (
              <div className="space-y-2">
                {availableProviders.length ? (
                  availableProviders.map((configured, index) => (
                    <Button
                      key={index}
                      variant="outline"
                      className="h-auto w-full justify-start p-4 text-left"
                      onClick={() => {
                        onSave({ ...configured });
                        onClose();
                      }}
                    >
                      {configured.label || configured.id}
                    </Button>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No configured providers are available. Contact your administrator.
                  </p>
                )}
              </div>
            ) : step === 'select' ? (
              <div className="w-full">
                <ProviderTypeSelector
                  provider={provider as RedteamProviderOptions | undefined}
                  setProvider={
                    handleProviderTypeSelect as (
                      provider: RedteamProviderOptions | undefined,
                    ) => void
                  }
                  providerType={providerType}
                />
              </div>
            ) : (
              provider && (
                <ProviderConfigEditor
                  provider={provider as RedteamProviderOptions}
                  setProvider={setProvider as (provider: RedteamProviderOptions) => void}
                  setError={setError}
                  validateAll={shouldValidate || providerType === 'codex-security'}
                  onValidationRequest={handleValidationRequest}
                  providerType={providerType}
                  mode="eval"
                />
              )
            )}
          </div>

          <DialogFooter data-testid="add-provider-dialog-footer" className="shrink-0">
            <Button variant="outline" onClick={isCatalogRestricted ? onClose : handleBack}>
              {!isCatalogRestricted && step === 'configure' ? 'Back' : 'Cancel'}
            </Button>
            {!isCatalogRestricted && step === 'configure' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Button onClick={handleSave} disabled={!!error}>
                      {initialProvider ? 'Save Changes' : 'Add Provider'}
                    </Button>
                  </div>
                </TooltipTrigger>
                {getDisabledTooltip() && (
                  <TooltipContent>
                    <p>{getDisabledTooltip()}</p>
                  </TooltipContent>
                )}
              </Tooltip>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function getProviderTypeFromId(
  id: string | undefined,
  config?: Record<string, unknown>,
): string | undefined {
  return getProviderEditorType(id, config);
}
