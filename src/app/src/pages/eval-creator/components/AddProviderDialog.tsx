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

const PROVIDER_TYPE_PREFIXES = [
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
] as const;

const EXACT_PROVIDER_TYPES: Record<string, string> = {
  http: 'http',
  websocket: 'websocket',
  browser: 'browser',
  mcp: 'mcp',
};

const FILE_PROVIDER_TYPES = [
  ['.py', 'python'],
  ['.js', 'javascript'],
  ['.go', 'go'],
] as const;

const AGENT_PROVIDER_TYPES = [
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
] as const;

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
                  mode="eval"
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

export function getProviderTypeFromId(id: string | undefined): string | undefined {
  if (!id || typeof id !== 'string') {
    return undefined;
  }

  const prefixedProviderType = PROVIDER_TYPE_PREFIXES.find(([prefix]) => id.startsWith(prefix));
  if (prefixedProviderType) {
    return prefixedProviderType[1];
  }

  if (Object.prototype.hasOwnProperty.call(EXACT_PROVIDER_TYPES, id)) {
    return EXACT_PROVIDER_TYPES[id];
  }

  if (!id.startsWith('file://')) {
    return 'custom';
  }

  const fileProviderType = FILE_PROVIDER_TYPES.find(([extension]) => id.includes(extension));
  if (fileProviderType) {
    return fileProviderType[1];
  }

  const agentProviderType = AGENT_PROVIDER_TYPES.find(([pattern]) => id.includes(pattern));
  if (agentProviderType) {
    return agentProviderType[1];
  }

  return 'generic-agent';
}
