import React from 'react';
import { Autocomplete, Box, Chip, TextField } from '@mui/material';
import {ProviderConfig} from '../../../../types';

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
  return (
    <Box mt={2}>
      <Autocomplete
        multiple
        freeSolo
        options={defaultProviders}
        value={providers.map(provider => provider.id)}
        onChange={(event, newValue: (string | ProviderConfig)[]) => {
          if (typeof newValue === 'string') {
            onChange([...providers, { id: newValue }]);
          } else {
            onChange(newValue.map(value => typeof value === 'string' ? { id: value } : value));
          }
        }}
        renderTags={(value: ProviderConfig[], getTagProps) =>
          value.map((provider: ProviderConfig, index: number) => (
            <Chip variant="outlined" label={provider.id || 'Unknown provider'} {...getTagProps({ index })} key={provider.id} />
          ))
        }
        renderInput={(params) => (
          <TextField {...params} variant="outlined" label="Providers" placeholder="Providers" />
        )}
      />
    </Box>
  );
};

export default ProviderSelector;
