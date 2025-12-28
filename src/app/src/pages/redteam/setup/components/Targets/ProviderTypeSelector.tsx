import { useEffect, useState } from 'react';

import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import { Input } from '@app/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { cn } from '@app/lib/utils';
import { CheckCircle, Edit, HelpCircle, Search } from 'lucide-react';
import { DEFAULT_WEBSOCKET_TIMEOUT_MS } from './consts';
import { getProviderDocumentationUrl, hasSpecificDocumentation } from './providerDocumentationMap';

import type { ProviderOptions } from '../../types';

// Flattened provider options with tag information
const allProviderOptions = [
  // Agentic Frameworks
  {
    value: 'langchain',
    label: 'LangChain',
    description: 'Framework for developing applications powered by language models',
    tag: 'agents',
  },
  {
    value: 'autogen',
    label: 'AutoGen',
    description: 'Multi-agent collaborative framework from Microsoft',
    tag: 'agents',
  },
  {
    value: 'crewai',
    label: 'CrewAI',
    description: 'Framework for orchestrating role-playing autonomous AI agents',
    tag: 'agents',
  },
  {
    value: 'llamaindex',
    label: 'LlamaIndex',
    description: 'Data framework for LLM applications with RAG capabilities',
    tag: 'agents',
  },
  {
    value: 'langgraph',
    label: 'LangGraph',
    description: 'Build stateful, multi-actor applications with LLMs',
    tag: 'agents',
  },
  {
    value: 'openai-agents-sdk',
    label: 'OpenAI Agents SDK',
    description: 'Official OpenAI SDK for building AI agents',
    tag: 'agents',
  },
  {
    value: 'pydantic-ai',
    label: 'PydanticAI',
    description: 'Type-safe AI agents with structured outputs using Pydantic',
    tag: 'agents',
  },
  {
    value: 'google-adk',
    label: 'Google ADK',
    description: 'Google AI Development Kit for building agents',
    tag: 'agents',
  },
  {
    value: 'generic-agent',
    label: 'Other Agent',
    description:
      'Any agent framework - Promptfoo is fully customizable and supports all agent frameworks',
    tag: 'agents',
    last: true,
  },

  // AI/ML API
  {
    value: 'aimlapi',
    label: 'AI/ML API',
    description: 'Access 300+ AI models with a single API',
    tag: 'specialized',
  },
  // AI21 Labs
  {
    value: 'ai21',
    label: 'AI21 Labs',
    description: 'Jurassic and Jamba models',
    tag: 'specialized',
  },
  // Amazon SageMaker
  {
    value: 'sagemaker',
    label: 'Amazon SageMaker',
    description: 'Models deployed on SageMaker endpoints',
    tag: 'cloud',
  },
  // Anthropic
  {
    value: 'anthropic',
    label: 'Anthropic',
    description: 'Claude models including Claude Sonnet 4',
    tag: 'model',
  },
  // AWS Bedrock
  {
    value: 'bedrock',
    label: 'AWS Bedrock',
    description: 'AWS-hosted models from various providers',
    tag: 'cloud',
  },
  // AWS Bedrock Agents
  {
    value: 'bedrock-agent',
    label: 'AWS Bedrock Agents',
    description: 'Amazon Bedrock Agents for orchestrating AI workflows',
    tag: 'agents',
  },
  // Azure OpenAI
  {
    value: 'azure',
    label: 'Azure OpenAI',
    description: 'Azure-hosted OpenAI models',
    tag: 'model',
  },
  // Cloudflare AI
  {
    value: 'cloudflare-ai',
    label: 'Cloudflare AI',
    description: "Cloudflare's OpenAI-compatible AI platform",
    tag: 'cloud',
  },
  // Custom Provider
  {
    value: 'custom',
    label: 'Custom Provider',
    description: 'Other custom providers and implementations',
    tag: 'custom',
  },
  // Databricks
  {
    value: 'databricks',
    label: 'Databricks',
    description: 'Databricks Foundation Model APIs',
    tag: 'cloud',
  },
  // DeepSeek
  {
    value: 'deepseek',
    label: 'DeepSeek',
    description: "DeepSeek's language models including R1",
    tag: 'model',
  },
  // fal.ai
  {
    value: 'fal',
    label: 'fal.ai',
    description: 'Image generation and specialized AI models',
    tag: 'specialized',
  },
  // GitHub Models
  {
    value: 'github',
    label: 'GitHub Models',
    description: "GitHub's hosted models from multiple providers",
    tag: 'specialized',
  },
  // Go Provider
  {
    value: 'go',
    label: 'Go Provider',
    description: 'Custom Go provider for specialized integrations',
    tag: 'custom',
  },
  // Google AI Studio
  {
    value: 'google',
    label: 'Google AI Studio',
    description: 'Gemini models and Live API',
    tag: 'model',
  },
  // Google Vertex AI
  {
    value: 'vertex',
    label: 'Google Vertex AI',
    description: "Google Cloud's AI platform with Gemini models",
    tag: 'model',
  },
  // Groq
  {
    value: 'groq',
    label: 'Groq',
    description: 'High-performance inference API',
    tag: 'model',
  },
  // Helicone AI Gateway
  {
    value: 'helicone',
    label: 'Helicone AI Gateway',
    description: 'Self-hosted AI gateway for unified provider access',
    tag: 'cloud',
  },
  // HTTP/HTTPS Endpoint
  {
    value: 'http',
    label: 'HTTP/HTTPS Endpoint',
    description: 'Connect to REST APIs and HTTP endpoints',
    tag: 'endpoint',
    recommended: true,
  },
  // Hugging Face
  {
    value: 'huggingface',
    label: 'Hugging Face',
    description: 'Access thousands of models',
    tag: 'cloud',
  },
  // Hyperbolic
  {
    value: 'hyperbolic',
    label: 'Hyperbolic',
    description: 'OpenAI-compatible Llama 3 provider',
    tag: 'specialized',
  },
  // JavaScript Provider
  {
    value: 'javascript',
    label: 'JavaScript Provider',
    description: 'Custom JS provider for specialized integrations',
    tag: 'custom',
    recommended: true,
  },
  // JFrog ML
  {
    value: 'jfrog',
    label: 'JFrog ML',
    description: "JFrog's LLM Model Library",
    tag: 'cloud',
  },
  // llama.cpp
  {
    value: 'llama.cpp',
    label: 'llama.cpp',
    description: 'Lightweight local model inference',
    tag: 'local',
  },
  // Llamafile
  {
    value: 'llamafile',
    label: 'Llamafile',
    description: 'Single-file local model server',
    tag: 'local',
  },
  // LocalAI
  {
    value: 'localai',
    label: 'LocalAI',
    description: 'Local OpenAI-compatible API',
    tag: 'local',
  },
  // MCP Server
  {
    value: 'mcp',
    label: 'MCP Server',
    description: 'Connect to Model Context Protocol (MCP) servers for direct tool red teaming',
    tag: 'custom',
  },
  // Mistral AI
  {
    value: 'mistral',
    label: 'Mistral AI',
    description: "Mistral's language models including Magistral",
    tag: 'model',
  },
  // Ollama
  {
    value: 'ollama',
    label: 'Ollama',
    description: 'Local model runner with easy setup',
    tag: 'local',
  },
  // OpenAI
  {
    value: 'openai',
    label: 'OpenAI',
    description: 'GPT models including GPT-4.1 and reasoning models',
    tag: 'model',
  },
  // OpenRouter
  {
    value: 'openrouter',
    label: 'OpenRouter',
    description: 'Access hundreds of top AI models through a single API',
    tag: 'specialized',
  },
  // Perplexity AI
  {
    value: 'perplexity',
    label: 'Perplexity AI',
    description: 'Search-augmented chat with citations',
    tag: 'model',
  },
  // Python Provider
  {
    value: 'python',
    label: 'Python Provider',
    description: 'Custom Python provider for specialized integrations',
    tag: 'custom',
    recommended: true,
  },
  // Shell Command
  {
    value: 'exec',
    label: 'Shell Command',
    description: 'Execute custom scripts and commands',
    tag: 'custom',
  },
  // Text Generation WebUI
  {
    value: 'text-generation-webui',
    label: 'Text Generation WebUI',
    description: 'Gradio-based local model interface',
    tag: 'local',
  },
  // vLLM
  {
    value: 'vllm',
    label: 'vLLM',
    description: 'High-performance local inference server',
    tag: 'local',
  },
  // Voyage AI
  {
    value: 'voyage',
    label: 'Voyage AI',
    description: 'Specialized embedding models',
    tag: 'specialized',
  },
  // Web Browser
  {
    value: 'browser',
    label: 'Web Browser',
    description: 'Automate web browser interactions for testing',
    tag: 'custom',
  },
  // WebSocket Endpoint
  {
    value: 'websocket',
    label: 'WebSocket Endpoint',
    description: 'Real-time communication with WebSocket APIs',
    tag: 'endpoint',
  },
  // X.AI (Grok)
  {
    value: 'xai',
    label: 'X.AI (Grok)',
    description: "X.AI's Grok models",
    tag: 'model',
  },
].sort((a, b) => {
  // Define priority tiers
  const tier1Providers = ['http', 'python', 'javascript']; // Custom/endpoint options
  const tier2Providers = ['openai', 'google', 'anthropic', 'openrouter']; // Popular foundation models

  const aIsTier1 = tier1Providers.includes(a.value);
  const bIsTier1 = tier1Providers.includes(b.value);
  const aIsTier2 = tier2Providers.includes(a.value);
  const bIsTier2 = tier2Providers.includes(b.value);

  // Items marked as 'last' always go to the end
  if (a.last) {
    return 1;
  }
  if (b.last) {
    return -1;
  }

  // Tier 1 providers come first
  if (aIsTier1 && !bIsTier1) {
    return -1;
  }
  if (!aIsTier1 && bIsTier1) {
    return 1;
  }
  if (aIsTier1 && bIsTier1) {
    return tier1Providers.indexOf(a.value) - tier1Providers.indexOf(b.value);
  }

  // Tier 2 providers come after tier 1
  if (aIsTier2 && !bIsTier2) {
    return -1;
  }
  if (!aIsTier2 && bIsTier2) {
    return 1;
  }
  if (aIsTier2 && bIsTier2) {
    return tier2Providers.indexOf(a.value) - tier2Providers.indexOf(b.value);
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
  const [isExpanded, setIsExpanded] = useState<boolean>(!selectedProviderType);

  // Tag filter options
  const tagFilters = [
    { key: 'agents', label: 'Agents' },
    { key: 'endpoint', label: 'API Endpoints' },
    { key: 'custom', label: 'Custom' },
    { key: 'model', label: 'Foundation Models' },
    { key: 'cloud', label: 'Cloud & Enterprise' },
    { key: 'specialized', label: 'Specialized' },
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

  useEffect(() => {
    if (!provider?.id) {
      setProvider(
        {
          id: 'http',
          config: {
            url: '',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: '{{prompt}}',
            }),
          },
        },
        'http',
      );
    }
  }, []);

  // Handle provider type selection
  const handleProviderTypeSelect = (value: string) => {
    setSelectedProviderType(value);
    setIsExpanded(false); // Collapse after selection

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

    if (value === 'custom') {
      setProvider(
        {
          id: '',
          label: currentLabel,
          config: {},
        },
        'custom',
      );
    } else if (value === 'javascript') {
      setProvider(
        {
          id: 'file:///path/to/custom_provider.js',
          config: {},
          label: currentLabel,
        },
        'javascript',
      );
    } else if (value === 'python') {
      setProvider(
        {
          id: 'file:///path/to/custom_provider.py',
          config: {},
          label: currentLabel,
        },
        'python',
      );
    } else if (value === 'http') {
      setProvider(
        {
          id: 'http',
          label: currentLabel,
          config: {
            url: '',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: '{{prompt}}',
            }),
          },
        },
        'http',
      );
    } else if (value === 'websocket') {
      setProvider(
        {
          id: 'websocket',
          label: currentLabel,
          config: {
            url: '',
            messageTemplate: '{{prompt}}',
            timeoutMs: DEFAULT_WEBSOCKET_TIMEOUT_MS,
          },
        },
        'websocket',
      );
    } else if (value === 'browser') {
      setProvider(
        {
          id: 'browser',
          label: currentLabel,
          config: {
            steps: [],
            headless: true,
          },
        },
        'browser',
      );
    } else if (value === 'openai') {
      setProvider(
        {
          id: 'openai:gpt-4o',
          config: {},
          label: currentLabel,
        },
        'openai',
      );
    } else if (value === 'anthropic') {
      setProvider(
        {
          id: 'anthropic:messages:claude-3-5-sonnet-20241022',
          config: {},
          label: currentLabel,
        },
        'anthropic',
      );
    } else if (value === 'azure') {
      setProvider(
        {
          id: 'azure:chat:your-deployment-name',
          config: {},
          label: currentLabel,
        },
        'azure',
      );
    } else if (value === 'google') {
      setProvider(
        {
          id: 'google:gemini-2.5-pro',
          config: {},
          label: currentLabel,
        },
        'google',
      );
    } else if (value === 'vertex') {
      setProvider(
        {
          id: 'vertex:gemini-2.5-pro',
          config: {},
          label: currentLabel,
        },
        'vertex',
      );
    } else if (value === 'mistral') {
      setProvider(
        {
          id: 'mistral:mistral-large-latest',
          config: {},
          label: currentLabel,
        },
        'mistral',
      );
    } else if (value === 'cohere') {
      setProvider(
        {
          id: 'cohere:command-r-plus',
          config: {},
          label: currentLabel,
        },
        'cohere',
      );
    } else if (value === 'groq') {
      setProvider(
        {
          id: 'groq:llama-3.1-70b-versatile',
          config: {},
          label: currentLabel,
        },
        'groq',
      );
    } else if (value === 'deepseek') {
      setProvider(
        {
          id: 'deepseek:deepseek-chat',
          config: {},
          label: currentLabel,
        },
        'deepseek',
      );
    } else if (value === 'openrouter') {
      setProvider(
        {
          id: 'openrouter:openai/gpt-4o',
          config: {},
          label: currentLabel,
        },
        'openrouter',
      );
    } else if (value === 'bedrock') {
      setProvider(
        {
          id: 'bedrock:anthropic.claude-3-5-sonnet-20241022-v2:0',
          config: {},
          label: currentLabel,
        },
        'bedrock',
      );
    } else if (value === 'bedrock-agent') {
      setProvider(
        {
          id: 'bedrock:agent:your-agent-id',
          config: {},
          label: currentLabel,
        },
        'bedrock-agent',
      );
    } else if (value === 'sagemaker') {
      setProvider(
        {
          id: 'sagemaker:your-endpoint-name',
          config: {},
          label: currentLabel,
        },
        'sagemaker',
      );
    } else if (value === 'huggingface') {
      setProvider(
        {
          id: 'huggingface:meta-llama/Meta-Llama-3-70B-Instruct',
          config: {},
          label: currentLabel,
        },
        'huggingface',
      );
    } else if (value === 'ollama') {
      setProvider(
        {
          id: 'ollama:llama3',
          config: {},
          label: currentLabel,
        },
        'ollama',
      );
    } else if (value === 'llama.cpp') {
      setProvider(
        {
          id: 'llama.cpp:http://localhost:8080/completion',
          config: {},
          label: currentLabel,
        },
        'llama.cpp',
      );
    } else if (value === 'llamafile') {
      setProvider(
        {
          id: 'llamafile:http://localhost:8080/v1/chat/completions',
          config: {},
          label: currentLabel,
        },
        'llamafile',
      );
    } else if (value === 'localai') {
      setProvider(
        {
          id: 'localai:gpt-4',
          config: {},
          label: currentLabel,
        },
        'localai',
      );
    } else if (value === 'vllm') {
      setProvider(
        {
          id: 'vllm:http://localhost:8000/v1',
          config: {},
          label: currentLabel,
        },
        'vllm',
      );
    } else if (value === 'text-generation-webui') {
      setProvider(
        {
          id: 'text-generation-webui:http://localhost:5000',
          config: {},
          label: currentLabel,
        },
        'text-generation-webui',
      );
    } else if (value === 'perplexity') {
      setProvider(
        {
          id: 'perplexity:sonar',
          config: {},
          label: currentLabel,
        },
        'perplexity',
      );
    } else if (value === 'xai') {
      setProvider(
        {
          id: 'xai:grok-2-1212',
          config: {},
          label: currentLabel,
        },
        'xai',
      );
    } else if (value === 'ai21') {
      setProvider(
        {
          id: 'ai21:jamba-1.5-large',
          config: {},
          label: currentLabel,
        },
        'ai21',
      );
    } else if (value === 'voyage') {
      setProvider(
        {
          id: 'voyage:voyage-3',
          config: {},
          label: currentLabel,
        },
        'voyage',
      );
    } else if (value === 'cloudflare-ai') {
      setProvider(
        {
          id: 'cloudflare-ai:@cf/meta/llama-3-8b-instruct',
          config: {},
          label: currentLabel,
        },
        'cloudflare-ai',
      );
    } else if (value === 'databricks') {
      setProvider(
        {
          id: 'databricks:databricks-meta-llama-3-1-70b-instruct',
          config: {},
          label: currentLabel,
        },
        'databricks',
      );
    } else if (value === 'fal') {
      setProvider(
        {
          id: 'fal:fal-ai/flux/dev',
          config: {},
          label: currentLabel,
        },
        'fal',
      );
    } else if (value === 'github') {
      setProvider(
        {
          id: 'github:gpt-4o',
          config: {},
          label: currentLabel,
        },
        'github',
      );
    } else if (value === 'hyperbolic') {
      setProvider(
        {
          id: 'hyperbolic:meta-llama/Meta-Llama-3.1-70B-Instruct',
          config: {},
          label: currentLabel,
        },
        'hyperbolic',
      );
    } else if (value === 'mcp') {
      setProvider(
        {
          id: 'mcp:server-name',
          config: {},
          label: currentLabel,
        },
        'mcp',
      );
    } else if (value === 'aimlapi') {
      setProvider(
        {
          id: 'aimlapi:gpt-4o',
          config: {},
          label: currentLabel,
        },
        'aimlapi',
      );
    } else if (value === 'exec') {
      setProvider(
        {
          id: 'exec:/path/to/script.sh',
          config: {},
          label: currentLabel,
        },
        'exec',
      );
    } else if (value === 'helicone') {
      setProvider(
        {
          id: 'helicone:openai/gpt-4.1',
          config: {},
          label: currentLabel,
        },
        'helicone',
      );
    } else if (value === 'jfrog') {
      setProvider(
        {
          id: 'jfrog:llama_3_8b_instruct',
          config: {},
          label: currentLabel,
        },
        'jfrog',
      );
    } else if (value === 'go') {
      setProvider(
        {
          id: 'file:///path/to/your/script.go',
          config: {},
          label: currentLabel,
        },
        'go',
      );
    } else if (value === 'langchain') {
      setProvider(
        {
          id: 'file:///path/to/langchain_agent.py',
          config: {},
          label: currentLabel,
        },
        'langchain',
      );
    } else if (value === 'autogen') {
      setProvider(
        {
          id: 'file:///path/to/autogen_agent.py',
          config: {},
          label: currentLabel,
        },
        'autogen',
      );
    } else if (value === 'crewai') {
      setProvider(
        {
          id: 'file:///path/to/crewai_agent.py',
          config: {},
          label: currentLabel,
        },
        'crewai',
      );
    } else if (value === 'llamaindex') {
      setProvider(
        {
          id: 'file:///path/to/llamaindex_agent.py',
          config: {},
          label: currentLabel,
        },
        'llamaindex',
      );
    } else if (value === 'langgraph') {
      setProvider(
        {
          id: 'file:///path/to/langgraph_agent.py',
          config: {},
          label: currentLabel,
        },
        'langgraph',
      );
    } else if (value === 'openai-agents-sdk') {
      setProvider(
        {
          id: 'file:///path/to/openai_agents.py',
          config: {},
          label: currentLabel,
        },
        'openai-agents-sdk',
      );
    } else if (value === 'pydantic-ai') {
      setProvider(
        {
          id: 'file:///path/to/pydantic_ai_agent.py',
          config: {},
          label: currentLabel,
        },
        'pydantic-ai',
      );
    } else if (value === 'google-adk') {
      setProvider(
        {
          id: 'file:///path/to/google_adk_agent.py',
          config: {},
          label: currentLabel,
        },
        'google-adk',
      );
    } else if (value === 'generic-agent') {
      setProvider(
        {
          id: 'file:///path/to/custom_agent.py',
          config: {},
          label: currentLabel,
        },
        'generic-agent',
      );
    } else {
      setProvider(
        {
          id: value,
          config: {},
          label: currentLabel,
        },
        value,
      );
    }
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
          <CheckCircle className="mr-4 h-5 w-5 flex-shrink-0 text-primary" />

          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <p className="font-semibold text-primary">{selectedOption.label}</p>
              {selectedOption.recommended && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="secondary" className="text-xs">
                      Recommended
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    Popular choice that's flexible, well-documented, and easy to integrate
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <p className="overflow-hidden text-ellipsis text-sm text-muted-foreground">
              {selectedOption.description}
            </p>
          </div>

          <div className="ml-4 flex flex-shrink-0 items-center">
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
                    <HelpCircle className="h-4 w-4" />
                  </a>
                </TooltipTrigger>
                <TooltipContent>View {selectedOption.label} documentation</TooltipContent>
              </Tooltip>
            )}

            <Button variant="outline" size="sm" onClick={handleEditSelection}>
              <Edit className="mr-1 h-4 w-4" />
              Change
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Show expanded view (original full list)
  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        <div className="relative min-w-[300px] flex-shrink-0">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search providers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex flex-1 flex-wrap gap-2">
          <Badge
            variant={selectedTag === undefined ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setSelectedTag(undefined)}
          >
            All Tags
          </Badge>
          {tagFilters.map((filter) => (
            <Badge
              key={filter.key}
              variant={selectedTag === filter.key ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => handleTagToggle(filter.key)}
            >
              {filter.label}
            </Badge>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {filteredProviderOptions.map((option, index) => {
          // Check if we need to show a divider before this option
          const tier2Providers = ['openai', 'google', 'anthropic', 'openrouter'];
          const showDivider =
            index > 0 &&
            tier2Providers.includes(filteredProviderOptions[index - 1].value) &&
            !tier2Providers.includes(option.value);

          return (
            <>
              {showDivider && (
                <div className="py-3">
                  <div className="h-px w-full bg-border" />
                </div>
              )}
              <div
                key={option.value}
                onClick={() => handleProviderTypeSelect(option.value)}
                className={cn(
                  'flex w-full cursor-pointer items-center rounded-lg border p-4 transition-colors',
                  selectedProviderType === option.value
                    ? 'border-2 border-primary bg-primary/5'
                    : 'border-border hover:bg-muted/50',
                )}
              >
                <input
                  type="radio"
                  checked={selectedProviderType === option.value}
                  onChange={() => handleProviderTypeSelect(option.value)}
                  name="provider-type-radio"
                  className="mr-4 h-4 w-4 flex-shrink-0"
                />

                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <p
                      className={cn(
                        selectedProviderType === option.value
                          ? 'font-semibold text-primary'
                          : 'font-medium text-foreground',
                      )}
                    >
                      {option.label}
                    </p>
                    {option.recommended && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="secondary" className="text-xs">
                            Recommended
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          Popular choice that's flexible, well-documented, and easy to integrate
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{option.description}</p>
                </div>

                <div className="ml-4 flex flex-shrink-0 items-center">
                  {/* Documentation link */}
                  {hasSpecificDocumentation(option.value) && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <a
                          href={getProviderDocumentationUrl(option.value)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="mr-2 text-muted-foreground hover:text-foreground"
                        >
                          <HelpCircle className="h-4 w-4" />
                        </a>
                      </TooltipTrigger>
                      <TooltipContent>View {option.label} documentation</TooltipContent>
                    </Tooltip>
                  )}

                  {selectedProviderType === option.value && (
                    <CheckCircle className="h-4 w-4 text-primary" />
                  )}
                </div>
              </div>
            </>
          );
        })}
      </div>
    </div>
  );
}
