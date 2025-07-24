import React from 'react';

import Box from '@mui/material/Box';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import { useTableStore } from './store';
import type { SelectChangeEvent } from '@mui/material/Select';

export const MetricFilterSelector: React.FC<{}> = () => {
  const { filters, addFilter, resetFilters } = useTableStore();
  const availableMetrics = filters.options.metric;

  const handleChange = React.useCallback(
    (event: SelectChangeEvent) => {
      const value = event.target.value;

      // Always reset any existing filters.
      resetFilters();

      if (value) {
        addFilter({
          type: 'metric',
          operator: 'equals',
          value,
        });
      }
    },
    [addFilter, resetFilters],
  );

  const selectedMetric =
    Object.keys(filters.values).length > 0 ? Object.values(filters.values)[0].value : null;

  return (
    <Box>
      <FormControl variant="outlined" size="small" sx={{ minWidth: 180 }}>
        <InputLabel id="metric-filter-label">Filter by Metric</InputLabel>
        <Select
          labelId="metric-filter-label"
          id="metric-filter-select"
          value={selectedMetric ?? ''}
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
