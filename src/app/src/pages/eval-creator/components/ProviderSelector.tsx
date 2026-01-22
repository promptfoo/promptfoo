import React from 'react';

import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import { ChevronDownIcon, FolderOpenIcon, XIcon } from '@app/components/ui/icons';
import { Input } from '@app/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@app/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import { useProvidersStore } from '../../../store/providersStore';
import AddLocalProviderDialog from './AddLocalProviderDialog';
import ProviderConfigDialog from './ProviderConfigDialog';
import type { ProviderOptions } from '@promptfoo/types';

const defaultProviders: ProviderOptions[] = (
  [] as (ProviderOptions & { id: string; label?: string })[]
)
  .concat([
    {
      id: 'openai:gpt-5',
      label: 'OpenAI: GPT-5',
      config: {
        organization: '',
        temperature: 0.5,
        max_tokens: 1024,
        top_p: 1.0,
        frequency_penalty: 0.0,
        presence_penalty: 0.0,
        function_call: undefined,
        functions: undefined,
        stop: undefined,
      },
    },
    {
      id: 'openai:gpt-5-mini',
      label: 'OpenAI: GPT-5 Mini',
      config: {
        organization: '',
        temperature: 0.5,
        max_tokens: 1024,
        top_p: 1.0,
        frequency_penalty: 0.0,
        presence_penalty: 0.0,
      },
    },
    {
      id: 'openai:gpt-5-nano',
      label: 'OpenAI: GPT-5 Nano',
      config: {
        organization: '',
        temperature: 0.5,
        max_tokens: 1024,
        top_p: 1.0,
        frequency_penalty: 0.0,
        presence_penalty: 0.0,
      },
    },
    {
      id: 'openai:gpt-4o',
      label: 'OpenAI: GPT-4o',
      config: {
        organization: '',
        temperature: 0.5,
        max_tokens: 1024,
        top_p: 1.0,
        frequency_penalty: 0.0,
        presence_penalty: 0.0,
        function_call: undefined,
        functions: undefined,
        stop: undefined,
      },
    },
    {
      id: 'openai:gpt-4o-mini',
      label: 'OpenAI: GPT-4o Mini',
      config: {
        organization: '',
        temperature: 0.5,
        max_tokens: 1024,
        top_p: 1.0,
        frequency_penalty: 0.0,
        presence_penalty: 0.0,
      },
    },
    {
      id: 'openai:o3',
      label: 'OpenAI: GPT-o3 (with thinking)',
      config: {
        organization: '',
        isReasoningModel: true,
        max_completion_tokens: 1024,
        reasoning_effort: 'medium', // Options: 'low', 'medium', 'high'
      },
    },
    {
      id: 'openai:o4-mini',
      label: 'OpenAI: GPT-o4 Mini (with thinking)',
      config: {
        organization: '',
        isReasoningModel: true,
        max_completion_tokens: 2048,
        reasoning_effort: 'medium', // Options: 'low', 'medium', 'high'
      },
    },
    {
      id: 'openai:o3-mini',
      label: 'OpenAI: GPT-o3 Mini (with thinking)',
      config: {
        organization: '',
        isReasoningModel: true,
        max_completion_tokens: 2048,
        reasoning_effort: 'medium', // Options: 'low', 'medium', 'high'
      },
    },
  ])
  .concat([
    {
      id: 'anthropic:messages:claude-opus-4-5-20251101',
      label: 'Anthropic: Claude 4.5 Opus',
      config: {
        max_tokens: 2048,
        temperature: 0.5,
      },
    },
    {
      id: 'anthropic:messages:claude-sonnet-4-5-20250929',
      label: 'Anthropic: Claude 4.5 Sonnet',
      config: {
        max_tokens: 2048,
        temperature: 0.5,
      },
    },
    {
      id: 'anthropic:messages:claude-sonnet-4-20250514',
      label: 'Anthropic: Claude 4 Sonnet',
      config: {
        max_tokens: 2048,
        temperature: 0.5,
      },
    },
    {
      id: 'anthropic:messages:claude-opus-4-1-20250805',
      label: 'Anthropic: Claude 4.1 Opus',
      config: {
        max_tokens: 2048,
        temperature: 0.5,
      },
    },
    {
      id: 'anthropic:messages:claude-opus-4-20250514',
      label: 'Anthropic: Claude 4 Opus',
      config: {
        max_tokens: 2048,
        temperature: 0.5,
      },
    },
    {
      id: 'anthropic:messages:claude-haiku-4-5-20251001',
      label: 'Anthropic: Claude 4.5 Haiku',
      config: {
        max_tokens: 2048,
        temperature: 0.5,
      },
    },
    {
      id: 'anthropic:claude-agent-sdk',
      label: 'Anthropic: Claude Agent SDK',
      config: {},
    },
  ])
  .concat([
    {
      id: 'bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      label: 'Bedrock: Claude 4.5 Sonnet',
      config: {
        max_tokens: 2048,
        temperature: 0.5,
        region: 'us-east-1',
      },
    },
    {
      id: 'bedrock:us.anthropic.claude-sonnet-4-20250514-v1:0',
      label: 'Bedrock: Claude 4 Sonnet',
      config: {
        max_tokens: 2048,
        temperature: 0.5,
        region: 'us-east-1',
      },
    },
    {
      id: 'bedrock:us.anthropic.claude-opus-4-1-20250805-v1:0',
      label: 'Bedrock: Claude 4.1 Opus',
      config: {
        max_tokens: 2048,
        temperature: 0.5,
        region: 'us-east-1',
      },
    },
    {
      id: 'bedrock:us.anthropic.claude-opus-4-20250514-v1:0',
      label: 'Bedrock: Claude 4 Opus',
      config: {
        max_tokens: 2048,
        temperature: 0.5,
        region: 'us-east-1',
      },
    },
    {
      id: 'bedrock:us.anthropic.claude-3-7-sonnet-20250219-v1:0',
      label: 'Bedrock: Claude 3.7 Sonnet',
      config: {
        max_tokens: 1024,
        temperature: 0.5,
        anthropic_version: 'bedrock-2023-05-31',
        region: 'us-east-1',
      },
    },
    {
      id: 'bedrock:us.anthropic.claude-3-5-sonnet-20241022-v2:0',
      label: 'Bedrock: Claude 3.5 Sonnet',
      config: {
        max_tokens: 1024,
        temperature: 0.5,
        anthropic_version: 'bedrock-2023-05-31',
        region: 'us-east-1',
      },
    },
    {
      id: 'bedrock:us.meta.llama3-2-3b-instruct-v1:0',
      label: 'Bedrock: Llama 3.2 (3B)',
      config: {
        temperature: 0.7,
        top_p: 0.9,
        max_new_tokens: 1024,
        region: 'us-east-1',
      },
    },
    {
      id: 'bedrock:us.meta.llama3-2-90b-instruct-v1:0',
      label: 'Bedrock: Llama 3.2 (90B)',
      config: {
        temperature: 0.7,
        top_p: 0.9,
        max_new_tokens: 1024,
        region: 'us-east-1',
      },
    },
    {
      id: 'bedrock:us.meta.llama4-maverick-17b-instruct-v1:0',
      label: 'Bedrock: Llama 4 Maverick (17B)',
      config: {
        temperature: 0.7,
        top_p: 0.9,
        max_new_tokens: 1024,
        region: 'us-east-1',
      },
    },
    {
      id: 'bedrock:us.meta.llama3-3-70b-instruct-v1:0',
      label: 'Bedrock: Llama 3.3 (70B)',
      config: {
        temperature: 0.7,
        top_p: 0.9,
        max_new_tokens: 1024,
        region: 'us-east-1',
      },
    },
    {
      id: 'bedrock:us.meta.llama3-3-8b-instruct-v1:0',
      label: 'Bedrock: Llama 3.3 (8B)',
      config: {
        temperature: 0.7,
        top_p: 0.9,
        max_new_tokens: 1024,
        region: 'us-east-1',
      },
    },
    {
      id: 'bedrock:us.amazon.nova-pro-v1:0',
      label: 'Bedrock: Amazon Titan Nova Pro',
      config: {
        max_tokens: 1024,
        temperature: 0.5,
        region: 'us-east-1',
      },
    },
    {
      id: 'bedrock:us.amazon.nova-lite-v1:0',
      label: 'Bedrock: Amazon Titan Nova Lite',
      config: {
        max_tokens: 1024,
        temperature: 0.5,
        region: 'us-east-1',
      },
    },
    {
      id: 'bedrock:us.amazon.nova-micro-v1:0',
      label: 'Bedrock: Amazon Titan Nova Micro',
      config: {
        max_tokens: 1024,
        temperature: 0.5,
        region: 'us-east-1',
      },
    },
    {
      id: 'bedrock:us.amazon.nova-sonic-v1:0',
      label: 'Bedrock: Amazon Nova Sonic',
      config: {
        inferenceConfiguration: {
          maxTokens: 1024,
          temperature: 0.7,
          topP: 0.95,
        },
        textOutputConfiguration: {
          mediaType: 'text/plain',
        },
        region: 'us-east-1',
      },
    },
    {
      id: 'bedrock-agent:YOUR_AGENT_ID',
      label: 'Bedrock: Agent',
      config: {
        agentId: 'YOUR_AGENT_ID',
        agentAliasId: 'YOUR_ALIAS_ID',
        region: 'us-east-1',
        enableTrace: false,
        temperature: 0.5,
      },
    },
  ])
  .concat([
    {
      id: 'azure:chat:gpt-5',
      label: 'Azure: GPT-5',
      config: {
        api_host: 'your-resource-name.openai.azure.com',
        api_version: '2025-08-07',
        temperature: 0.5,
        max_tokens: 1024,
      },
    },
    {
      id: 'azure:chat:gpt-5-mini',
      label: 'Azure: GPT-5 Mini',
      config: {
        api_host: 'your-resource-name.openai.azure.com',
        api_version: '2025-08-07',
        temperature: 0.5,
        max_tokens: 1024,
      },
    },
    {
      id: 'azure:chat:gpt-4o',
      label: 'Azure: GPT-4o',
      config: {
        api_host: 'your-resource-name.openai.azure.com',
        api_version: '2025-08-07',
        temperature: 0.5,
        max_tokens: 1024,
      },
    },
    {
      id: 'azure:chat:gpt-4o-mini',
      label: 'Azure: GPT-4o Mini',
      config: {
        api_host: 'your-resource-name.openai.azure.com',
        api_version: '2025-08-07',
        temperature: 0.5,
        max_tokens: 2048,
      },
    },
    {
      id: 'azure:chat:o4-mini',
      label: 'Azure: O4 Mini',
      config: {
        api_host: 'your-resource-name.openai.azure.com',
        api_version: '2024-05-15-preview',
        temperature: 0.5,
        max_tokens: 4096,
      },
    },
    {
      id: 'azure:chat:o3-mini',
      label: 'Azure: O3 Mini',
      config: {
        api_host: 'your-resource-name.openai.azure.com',
        api_version: '2024-05-15-preview',
        temperature: 0.5,
        max_tokens: 4096,
      },
    },
  ])
  .concat([
    {
      id: 'vertex:gemini-2.5-pro',
      label: 'Vertex: Gemini 2.5 Pro',
      config: {
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 1024,
          topP: 0.95,
          topK: 40,
        },
      },
    },
    {
      id: 'vertex:gemini-2.5-flash',
      label: 'Vertex: Gemini 2.5 Flash',
      config: {
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 1024,
          topP: 0.95,
          topK: 40,
        },
      },
    },
    {
      id: 'vertex:gemini-2.0-pro',
      label: 'Vertex: Gemini 2.0 Pro',
      config: {
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 1024,
          topP: 0.95,
          topK: 40,
        },
      },
    },
    {
      id: 'vertex:gemini-2.0-flash-001',
      label: 'Vertex: Gemini 2.0 Flash',
      config: {
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 1024,
          topP: 0.95,
          topK: 40,
        },
      },
    },
  ])
  .concat([
    {
      id: 'vertex:claude-sonnet-4-5@20250929',
      label: 'Vertex: Claude 4.5 Sonnet',
      config: {
        region: 'global',
        anthropic_version: 'vertex-2024-10-22',
        max_tokens: 2048,
        temperature: 0.5,
      },
    },
    {
      id: 'vertex:claude-sonnet-4@20250514',
      label: 'Vertex: Claude 4 Sonnet',
      config: {
        region: 'global',
        anthropic_version: 'vertex-2024-10-22',
        max_tokens: 2048,
        temperature: 0.5,
      },
    },
    {
      id: 'vertex:claude-opus-4-1@20250805',
      label: 'Vertex: Claude 4.1 Opus',
      config: {
        region: 'global',
        anthropic_version: 'vertex-2024-10-22',
        max_tokens: 2048,
        temperature: 0.5,
      },
    },
    {
      id: 'vertex:claude-opus-4@20250514',
      label: 'Vertex: Claude 4 Opus',
      config: {
        region: 'global',
        anthropic_version: 'vertex-2024-10-22',
        max_tokens: 2048,
        temperature: 0.5,
      },
    },
    {
      id: 'vertex:claude-3-5-sonnet-v2@20241022',
      label: 'Vertex: Claude 3.5 Sonnet',
      config: {
        region: 'us-east5',
        anthropic_version: 'vertex-2023-10-16',
        max_tokens: 1024,
        temperature: 0.5,
      },
    },
    {
      id: 'vertex:claude-4-5-haiku@20251001',
      label: 'Vertex: Claude 3.5 Haiku',
      config: {
        region: 'us-east5',
        anthropic_version: 'vertex-2023-10-16',
        max_tokens: 1024,
        temperature: 0.5,
      },
    },
    {
      id: 'vertex:claude-3-5-haiku@20241022',
      label: 'Vertex: Claude 3.5 Haiku',
      config: {
        region: 'us-east5',
        anthropic_version: 'vertex-2023-10-16',
        max_tokens: 1024,
        temperature: 0.5,
      },
    },
    {
      id: 'vertex:llama-3.3-70b-instruct-maas',
      label: 'Vertex: Llama 3.3 (70B)',
      config: {
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
          topP: 0.95,
          topK: 40,
        },
        region: 'us-central1', // Llama models are only available in this region
      },
    },
    {
      id: 'vertex:llama-3.3-8b-instruct-maas',
      label: 'Vertex: Llama 3.3 (8B)',
      config: {
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
          topP: 0.95,
          topK: 40,
        },
        region: 'us-central1', // Llama models are only available in this region
      },
    },
  ])
  .concat([
    {
      id: 'openrouter:anthropic/claude-sonnet-4-5-20250929',
      label: 'OpenRouter: Claude 4.5 Sonnet',
      config: {
        temperature: 0.7,
        max_tokens: 4096,
      },
    },
    {
      id: 'openrouter:anthropic/claude-sonnet-4-20250514',
      label: 'OpenRouter: Claude 4 Sonnet',
      config: {
        temperature: 0.7,
        max_tokens: 4096,
      },
    },
    {
      id: 'openrouter:anthropic/claude-opus-4-1-20250805',
      label: 'OpenRouter: Claude 4.1 Opus',
      config: {
        temperature: 0.7,
        max_tokens: 4096,
      },
    },
    {
      id: 'openrouter:anthropic/claude-opus-4-20250514',
      label: 'OpenRouter: Claude 4 Opus',
      config: {
        temperature: 0.7,
        max_tokens: 4096,
      },
    },
    {
      id: 'openrouter:anthropic/claude-3-5-sonnet',
      label: 'OpenRouter: Claude 3.5 Sonnet',
      config: {
        temperature: 0.7,
        max_tokens: 4096,
      },
    },
    {
      id: 'openrouter:meta-llama/llama-4-maverick',
      label: 'OpenRouter: Llama 4 Maverick',
      config: {
        temperature: 0.7,
        max_tokens: 4096,
      },
    },
    {
      id: 'openrouter:mistralai/mistral-large-2402',
      label: 'OpenRouter: Mistral Large',
      config: {
        temperature: 0.7,
        max_tokens: 4096,
      },
    },
    {
      id: 'openrouter:google/gemini-2.5-pro',
      label: 'OpenRouter: Gemini 2.5 Pro',
      config: {
        temperature: 0.7,
        max_tokens: 8192,
      },
    },
  ])
  .sort((a, b) => a.id.localeCompare(b.id));

const PROVIDER_GROUPS: Record<string, string> = {
  'openai:': 'OpenAI',
  'anthropic:': 'Anthropic',
  'bedrock:': 'Amazon Web Services',
  'bedrock-agent:': 'Amazon Web Services',
  'azure:': 'Azure',
  'openrouter:': 'OpenRouter',
  'replicate:': 'Replicate',
  'vertex:': 'Google Vertex AI',
};

const getProviderGroup = (option: string | ProviderOptions): string => {
  if (!option) {
    return 'Other';
  }

  let id = '';
  if (typeof option === 'string') {
    id = option;
  } else if (option && typeof option === 'object' && option.id) {
    id = option.id as string;
  }

  for (const prefix in PROVIDER_GROUPS) {
    if (id && typeof id === 'string' && id.indexOf(prefix) === 0) {
      return PROVIDER_GROUPS[prefix];
    }
  }

  return 'Other';
};

interface ProviderSelectorProps {
  providers: ProviderOptions[];
  onChange: (providers: ProviderOptions[]) => void;
}

const ProviderSelector = ({ providers, onChange }: ProviderSelectorProps) => {
  const { customProviders, addCustomProvider } = useProvidersStore();
  const [selectedProvider, setSelectedProvider] = React.useState<ProviderOptions | null>(null);
  const [isAddLocalDialogOpen, setIsAddLocalDialogOpen] = React.useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');

  const handleAddLocalProvider = (provider: ProviderOptions) => {
    addCustomProvider(provider);
    onChange([...providers, provider]);
  };

  const allProviders = React.useMemo(() => {
    return [...defaultProviders, ...customProviders];
  }, [customProviders]);

  const handleProviderClick = (provider: ProviderOptions | string) => {
    setSelectedProvider(typeof provider === 'string' ? { id: provider } : provider);
  };

  const handleSave = (providerId: string, config: Record<string, unknown>) => {
    onChange(providers.map((p) => (p.id === providerId ? { ...p, config } : p)));
    setSelectedProvider(null);
  };

  const getOptionLabel = (option: string | ProviderOptions): string => {
    if (!option) {
      return '';
    }

    if (typeof option === 'string') {
      return option;
    }

    if (typeof option === 'object' && option) {
      return option.label || option.id || '';
    }

    return '';
  };

  const getProviderId = (option: string | ProviderOptions): string => {
    if (!option) {
      return '';
    }

    if (typeof option === 'string') {
      return option;
    }

    if (typeof option === 'object' && option) {
      return option.id || '';
    }

    return '';
  };

  const handleSelectProvider = (provider: ProviderOptions) => {
    const exists = providers.some((p) => getProviderId(p) === getProviderId(provider));
    if (!exists) {
      onChange([...providers, provider]);
    }
    setSearchQuery('');
  };

  const handleRemoveProvider = (index: number) => {
    onChange(providers.filter((_, i) => i !== index));
  };

  const handleAddCustomProvider = () => {
    if (searchQuery.trim()) {
      const customProvider: ProviderOptions = { id: searchQuery.trim() };
      onChange([...providers, customProvider]);
      setSearchQuery('');
      setIsDropdownOpen(false);
    }
  };

  // Filter and group providers
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  const filteredProviders = React.useMemo(() => {
    const query = searchQuery.toLowerCase();
    return allProviders.filter((provider) => {
      const label = getOptionLabel(provider).toLowerCase();
      const id = getProviderId(provider).toLowerCase();
      const isSelected = providers.some((p) => getProviderId(p) === getProviderId(provider));
      return !isSelected && (label.includes(query) || id.includes(query));
    });
  }, [allProviders, searchQuery, providers]);

  const groupedProviders = React.useMemo(() => {
    const groups: Record<string, ProviderOptions[]> = {};
    for (const provider of filteredProviders) {
      const group = getProviderGroup(provider);
      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group].push(provider);
    }
    return groups;
  }, [filteredProviders]);

  const groupOrder = [
    'OpenAI',
    'Anthropic',
    'Amazon Web Services',
    'Azure',
    'Google Vertex AI',
    'OpenRouter',
    'Replicate',
    'Other',
  ];

  return (
    <div className="mt-4 space-y-4">
      <div className="flex gap-3 items-start">
        {/* Provider selector with popover */}
        <Popover open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
          <PopoverTrigger asChild>
            <div
              className={cn(
                'flex-1 min-h-14 rounded-md border border-input bg-background px-3 py-2 cursor-text',
                'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
              )}
              onClick={() => setIsDropdownOpen(true)}
            >
              {/* Selected providers as badges */}
              <div className="flex flex-wrap gap-2 mb-2">
                {providers.map((provider, index) => {
                  const label = getOptionLabel(provider);
                  const id = getProviderId(provider);
                  return (
                    <Tooltip key={id + index}>
                      <TooltipTrigger asChild>
                        <Badge
                          variant="outline"
                          className="cursor-pointer hover:bg-muted/50 transition-colors pr-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleProviderClick(provider);
                          }}
                        >
                          <span className="truncate max-w-[200px]">{label}</span>
                          <button
                            type="button"
                            className="ml-1 p-0.5 rounded-full hover:bg-muted"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveProvider(index);
                            }}
                          >
                            <XIcon className="size-3" />
                          </button>
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>{id}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>

              {/* Search input */}
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Select LLM providers"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && searchQuery.trim()) {
                      e.preventDefault();
                      handleAddCustomProvider();
                    }
                  }}
                  className="border-0 p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0"
                  onClick={(e) => e.stopPropagation()}
                />
                <ChevronDownIcon className="size-4 text-muted-foreground shrink-0" />
              </div>
            </div>
          </PopoverTrigger>

          <PopoverContent
            className="w-[var(--radix-popover-trigger-width)] p-0 max-h-[400px] overflow-y-auto"
            align="start"
          >
            {/* Custom provider option when typing */}
            {searchQuery.trim() && (
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors border-b border-border"
                onClick={handleAddCustomProvider}
              >
                <span className="text-muted-foreground">Add custom: </span>
                <span className="font-mono">{searchQuery}</span>
              </button>
            )}

            {/* Grouped providers */}
            {groupOrder.map((group) => {
              const groupProviders = groupedProviders[group];
              if (!groupProviders || groupProviders.length === 0) {
                return null;
              }

              return (
                <div key={group}>
                  <div className="px-3 py-2 text-xs font-semibold text-muted-foreground bg-muted/50 sticky top-0">
                    {group}
                  </div>
                  {groupProviders.map((provider) => {
                    const label = getOptionLabel(provider);
                    const id = getProviderId(provider);
                    return (
                      <button
                        key={id}
                        type="button"
                        className="w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                        onClick={() => handleSelectProvider(provider)}
                      >
                        <div className="text-sm">{label}</div>
                        <div className="text-xs text-muted-foreground font-mono truncate">{id}</div>
                      </button>
                    );
                  })}
                </div>
              );
            })}

            {filteredProviders.length === 0 && !searchQuery.trim() && (
              <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                No more providers available
              </div>
            )}
          </PopoverContent>
        </Popover>

        {/* Local provider button */}
        <Button
          variant="outline"
          onClick={() => setIsAddLocalDialogOpen(true)}
          className="h-14 whitespace-nowrap px-4"
        >
          <FolderOpenIcon className="size-4 mr-2" />
          Reference Local Provider
        </Button>
      </div>

      {/* Helper text */}
      <p className="text-sm text-muted-foreground">
        {providers.length > 0
          ? 'Click a provider to configure its settings. Hover over badges to see model IDs.'
          : 'Select LLM providers from the dropdown or type to search'}
      </p>

      <AddLocalProviderDialog
        open={isAddLocalDialogOpen}
        onClose={() => setIsAddLocalDialogOpen(false)}
        onAdd={handleAddLocalProvider}
      />
      {selectedProvider && selectedProvider.id && (
        <ProviderConfigDialog
          open={!!selectedProvider}
          providerId={selectedProvider.id}
          config={selectedProvider.config as Record<string, unknown>}
          onClose={() => setSelectedProvider(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
};

export default ProviderSelector;
