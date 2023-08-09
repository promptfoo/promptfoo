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
        options={defaultProviders}
        value={providers}
        onChange={(event, newValue: ProviderConfig[]) => {
          onChange(newValue);
        }}
        renderTags={(value: ProviderConfig[], getTagProps) =>
          value.map((provider: ProviderConfig, index: number) => (
            <Chip variant="outlined" label={provider.id || 'Unknown provider'} {...getTagProps({ index })} key={index} />
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
