// Import Prism for syntax highlighting in provider configurations
import '@app/lib/prism';
import '@app/pages/redteam/setup/components/Targets/syntax-highlighting.css';

import { useEffect, useId, useRef, useState } from 'react';

import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
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

type DiscardDestination = 'close' | 'select';

const PROVIDER_PREFIX_TYPES: ReadonlyArray<readonly [string, string]> = [
  ['bedrock:agent:', 'bedrock-agent'],
  ['openai:', 'openai'],
  ['anthropic:', 'anthropic'],
  ['bedrock-agent:', 'bedrock-agent'],
  ['bedrock:', 'bedrock'],
  ['azure:', 'azure'],
  ['vertex:', 'vertex'],
  ['google:', 'google'],
  ['mistral:', 'mistral'],
  ['openrouter:', 'openrouter'],
  ['groq:', 'groq'],
  ['deepseek:', 'deepseek'],
  ['perplexity:', 'perplexity'],
  ['cohere:', 'cohere'],
  ['ai21:', 'ai21'],
  ['xai:', 'xai'],
  ['sagemaker:', 'sagemaker'],
  ['fireworks:', 'fireworks'],
  ['together:', 'together'],
  ['cerebras:', 'cerebras'],
  ['hyperbolic:', 'hyperbolic'],
  ['aimlapi:', 'aimlapi'],
  ['huggingface:', 'huggingface'],
  ['github:', 'github'],
  ['cloudflare-ai:', 'cloudflare-ai'],
  ['databricks:', 'databricks'],
  ['replicate:', 'replicate'],
  ['fal:', 'fal'],
  ['voyage:', 'voyage'],
  ['ollama:', 'ollama'],
  ['vllm:', 'vllm'],
  ['llama.cpp:', 'llama.cpp'],
  ['localai:', 'localai'],
  ['llamafile:', 'llamafile'],
  ['text-generation-webui:', 'text-generation-webui'],
  ['python:', 'python'],
  ['golang:', 'go'],
  ['a2a:', 'a2a'],
  ['mcp:', 'mcp'],
];

const EXACT_PROVIDER_TYPES = new Map<string, string>([
  ['http', 'http'],
  ['websocket', 'websocket'],
  ['browser', 'browser'],
  ['a2a', 'a2a'],
  ['mcp', 'mcp'],
]);

const FILE_EXTENSION_PROVIDER_TYPES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\.py(?::[^/\\]+)?$/i, 'python'],
  [/\.(?:js|cjs|mjs|ts|cts|mts)(?::[^/\\]+)?$/i, 'javascript'],
  [/\.go(?::[^/\\]+)?$/i, 'go'],
];
const JAVASCRIPT_PROVIDER_PATH_PATTERN = /\.(?:js|cjs|mjs|ts|cts|mts)$/i;

const FILE_FRAMEWORK_PROVIDER_TYPES: ReadonlyArray<readonly [string, string]> = [
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
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [discardDestination, setDiscardDestination] = useState<DiscardDestination>('close');
  const validationMessageId = useId();
  const validateProviderRef = useRef<(() => boolean) | null>(null);

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
      setDiscardDialogOpen(false);
      setDiscardDestination('close');
    }
  }, [open, initialProvider]);

  const hasUnsavedChanges = initialProvider
    ? JSON.stringify(provider) !== JSON.stringify(initialProvider)
    : Boolean(provider && provider.id !== '__selecting__');

  const handleProviderTypeSelect = (newProvider: ProviderOptions, type: string) => {
    // Only move to configure step if user has made an explicit selection
    // (not when ProviderTypeSelector auto-sets a default or we're using placeholder)
    if (newProvider.id && newProvider.id !== '' && newProvider.id !== '__selecting__') {
      setError(null);
      setProvider(newProvider);
      setProviderType(type);
      setStep('configure');
    }
  };

  const handleSave = () => {
    if (!provider || !validateProviderRef.current?.()) {
      return;
    }

    // Auto-generate label from ID if not provided
    const providerToSave = provider.label
      ? provider
      : { ...provider, label: typeof provider.id === 'string' ? provider.id : 'Custom Provider' };
    onSave(providerToSave);
    onClose();
  };

  const requestClose = () => {
    if (hasUnsavedChanges) {
      setDiscardDestination('close');
      setDiscardDialogOpen(true);
      return;
    }
    onClose();
  };

  const handleBack = () => {
    setError(null);
    if (step === 'configure') {
      if (hasUnsavedChanges) {
        setDiscardDestination('select');
        setDiscardDialogOpen(true);
        return;
      }
      // Clear only after committing to leaving — otherwise "Continue editing" would lose Save.
      validateProviderRef.current = null;
      setStep('select');
    } else {
      requestClose();
    }
  };

  const handleConfirmDiscard = () => {
    setDiscardDialogOpen(false);
    if (discardDestination === 'select') {
      validateProviderRef.current = null;
      setProvider({ id: '__selecting__', config: {} } as ProviderOptions);
      setProviderType(undefined);
      setStep('select');
      setDiscardDestination('close');
      return;
    }

    onClose();
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
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && requestClose()}>
        <DialogContent
          className="flex max-h-[90vh] max-w-5xl flex-col overflow-hidden"
          hideDescription={false}
        >
          <DialogHeader>
            <DialogTitle>
              {initialProvider
                ? 'Edit Provider'
                : step === 'select'
                  ? 'Select Provider Type'
                  : 'Configure Provider'}
            </DialogTitle>
            {!initialProvider && (
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Step {step === 'select' ? '1' : '2'} of 2
              </p>
            )}
            <DialogDescription>
              {step === 'select'
                ? 'A provider is a model, agent, or endpoint. Choose what each prompt and test case will run against.'
                : initialProvider
                  ? 'Update the connection and model settings used for this evaluation.'
                  : 'Configure how Promptfoo connects to this provider. By default, it receives every prompt and test case; YAML routing can narrow that set. Add more providers later to compare outputs.'}
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
                  mode="eval"
                />
              </div>
            ) : (
              provider && (
                <ProviderConfigEditor
                  provider={provider as RedteamProviderOptions}
                  setProvider={setProvider as (provider: RedteamProviderOptions) => void}
                  setError={setError}
                  validateAll={false}
                  onValidationRequest={(validator) => {
                    validateProviderRef.current = validator;
                  }}
                  providerType={providerType}
                  mode="eval"
                />
              )
            )}
          </div>

          <DialogFooter data-testid="add-provider-dialog-footer" className="shrink-0">
            {error && (
              <p
                id={validationMessageId}
                role="alert"
                className="mr-auto text-left text-sm text-destructive"
              >
                {error}
              </p>
            )}
            {initialProvider && hasUnsavedChanges && !error && (
              <p
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className="mr-auto text-left text-sm text-muted-foreground"
              >
                Unsaved provider changes
              </p>
            )}
            <Button variant="outline" onClick={handleBack}>
              {step === 'configure' ? 'Back' : 'Cancel'}
            </Button>
            {step === 'configure' && (
              <Button
                onClick={handleSave}
                disabled={Boolean(initialProvider && !hasUnsavedChanges)}
                aria-describedby={error ? validationMessageId : undefined}
              >
                {initialProvider ? 'Save Changes' : 'Add Provider'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={discardDialogOpen}
        onOpenChange={(isOpen) => !isOpen && setDiscardDialogOpen(false)}
      >
        <DialogContent hideDescription={false}>
          <DialogHeader>
            <DialogTitle>Discard provider changes?</DialogTitle>
            <DialogDescription>
              Your provider selection and configuration changes will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscardDialogOpen(false)}>
              Continue editing
            </Button>
            <Button variant="destructive" onClick={handleConfirmDiscard}>
              {discardDestination === 'select' ? 'Discard and choose type' : 'Discard changes'}
            </Button>
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

  const prefixType = PROVIDER_PREFIX_TYPES.find(([prefix]) => id.startsWith(prefix))?.[1];
  if (prefixType) {
    return prefixType;
  }

  const exactType = EXACT_PROVIDER_TYPES.get(id);
  if (exactType) {
    return exactType;
  }

  if (id.startsWith('exec:')) {
    return 'exec';
  }

  if (id.startsWith('file://')) {
    return (
      FILE_EXTENSION_PROVIDER_TYPES.find(([pattern]) => pattern.test(id))?.[1] ??
      FILE_FRAMEWORK_PROVIDER_TYPES.find(([marker]) => id.includes(marker))?.[1] ??
      'generic-agent'
    );
  }

  if (JAVASCRIPT_PROVIDER_PATH_PATTERN.test(id)) {
    return 'javascript';
  }

  return 'custom';
}
