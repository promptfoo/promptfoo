import React from 'react';
import { Autocomplete, Box, Chip, TextField } from '@mui/material';
import { ProviderConfig } from '../../../../../types';
import ProviderConfigDialog from './ProviderConfigDialog';

const defaultProviders: ProviderConfig[] = [
  {
    id: 'replicate:replicate/llama70b-v2-chat:e951f18578850b652510200860fc4ea62b3b16fac280f83ff32282f87bbd2e48',
    config: { temperature: 0.5 },
  },
]
  .concat(
    [
      'anthropic:claude-1',
      'anthropic:claude-1-100k',
      'anthropic:claude-instant-1',
      'anthropic:claude-instant-1-100k',
    ].map((id) => ({ id, config: { temperature: 0.5 } })),
  )
  .concat(
    [
      'openai:gpt-3.5-turbo',
      'openai:gpt-3.5-turbo-0301',
      'openai:gpt-3.5-turbo-0613',
      'openai:gpt-3.5-turbo-16k',
      'openai:gpt-3.5-turbo-16k-0613',
      'openai:gpt-4',
      'openai:gpt-4-0314',
      'openai:gpt-4-0613',
      'openai:gpt-4-32k',
      'openai:gpt-4-32k-0314',
    ].map((id) => ({ id, config: { temperature: 0.5, max_tokens: 1024 } })),
  )
  .concat(
    [
      'azureopenai:gpt-3.5-turbo',
      'azureopenai:gpt-3.5-turbo-0301',
      'azureopenai:gpt-3.5-turbo-0613',
      'azureopenai:gpt-3.5-turbo-16k',
      'azureopenai:gpt-3.5-turbo-16k-0613',
      'azureopenai:gpt-4',
      'azureopenai:gpt-4-0314',
      'azureopenai:gpt-4-0613',
      'azureopenai:gpt-4-32k',
      'azureopenai:gpt-4-32k-0314',
    ].map((id) => ({ id, config: { temperature: 0.5, max_tokens: 1024 } })),
  )
  .sort((a, b) => a.id.localeCompare(b.id));

interface ProviderSelectorProps {
  providers: ProviderConfig[];
  onChange: (providers: ProviderConfig[]) => void;
}

const ProviderSelector: React.FC<ProviderSelectorProps> = ({ providers, onChange }) => {
  const [selectedProvider, setSelectedProvider] = React.useState<ProviderConfig | null>(null);

  const getProviderLabel = (provider: string | ProviderConfig) => {
    if (typeof provider === 'string') {
      return provider;
    }
    return provider.id || 'Unknown provider';
  };

  const getProviderKey = (provider: string | ProviderConfig, index: number) => {
    if (typeof provider === 'string') {
      return provider;
    }
    return provider.id || index;
  };

  const handleProviderClick = (provider: string | ProviderConfig) => {
    if (typeof provider === 'string') {
      alert('Cannot edit custom providers');
    } else if (!provider.config) {
      alert('There is no config for this provider');
    } else {
      setSelectedProvider(provider as ProviderConfig);
    }
  };

  const handleSave = (config: ProviderConfig['config']) => {
    if (selectedProvider) {
      const updatedProviders = providers.map((provider) =>
        provider.id === selectedProvider.id ? { ...provider, config } : provider,
      );
      onChange(updatedProviders);
      setSelectedProvider(null);
    }
  };

  return (
    <Box mt={2}>
      <Autocomplete
        multiple
        freeSolo
        options={defaultProviders}
        value={providers}
        onChange={(event, newValue: (string | ProviderConfig)[]) => {
          onChange(newValue.map((value) => (typeof value === 'string' ? { id: value } : value)));
        }}
        getOptionLabel={(option) => {
          if (!option) {
            return '';
          }
          if (typeof option === 'string') {
            return option;
          }
          return (option as ProviderConfig).id || 'Unknown provider';
        }}
        renderTags={(value, getTagProps) =>
          value.map((provider, index: number) => {
            const label = getProviderLabel(provider);
            const key = getProviderKey(provider, index);

            return (
              <Chip
                variant="outlined"
                label={label}
                {...getTagProps({ index })}
                key={key}
                onClick={() => handleProviderClick(provider)}
              />
            );
          })
        }
        renderInput={(params) => (
          <TextField
            {...params}
            variant="outlined"
            placeholder="Select LLM providers"
            helperText={providers.length > 0 ? 'Click a provider to configure its settings.' : null}
          />
        )}
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

export default ProviderSelector;
