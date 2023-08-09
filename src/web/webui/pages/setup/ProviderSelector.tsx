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
  const value = providers.map((provider) => provider.id || 'Unknown provider');

  const handleProviderClick = (provider: ProviderConfig) => {
    setSelectedProvider(provider);
  };

  const handleSave = (config: ProviderConfig['config']) => {
    if (selectedProvider) {
      const updatedProviders = providers.map((provider) =>
        provider.id === selectedProvider.id ? { ...provider, config } : provider
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
        value={value}
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
        renderTags={(value: (string | ProviderConfig)[], getTagProps) =>
          value.map((provider: string | ProviderConfig, index: number) => (
            <Chip
              variant="outlined"
              label={
                typeof provider === 'string'
                  ? provider
                  : (provider as ProviderConfig).id || 'Unknown provider'
              }
              {...getTagProps({ index })}
              key={typeof provider === 'string' ? provider : provider.id || index}
              onClick={() => handleProviderClick(provider as ProviderConfig)}
            />
          ))
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
