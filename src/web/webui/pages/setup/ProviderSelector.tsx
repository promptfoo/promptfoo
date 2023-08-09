import React from 'react';
import { FormControl, InputLabel, Select, MenuItem, Box, Chip } from '@mui/material';

const providerOptions = ['openai:gpt-3.5-turbo', 'openai:gpt-4', 'localai:chat:vicuna'];

interface ProviderSelectorProps {
  providers: string[];
  setProviders: (providers: string[]) => void;
}

const ProviderSelector: React.FC<ProviderSelectorProps> = ({ providers, setProviders }) => {
  return (
    <FormControl fullWidth margin="normal">
      <InputLabel id="providers-select-label">Providers</InputLabel>
      <Select
        labelId="providers-select-label"
        label="Providers"
        multiple
        value={providers}
        onChange={(e) => {
          setProviders(e.target.value as string[]);
        }}
        renderValue={(selected) => (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {(selected as string[]).map((value) => (
              <Chip key={value} label={value} />
            ))}
          </Box>
        )}
      >
        {providerOptions.map((option) => (
          <MenuItem key={option} value={option}>
            {option}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};

export default ProviderSelector;
