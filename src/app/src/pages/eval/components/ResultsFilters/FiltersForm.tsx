import { useState, useMemo } from 'react';
import CloseIcon from '@mui/icons-material/Close';
import { Popover, Box, FormControl, InputLabel, Select, MenuItem, IconButton } from '@mui/material';
import { useTableStore } from '../store';

type FilterType = 'metric' | 'strategy' | 'plugin' | 'metadata';
type Operator = 'equals';

function Dropdown({
  label,
  values,
  value,
  onChange,
}: {
  label: string;
  values: { label: string; value: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <FormControl variant="outlined" size="small" sx={{ minWidth: 180 }}>
      <InputLabel id="metric-filter-label">{label}</InputLabel>
      <Select
        labelId="metric-filter-label"
        id="metric-filter-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        label={label}
      >
        {values.map((value) => (
          <MenuItem key={value.value} value={value.value}>
            {value.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

function Filter() {
  const { selectedMetric, setSelectedMetric, availableMetrics } = useTableStore();

  const [filterType, setFilterType] = useState<FilterType>('metric');
  const [operator, setOperator] = useState<Operator>('equals');
  //const [value, setValue] = useState<string>('');

  /**
   * Constructs the value dropdown props based on the filter type.
   */
  const [label, value, values, onChange] = useMemo(() => {
    if (filterType === 'metric') {
      return [
        'Metric',
        selectedMetric ?? '',
        availableMetrics.map((metric) => ({ label: metric, value: metric })),
        (value: string) => setSelectedMetric(value),
      ];
    }
    return ['', '', [], () => {}];
  }, [selectedMetric, availableMetrics, filterType, setSelectedMetric]);

  return (
    <Box sx={{ display: 'flex', gap: 1 }}>
      <IconButton>
        <CloseIcon />
      </IconButton>
      {/* FILTER TYPE */}
      <Dropdown
        label="Filter Type"
        values={[
          { label: 'Metric', value: 'metric' },
          // { label: 'Strategy', value: 'strategy' },
          // { label: 'Plugin', value: 'plugin' },
          // { label: 'Metadata', value: 'metadata' },
        ]}
        value={filterType}
        onChange={(value) => setFilterType(value as FilterType)}
      />
      {/* OPERATOR */}
      <Dropdown
        label="Operator"
        values={[
          {
            label: 'Equals',
            value: 'equals',
          },
        ]}
        value={operator}
        onChange={(value) => setOperator(value as Operator)}
      />
      {/* VALUE */}
      <Dropdown label={label} values={values} value={value} onChange={onChange} />
    </Box>
  );
}

export default function FiltersForm({
  open,
  onClose,
  anchorEl,
}: {
  open: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
}) {
  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorEl={anchorEl}
      anchorOrigin={{
        vertical: 'bottom',
        horizontal: 'left',
      }}
    >
      <Box sx={{ p: 2 }}>
        <Filter />
      </Box>
    </Popover>
  );
}
