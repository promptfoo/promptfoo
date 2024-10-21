import React from 'react';
import type { SelectChangeEvent } from '@mui/material';
import { FormControl, InputLabel, Select, MenuItem } from '@mui/material';

interface FilterModeSelectorProps {
  filterMode: string;
  onChange: (event: SelectChangeEvent) => void;
}

export const FilterModeSelector: React.FC<FilterModeSelectorProps> = ({ filterMode, onChange }) => {
  return (
    <FormControl sx={{ minWidth: 180 }} size="small">
      <InputLabel id="failure-filter-mode-label">Display</InputLabel>
      <Select
        labelId="filter-mode-label"
        id="filter-mode"
        value={filterMode}
        onChange={onChange}
        label="Filter"
      >
        <MenuItem value="all">Show all results</MenuItem>
        <MenuItem value="failures">Show failures only</MenuItem>
        <MenuItem value="different">Show different only</MenuItem>
        <MenuItem value="highlights">Show highlights only</MenuItem>
      </Select>
    </FormControl>
  );
};
