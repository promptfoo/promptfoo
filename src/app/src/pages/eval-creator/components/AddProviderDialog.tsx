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

function getProviderTypeFromId(id: string | undefined): string | undefined {
  if (!id || typeof id !== 'string') {
    return undefined;
  }

  if (id.startsWith('openai:')) {
    return 'openai';
  }
  if (id.startsWith('anthropic:')) {
    return 'anthropic';
  }
  if (id.startsWith('bedrock:')) {
    return 'bedrock';
  }
  if (id.startsWith('bedrock-agent:')) {
    return 'bedrock-agent';
  }
  if (id.startsWith('azure:')) {
    return 'azure';
  }
  if (id.startsWith('vertex:')) {
    return 'vertex';
  }
  if (id.startsWith('google:')) {
    return 'google';
  }
  if (id.startsWith('mistral:')) {
    return 'mistral';
  }
  if (id.startsWith('openrouter:')) {
    return 'openrouter';
  }
  if (id.startsWith('groq:')) {
    return 'groq';
  }
  if (id.startsWith('deepseek:')) {
    return 'deepseek';
  }
  if (id.startsWith('perplexity:')) {
    return 'perplexity';
  }
  if (id === 'http') {
    return 'http';
  }
  if (id === 'websocket') {
    return 'websocket';
  }
  if (id === 'browser') {
    return 'browser';
  }
  if (id === 'mcp') {
    return 'mcp';
  }
  if (id.startsWith('exec:')) {
    return 'exec';
  }
  if (id.startsWith('file://')) {
    if (id.includes('.py')) {
      return 'python';
    }
    if (id.includes('.js')) {
      return 'javascript';
    }
    if (id.includes('.go')) {
      return 'go';
    }
    // Check for agent frameworks
    if (id.includes('langchain')) {
      return 'langchain';
    }
    if (id.includes('autogen')) {
      return 'autogen';
    }
    if (id.includes('crewai')) {
      return 'crewai';
    }
    if (id.includes('llamaindex')) {
      return 'llamaindex';
    }
    if (id.includes('langgraph')) {
      return 'langgraph';
    }
    if (id.includes('openai_agents') || id.includes('openai-agents')) {
      return 'openai-agents-sdk';
    }
    if (id.includes('pydantic_ai') || id.includes('pydantic-ai')) {
      return 'pydantic-ai';
    }
    if (id.includes('google_adk') || id.includes('google-adk')) {
      return 'google-adk';
    }
    return 'generic-agent';
  }

  return 'custom';
}
