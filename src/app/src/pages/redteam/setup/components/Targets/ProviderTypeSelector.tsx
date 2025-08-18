import { useEffect, useState } from 'react';

import { useTelemetry } from '@app/hooks/useTelemetry';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EditIcon from '@mui/icons-material/Edit';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import SearchIcon from '@mui/icons-material/Search';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Radio from '@mui/material/Radio';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { getProviderDocumentationUrl, hasSpecificDocumentation } from './providerDocumentationMap';

import type { ProviderOptions } from '../../types';

// Flattened provider options with category information
const allProviderOptions = [
  // Agentic Frameworks
  {
    value: 'langchain',
    label: 'LangChain',
    description: 'Framework for developing applications powered by language models',
    category: 'agents',
  },
  {
    value: 'autogen',
    label: 'AutoGen',
    description: 'Multi-agent collaborative framework from Microsoft',
    category: 'agents',
  },
  {
    value: 'crewai',
    label: 'CrewAI',
    description: 'Framework for orchestrating role-playing autonomous AI agents',
    category: 'agents',
  },
  {
    value: 'llamaindex',
    label: 'LlamaIndex',
    description: 'Data framework for LLM applications with RAG capabilities',
    category: 'agents',
  },
  {
    value: 'langgraph',
    label: 'LangGraph',
    description: 'Build stateful, multi-actor applications with LLMs',
    category: 'agents',
  },
  {
    value: 'openai-agents-sdk',
    label: 'OpenAI Agents SDK',
    description: 'Official OpenAI SDK for building AI agents',
    category: 'agents',
  },
  {
    value: 'pydantic-ai',
    label: 'PydanticAI',
    description: 'Type-safe AI agents with structured outputs using Pydantic',
    category: 'agents',
  },
  {
    value: 'google-adk',
    label: 'Google ADK',
    description: 'Google AI Development Kit for building agents',
    category: 'agents',
  },
  {
    value: 'generic-agent',
    label: 'Other Agent',
    description:
      'Any agent framework - Promptfoo is fully customizable and supports all agent frameworks',
    category: 'agents',
    last: true,
  },

  // AI/ML API
  {
    value: 'aimlapi',
    label: 'AI/ML API',
    description: 'Access 300+ AI models with a single API',
    category: 'specialized',
  },
  // AI21 Labs
  {
    value: 'ai21',
    label: 'AI21 Labs',
    description: 'Jurassic and Jamba models',
    category: 'specialized',
  },
  // Amazon SageMaker
  {
    value: 'sagemaker',
    label: 'Amazon SageMaker',
    description: 'Models deployed on SageMaker endpoints',
    category: 'cloud',
  },
  // Anthropic
  {
    value: 'anthropic',
    label: 'Anthropic',
    description: 'Claude models including Claude Sonnet 4',
    category: 'model',
  },
  // AWS Bedrock
  {
    value: 'bedrock',
    label: 'AWS Bedrock',
    description: 'AWS-hosted models from various providers',
    category: 'cloud',
  },
  // Azure OpenAI
  {
    value: 'azure',
    label: 'Azure OpenAI',
    description: 'Azure-hosted OpenAI models',
    category: 'model',
  },
  // Cloudflare AI
  {
    value: 'cloudflare-ai',
    label: 'Cloudflare AI',
    description: "Cloudflare's OpenAI-compatible AI platform",
    category: 'cloud',
  },
  // Custom Provider
  {
    value: 'custom',
    label: 'Custom Provider',
    description: 'Other custom providers and implementations',
    category: 'custom',
  },
  // Databricks
  {
    value: 'databricks',
    label: 'Databricks',
    description: 'Databricks Foundation Model APIs',
    category: 'cloud',
  },
  // DeepSeek
  {
    value: 'deepseek',
    label: 'DeepSeek',
    description: "DeepSeek's language models including R1",
    category: 'model',
  },
  // fal.ai
  {
    value: 'fal',
    label: 'fal.ai',
    description: 'Image generation and specialized AI models',
    category: 'specialized',
  },
  // GitHub Models
  {
    value: 'github',
    label: 'GitHub Models',
    description: "GitHub's hosted models from multiple providers",
    category: 'specialized',
  },
  // Go Provider
  {
    value: 'go',
    label: 'Go Provider',
    description: 'Custom Go provider for specialized integrations',
    category: 'custom',
  },
  // Google AI Studio
  {
    value: 'google',
    label: 'Google AI Studio',
    description: 'Gemini models and Live API',
    category: 'model',
  },
  // Google Vertex AI
  {
    value: 'vertex',
    label: 'Google Vertex AI',
    description: "Google Cloud's AI platform with Gemini models",
    category: 'model',
  },
  // Groq
  {
    value: 'groq',
    label: 'Groq',
    description: 'High-performance inference API',
    category: 'model',
  },
  // Helicone AI Gateway
  {
    value: 'helicone',
    label: 'Helicone AI Gateway',
    description: 'Self-hosted AI gateway for unified provider access',
    category: 'cloud',
  },
  // HTTP/HTTPS Endpoint
  {
    value: 'http',
    label: 'HTTP/HTTPS Endpoint',
    description: 'Connect to REST APIs and HTTP endpoints',
    category: 'endpoint',
  },
  // Hugging Face
  {
    value: 'huggingface',
    label: 'Hugging Face',
    description: 'Access thousands of models',
    category: 'cloud',
  },
  // Hyperbolic
  {
    value: 'hyperbolic',
    label: 'Hyperbolic',
    description: 'OpenAI-compatible Llama 3 provider',
    category: 'specialized',
  },
  // JavaScript Provider
  {
    value: 'javascript',
    label: 'JavaScript Provider',
    description: 'Custom JS provider for specialized integrations',
    category: 'custom',
  },
  // JFrog ML
  {
    value: 'jfrog',
    label: 'JFrog ML',
    description: "JFrog's LLM Model Library",
    category: 'cloud',
  },
  // Lambda Labs
  {
    value: 'lambdalabs',
    label: 'Lambda Labs',
    description: 'Lambda Labs models via Inference API',
    category: 'specialized',
  },
  // llama.cpp
  {
    value: 'llama.cpp',
    label: 'llama.cpp',
    description: 'Lightweight local model inference',
    category: 'local',
  },
  // Llamafile
  {
    value: 'llamafile',
    label: 'Llamafile',
    description: 'Single-file local model server',
    category: 'local',
  },
  // LocalAI
  {
    value: 'localai',
    label: 'LocalAI',
    description: 'Local OpenAI-compatible API',
    category: 'local',
  },
  // MCP Server
  {
    value: 'mcp',
    label: 'MCP Server',
    description: 'Connect to Model Context Protocol (MCP) servers for direct tool red teaming',
    category: 'custom',
  },
  // Mistral AI
  {
    value: 'mistral',
    label: 'Mistral AI',
    description: "Mistral's language models including Magistral",
    category: 'model',
  },
  // Ollama
  {
    value: 'ollama',
    label: 'Ollama',
    description: 'Local model runner with easy setup',
    category: 'local',
  },
  // OpenAI
  {
    value: 'openai',
    label: 'OpenAI',
    description: 'GPT models including GPT-4.1 and reasoning models',
    category: 'model',
  },
  // OpenRouter
  {
    value: 'openrouter',
    label: 'OpenRouter',
    description: 'Access hundreds of top AI models through a single API',
    category: 'specialized',
  },
  // Perplexity AI
  {
    value: 'perplexity',
    label: 'Perplexity AI',
    description: 'Search-augmented chat with citations',
    category: 'model',
  },
  // Python Provider
  {
    value: 'python',
    label: 'Python Provider',
    description: 'Custom Python provider for specialized integrations',
    category: 'custom',
  },
  // Shell Command
  {
    value: 'exec',
    label: 'Shell Command',
    description: 'Execute custom scripts and commands',
    category: 'custom',
  },
  // Text Generation WebUI
  {
    value: 'text-generation-webui',
    label: 'Text Generation WebUI',
    description: 'Gradio-based local model interface',
    category: 'local',
  },
  // vLLM
  {
    value: 'vllm',
    label: 'vLLM',
    description: 'High-performance local inference server',
    category: 'local',
  },
  // Voyage AI
  {
    value: 'voyage',
    label: 'Voyage AI',
    description: 'Specialized embedding models',
    category: 'specialized',
  },
  // Web Browser
  {
    value: 'browser',
    label: 'Web Browser',
    description: 'Automate web browser interactions for testing',
    category: 'custom',
  },
  // WebSocket Endpoint
  {
    value: 'websocket',
    label: 'WebSocket Endpoint',
    description: 'Real-time communication with WebSocket APIs',
    category: 'endpoint',
  },
  // X.AI (Grok)
  {
    value: 'xai',
    label: 'X.AI (Grok)',
    description: "X.AI's Grok models",
    category: 'model',
  },
].sort((a, b) => {
  return a.last ? 1 : b.last ? -1 : a.label.localeCompare(b.label);
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
  const theme = useTheme();
  const { recordEvent } = useTelemetry();

  const [selectedProviderType, setSelectedProviderType] = useState<string | undefined>(
    providerType,
  );
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [isExpanded, setIsExpanded] = useState<boolean>(!selectedProviderType);

  // Category filter options
  const categoryFilters = [
    { key: 'agents', label: 'Agents' },
    { key: 'endpoint', label: 'API Endpoints' },
    { key: 'custom', label: 'Custom' },
    { key: 'model', label: 'Foundation Models' },
    { key: 'cloud', label: 'Cloud & Enterprise' },
    { key: 'specialized', label: 'Specialized' },
    { key: 'local', label: 'Local Models' },
  ];

  // Handle category filter toggle
  const handleCategoryToggle = (category: string) => {
    setSelectedCategory(category);

    // Track category filter usage
    recordEvent('feature_used', {
      feature: 'redteam_provider_category_filtered',
      category: category,
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
      provider_category: selectedOption?.category,
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
            type: 'websocket',
            url: 'wss://example.com/ws',
            messageTemplate: '{"message": "{{prompt}}"}',
            transformResponse: 'response.message',
            timeoutMs: 30000,
          },
        },
        'websocket',
      );
    } else if (value === 'mcp') {
      setProvider(
        {
          id: 'mcp',
          label: currentLabel,
          config: {
            enabled: true,
            verbose: false,
          },
        },
        'mcp',
      );
    } else if (value === 'browser') {
      setProvider(
        {
          id: 'browser',
          label: currentLabel,
          config: {
            steps: [
              {
                action: 'navigate',
                args: { url: 'https://example.com' },
              },
            ],
          },
        },
        'browser',
      );
    } else if (value === 'exec') {
      setProvider(
        {
          id: 'exec: python script.py',
          label: currentLabel,
          config: {},
        },
        'exec',
      );
    } else if (value === 'openai') {
      setProvider(
        {
          id: 'openai:gpt-4.1',
          config: {},
          label: currentLabel,
        },
        'openai',
      );
    } else if (value === 'anthropic') {
      setProvider(
        {
          id: 'anthropic:messages:claude-sonnet-4-20250514',
          config: {},
          label: currentLabel,
        },
        'anthropic',
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
    } else if (value === 'cerebras') {
      setProvider(
        {
          id: 'cerebras:llama3.1-70b',
          config: {},
          label: currentLabel,
        },
        'cerebras',
      );
    } else if (value === 'perplexity') {
      setProvider(
        {
          id: 'perplexity:llama-3.1-sonar-large-128k-online',
          config: {},
          label: currentLabel,
        },
        'perplexity',
      );
    } else if (value === 'bedrock') {
      setProvider(
        {
          id: 'bedrock:anthropic.claude-3-sonnet-20240229-v1:0',
          config: {},
          label: currentLabel,
        },
        'bedrock',
      );
    } else if (value === 'ollama') {
      setProvider(
        {
          id: 'ollama:llama3.2:latest',
          config: {},
          label: currentLabel,
        },
        'ollama',
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
    } else if (value === 'azure') {
      setProvider(
        {
          id: 'azure:chat:',
          config: {},
          label: currentLabel,
        },
        'azure',
      );
    } else if (value === 'adaline') {
      setProvider(
        {
          id: 'adaline:openai/gpt-4.1',
          config: {},
          label: currentLabel,
        },
        'adaline',
      );
    } else if (value === 'cloudera') {
      setProvider(
        {
          id: 'cloudera:llama-2-13b-chat',
          config: {},
          label: currentLabel,
        },
        'cloudera',
      );
    } else if (value === 'f5') {
      setProvider(
        {
          id: 'f5:path-name',
          config: {},
          label: currentLabel,
        },
        'f5',
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
    } else if (value === 'ibm-bam') {
      setProvider(
        {
          id: 'bam:chat:ibm/granite-13b-chat-v2',
          config: {},
          label: currentLabel,
        },
        'ibm-bam',
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
    } else if (value === 'litellm') {
      setProvider(
        {
          id: 'litellm:gpt-4.1',
          config: {},
          label: currentLabel,
        },
        'litellm',
      );
    } else if (value === 'openllm') {
      setProvider(
        {
          id: 'openllm:llama3',
          config: {},
          label: currentLabel,
        },
        'openllm',
      );
    } else if (value === 'watsonx') {
      setProvider(
        {
          id: 'watsonx:ibm/granite-13b-chat-v2',
          config: {},
          label: currentLabel,
        },
        'watsonx',
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
    } else if (value === 'webhook') {
      setProvider(
        {
          id: 'webhook:http://example.com/webhook',
          config: {},
          label: currentLabel,
        },
        'webhook',
      );
    } else if (value === 'echo') {
      setProvider(
        {
          id: 'echo',
          config: {},
          label: currentLabel,
        },
        'echo',
      );
    } else if (value === 'manual-input') {
      setProvider(
        {
          id: 'promptfoo:manual-input',
          config: {},
          label: currentLabel,
        },
        'manual-input',
      );
    } else if (value === 'sequence') {
      setProvider(
        {
          id: 'sequence',
          config: {
            inputs: [],
          },
          label: currentLabel,
        },
        'sequence',
      );
    } else if (value === 'simulated-user') {
      setProvider(
        {
          id: 'promptfoo:simulated-user',
          config: {},
          label: currentLabel,
        },
        'simulated-user',
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
    setSelectedCategory(undefined); // Clear category filter when expanding

    // Track when user changes their provider selection
    recordEvent('feature_used', {
      feature: 'redteam_provider_selection_changed',
      previous_provider_type: selectedProviderType,
    });
  };

  // Filter available options if availableProviderIds is provided, by search term, and by category
  const filteredProviderOptions = allProviderOptions.filter((option) => {
    // Filter by availableProviderIds if provided
    const isAvailable = !availableProviderIds || availableProviderIds.includes(option.value);

    // Filter by search term if provided
    const matchesSearch =
      !searchTerm ||
      option.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      option.description.toLowerCase().includes(searchTerm.toLowerCase());

    // Filter by selected category if provided
    const matchesCategory = !selectedCategory || option.category === selectedCategory;

    return isAvailable && matchesSearch && matchesCategory;
  });

  // Get the selected provider option for collapsed view
  const selectedOption = selectedProviderType
    ? allProviderOptions.find((option) => option.value === selectedProviderType)
    : undefined;

  // Show collapsed view when a provider is selected and not in expanded mode
  if (selectedOption && !isExpanded) {
    return (
      <Box>
        <Paper
          variant="outlined"
          sx={{
            border: '2px solid',
            borderColor: 'primary.main',
            borderRadius: 2,
            bgcolor: 'rgba(25, 118, 210, 0.04)',
            p: 2,
            display: 'flex',
            alignItems: 'center',
            width: '100%',
          }}
        >
          <CheckCircleIcon color="primary" sx={{ mr: 2, flexShrink: 0 }} />

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 600,
                color: 'primary.main',
                mb: 0.5,
              }}
            >
              {selectedOption.label}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {selectedOption.description}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0, ml: 2 }}>
            {/* Documentation link */}
            {hasSpecificDocumentation(selectedOption.value) && (
              <Tooltip title={`View ${selectedOption.label} documentation`}>
                <IconButton
                  size="small"
                  component={Link}
                  href={getProviderDocumentationUrl(selectedOption.value)}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ mr: 1, color: 'text.secondary' }}
                >
                  <HelpOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}

            <Button
              variant="outlined"
              size="small"
              startIcon={<EditIcon />}
              onClick={handleEditSelection}
              sx={{ ml: 1 }}
            >
              Change
            </Button>
          </Box>
        </Paper>
      </Box>
    );
  }

  // Show expanded view (original full list)
  return (
    <Box>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
        <TextField
          variant="outlined"
          placeholder="Search providers..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
          sx={{ minWidth: 300, flexShrink: 0 }}
        />

        <Box sx={{ flex: 1 }}>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
            <Chip
              label="All Categories"
              variant={selectedCategory === undefined ? 'filled' : 'outlined'}
              color={selectedCategory === undefined ? 'primary' : 'default'}
              onClick={() => setSelectedCategory(undefined)}
              sx={{
                cursor: 'pointer',
                '&:hover': {
                  bgcolor: selectedCategory === undefined ? 'primary.dark' : 'action.hover',
                },
              }}
            />
            {categoryFilters.map((filter) => (
              <Chip
                key={filter.key}
                label={filter.label}
                variant={selectedCategory === filter.key ? 'filled' : 'outlined'}
                color={selectedCategory === filter.key ? 'primary' : 'default'}
                onClick={() => handleCategoryToggle(filter.key)}
                sx={{
                  cursor: 'pointer',
                  '&:hover': {
                    bgcolor: selectedCategory === filter.key ? 'primary.dark' : 'action.hover',
                  },
                }}
              />
            ))}
          </Stack>
        </Box>
      </Stack>

      <FormControl component="fieldset" sx={{ width: '100%' }}>
        <Stack spacing={1}>
          {filteredProviderOptions.map((option) => (
            <Paper
              key={option.value}
              variant="outlined"
              onClick={() => handleProviderTypeSelect(option.value)}
              sx={{
                border: '1px solid',
                borderColor: selectedProviderType === option.value ? 'primary.main' : 'divider',
                borderWidth: selectedProviderType === option.value ? 2 : 1,
                borderRadius: 2,
                bgcolor:
                  selectedProviderType === option.value
                    ? 'rgba(25, 118, 210, 0.04)'
                    : 'transparent',
                '&:hover': {
                  bgcolor: 'rgba(0, 0, 0, 0.04)',
                  cursor: 'pointer',
                  borderColor:
                    selectedProviderType === option.value
                      ? 'primary.main'
                      : theme.palette.action.hover,
                },
                p: selectedProviderType === option.value ? '15px' : 2,
                transition: 'background-color 0.2s',
                display: 'flex',
                alignItems: 'center',
                width: '100%',
              }}
            >
              <Radio
                checked={selectedProviderType === option.value}
                onChange={() => handleProviderTypeSelect(option.value)}
                value={option.value}
                name="provider-type-radio"
                sx={{ mr: 2, flexShrink: 0 }}
                size="small"
              />

              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  variant="subtitle1"
                  sx={{
                    fontWeight: selectedProviderType === option.value ? 600 : 500,
                    color: selectedProviderType === option.value ? 'primary.main' : 'text.primary',
                    mb: 0.5,
                  }}
                >
                  {option.label}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: 'text.secondary',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {option.description}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0, ml: 2 }}>
                {/* Documentation link */}
                {hasSpecificDocumentation(option.value) && (
                  <Tooltip title={`View ${option.label} documentation`}>
                    <IconButton
                      size="small"
                      component={Link}
                      href={getProviderDocumentationUrl(option.value)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      sx={{ mr: 1, color: 'text.secondary' }}
                    >
                      <HelpOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}

                {selectedProviderType === option.value && (
                  <CheckCircleIcon color="primary" fontSize="small" />
                )}
              </Box>
            </Paper>
          ))}
        </Stack>
      </FormControl>
    </Box>
  );
}
