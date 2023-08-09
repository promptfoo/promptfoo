import React from 'react';
import { Autocomplete, Box, Chip, TextField } from '@mui/material';
import {ProviderConfig} from '../../../../types';

const defaultProviders = ['openai:gpt-3.5-turbo', 'openai:gpt-4', 'localai:chat:vicuna'];

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
        value={providers.map((provider) => provider.id || undefined)}
        onChange={(event, newValue) => {
          onChange(
            newValue
              .filter((id): id is string => id !== undefined)
              .map((id) => ({ id }))
          );
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
