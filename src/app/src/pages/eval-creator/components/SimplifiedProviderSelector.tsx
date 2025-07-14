import React from 'react';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import type { ProviderOptions } from '@promptfoo/types';
import { useProvidersStore } from '../../../store/providersStore';
import { useApiKeyDiscovery } from '../hooks/useApiKeyDiscovery';
import AddLocalProviderDialog from './AddLocalProviderDialog';
import ProviderConfigDialog from './ProviderConfigDialog';
import NextStepsGuide from './NextStepsGuide';

// Extended type for providers with UI metadata
interface ProviderWithMetadata extends ProviderOptions {
  _hasApiKey?: boolean;
}

// Simplified list of most popular providers - Updated for 2025
const POPULAR_PROVIDERS: ProviderOptions[] = [
  // OpenAI - Latest 2025 models
  {
    id: 'openai:gpt-4.1',
    label: 'GPT-4.1 (Latest 2025)',
    config: {
      temperature: 0.5,
      max_tokens: 1024,
    },
  },
  {
    id: 'openai:o4-mini',
    label: 'O4 Mini (Reasoning)',
    config: {
      temperature: 0.5,
      max_tokens: 1024,
    },
  },
  {
    id: 'openai:gpt-4o',
    label: 'GPT-4o (Previous Gen)',
    config: {
      temperature: 0.5,
      max_tokens: 1024,
    },
  },
  {
    id: 'openai:gpt-4o-mini',
    label: 'GPT-4o Mini (Fast & Cheap)',
    config: {
      temperature: 0.5,
      max_tokens: 1024,
    },
  },
  {
    id: 'openai:gpt-nano',
    label: 'GPT Nano (Ultra Fast)',
    config: {
      temperature: 0.5,
      max_tokens: 1024,
    },
  },

  // Anthropic - Claude 4 series
  {
    id: 'anthropic:messages:claude-4-opus',
    label: 'Claude 4 Opus (Most Capable)',
    config: {
      max_tokens: 1024,
      temperature: 0.5,
    },
  },
  {
    id: 'anthropic:messages:claude-4-sonnet',
    label: 'Claude 4 Sonnet (Balanced)',
    config: {
      max_tokens: 1024,
      temperature: 0.5,
    },
  },
  {
    id: 'anthropic:messages:claude-4-haiku',
    label: 'Claude 4 Haiku (Fast)',
    config: {
      max_tokens: 1024,
      temperature: 0.5,
    },
  },

  // Google
  {
    id: 'google:gemini-2.5-flash',
    label: 'Gemini 2.5 Flash (AI Studio)',
    config: {
      temperature: 0.5,
      maxOutputTokens: 1024,
    },
  },
  {
    id: 'google:gemini-2.5-pro',
    label: 'Gemini 2.5 Pro (AI Studio)',
    config: {
      temperature: 0.5,
      maxOutputTokens: 1024,
    },
  },
  {
    id: 'vertex:gemini-2.5-flash',
    label: 'Gemini 2.5 Flash (Vertex AI)',
    config: {
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 1024,
      },
    },
  },
  {
    id: 'vertex:gemini-2.5-pro',
    label: 'Gemini 2.5 Pro (Vertex AI)',
    config: {
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 1024,
      },
    },
  },
];

// Additional providers for advanced users
const ADDITIONAL_PROVIDERS: ProviderOptions[] = [
  // Meta Llama 4
  {
    id: 'replicate:meta/llama-4-70b',
    label: 'Llama 4 70B (Latest)',
    config: {
      temperature: 0.5,
      max_tokens: 1024,
    },
  },
  {
    id: 'bedrock:meta.llama4-70b-instruct-v1',
    label: 'AWS Bedrock: Llama 4 70B',
    config: {
      max_tokens: 1024,
      temperature: 0.5,
      region: 'us-east-1',
    },
  },

  // AWS Bedrock
  {
    id: 'bedrock:anthropic.claude-4-opus-20250114',
    label: 'AWS Bedrock: Claude 4 Opus',
    config: {
      max_tokens: 1024,
      temperature: 0.5,
      region: 'us-east-1',
    },
  },

  // Azure
  {
    id: 'azure:chat:gpt-4.1',
    label: 'Azure: GPT-4.1',
    config: {
      api_host: 'your-resource-name.openai.azure.com',
      temperature: 0.5,
      max_tokens: 1024,
    },
  },
  {
    id: 'azure:chat:o4-mini',
    label: 'Azure: O4 Mini',
    config: {
      api_host: 'your-resource-name.openai.azure.com',
      temperature: 0.5,
      max_tokens: 1024,
    },
  },

  // Mistral
  {
    id: 'mistral:mistral-large-2411',
    label: 'Mistral Large (Nov 2024)',
    config: {
      temperature: 0.5,
      max_tokens: 1024,
    },
  },

  // Local/Custom
  {
    id: 'ollama:llama4',
    label: 'Ollama: Llama 4 (Local)',
    config: {},
  },
  {
    id: 'ollama:deepseek-r1',
    label: 'Ollama: DeepSeek R1 (Local)',
    config: {},
  },
  {
    id: 'http://localhost:8080',
    label: 'Custom HTTP Endpoint',
    config: {},
  },
];

const PROVIDER_GROUPS: Record<string, string> = {
  'openai:': 'OpenAI',
  'anthropic:': 'Anthropic',
  'google:': 'Google AI Studio',
  'vertex:': 'Google Vertex AI',
  'bedrock:': 'AWS Bedrock',
  'azure:': 'Microsoft Azure',
  'replicate:': 'Replicate',
  'mistral:': 'Mistral AI',
  'ollama:': 'Local Models',
  http: 'Custom Endpoints',
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

const SimplifiedProviderSelector: React.FC<ProviderSelectorProps> = ({ providers, onChange }) => {
  const { customProviders, addCustomProvider } = useProvidersStore();
  const { apiKeyStatus, loading: apiKeysLoading } = useApiKeyDiscovery();
  const [selectedProvider, setSelectedProvider] = React.useState<ProviderOptions | null>(null);
  const [isAddLocalDialogOpen, setIsAddLocalDialogOpen] = React.useState(false);
  const [showAllProviders, setShowAllProviders] = React.useState(false);

  // Get providers with API key prioritization
  const getDefaultProviders = React.useCallback((): ProviderWithMetadata[] => {
    // Sort providers based on available credentials
    const providers: ProviderWithMetadata[] = [];

    // Add providers with available API keys first
    POPULAR_PROVIDERS.forEach((provider) => {
      const hasKey =
        (provider.id.startsWith('openai:') && apiKeyStatus.openai) ||
        (provider.id.startsWith('anthropic:') && apiKeyStatus.anthropic) ||
        (provider.id.startsWith('google:') && apiKeyStatus.google) ||
        (provider.id.startsWith('vertex:') && apiKeyStatus.google);

      providers.push({
        ...provider,
        // Add metadata for UI
        _hasApiKey: hasKey,
      });
    });

    ADDITIONAL_PROVIDERS.forEach((provider) => {
      const hasKey =
        (provider.id.startsWith('bedrock:') && apiKeyStatus.aws) ||
        (provider.id.startsWith('azure:') && apiKeyStatus.azure) ||
        (provider.id.startsWith('replicate:') && apiKeyStatus.replicate) ||
        (provider.id.startsWith('mistral:') && apiKeyStatus.mistral) ||
        provider.id.startsWith('ollama:') ||
        provider.id.startsWith('http'); // Local always available

      providers.push({
        ...provider,
        _hasApiKey: hasKey,
      });
    });

    // Sort: available providers first, then by group
    return providers.sort((a, b) => {
      const aHasKey = a._hasApiKey;
      const bHasKey = b._hasApiKey;

      if (aHasKey && !bHasKey) {
        return -1;
      }
      if (!aHasKey && bHasKey) {
        return 1;
      }

      // Then sort by provider type (OpenAI first)
      const aGroup = getProviderGroup(a);
      const bGroup = getProviderGroup(b);

      if (aGroup === 'OpenAI' && bGroup !== 'OpenAI') {
        return -1;
      }
      if (aGroup !== 'OpenAI' && bGroup === 'OpenAI') {
        return 1;
      }

      return 0;
    });
  }, [apiKeyStatus]);

  const handleAddLocalProvider = (provider: ProviderOptions) => {
    addCustomProvider(provider);
    onChange([...providers, provider]);
  };

  const availableProviders = React.useMemo(() => getDefaultProviders(), [getDefaultProviders]);

  // Get top 5 recommended providers
  const topProviders = React.useMemo(() => {
    const recommended = [
      'openai:gpt-4.1',
      'anthropic:messages:claude-4-opus',
      'google:gemini-2.5-pro',
      'openai:o4-mini',
      'anthropic:messages:claude-4-sonnet',
    ];

    return availableProviders.filter((p) => recommended.includes(p.id));
  }, [availableProviders]);

  const allProviders = React.useMemo(() => {
    const providers = showAllProviders ? availableProviders : topProviders;
    return [...providers, ...customProviders];
  }, [availableProviders, topProviders, customProviders, showAllProviders]);

  const handleProviderClick = (provider: ProviderOptions | string) => {
    setSelectedProvider(typeof provider === 'string' ? { id: provider } : provider);
  };

  const handleSave = (providerId: string, config: Record<string, any>) => {
    onChange(providers.map((p) => (p.id === providerId && !p.label ? { ...p, config } : p)));
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

  // Count available API keys
  const availableKeys = React.useMemo(
    () =>
      [
        apiKeyStatus.openai && 'OpenAI',
        apiKeyStatus.anthropic && 'Anthropic',
        apiKeyStatus.google && 'Google',
        apiKeyStatus.aws && 'AWS',
        apiKeyStatus.azure && 'Azure',
        apiKeyStatus.mistral && 'Mistral',
        apiKeyStatus.replicate && 'Replicate',
      ].filter(Boolean),
    [apiKeyStatus],
  );

  return (
    <Box mt={2}>
      <NextStepsGuide currentSection="providers" />
      <Box display="flex" gap={2} alignItems="flex-start">
        <Autocomplete
          sx={{
            flex: 1,
            '& .MuiOutlinedInput-root': {
              minHeight: '56px',
              height: 'auto',
              padding: '8px 14px 8px 8px !important',
              flexWrap: 'wrap',
            },
            '& .MuiAutocomplete-tag': {
              margin: '2px',
            },
          }}
          multiple
          freeSolo
          options={allProviders}
          value={providers}
          groupBy={getProviderGroup}
          onChange={(event, newValue: (string | ProviderOptions)[]) => {
            const validValues = newValue.filter((value) => value !== null && value !== undefined);
            onChange(
              validValues.map((value) => (typeof value === 'string' ? { id: value } : value)),
            );
          }}
          getOptionLabel={getOptionLabel}
          renderOption={(props, option) => {
            const label = getOptionLabel(option);
            const id = getProviderId(option);
            const hasKey = (option as ProviderWithMetadata)._hasApiKey;
            return (
              <li {...props}>
                <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1 }}>
                  {hasKey && (
                    <Tooltip title="API key detected">
                      <CheckCircleIcon sx={{ color: 'success.main', fontSize: '1rem' }} />
                    </Tooltip>
                  )}
                  <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <Typography variant="body1">{label}</Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontSize: '0.7rem' }}
                    >
                      {id}
                    </Typography>
                  </Box>
                </Box>
              </li>
            );
          }}
          renderTags={(value, getTagProps) =>
            value.map((provider, index: number) => {
              const label = getOptionLabel(provider);
              const id = getProviderId(provider);
              return (
                <Tooltip
                  title={id}
                  key={
                    typeof provider === 'string' ? provider : provider.id + (provider.label || '')
                  }
                >
                  <Chip
                    variant="outlined"
                    label={label}
                    {...getTagProps({ index })}
                    onClick={() => handleProviderClick(provider)}
                    sx={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  />
                </Tooltip>
              );
            })
          }
          renderInput={(params) => (
            <TextField
              {...params}
              variant="outlined"
              placeholder="Select AI models to test"
              helperText={
                <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
                  {apiKeysLoading ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CircularProgress size={12} />
                      <Typography variant="caption">Checking available providers...</Typography>
                    </Box>
                  ) : (
                    <>
                      <Typography variant="caption">
                        {providers.length > 0
                          ? 'Click a model to configure settings. '
                          : showAllProviders
                            ? 'Showing all available models. '
                            : 'Showing recommended models. '}
                      </Typography>
                      {!showAllProviders && (
                        <Button
                          size="small"
                          onClick={() => setShowAllProviders(true)}
                          sx={{
                            textTransform: 'none',
                            minHeight: 'auto',
                            padding: '2px 8px',
                            fontSize: '0.75rem',
                          }}
                        >
                          Show all providers ({availableProviders.length - topProviders.length}{' '}
                          more)
                        </Button>
                      )}
                      {availableKeys.length > 0 && (
                        <Typography variant="caption" color="success.main">
                          ✓ API keys detected for: {availableKeys.join(', ')}
                        </Typography>
                      )}
                      {availableKeys.length === 0 && (
                        <Typography variant="caption" color="text.secondary">
                          Add API keys in environment variables for automatic detection.
                        </Typography>
                      )}
                    </>
                  )}
                </Box>
              }
            />
          )}
        />
        <Button
          variant="outlined"
          onClick={() => setIsAddLocalDialogOpen(true)}
          startIcon={<FolderOpenIcon />}
          sx={{
            height: '56px',
            whiteSpace: 'nowrap',
            px: 3,
            minWidth: 'fit-content',
            alignSelf: 'flex-start',
          }}
        >
          Local/Custom
        </Button>
      </Box>

      <AddLocalProviderDialog
        open={isAddLocalDialogOpen}
        onClose={() => setIsAddLocalDialogOpen(false)}
        onAdd={handleAddLocalProvider}
      />
      {selectedProvider && selectedProvider.id && (
        <ProviderConfigDialog
          open={!!selectedProvider}
          providerId={selectedProvider.id}
          config={selectedProvider.config}
          onClose={() => setSelectedProvider(null)}
          onSave={handleSave}
        />
      )}
    </Box>
  );
};

export default React.memo(SimplifiedProviderSelector);
