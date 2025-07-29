import { useEffect, useState } from 'react';

import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import Box from '@mui/material/Box';
import FormControl from '@mui/material/FormControl';
import Paper from '@mui/material/Paper';
import Radio from '@mui/material/Radio';
import { useTheme } from '@mui/material/styles';
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
        value: 'openrouter',
        label: 'OpenRouter',
        description: 'Access hundreds of top AI models through a single API',
      },
      {
        value: 'mistral',
        label: 'Mistral AI',
        description: "Mistral's language models including Magistral",
      },
      {
        value: 'cohere',
        label: 'Cohere',
        description: "Cohere's language models",
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
        value: 'cerebras',
        label: 'Cerebras',
        description: 'High-performance inference for Llama models',
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
        value: 'fireworks',
        label: 'Fireworks AI',
        description: 'Various hosted models with fast inference',
      },
      {
        value: 'together',
        label: 'Together AI',
        description: 'Various hosted models with competitive pricing',
      },
      {
        value: 'replicate',
        label: 'Replicate',
        description: 'Various hosted models including image generation',
      },
      {
        value: 'huggingface',
        label: 'Hugging Face',
        description: 'Access thousands of models',
      },
    ],
  },
  {
    category: 'specialized',
    title: 'Specialized Providers',
    description: 'Providers for specific use cases and integrations',
    options: [
      {
        value: 'github',
        label: 'GitHub Models',
        description: "GitHub's hosted models from multiple providers",
      },
      {
        value: 'xai',
        label: 'X.AI (Grok)',
        description: "X.AI's Grok models",
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
    description: 'Run models locally on your infrastructure',
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
  {
    category: 'custom',
    title: 'Custom Providers',
    description: 'Use custom code or specialized integrations',
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
        id: 'openai:gpt-4o',
        config: {},
        label: currentLabel,
      });
    } else if (value === 'anthropic') {
      setProvider({
        id: 'anthropic:messages:claude-3-5-sonnet-20241022',
        config: {},
        label: currentLabel,
      });
    } else if (value === 'google') {
      setProvider({
        id: 'google:gemini-1.5-pro',
        config: {},
        label: currentLabel,
      });
    } else if (value === 'vertex') {
      setProvider({
        id: 'vertex:gemini-1.5-pro',
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
    } else {
      setProvider({
        id: value,
        config: {},
        label: currentLabel,
      });
    }
  };

  // Filter available options if availableProviderIds is provided
  const filteredProviderOptions = providerOptions
    .map((group) => ({
      ...group,
      options: group.options.filter(
        (option) => !availableProviderIds || availableProviderIds.includes(option.value),
      ),
    }))
    .filter((group) => group.options.length > 0);

  return (
    <Box>
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
