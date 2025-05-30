import React from 'react';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import type { SelectChangeEvent } from '@mui/material/Select';
import Select from '@mui/material/Select';

interface FilterModeSelectorProps {
  filterMode: string;
  onChange: (event: SelectChangeEvent) => void;
}

const options = [
  { value: 'all', label: 'Show all results' },
  { value: 'failures', label: 'Show failures only' },
  { value: 'errors', label: 'Show errors only' },
  { value: 'different', label: 'Show different outputs' },
  { value: 'highlights', label: 'Show highlights only' },
  { value: 'thumbs-up', label: 'Show thumbs up' },
  { value: 'thumbs-down', label: 'Show thumbs down' },
  { value: 'human', label: 'Show all human ratings' },
];

export const FilterModeSelector: React.FC<FilterModeSelectorProps> = ({ filterMode, onChange }) => {
  return (
    <FormControl sx={{ minWidth: 180 }} size="small">
      <InputLabel id="filter-mode-label">Display</InputLabel>
      <Select
        labelId="filter-mode-label"
        id="filter-mode"
        value={filterMode}
        onChange={onChange}
        label="Filter"
      >
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};
