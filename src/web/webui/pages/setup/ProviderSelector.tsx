import React from 'react';
import { Autocomplete, Box, Chip, TextField } from '@mui/material';
import { ProviderConfig } from '../../../../types';
import ProviderConfigDialog from './ProviderConfigDialog';

const defaultProviders: ProviderConfig[] = [
  {
    id: 'openai:gpt-3.5-turbo',
    config: {
      temperature: 0.5,
      max_tokens: 1024,
    },
  },
  {
    id: 'openai:gpt-4',
    config: {
      temperature: 0.5,
      max_tokens: 1024,
    },
  },
];

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
            const isCustom = typeof provider === 'string';

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
          <TextField {...params} variant="outlined" label="Providers" placeholder="Providers" />
        )}
      />
      {selectedProvider && (
        <ProviderConfigDialog
          open={!!selectedProvider}
          config={selectedProvider.config}
          onClose={() => setSelectedProvider(null)}
          onSave={handleSave}
        />
      )}
    </Box>
  );
};

export default ProviderSelector;
