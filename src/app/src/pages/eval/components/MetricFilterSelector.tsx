import React from 'react';
import Box from '@mui/material/Box';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import type { SelectChangeEvent } from '@mui/material/Select';
import Select from '@mui/material/Select';

interface MetricFilterSelectorProps {
  selectedMetric: string | null;
  availableMetrics: string[];
  onChange: (metric: string | null) => void;
}

export const MetricFilterSelector: React.FC<MetricFilterSelectorProps> = ({
  selectedMetric,
  availableMetrics,
  onChange,
}) => {
  if (availableMetrics.length === 0) {
    return null;
  }

  const handleChange = (event: SelectChangeEvent) => {
    onChange(event.target.value === '' ? null : event.target.value);
  };

  return (
    <Box>
      <FormControl variant="outlined" size="small" sx={{ minWidth: 180 }}>
        <InputLabel id="metric-filter-label">Filter by Metric</InputLabel>
        <Select
          labelId="metric-filter-label"
          id="metric-filter-select"
          value={selectedMetric || ''}
          onChange={handleChange}
          label="Filter by Metric"
        >
          <MenuItem value="">All metrics</MenuItem>
          {availableMetrics.map((metric) => (
            <MenuItem key={metric} value={metric}>
              {metric}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Box>
  );
};
