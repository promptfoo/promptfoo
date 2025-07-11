import { useCallback } from 'react';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  Popover,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Button,
  Stack,
  Divider,
} from '@mui/material';
import { useTableStore, type ResultsFilter } from '../store';

const TYPE_LABELS_BY_TYPE: Record<ResultsFilter['type'], string> = {
  metric: 'Metric',
  //strategy: 'Strategy',
  //plugin: 'Plugin',
  //metadata: 'Metadata',
};

function Dropdown({
  id,
  label,
  values,
  value,
  onChange,
}: {
  id: string;
  label?: string;
  values: { label: string; value: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <FormControl variant="outlined" size="small" sx={{ minWidth: 180 }}>
      {label && <InputLabel id={`${id}-label`}>{label}</InputLabel>}
      <Select
        labelId={`${id}-label`}
        id={`${id}-select`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        label={label}
        sx={{ width: 200 }}
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

function Filter({ value, index }: { value: ResultsFilter; index: number }) {
  const { filters, updateFilter, removeFilter } = useTableStore();

  /**
   * Updates the filter type.
   * @param type - The new filter type.
   */
  const handleTypeChange = useCallback(
    (filterType: ResultsFilter['type']) => {
      updateFilter({ ...value, type: filterType }, index);
    },
    [value, index, updateFilter],
  );

  /**
   * Updates the filter operator.
   * @param operator - The new filter operator.
   */
  const handleOperatorChange = useCallback(
    (filterOperator: ResultsFilter['operator']) => {
      updateFilter({ ...value, operator: filterOperator }, index);
    },
    [value, index, updateFilter],
  );

  /**
   * Updates the filter value.
   * @param filterValue - The new filter value.
   */
  const handleValueChange = useCallback(
    (filterValue: string) => {
      updateFilter({ ...value, value: filterValue }, index);
    },
    [value, index, updateFilter],
  );

  /**
   * Updates the filter logic operator.
   * @param logicOperator - The new filter logic operator.
   */
  const handleLogicOperatorChange = useCallback(
    (filterLogicOperator: ResultsFilter['logicOperator']) => {
      updateFilter({ ...value, logicOperator: filterLogicOperator }, index);
    },
    [value, index, updateFilter],
  );

  return (
    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'space-between' }}>
      <IconButton onClick={() => removeFilter(index)}>
        <CloseIcon />
      </IconButton>

      <Box sx={{ display: 'flex', gap: 1 }}>
        {index !== 0 && (
          <Dropdown
            id={`${index}-logic-operator-select`}
            values={[
              { label: 'And', value: 'and' },
              { label: 'Or', value: 'or' },
            ]}
            value={value.logicOperator ?? 'and'}
            onChange={(e) => handleLogicOperatorChange(e as ResultsFilter['logicOperator'])}
          />
        )}

        <Dropdown
          id={`${index}-filter-type-select`}
          label="Filter Type"
          values={[
            { label: TYPE_LABELS_BY_TYPE.metric, value: 'metric' },
            // { label: 'Strategy', value: 'strategy' },
            // { label: 'Plugin', value: 'plugin' },
            // { label: 'Metadata', value: 'metadata' },
          ]}
          value={value.type}
          onChange={(e) => handleTypeChange(e as ResultsFilter['type'])}
        />

        <Dropdown
          id={`${index}-operator-select`}
          label="Operator"
          values={[
            {
              label: 'Equals',
              value: 'equals',
            },
          ]}
          value={value.operator}
          onChange={(e) => handleOperatorChange(e as ResultsFilter['operator'])}
        />

        <Dropdown
          id={`${index}-value-select`}
          label={TYPE_LABELS_BY_TYPE[value.type]}
          values={(filters.options[value.type] ?? []).map((value) => ({
            label: value,
            value,
          }))}
          value={value.value}
          onChange={(e) => handleValueChange(e)}
        />
      </Box>
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
  const { filters, addFilter, removeAllFilters } = useTableStore();

  /**
   * Adds a new filter with a default metric filter.
   */
  const handleAddFilter = () => {
    addFilter({
      type: 'metric',
      operator: 'equals',
      value: '',
    });
  };

  /**
   * Removes all filters.
   */
  const handleRemoveAllFilters = () => {
    removeAllFilters();
  };

  // TODO(Will): There should always be a single filter even if its default.

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
        <Stack direction="column" spacing={1}>
          <Stack direction="column" spacing={1}>
            {(filters.values ?? []).map((filter, index) => (
              <Filter key={index} value={filter} index={index} />
            ))}
          </Stack>
          {filters.values.length > 0 && <Divider />}
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'space-between' }}>
            <Button startIcon={<AddIcon />} onClick={handleAddFilter}>
              Add Filter
            </Button>
            <Button startIcon={<DeleteIcon />} onClick={handleRemoveAllFilters}>
              Remove All
            </Button>
          </Box>
        </Stack>
      </Box>
    </Popover>
  );
}
