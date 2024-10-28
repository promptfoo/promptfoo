import React from 'react';
import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import OutlinedInput from '@mui/material/OutlinedInput';
import Select from '@mui/material/Select';
import type { SelectChangeEvent } from '@mui/material/Select';

interface ColumnSelectorProps {
  columnData: { value: string; label: string }[];
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
