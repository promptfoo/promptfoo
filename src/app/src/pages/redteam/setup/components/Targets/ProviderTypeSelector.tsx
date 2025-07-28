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
    description: 'Test models directly without application context',
    options: [
      {
        value: 'openrouter',
        label: 'OpenRouter',
        description: 'Access hundreds of top AI models through a single API',
      },
      {
        value: 'azure',
        label: 'Azure OpenAI',
        description: 'Access Azure OpenAI models',
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
                height: '105px',
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