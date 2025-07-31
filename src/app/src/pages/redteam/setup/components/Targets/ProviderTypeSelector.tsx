import { useEffect, useState } from 'react';

import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SearchIcon from '@mui/icons-material/Search';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import InputAdornment from '@mui/material/InputAdornment';
import Paper from '@mui/material/Paper';
import Radio from '@mui/material/Radio';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { getProviderType } from './helpers';

import type { ProviderOptions } from '../../types';

// Provider options grouped by category
const providerOptions = [
  {
    category: 'endpoint',
    title: 'API Endpoints',
    description: 'Connect to existing AI applications via HTTP or WebSocket',
    options: [
      {
        value: 'http',
        label: 'HTTP/HTTPS Endpoint',
        description: 'Connect to REST APIs and HTTP endpoints',
      },
      {
        value: 'websocket',
        label: 'WebSocket Endpoint',
        description: 'Real-time communication with WebSocket APIs',
      },
    ],
  },
  {
    category: 'custom',
    title: 'Code-based Providers',
    description:
      'Use custom code or specialized integrations. Recommended for most workflows with agents, MCP clients, and other specialized use cases.',
    options: [
      {
        value: 'javascript',
        label: 'JavaScript Provider',
        description: 'Custom JS provider for specialized integrations',
      },
      {
        value: 'python',
        label: 'Python Provider',
        description: 'Custom Python provider for specialized integrations',
      },
      {
        value: 'go',
        label: 'Go Provider',
        description: 'Custom Go provider for specialized integrations',
      },
      {
        value: 'custom',
        label: 'Custom Provider',
        description: 'Other custom providers and implementations',
      },
      {
        value: 'mcp',
        label: 'MCP Server',
        description: 'Connect to Model Context Protocol (MCP) servers for direct tool red teaming',
      },
      {
        value: 'browser',
        label: 'Web Browser',
        description: 'Automate web browser interactions for testing',
      },
      {
        value: 'exec',
        label: 'Shell Command',
        description: 'Execute custom scripts and commands',
      },
    ],
  },
  {
    category: 'model',
    title: 'Foundation Models',
    description: 'Test popular AI models and providers directly',
    options: [
      {
        value: 'openai',
        label: 'OpenAI',
        description: 'GPT models including GPT-4.1 and reasoning models',
      },
      {
        value: 'anthropic',
        label: 'Anthropic',
        description: 'Claude models including Claude Sonnet 4',
      },
      {
        value: 'google',
        label: 'Google AI Studio',
        description: 'Gemini models and Live API',
      },
      {
        value: 'vertex',
        label: 'Google Vertex AI',
        description: "Google Cloud's AI platform with Gemini models",
      },
      {
        value: 'azure',
        label: 'Azure OpenAI',
        description: 'Azure-hosted OpenAI models',
      },
      {
        value: 'mistral',
        label: 'Mistral AI',
        description: "Mistral's language models including Magistral",
      },
      {
        value: 'groq',
        label: 'Groq',
        description: 'High-performance inference API',
      },
      {
        value: 'perplexity',
        label: 'Perplexity AI',
        description: 'Search-augmented chat with citations',
      },
      {
        value: 'deepseek',
        label: 'DeepSeek',
        description: "DeepSeek's language models including R1",
      },
      {
        value: 'xai',
        label: 'X.AI (Grok)',
        description: "X.AI's Grok models",
      },
    ],
  },
  {
    category: 'cloud',
    title: 'Cloud & Enterprise',
    description: 'Enterprise and cloud-hosted AI services',
    options: [
      {
        value: 'bedrock',
        label: 'AWS Bedrock',
        description: 'AWS-hosted models from various providers',
      },
      {
        value: 'sagemaker',
        label: 'Amazon SageMaker',
        description: 'Models deployed on SageMaker endpoints',
      },
      {
        value: 'databricks',
        label: 'Databricks',
        description: 'Databricks Foundation Model APIs',
      },
      {
        value: 'cloudflare-ai',
        label: 'Cloudflare AI',
        description: "Cloudflare's OpenAI-compatible AI platform",
      },
      {
        value: 'huggingface',
        label: 'Hugging Face',
        description: 'Access thousands of models',
      },
      {
        value: 'helicone',
        label: 'Helicone AI Gateway',
        description: 'Self-hosted AI gateway for unified provider access',
      },
      {
        value: 'jfrog',
        label: 'JFrog ML',
        description: "JFrog's LLM Model Library",
      },
    ],
  },
  {
    category: 'specialized',
    title: 'Third-Party Providers',
    description: 'Providers for specific use cases and integrations',
    options: [
      {
        value: 'openrouter',
        label: 'OpenRouter',
        description: 'Access hundreds of top AI models through a single API',
      },
      {
        value: 'github',
        label: 'GitHub Models',
        description: "GitHub's hosted models from multiple providers",
      },
      {
        value: 'ai21',
        label: 'AI21 Labs',
        description: 'Jurassic and Jamba models',
      },
      {
        value: 'aimlapi',
        label: 'AI/ML API',
        description: 'Access 300+ AI models with a single API',
      },
      {
        value: 'hyperbolic',
        label: 'Hyperbolic',
        description: 'OpenAI-compatible Llama 3 provider',
      },
      {
        value: 'lambdalabs',
        label: 'Lambda Labs',
        description: 'Lambda Labs models via Inference API',
      },
      {
        value: 'fal',
        label: 'fal.ai',
        description: 'Image generation and specialized AI models',
      },
      {
        value: 'voyage',
        label: 'Voyage AI',
        description: 'Specialized embedding models',
      },
    ],
  },
  {
    category: 'local',
    title: 'Local Models',
    description: 'Models run locally on your hardware or infrastructure',
    options: [
      {
        value: 'ollama',
        label: 'Ollama',
        description: 'Local model runner with easy setup',
      },
      {
        value: 'vllm',
        label: 'vLLM',
        description: 'High-performance local inference server',
      },
      {
        value: 'localai',
        label: 'LocalAI',
        description: 'Local OpenAI-compatible API',
      },
      {
        value: 'llamafile',
        label: 'Llamafile',
        description: 'Single-file local model server',
      },
      {
        value: 'llama.cpp',
        label: 'llama.cpp',
        description: 'Lightweight local model inference',
      },
      {
        value: 'text-generation-webui',
        label: 'Text Generation WebUI',
        description: 'Gradio-based local model interface',
      },
    ],
  },
];

interface ProviderTypeSelectorProps {
  provider: ProviderOptions | undefined;
  setProvider: (provider: ProviderOptions) => void;
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

  const [selectedProviderType, setSelectedProviderType] = useState<string | undefined>(
    providerType ?? getProviderType(provider?.id),
  );
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // Category filter options
  const categoryFilters = [
    { key: 'endpoint', label: 'API Endpoints' },
    { key: 'custom', label: 'Custom' },
    { key: 'model', label: 'Foundation Models' },
    { key: 'cloud', label: 'Cloud & Enterprise' },
    { key: 'specialized', label: 'Specialized' },
    { key: 'local', label: 'Local Models' },
  ];

  // Handle category filter toggle
  const handleCategoryToggle = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    );
  };

  // Sync selectedProviderType with providerType prop
  useEffect(() => {
    if (providerType !== undefined) {
      setSelectedProviderType(providerType);
    } else if (provider?.id) {
      setSelectedProviderType(getProviderType(provider.id));
    }
  }, [providerType, provider?.id]);

  useEffect(() => {
    if (!provider?.id) {
      setSelectedProviderType('http');
      setProvider({
        id: 'http',
        config: {
          url: '',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: '{{prompt}}',
          }),
        },
      });
    }
  }, []);

  // Handle provider type selection
  const handleProviderTypeSelect = (value: string) => {
    setSelectedProviderType(value);

    const currentLabel = provider?.label;

    if (value === 'custom') {
      setProvider({
        id: '',
        label: currentLabel,
        config: {},
      });
    } else if (value === 'javascript') {
      setProvider({
        id: 'file:///path/to/custom_provider.js',
        config: {},
        label: currentLabel,
      });
    } else if (value === 'python') {
      setProvider({
        id: 'file:///path/to/custom_provider.py',
        config: {},
        label: currentLabel,
      });
    } else if (value === 'http') {
      setProvider({
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
      });
    } else if (value === 'websocket') {
      setProvider({
        id: 'websocket',
        label: currentLabel,
        config: {
          type: 'websocket',
          url: 'wss://example.com/ws',
          messageTemplate: '{"message": "{{prompt}}"}',
          transformResponse: 'response.message',
          timeoutMs: 30000,
        },
      });
    } else if (value === 'mcp') {
      setProvider({
        id: 'mcp',
        label: currentLabel,
        config: {
          enabled: true,
          verbose: false,
        },
      });
    } else if (value === 'browser') {
      setProvider({
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
      });
    } else if (value === 'exec') {
      setProvider({
        id: 'exec: python script.py',
        label: currentLabel,
        config: {},
      });
    } else if (value === 'openai') {
      setProvider({
        id: 'openai:gpt-4.1',
        config: {},
        label: currentLabel,
      });
    } else if (value === 'anthropic') {
      setProvider({
        id: 'anthropic:messages:claude-sonnet-4-20250514',
        config: {},
        label: currentLabel,
      });
    } else if (value === 'google') {
      setProvider({
        id: 'google:gemini-2.5-pro',
        config: {},
        label: currentLabel,
      });
    } else if (value === 'vertex') {
      setProvider({
        id: 'vertex:gemini-2.5-pro',
        config: {},
        label: currentLabel,
      });
    } else if (value === 'mistral') {
      setProvider({
        id: 'mistral:mistral-large-latest',
        config: {},
        label: currentLabel,
      });
    } else if (value === 'cohere') {
      setProvider({
        id: 'cohere:command-r-plus',
        config: {},
        label: currentLabel,
      });
    } else if (value === 'groq') {
      setProvider({
        id: 'groq:llama-3.1-70b-versatile',
        config: {},
        label: currentLabel,
      });
    } else if (value === 'deepseek') {
      setProvider({
        id: 'deepseek:deepseek-chat',
        config: {},
        label: currentLabel,
      });
    } else if (value === 'cerebras') {
      setProvider({
        id: 'cerebras:llama3.1-70b',
        config: {},
        label: currentLabel,
      });
    } else if (value === 'perplexity') {
      setProvider({
        id: 'perplexity:llama-3.1-sonar-large-128k-online',
        config: {},
        label: currentLabel,
      });
    } else if (value === 'bedrock') {
      setProvider({
        id: 'bedrock:anthropic.claude-3-sonnet-20240229-v1:0',
        config: {},
        label: currentLabel,
      });
    } else if (value === 'ollama') {
      setProvider({
        id: 'ollama:llama3.2:latest',
        config: {},
        label: currentLabel,
      });
    } else if (value === 'openrouter') {
      setProvider({
        id: 'openrouter:openai/gpt-4o',
        config: {},
        label: currentLabel,
      });
    } else if (value === 'azure') {
      setProvider({
        id: 'azure:chat:',
        config: {},
        label: currentLabel,
      });
    } else if (value === 'adaline') {
      setProvider({
        id: 'adaline:openai/gpt-4.1',
        config: {},
        label: currentLabel,
      });
    } else if (value === 'cloudera') {
      setProvider({
        id: 'cloudera:llama-2-13b-chat',
        config: {},
        label: currentLabel,
      });
    } else if (value === 'f5') {
      setProvider({
        id: 'f5:path-name',
        config: {},
        label: currentLabel,
      });
    } else if (value === 'helicone') {
      setProvider({
        id: 'helicone:openai/gpt-4.1',
        config: {},
        label: currentLabel,
      });
    } else if (value === 'ibm-bam') {
      setProvider({
        id: 'bam:chat:ibm/granite-13b-chat-v2',
        config: {},
        label: currentLabel,
      });
    } else if (value === 'jfrog') {
      setProvider({
        id: 'jfrog:llama_3_8b_instruct',
        config: {},
        label: currentLabel,
      });
    } else if (value === 'litellm') {
      setProvider({
        id: 'litellm:gpt-4.1',
        config: {},
        label: currentLabel,
      });
    } else if (value === 'openllm') {
      setProvider({
        id: 'openllm:llama3',
        config: {},
        label: currentLabel,
      });
    } else if (value === 'watsonx') {
      setProvider({
        id: 'watsonx:ibm/granite-13b-chat-v2',
        config: {},
        label: currentLabel,
      });
    } else if (value === 'go') {
      setProvider({
        id: 'file:///path/to/your/script.go',
        config: {},
        label: currentLabel,
      });
    } else if (value === 'webhook') {
      setProvider({
        id: 'webhook:http://example.com/webhook',
        config: {},
        label: currentLabel,
      });
    } else if (value === 'echo') {
      setProvider({
        id: 'echo',
        config: {},
        label: currentLabel,
      });
    } else if (value === 'manual-input') {
      setProvider({
        id: 'promptfoo:manual-input',
        config: {},
        label: currentLabel,
      });
    } else if (value === 'sequence') {
      setProvider({
        id: 'sequence',
        config: {
          inputs: [],
        },
        label: currentLabel,
      });
    } else if (value === 'simulated-user') {
      setProvider({
        id: 'promptfoo:simulated-user',
        config: {},
        label: currentLabel,
      });
    } else {
      setProvider({
        id: value,
        config: {},
        label: currentLabel,
      });
    }
  };

  // Filter available options if availableProviderIds is provided, by search term, and by category
  const filteredProviderOptions = providerOptions
    .filter((group) => {
      // Filter by selected categories if any are selected
      return selectedCategories.length === 0 || selectedCategories.includes(group.category);
    })
    .map((group) => ({
      ...group,
      options: group.options.filter((option) => {
        // Filter by availableProviderIds if provided
        const isAvailable = !availableProviderIds || availableProviderIds.includes(option.value);

        // Filter by search term if provided
        const matchesSearch =
          !searchTerm ||
          option.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
          option.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
          group.title.toLowerCase().includes(searchTerm.toLowerCase());

        return isAvailable && matchesSearch;
      }),
    }))
    .filter((group) => group.options.length > 0);

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
            {categoryFilters.map((filter) => (
              <Chip
                key={filter.key}
                label={filter.label}
                variant={selectedCategories.includes(filter.key) ? 'filled' : 'outlined'}
                color={selectedCategories.includes(filter.key) ? 'primary' : 'default'}
                onClick={() => handleCategoryToggle(filter.key)}
                sx={{
                  cursor: 'pointer',
                  '&:hover': {
                    bgcolor: selectedCategories.includes(filter.key)
                      ? 'primary.dark'
                      : 'action.hover',
                  },
                }}
              />
            ))}
          </Stack>
        </Box>
      </Stack>

      <FormControl component="fieldset" sx={{ width: '100%' }}>
        {filteredProviderOptions.map((group) => (
          <Box key={group.category} sx={{ mb: 3 }}>
            <Typography
              variant="subtitle1"
              sx={{
                mb: 1.5,
                fontWeight: 600,
                color: 'text.primary',
                fontSize: '1rem',
              }}
            >
              {group.title}
            </Typography>

            <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
              {group.description}
            </Typography>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 2,
              }}
            >
              {group.options.map((option) => (
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
                    flexDirection: 'column',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Radio
                      checked={selectedProviderType === option.value}
                      onChange={() => handleProviderTypeSelect(option.value)}
                      value={option.value}
                      name="provider-type-radio"
                      sx={{ mr: 1, p: 0 }}
                      size="small"
                    />
                    <Typography
                      variant="subtitle1"
                      sx={{
                        fontWeight: selectedProviderType === option.value ? 600 : 500,
                        color:
                          selectedProviderType === option.value ? 'primary.main' : 'text.primary',
                        flex: 1,
                      }}
                    >
                      {option.label}
                    </Typography>
                    {selectedProviderType === option.value && (
                      <CheckCircleIcon color="primary" fontSize="small" />
                    )}
                  </Box>

                  <Typography variant="body2" sx={{ color: 'text.secondary', ml: '28px' }}>
                    {option.description}
                  </Typography>
                </Paper>
              ))}
            </Box>
          </Box>
        ))}
      </FormControl>
    </Box>
  );
}
