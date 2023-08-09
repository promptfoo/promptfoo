import React from 'react';
import { Autocomplete, Box, Chip, TextField } from '@mui/material';
import {ProviderConfig} from '../../../../types';

const defaultProviders = [
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
        options={defaultProviders.map((provider) => provider.id || 'Unknown provider')}
        value={providers.map((provider) => provider.id || 'Unknown provider')}
        onChange={(event, newValue) => {
          onChange(newValue.map((id) => ({ id })));
        }}
        renderTags={(value: string[], getTagProps) =>
          value.map((option: string, index: number) => (
            <Chip variant="outlined" label={option} {...getTagProps({ index })} key={index} />
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
