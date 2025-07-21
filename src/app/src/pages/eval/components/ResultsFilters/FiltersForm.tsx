import { useCallback, useEffect, useMemo } from 'react';
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
  TextField,
} from '@mui/material';
import { useTableStore, type ResultsFilter, type FilterableField } from '../store';

function Dropdown({
  id,
  label,
  values,
  value,
  onChange,
  width = 200,
}: {
  id: string;
  label?: string;
  values: { label: string; value: string }[];
  value: string;
  onChange: (value: string) => void;
  width?: number;
}) {
  return (
    <FormControl variant="outlined" size="small">
      {label && <InputLabel id={`${id}-label`}>{label}</InputLabel>}
      <Select
        labelId={`${id}-label`}
        id={`${id}-select`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        label={label}
        sx={{ width }}
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

function TextField_({
  id,
  label,
  value,
  onChange,
  width = 200,
}: {
  id: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  width?: number;
}) {
  return (
    <TextField
      id={id}
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      sx={{ width }}
      size="small"
    />
  );
}

function Filter({ value, index, onRemoveFilter }: { value: ResultsFilter; index: number, onRemoveFilter: (id: string) => void }) {
  const { filters, updateFilter } = useTableStore();

  /**
   * Updates the filter type.
   * @param type - The new filter type.
   */
  const handleTypeChange = useCallback(
    (filterType: ResultsFilter['type']) => {
      updateFilter({ ...value, type: filterType, value: '', field: undefined });
    },
    [value, updateFilter],
  );

  /**
   * Updates the filter field (for metadata filters).
   * @param field - The new filter field.
   */
  const handleFieldChange = useCallback(
    (field: string) => {
      updateFilter({ ...value, field, value: '' });
    },
    [value, updateFilter],
  );

  /**
   * Updates the filter operator.
   * @param operator - The new filter operator.
   */
  const handleOperatorChange = useCallback(
    (filterOperator: ResultsFilter['operator']) => {
      updateFilter({ ...value, operator: filterOperator });
    },
    [value, updateFilter],
  );

  /**
   * Updates the filter value.
   * @param filterValue - The new filter value.
   */
  const handleValueChange = useCallback(
    (filterValue: string) => {
      updateFilter({ ...value, value: filterValue });
    },
    [value, updateFilter],
  );

  /**
   * Updates the filter logic operator.
   * @param logicOperator - The new filter logic operator.
   */
  const handleLogicOperatorChange = useCallback(
    (filterLogicOperator: ResultsFilter['logicOperator']) => {
      updateFilter({ ...value, logicOperator: filterLogicOperator });
    },
    [value, updateFilter],
  );

  // Find the current field to get its options
  const currentField = filters.fields.find((field) => field.id === value.type) as FilterableField;

  let valueInput = null;

  if (currentField!.type === 'select') {
    // For metric filters, show dropdown of metric values
    valueInput = (
      <Dropdown
        id={`${index}-value-select`}
        label={currentField.label || 'Value'}
        values={currentField.options
          .sort((a, b) => a.label.localeCompare(b.label))
          .map((option) => ({
            label: option.label,
            value: option.id,
          }))}
        value={value.value}
        onChange={(e) => handleValueChange(e)}
        width={275}
      />
    );
  } else if (currentField!.type === 'field') {
    // For metadata filters, show text input only if a field is selected
    if (value.field) {
      valueInput = (
        <TextField_
          id={`${index}-value-text`}
          label="Value"
          value={value.value}
          onChange={(e) => handleValueChange(e)}
          width={275}
        />
      );
    }
  };

  return (
    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'space-between' }}>
      <IconButton onClick={() => onRemoveFilter(value.id)}>
        <CloseIcon />
      </IconButton>

      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
        {index !== 0 && (
          <Dropdown
            id={`${index}-logic-operator-select`}
            values={[
              { label: 'And', value: 'and' },
              { label: 'Or', value: 'or' },
            ]}
            value={value.logicOperator ?? 'and'}
            onChange={(e) => handleLogicOperatorChange(e as ResultsFilter['logicOperator'])}
            width={100}
          />
        )}

        <Dropdown
          id={`${index}-filter-type-select`}
          label="Filter Type"
          values={filters.fields.map((field) => ({
            label: field.label,
            value: field.id,
          }))}
          value={value.type}
          onChange={(e) => handleTypeChange(e as ResultsFilter['type'])}
          width={125}
        />

        {currentField.type === 'field' && (
          <Dropdown
            id={`${index}-field-select`}
            label="Field"
            values={currentField.options
              .sort((a, b) => a.label.localeCompare(b.label))
              .map((option) => ({
                label: option.label,
                value: option.id,
              }))}
            value={value.field ?? ''}
            onChange={(e) => handleFieldChange(e)}
            width={275}
          />
        )}

        <Dropdown
          id={`${index}-operator-select`}
          label="Operator"
          values={[{ label: 'Equals', value: 'equals' }]}
          value={value.operator}
          onChange={(e) => handleOperatorChange(e as ResultsFilter['operator'])}
          width={125}
        />

        {valueInput}
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
  const { filters, addFilter, removeAllFilters, removeFilter } = useTableStore();

  /**
   * Adds a new filter with default values.
   */
  const handleAddFilter = useCallback(() => {
    addFilter({
      type: 'metric',
      operator: 'equals',
      // By default, the value is empty, which means the filter is not applied.
      // In other words, the filter is not applied until the user selects a value.
      value: '',
    });
  }, [addFilter]);

  /**
   * Removes all filters and closes the popover.
   */
  const handleRemoveAllFilters = () => {
    onClose();
    removeAllFilters();
  };

  /**
   * Removes a filter or closes the popover if there is only one filter.
   * @param id - The ID of the filter to remove.
   */
  const handleRemoveFilter = (id: string) => {
    if (filterValuesList.length === 1) {
      handleRemoveAllFilters();
    }else{
      removeFilter(id);
    }
  };

  /**
   * If there are no filters when the popover is opened, add a default filter, reducing
   * the number of clicks required to create a filter.
   */
  useEffect(() => {
    if (open && Object.keys(filters.values).length === 0) {
      handleAddFilter();
    }
  }, [filters.values, open, handleAddFilter]);

  const filterValuesList = useMemo(() => Object.values(filters.values), [filters.values]);

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
            {filterValuesList.map((filter, index) => (
              <Filter key={filter.id} value={filter} index={index} onRemoveFilter={handleRemoveFilter} />
            ))}
          </Stack>
          {filterValuesList.length > 0 && <Divider />}
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
