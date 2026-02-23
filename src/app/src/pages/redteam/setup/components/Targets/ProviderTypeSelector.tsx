import { Fragment, useState } from 'react';

import { Button } from '@app/components/ui/button';
import { Input } from '@app/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { cn } from '@app/lib/utils';
import { CheckCircle, Edit, HelpCircle, Search, X } from 'lucide-react';
import { DEFAULT_WEBSOCKET_TIMEOUT_MS, DEFAULT_WEBSOCKET_TRANSFORM_RESPONSE } from './consts';
import { getProviderDocumentationUrl, hasSpecificDocumentation } from './providerDocumentationMap';

import type { ProviderOptions } from '../../types';

// Priority order for the most important providers (shown first in this exact order)
const priorityOrder = [
  // Most common ways to test your own application
  'http',
  'python',
  'javascript',
  // Most popular AI providers (direct API access)
  'openai',
  'anthropic',
  'google',
];

// Provider options organized by user intent
// Tags: 'app' (My Application), 'agents' (Agent Frameworks), 'providers' (AI Providers), 'local' (Local Models)
const allProviderOptions = [
  // ============================================
  // MY APPLICATION - Test your own app/API
  // ============================================
  {
    value: 'http',
    label: 'HTTP/HTTPS Endpoint',
    description: 'Connect to your REST API or HTTP endpoint',
    tag: 'app',
    recommended: true,
  },
  {
    value: 'websocket',
    label: 'WebSocket',
    description: 'Real-time WebSocket connections',
    tag: 'app',
  },
  {
    value: 'python',
    label: 'Python',
    description: 'Custom Python script or integration',
    tag: 'app',
    recommended: true,
  },
  {
    value: 'javascript',
    label: 'JavaScript / TypeScript',
    description: 'Custom JS/TS script or integration',
    tag: 'app',
    recommended: true,
  },
  {
    value: 'go',
    label: 'Go',
    description: 'Custom Go integration',
    tag: 'app',
  },
  {
    value: 'exec',
    label: 'Shell Command',
    description: 'Execute shell scripts or CLI commands',
    tag: 'app',
  },
  {
    value: 'browser',
    label: 'Browser Automation',
    description: 'Test web apps via browser automation',
    tag: 'app',
  },
  {
    value: 'custom',
    label: 'Custom Provider',
    description: 'Other custom providers and implementations',
    tag: 'app',
    last: true,
  },

  // ============================================
  // AGENT FRAMEWORKS - Popular agent SDKs
  // ============================================
  {
    value: 'claude-agent-sdk',
    label: 'Claude Agent SDK',
    description: "Anthropic's official SDK for building agents",
    tag: 'agents',
    recommended: true,
  },
  {
    value: 'openai-agents-sdk',
    label: 'OpenAI Agents SDK',
    description: "OpenAI's official agent framework",
    tag: 'agents',
    recommended: true,
  },
  {
    value: 'langchain',
    label: 'LangChain',
    description: 'Popular framework for LLM applications',
    tag: 'agents',
  },
  {
    value: 'langgraph',
    label: 'LangGraph',
    description: 'Stateful, multi-actor agent applications',
    tag: 'agents',
  },
  {
    value: 'crewai',
    label: 'CrewAI',
    description: 'Multi-agent orchestration framework',
    tag: 'agents',
  },
  {
    value: 'autogen',
    label: 'AutoGen',
    description: "Microsoft's multi-agent framework",
    tag: 'agents',
  },
  {
    value: 'pydantic-ai',
    label: 'PydanticAI',
    description: 'Type-safe agents with structured outputs',
    tag: 'agents',
  },
  {
    value: 'llamaindex',
    label: 'LlamaIndex',
    description: 'RAG and data framework for LLM apps',
    tag: 'agents',
  },
  {
    value: 'google-adk',
    label: 'Google ADK',
    description: 'Google AI Development Kit',
    tag: 'agents',
  },
  {
    value: 'bedrock-agent',
    label: 'AWS Bedrock Agents',
    description: "Amazon's agent orchestration service",
    tag: 'agents',
  },
  {
    value: 'mcp',
    label: 'MCP Server',
    description: 'Model Context Protocol for tool use',
    tag: 'agents',
  },
  {
    value: 'generic-agent',
    label: 'Other Agent Framework',
    description: 'Any other agent framework via custom provider',
    tag: 'agents',
    last: true,
  },

  // ============================================
  // AI PROVIDERS - Hosted AI services
  // ============================================
  // Major Model Providers
  {
    value: 'openai',
    label: 'OpenAI',
    description: 'GPT-5.2, GPT-5.1, and GPT-5 models',
    tag: 'providers',
    recommended: true,
  },
  {
    value: 'anthropic',
    label: 'Anthropic',
    description: 'Claude Sonnet, Opus, and Haiku models',
    tag: 'providers',
    recommended: true,
  },
  {
    value: 'google',
    label: 'Google AI Studio',
    description: 'Gemini models via Google AI',
    tag: 'providers',
    recommended: true,
  },
  {
    value: 'mistral',
    label: 'Mistral AI',
    description: 'Mistral and Mixtral models',
    tag: 'providers',
  },
  {
    value: 'deepseek',
    label: 'DeepSeek',
    description: 'DeepSeek-V3 and R1 models',
    tag: 'providers',
  },
  {
    value: 'cohere',
    label: 'Cohere',
    description: 'Command and embedding models',
    tag: 'providers',
  },
  {
    value: 'ai21',
    label: 'AI21 Labs',
    description: 'Jamba and Jurassic models',
    tag: 'providers',
  },
  {
    value: 'xai',
    label: 'X.AI (Grok)',
    description: 'Grok models from X.AI',
    tag: 'providers',
  },
  {
    value: 'perplexity',
    label: 'Perplexity AI',
    description: 'Search-augmented AI with citations',
    tag: 'providers',
  },
  // Cloud Platforms
  {
    value: 'azure',
    label: 'Azure OpenAI',
    description: 'OpenAI models on Azure',
    tag: 'providers',
  },
  {
    value: 'vertex',
    label: 'Google Vertex AI',
    description: 'Gemini on Google Cloud',
    tag: 'providers',
  },
  {
    value: 'bedrock',
    label: 'AWS Bedrock',
    description: 'Multiple models on AWS',
    tag: 'providers',
  },
  {
    value: 'sagemaker',
    label: 'Amazon SageMaker',
    description: 'Custom model endpoints on AWS',
    tag: 'providers',
  },
  // Inference APIs & Routers
  {
    value: 'groq',
    label: 'Groq',
    description: 'Ultra-fast inference API',
    tag: 'providers',
  },
  {
    value: 'openrouter',
    label: 'OpenRouter',
    description: 'Unified API for 200+ models',
    tag: 'providers',
  },
  {
    value: 'fireworks',
    label: 'Fireworks AI',
    description: 'Fast inference for open models',
    tag: 'providers',
  },
  {
    value: 'together',
    label: 'Together AI',
    description: 'Open-source model inference',
    tag: 'providers',
  },
  {
    value: 'cerebras',
    label: 'Cerebras',
    description: 'High-speed Llama inference',
    tag: 'providers',
  },
  {
    value: 'hyperbolic',
    label: 'Hyperbolic',
    description: 'Fast open model inference',
    tag: 'providers',
  },
  {
    value: 'aimlapi',
    label: 'AI/ML API',
    description: 'Access 300+ AI models',
    tag: 'providers',
  },
  // Other Cloud Services
  {
    value: 'huggingface',
    label: 'Hugging Face',
    description: 'Inference API for thousands of models',
    tag: 'providers',
  },
  {
    value: 'github',
    label: 'GitHub Models',
    description: 'AI models via GitHub',
    tag: 'providers',
  },
  {
    value: 'cloudflare-ai',
    label: 'Cloudflare AI',
    description: 'Edge AI inference',
    tag: 'providers',
  },
  {
    value: 'databricks',
    label: 'Databricks',
    description: 'Foundation Model APIs',
    tag: 'providers',
  },
  {
    value: 'replicate',
    label: 'Replicate',
    description: 'Run open-source models',
    tag: 'providers',
  },
  // Specialized
  {
    value: 'fal',
    label: 'fal.ai',
    description: 'Image generation models',
    tag: 'providers',
  },
  {
    value: 'voyage',
    label: 'Voyage AI',
    description: 'Embedding models',
    tag: 'providers',
  },

  // ============================================
  // LOCAL MODELS - Self-hosted inference
  // ============================================
  {
    value: 'ollama',
    label: 'Ollama',
    description: 'Easy local model runner',
    tag: 'local',
    recommended: true,
  },
  {
    value: 'vllm',
    label: 'vLLM',
    description: 'High-performance inference server',
    tag: 'local',
  },
  {
    value: 'llama.cpp',
    label: 'llama.cpp',
    description: 'Lightweight CPU/GPU inference',
    tag: 'local',
  },
  {
    value: 'localai',
    label: 'LocalAI',
    description: 'OpenAI-compatible local API',
    tag: 'local',
  },
  {
    value: 'llamafile',
    label: 'Llamafile',
    description: 'Single-file executable models',
    tag: 'local',
  },
  {
    value: 'text-generation-webui',
    label: 'Text Generation WebUI',
    description: 'Gradio-based model interface',
    tag: 'local',
  },
].sort((a, b) => {
  // Items marked as 'last' always go to the end
  if (a.last) {
    return 1;
  }
  if (b.last) {
    return -1;
  }

  // Priority providers come first in the defined order
  const aPriority = priorityOrder.indexOf(a.value);
  const bPriority = priorityOrder.indexOf(b.value);

  if (aPriority !== -1 && bPriority !== -1) {
    return aPriority - bPriority;
  }
  if (aPriority !== -1) {
    return -1;
  }
  if (bPriority !== -1) {
    return 1;
  }

  // Popular items come next
  if (a.recommended && !b.recommended) {
    return -1;
  }
  if (!a.recommended && b.recommended) {
    return 1;
  }

  // Otherwise sort alphabetically
  return a.label.localeCompare(b.label);
});

interface ProviderTypeSelectorProps {
  provider: ProviderOptions | undefined;
  setProvider: (provider: ProviderOptions, providerType: string) => void;
  availableProviderIds?: string[];
  disableModelSelection?: boolean;
  providerType?: string;
}

export default function ProviderTypeSelector({
  provider,
  providerType,
  setProvider,
  availableProviderIds,
}: ProviderTypeSelectorProps) {
  const { recordEvent } = useTelemetry();

  const [selectedProviderType, setSelectedProviderType] = useState<string | undefined>(
    providerType,
  );
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<string | undefined>();
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  // Tag filter options - 4 categories based on user intent
  type TagKey = 'app' | 'agents' | 'providers' | 'local';
  const tagFilters: Array<{ key: TagKey; label: string }> = [
    { key: 'app', label: 'My Application' },
    { key: 'agents', label: 'Agent Frameworks' },
    { key: 'providers', label: 'AI Providers' },
    { key: 'local', label: 'Local Models' },
  ];

  // Handle tag filter toggle
  const handleTagToggle = (tag: string) => {
    setSelectedTag(tag);

    // Track tag filter usage
    recordEvent('feature_used', {
      feature: 'redteam_provider_tag_filtered',
      tag: tag,
    });
  };

  // Map of provider type to default provider ID
  const PROVIDER_DEFAULT_IDS: Record<string, string> = {
    javascript: 'file:///path/to/custom_provider.js',
    python: 'file:///path/to/custom_provider.py',
    http: 'http',
    websocket: 'websocket',
    browser: 'browser',
    openai: 'openai:gpt-5.2',
    anthropic: 'anthropic:messages:claude-sonnet-4-5-20250929',
    azure: 'azure:chat:your-deployment-name',
    google: 'google:gemini-2.5-pro',
    vertex: 'vertex:gemini-2.5-pro',
    mistral: 'mistral:mistral-large-latest',
    cohere: 'cohere:command-r-plus',
    groq: 'groq:llama-3.1-70b-versatile',
    deepseek: 'deepseek:deepseek-chat',
    openrouter: 'openrouter:openai/gpt-4o',
    bedrock: 'bedrock:anthropic.claude-3-5-sonnet-20241022-v2:0',
    'bedrock-agent': 'bedrock:agent:your-agent-id',
    sagemaker: 'sagemaker:your-endpoint-name',
    huggingface: 'huggingface:meta-llama/Meta-Llama-3-70B-Instruct',
    ollama: 'ollama:llama3',
    'llama.cpp': 'llama.cpp:http://localhost:8080/completion',
    llamafile: 'llamafile:http://localhost:8080/v1/chat/completions',
    localai: 'localai:gpt-4',
    vllm: 'vllm:http://localhost:8000/v1',
    'text-generation-webui': 'text-generation-webui:http://localhost:5000',
    perplexity: 'perplexity:sonar',
    xai: 'xai:grok-2-1212',
    ai21: 'ai21:jamba-1.5-large',
    voyage: 'voyage:voyage-3',
    'cloudflare-ai': 'cloudflare-ai:@cf/meta/llama-3-8b-instruct',
    databricks: 'databricks:databricks-meta-llama-3-1-70b-instruct',
    fal: 'fal:fal-ai/flux/dev',
    github: 'github:gpt-4o',
    hyperbolic: 'hyperbolic:meta-llama/Meta-Llama-3.1-70B-Instruct',
    mcp: 'mcp',
    aimlapi: 'aimlapi:gpt-4o',
    exec: 'exec:/path/to/script.sh',
    helicone: 'helicone:openai/gpt-4.1',
    jfrog: 'jfrog:llama_3_8b_instruct',
    go: 'file:///path/to/your/script.go',
    langchain: 'file:///path/to/langchain_agent.py',
    autogen: 'file:///path/to/autogen_agent.py',
    crewai: 'file:///path/to/crewai_agent.py',
    llamaindex: 'file:///path/to/llamaindex_agent.py',
    langgraph: 'file:///path/to/langgraph_agent.py',
    'openai-agents-sdk': 'file:///path/to/openai_agents.py',
    'pydantic-ai': 'file:///path/to/pydantic_ai_agent.py',
    'google-adk': 'file:///path/to/google_adk_agent.py',
    'claude-agent-sdk': 'file:///path/to/claude_agent.py',
    fireworks: 'fireworks:accounts/fireworks/models/llama-v3p1-70b-instruct',
    together: 'together:meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    cerebras: 'cerebras:llama3.1-70b',
    replicate: 'replicate:meta/meta-llama-3-70b-instruct',
    'generic-agent': 'file:///path/to/custom_agent.py',
    custom: '',
  };

  // Build the provider config for a given type and label
  const buildProviderConfig = (
    value: string,
    currentLabel: string | undefined,
  ): { provider: ProviderOptions; type: string } => {
    if (value === 'http') {
      return {
        provider: {
          id: 'http',
          label: currentLabel,
          config: {
            url: '',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: '{{prompt}}' }),
            stateful: true,
          },
        },
        type: 'http',
      };
    }

    if (value === 'websocket') {
      return {
        provider: {
          id: 'websocket',
          label: currentLabel,
          config: {
            type: 'websocket',
            url: 'wss://example.com/ws',
            messageTemplate: '{"message": {{prompt | dump}}}',
            transformResponse: DEFAULT_WEBSOCKET_TRANSFORM_RESPONSE,
            timeoutMs: DEFAULT_WEBSOCKET_TIMEOUT_MS,
            stateful: true,
          },
        },
        type: 'websocket',
      };
    }

    if (value === 'browser') {
      return {
        provider: {
          id: 'browser',
          label: currentLabel,
          config: {
            steps: [{ action: 'navigate', args: { url: 'https://example.com' } }],
          },
        },
        type: 'browser',
      };
    }

    if (value === 'mcp') {
      return {
        provider: {
          id: 'mcp',
          label: currentLabel,
          config: { enabled: true, verbose: false },
        },
        type: 'mcp',
      };
    }

    const defaultId = PROVIDER_DEFAULT_IDS[value] ?? value;
    return {
      provider: { id: defaultId, config: {}, label: currentLabel },
      type: value,
    };
  };

  // Handle provider type selection
  const handleProviderTypeSelect = (value: string) => {
    setSelectedProviderType(value);

    const currentLabel = provider?.label;

    // Find the selected option to get its details
    const selectedOption = allProviderOptions.find((option) => option.value === value);

    // Track provider type selection
    recordEvent('feature_used', {
      feature: 'redteam_provider_type_selected',
      provider_type: value,
      provider_label: selectedOption?.label,
      provider_tag: selectedOption?.tag,
    });

    const { provider: newProvider, type } = buildProviderConfig(value, currentLabel);
    setProvider(newProvider, type);
  };

  // Handle edit/change button click
  const handleEditSelection = () => {
    setIsExpanded(true);
    setSearchTerm(''); // Clear search when expanding
    setSelectedTag(undefined); // Clear tag filter when expanding

    // Track when user changes their provider selection
    recordEvent('feature_used', {
      feature: 'redteam_provider_selection_changed',
      previous_provider_type: selectedProviderType,
    });
  };

  // Filter available options if availableProviderIds is provided, by search term, and by tag
  const filteredProviderOptions = allProviderOptions.filter((option) => {
    // Filter by availableProviderIds if provided
    const isAvailable = !availableProviderIds || availableProviderIds.includes(option.value);

    // Filter by search term if provided
    const matchesSearch =
      !searchTerm ||
      option.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      option.description.toLowerCase().includes(searchTerm.toLowerCase());

    // Filter by selected tag if provided
    const matchesTag = !selectedTag || option.tag === selectedTag;

    return isAvailable && matchesSearch && matchesTag;
  });

  // Get the selected provider option for collapsed view
  const selectedOption = selectedProviderType
    ? allProviderOptions.find((option) => option.value === selectedProviderType)
    : undefined;

  // Show collapsed view when a provider is selected and not in expanded mode
  if (selectedOption && !isExpanded) {
    return (
      <div>
        <div className="flex w-full items-center rounded-lg border-2 border-primary bg-primary/5 p-4">
          <CheckCircle className="mr-4 size-5 shrink-0 text-primary" />

          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <p className="font-semibold text-primary">{selectedOption.label}</p>
              {selectedOption.recommended && (
                <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">
                  Popular
                </span>
              )}
            </div>
            <p className="overflow-hidden text-ellipsis text-sm text-muted-foreground">
              {selectedOption.description}
            </p>
          </div>

          <div className="ml-4 flex shrink-0 items-center">
            {/* Documentation link */}
            {hasSpecificDocumentation(selectedOption.value) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={getProviderDocumentationUrl(selectedOption.value)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mr-2 text-muted-foreground hover:text-foreground"
                  >
                    <HelpCircle className="size-4" />
                  </a>
                </TooltipTrigger>
                <TooltipContent>View {selectedOption.label} documentation</TooltipContent>
              </Tooltip>
            )}

            <Button variant="outline" size="sm" onClick={handleEditSelection}>
              <Edit className="mr-1 size-4" />
              Change
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Calculate counts for each tag
  const getTagCount = (tagKey: TagKey | undefined) => {
    if (tagKey === undefined) {
      return allProviderOptions.filter(
        (opt) => !availableProviderIds || availableProviderIds.includes(opt.value),
      ).length;
    }
    return allProviderOptions.filter(
      (opt) =>
        opt.tag === tagKey && (!availableProviderIds || availableProviderIds.includes(opt.value)),
    ).length;
  };

  // Show expanded view (original full list)
  return (
    <div className="space-y-4">
      {/* Filter bar - chips on left, search on right */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedTag(undefined)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              selectedTag === undefined
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground',
            )}
          >
            All ({getTagCount(undefined)})
          </button>
          {tagFilters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => handleTagToggle(filter.key)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                selectedTag === filter.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground',
              )}
            >
              {filter.label} ({getTagCount(filter.key)})
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-64 shrink-0">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search providers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-9"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* Provider list */}
      <div className="space-y-2">
        {filteredProviderOptions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No providers found matching your search.
            </p>
          </div>
        ) : (
          filteredProviderOptions.map((option, index) => {
            // Check if we need to show a divider before this option
            const tier2Providers = ['openai', 'google', 'anthropic', 'openrouter'];
            const showDivider =
              index > 0 &&
              tier2Providers.includes(filteredProviderOptions[index - 1].value) &&
              !tier2Providers.includes(option.value);
            const isSelected = selectedProviderType === option.value;

            return (
              <Fragment key={option.value}>
                {showDivider && (
                  <div className="py-2">
                    <div className="h-px w-full bg-border" />
                  </div>
                )}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleProviderTypeSelect(option.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleProviderTypeSelect(option.value);
                    }
                  }}
                  className={cn(
                    'flex w-full cursor-pointer items-center rounded-lg border p-4 transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    isSelected
                      ? 'border-2 border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/50',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <p
                        className={cn(
                          isSelected ? 'font-semibold text-primary' : 'font-medium text-foreground',
                        )}
                      >
                        {option.label}
                      </p>
                      {option.recommended && (
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">
                          Popular
                        </span>
                      )}
                    </div>
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {option.description}
                    </p>
                  </div>

                  <div className="ml-4 flex shrink-0 items-center gap-2">
                    {/* Documentation link */}
                    {hasSpecificDocumentation(option.value) && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a
                            href={getProviderDocumentationUrl(option.value)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <HelpCircle className="size-4" />
                          </a>
                        </TooltipTrigger>
                        <TooltipContent>View {option.label} documentation</TooltipContent>
                      </Tooltip>
                    )}

                    {isSelected && <CheckCircle className="size-5 text-primary" />}
                  </div>
                </div>
              </Fragment>
            );
          })
        )}
      </div>
    </div>
  );
}
