import React from 'react';
import type { SelectChangeEvent } from '@mui/material';
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  ListItemText,
  OutlinedInput,
} from '@mui/material';

interface ColumnSelectorProps {
  columnData: Array<{ value: string; label: string }>;
  selectedColumns: string[];
  onChange: (event: SelectChangeEvent<string[]>) => void;
}

export const ColumnSelector: React.FC<ColumnSelectorProps> = ({
  columnData,
  selectedColumns,
  onChange,
}) => {
  return (
    <FormControl sx={{ minWidth: 200, maxWidth: 350 }} size="small">
      <InputLabel id="visible-columns-label">Columns</InputLabel>
      <Select
        labelId="visible-columns-label"
        id="visible-columns"
        multiple
        value={selectedColumns}
        onChange={onChange}
        input={<OutlinedInput label="Visible columns" />}
        renderValue={(selected: string[]) => selected.join(', ')}
      >
        {columnData.map((column) => (
          <MenuItem dense key={column.value} value={column.value}>
            <Checkbox checked={selectedColumns.includes(column.value)} />
            <ListItemText primary={column.label} />
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};
