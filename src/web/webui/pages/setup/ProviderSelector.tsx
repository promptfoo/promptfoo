import React from 'react';
import { Autocomplete, Box, Chip, TextField } from '@mui/material';

const providerOptions = ['openai:gpt-3.5-turbo', 'openai:gpt-4', 'localai:chat:vicuna'];

interface ProviderSelectorProps {
  providers: string[];
  onChange: (providers: string[]) => void;
}

const ProviderSelector: React.FC<ProviderSelectorProps> = ({ providers, onChange }) => {
  return (
    <Box mt={2}>
      <Autocomplete
        multiple
        freeSolo
        options={providerOptions}
        value={providers}
        onChange={(event, newValue) => {
          onChange(newValue);
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
