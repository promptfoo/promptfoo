import React from 'react';

import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import type { SelectChangeEvent } from '@mui/material/Select';

interface FilterModeSelectorProps {
  filterMode: string;
  onChange: (event: SelectChangeEvent) => void;
  showDifferentOption?: boolean;
}

const BASE_OPTIONS = [
  { value: 'all', label: 'Show all results' },
  { value: 'failures', label: 'Show failures only' },
  { value: 'errors', label: 'Show errors only' },
  { value: 'different', label: 'Show different outputs' },
  { value: 'highlights', label: 'Show highlights only' },
];

export const FilterModeSelector: React.FC<FilterModeSelectorProps> = ({
  filterMode,
  onChange,
  showDifferentOption = true,
}) => {
  const options = showDifferentOption
    ? BASE_OPTIONS
    : BASE_OPTIONS.filter((o) => o.value !== 'different');
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
