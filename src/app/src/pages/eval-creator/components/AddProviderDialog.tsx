// Import Prism for syntax highlighting in provider configurations
import '@app/lib/prism';
import '@app/pages/redteam/setup/components/Targets/syntax-highlighting.css';

import { useEffect, useState } from 'react';

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
}

export default function AddProviderDialog({
  open,
  onClose,
  onSave,
  initialProvider,
}: AddProviderDialogProps) {
  const [step, setStep] = useState<'select' | 'configure'>('select');
  const [provider, setProvider] = useState<ProviderOptions | undefined>(initialProvider);
  const [providerType, setProviderType] = useState<string | undefined>(
    initialProvider ? getProviderTypeFromId(initialProvider.id) : undefined,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (initialProvider) {
        setProvider(initialProvider);
        setProviderType(getProviderTypeFromId(initialProvider.id));
        setStep('configure');
      } else {
        // Use placeholder ID to prevent ProviderTypeSelector from auto-selecting HTTP
        // The empty string is falsy and triggers the default, so use a truthy placeholder
        setProvider({ id: '__selecting__', config: {} } as ProviderOptions);
        setProviderType(undefined);
        setStep('select');
      }
      setError(null);
    }
  }, [open, initialProvider]);

  const handleProviderTypeSelect = (newProvider: ProviderOptions, type: string) => {
    // Only move to configure step if user has made an explicit selection
    // (not when ProviderTypeSelector auto-sets a default or we're using placeholder)
    if (newProvider.id && newProvider.id !== '' && newProvider.id !== '__selecting__') {
      setProvider(newProvider);
      setProviderType(type);
      setStep('configure');
    }
  };

  const handleSave = () => {
    if (provider) {
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
                : step === 'select'
                  ? 'Select Provider Type'
                  : 'Configure Provider'}
            </DialogTitle>
            <DialogDescription>
              {step === 'select'
                ? 'Choose the type of provider you want to evaluate'
                : 'Configure the settings for your provider'}
            </DialogDescription>
          </DialogHeader>

          <div
            key={step}
            data-testid="add-provider-dialog-scroll-body"
            className="min-h-0 flex-1 overflow-y-auto py-4"
          >
            {step === 'select' ? (
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
                  validateAll={false}
                  providerType={providerType}
                  mode="eval"
                />
              )
            )}
          </div>

          <DialogFooter data-testid="add-provider-dialog-footer" className="shrink-0">
            <Button variant="outline" onClick={handleBack}>
              {step === 'configure' ? 'Back' : 'Cancel'}
            </Button>
            {step === 'configure' && (
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

export function getProviderTypeFromId(id: string | undefined): string | undefined {
  if (!id || typeof id !== 'string') {
    return undefined;
  }

  const prefixMatches: Array<[string, string]> = [
    ['openai:', 'openai'],
    ['anthropic:', 'anthropic'],
    ['bedrock:', 'bedrock'],
    ['bedrock-agent:', 'bedrock-agent'],
    ['azure:', 'azure'],
    ['vertex:', 'vertex'],
    ['google:', 'google'],
    ['mistral:', 'mistral'],
    ['openrouter:', 'openrouter'],
    ['groq:', 'groq'],
    ['deepseek:', 'deepseek'],
    ['perplexity:', 'perplexity'],
    ['exec:', 'exec'],
  ];
  const prefixedProvider = prefixMatches.find(([prefix]) => id.startsWith(prefix));
  if (prefixedProvider) {
    return prefixedProvider[1];
  }

  const exactMatches = new Set(['http', 'websocket', 'browser', 'mcp']);
  if (exactMatches.has(id)) {
    return id;
  }

  if (id.startsWith('file://')) {
    return getFileProviderType(id);
  }

  return 'custom';
}

function getFileProviderType(id: string): string {
  const scriptMatches: Array<[string, string]> = [
    ['.py', 'python'],
    ['.js', 'javascript'],
    ['.go', 'go'],
  ];
  const scriptType = scriptMatches.find(([needle]) => id.includes(needle));
  if (scriptType) {
    return scriptType[1];
  }

  const frameworkMatches: Array<[string[], string]> = [
    [['langchain'], 'langchain'],
    [['autogen'], 'autogen'],
    [['crewai'], 'crewai'],
    [['llamaindex'], 'llamaindex'],
    [['langgraph'], 'langgraph'],
    [['openai_agents', 'openai-agents'], 'openai-agents-sdk'],
    [['pydantic_ai', 'pydantic-ai'], 'pydantic-ai'],
    [['google_adk', 'google-adk'], 'google-adk'],
  ];
  const frameworkType = frameworkMatches.find(([needles]) =>
    needles.some((needle) => id.includes(needle)),
  );

  return frameworkType?.[1] || 'generic-agent';
}
