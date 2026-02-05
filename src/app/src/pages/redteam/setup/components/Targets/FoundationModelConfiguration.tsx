import React, { useEffect, useState } from 'react';

import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { SetupSection } from '../SetupSection';

import type { ProviderOptions } from '../../types';

interface FoundationModelConfigurationProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: unknown) => void;
  providerType: string;
}

const FoundationModelConfiguration = ({
  selectedTarget,
  updateCustomTarget,
  providerType,
}: FoundationModelConfigurationProps) => {
  const [modelId, setModelId] = useState(selectedTarget.id || '');
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  useEffect(() => {
    setModelId(selectedTarget.id || '');
  }, [selectedTarget.id]);

  const handleModelIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newId = e.target.value;
    setModelId(newId);
    updateCustomTarget('id', newId);
  };

  const getProviderInfo = (type: string) => {
    const providerConfigs = {
      openai: {
        name: 'OpenAI',
        defaultModel: 'openai:gpt-4o',
        placeholder: 'openai:gpt-4o, openai:gpt-4o-mini, openai:o1-preview',
        docUrl: 'https://www.promptfoo.dev/docs/providers/openai',
        envVar: 'OPENAI_API_KEY',
      },
      anthropic: {
        name: 'Anthropic',
        defaultModel: 'anthropic:messages:claude-sonnet-4-5-20250929',
        placeholder:
          'anthropic:messages:claude-sonnet-4-5-20250929, anthropic:messages:claude-haiku-4-5-20251001',
        docUrl: 'https://www.promptfoo.dev/docs/providers/anthropic',
        envVar: 'ANTHROPIC_API_KEY',
      },
      google: {
        name: 'Google AI Studio',
        defaultModel: 'google:gemini-2.5-pro',
        placeholder: 'google:gemini-2.5-pro, google:gemini-2.5-flash',
        docUrl: 'https://www.promptfoo.dev/docs/providers/google',
        envVar: 'GOOGLE_API_KEY | GEMINI_API_KEY | PALM_API_KEY',
      },
      vertex: {
        name: 'Google Vertex AI',
        defaultModel: 'vertex:gemini-2.5-pro',
        placeholder: 'vertex:gemini-2.5-pro, vertex:gemini-2.5-flash',
        docUrl: 'https://www.promptfoo.dev/docs/providers/vertex',
        envVar: 'GOOGLE_APPLICATION_CREDENTIALS',
      },
      mistral: {
        name: 'Mistral AI',
        defaultModel: 'mistral:mistral-large-latest',
        placeholder: 'mistral:mistral-large-latest, mistral:mistral-small-latest',
        docUrl: 'https://www.promptfoo.dev/docs/providers/mistral',
        envVar: 'MISTRAL_API_KEY',
      },
      cohere: {
        name: 'Cohere',
        defaultModel: 'cohere:command-r-plus',
        placeholder: 'cohere:command-r-plus, cohere:command-r',
        docUrl: 'https://www.promptfoo.dev/docs/providers/cohere',
        envVar: 'COHERE_API_KEY',
      },
      groq: {
        name: 'Groq',
        defaultModel: 'groq:llama-3.1-70b-versatile',
        placeholder: 'groq:llama-3.1-70b-versatile, groq:mixtral-8x7b-32768',
        docUrl: 'https://www.promptfoo.dev/docs/providers/groq',
        envVar: 'GROQ_API_KEY',
      },
      deepseek: {
        name: 'DeepSeek',
        defaultModel: 'deepseek:deepseek-chat',
        placeholder: 'deepseek:deepseek-chat, deepseek:deepseek-coder',
        docUrl: 'https://www.promptfoo.dev/docs/providers/deepseek',
        envVar: 'DEEPSEEK_API_KEY',
      },
      azure: {
        name: 'Azure OpenAI',
        defaultModel: 'azure:chat:gpt-4o',
        placeholder: 'azure:chat:your-deployment-name',
        docUrl: 'https://www.promptfoo.dev/docs/providers/azure',
        envVar: 'AZURE_OPENAI_API_KEY',
      },
      openrouter: {
        name: 'OpenRouter',
        defaultModel: 'openrouter:openai/gpt-4o',
        placeholder: 'openrouter:openai/gpt-4o, openrouter:anthropic/claude-3.5-sonnet',
        docUrl: 'https://www.promptfoo.dev/docs/providers/openrouter',
        envVar: 'OPENROUTER_API_KEY',
      },
    };

    return (
      providerConfigs[type as keyof typeof providerConfigs] || {
        name: type.charAt(0).toUpperCase() + type.slice(1),
        defaultModel: `${type}:model`,
        placeholder: `${type}:model-name`,
        docUrl: 'https://www.promptfoo.dev/docs/providers',
        envVar: `${type.toUpperCase()}_API_KEY`,
      }
    );
  };

  const providerInfo = getProviderInfo(providerType);

  return (
    <div className="mt-4">
      <h3 className="mb-4 text-lg font-semibold">{providerInfo.name} Configuration</h3>

      <div className="rounded-lg border border-border p-4">
        <div className="space-y-2">
          <Label htmlFor="model-id">
            Model ID <span className="text-destructive">*</span>
          </Label>
          <Input
            id="model-id"
            value={modelId}
            onChange={handleModelIdChange}
            placeholder={providerInfo.placeholder}
          />
          <p className="text-sm text-muted-foreground">
            Specify the model to use. See{' '}
            <a
              href={providerInfo.docUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {providerInfo.name} documentation
            </a>{' '}
            for available models.
          </p>
        </div>

        <SetupSection
          title="Advanced Configuration"
          description="Model parameters and API settings"
          isExpanded={isAdvancedOpen}
          onExpandedChange={setIsAdvancedOpen}
          className="mt-4"
        >
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="temperature">Temperature</Label>
              <Input
                id="temperature"
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={selectedTarget.config?.temperature ?? ''}
                onChange={(e) =>
                  updateCustomTarget('temperature', parseFloat(e.target.value) || undefined)
                }
              />
              <p className="text-sm text-muted-foreground">Controls randomness (0.0 to 2.0)</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="max-tokens">Max Tokens</Label>
              <Input
                id="max-tokens"
                type="number"
                min={1}
                value={selectedTarget.config?.max_tokens ?? ''}
                onChange={(e) =>
                  updateCustomTarget('max_tokens', parseInt(e.target.value) || undefined)
                }
              />
              <p className="text-sm text-muted-foreground">Maximum number of tokens to generate</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="top-p">Top P</Label>
              <Input
                id="top-p"
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={selectedTarget.config?.top_p ?? ''}
                onChange={(e) =>
                  updateCustomTarget('top_p', parseFloat(e.target.value) || undefined)
                }
              />
              <p className="text-sm text-muted-foreground">
                Nucleus sampling parameter (0.0 to 1.0)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="api-key">API Key</Label>
              <Input
                id="api-key"
                type="password"
                value={selectedTarget.config?.apiKey ?? ''}
                onChange={(e) => updateCustomTarget('apiKey', e.target.value || undefined)}
              />
              <p className="text-sm text-muted-foreground">
                Optional - defaults to {providerInfo.envVar} environment variable
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="api-base-url">API Base URL</Label>
              <Input
                id="api-base-url"
                type="url"
                value={selectedTarget.config?.apiBaseUrl ?? ''}
                onChange={(e) => updateCustomTarget('apiBaseUrl', e.target.value || undefined)}
                placeholder="https://api.openai.com/v1"
              />
              <p className="text-sm text-muted-foreground">
                For proxies, local models (Ollama, LMStudio), or custom API endpoints
              </p>
            </div>
          </div>
        </SetupSection>
      </div>
    </div>
  );
};

export default FoundationModelConfiguration;
