// Import Prism for syntax highlighting in provider configurations
import '@app/pages/redteam/setup/components/Targets/syntax-highlighting.css';
import 'prismjs'; // Core Prism library must be imported first
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';

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
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
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

          <div className="py-4 min-h-[400px]">
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
                />
              )
            )}
          </div>

          <DialogFooter>
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

const PROVIDER_PREFIX_MAP: Array<[string, string]> = [
  ['bedrock-agent:', 'bedrock-agent'],
  ['openai:', 'openai'],
  ['anthropic:', 'anthropic'],
  ['bedrock:', 'bedrock'],
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

const PROVIDER_EXACT_MAP: Record<string, string> = {
  http: 'http',
  websocket: 'websocket',
  browser: 'browser',
  mcp: 'mcp',
};

const FILE_EXTENSION_MAP: Array<[string, string]> = [
  ['.py', 'python'],
  ['.js', 'javascript'],
  ['.go', 'go'],
];

const FILE_FRAMEWORK_MAP: Array<[string, string]> = [
  ['langchain', 'langchain'],
  ['autogen', 'autogen'],
  ['crewai', 'crewai'],
  ['llamaindex', 'llamaindex'],
  ['langgraph', 'langgraph'],
  ['openai_agents', 'openai-agents-sdk'],
  ['openai-agents', 'openai-agents-sdk'],
  ['pydantic_ai', 'pydantic-ai'],
  ['pydantic-ai', 'pydantic-ai'],
  ['google_adk', 'google-adk'],
  ['google-adk', 'google-adk'],
];

function getProviderTypeFromFileId(id: string): string {
  for (const [ext, type] of FILE_EXTENSION_MAP) {
    if (id.includes(ext)) {
      return type;
    }
  }
  for (const [fragment, type] of FILE_FRAMEWORK_MAP) {
    if (id.includes(fragment)) {
      return type;
    }
  }
  return 'generic-agent';
}

export function getProviderTypeFromId(id: string | undefined): string | undefined {
  if (!id || typeof id !== 'string') {
    return undefined;
  }

  const exact = PROVIDER_EXACT_MAP[id];
  if (exact) {
    return exact;
  }

  for (const [prefix, type] of PROVIDER_PREFIX_MAP) {
    if (id.startsWith(prefix)) {
      return type;
    }
  }

  if (id.startsWith('file://')) {
    return getProviderTypeFromFileId(id);
  }

  return 'custom';
}
