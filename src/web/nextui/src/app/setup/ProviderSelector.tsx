import React from 'react';
import { Autocomplete, Box, Chip, TextField } from '@mui/material';
import ProviderConfigDialog from './ProviderConfigDialog';

import type { ProviderOptions } from '../../../../../types';

const defaultProviders: ProviderOptions[] = ([] as (ProviderOptions & { id: string })[])
  .concat(
    [
      'replicate:replicate/llama70b-v2-chat:e951f18578850b652510200860fc4ea62b3b16fac280f83ff32282f87bbd2e48',
      'replicate:replicate/flan-t5-small:69716ad8c34274043bf4a135b7315c7c569ec931d8f23d6826e249e1c142a264',
    ].map((id) => ({
      id,
      config: { apiKey: '', temperature: 0.5, max_length: 1024, repetition_penality: 1.0 },
    })),
  )
  .concat(
    [
      'replicate:a16z-infra/llama-2-7b-chat:7b0bfc9aff140d5b75bacbed23e91fd3c34b01a1e958d32132de6e0a19796e2c',
      'replicate:a16z-infra/llama-2-13b-chat:2a7f981751ec7fdf87b5b91ad4db53683a98082e9ff7bfd12c8cd5ea85980a52',
    ].map((id) => ({
      id,
      config: {
        apiKey: '',
        temperature: 0.95,
        top_p: 0.95,
        top_k: 250,
        max_new_tokens: 500,
        min_new_tokens: -1,
        repetition_penality: 1.0,
        system_prompt: '',
      },
    })),
  )
  .concat(
    [
      'anthropic:claude-1',
      'anthropic:claude-1-100k',
      'anthropic:claude-instant-1',
      'anthropic:claude-instant-1-100k',
    ].map((id) => ({ id, config: { apiKey: '', max_tokens_to_sample: 256, temperature: 0.5 } })),
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
    ].map((id) => ({
      id,
      config: {
        apiKey: '',
        organization: '',
        apiHost: 'api.openai.com',
        temperature: 0.5,
        max_tokens: 1024,
        top_p: 1.0,
        frequency_penalty: 0.0,
        presence_penalty: 0.0,
      },
    })),
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
    ].map((id) => ({
      id,
      config: {
        apiKey: '',
        temperature: 0.5,
        max_tokens: 1024,
        top_p: 1.0,
        frequency_penalty: 0.0,
        presence_penalty: 0.0,
      },
    })),
  )
  .sort((a, b) => a.id.localeCompare(b.id));

interface ProviderSelectorProps {
  providers: ProviderOptions[];
  onChange: (providers: ProviderOptions[]) => void;
}

const ProviderSelector: React.FC<ProviderSelectorProps> = ({ providers, onChange }) => {
  const [selectedProvider, setSelectedProvider] = React.useState<ProviderOptions | null>(null);

  const getProviderLabel = (provider: string | ProviderOptions) => {
    if (typeof provider === 'string') {
      return provider;
    }
    return provider.id || 'Unknown provider';
  };

  const getProviderKey = (provider: string | ProviderOptions, index: number) => {
    if (typeof provider === 'string') {
      return provider;
    }
    return provider.id || index;
  };

  const handleProviderClick = (provider: string | ProviderOptions) => {
    if (typeof provider === 'string') {
      alert('Cannot edit custom providers');
    } else if (!provider.config) {
      alert('There is no config for this provider');
    } else {
      setSelectedProvider(provider as ProviderOptions);
    }
  };

  const handleSave = (config: ProviderOptions['config']) => {
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
        onChange={(event, newValue: (string | ProviderOptions)[]) => {
          onChange(newValue.map((value) => (typeof value === 'string' ? { id: value } : value)));
        }}
        getOptionLabel={(option) => {
          if (!option) {
            return '';
          }
          if (typeof option === 'string') {
            return option;
          }
          return (option as ProviderOptions).id || 'Unknown provider';
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
