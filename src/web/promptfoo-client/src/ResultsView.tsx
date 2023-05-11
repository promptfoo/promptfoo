import * as React from 'react';

import Box from '@mui/material/Box';
import Paper from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Slider from '@mui/material/Slider';
import Typography from '@mui/material/Typography';
import OutlinedInput from '@mui/material/OutlinedInput';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import ListItemText from '@mui/material/ListItemText';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import Checkbox from '@mui/material/Checkbox';

import ResultsTable from './ResultsTable.js';

import { VisibilityState } from '@tanstack/table-core';

import type { EvalRow, EvalHead } from './types.js';

export interface ResultsViewTable {
  head: EvalHead;
  body: EvalRow[];
}

interface ResultsViewProps {
  table: ResultsViewTable;
}

export default function ResultsView({ table }: ResultsViewProps) {
  const [maxTextLength, setMaxTextLength] = React.useState(250);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [selectedColumns, setSelectedColumns] = React.useState<string[]>([]);

  const { head, body } = table;

  const handleChange = (event: SelectChangeEvent<typeof selectedColumns>) => {
    const {
      target: { value },
    } = event;
    setSelectedColumns(typeof value === 'string' ? value.split(',') : value);

    const allColumns = [
      ...head.prompts.map((_, idx) => `Prompt ${idx + 1}`),
      ...head.vars.map((_, idx) => `Variable ${idx + 1}`),
    ];
    const newColumnVisibility: VisibilityState = {};
    allColumns.forEach((col) => {
      newColumnVisibility[col] = (typeof value === 'string' ? value.split(',') : value).includes(
        col,
      );
    });
    setColumnVisibility(newColumnVisibility);
  };

  const columnData = [
    ...head.prompts.map((_, idx) => ({
      value: `Prompt ${idx + 1}`,
      label: `Prompt ${idx + 1}`,
      group: 'Prompts',
    })),
    ...head.vars.map((_, idx) => ({
      value: `Variable ${idx + 1}`,
      label: `Variable ${idx + 1}`,
      group: 'Variables',
    })),
  ];

  // Set all columns as selected by default
  React.useEffect(() => {
    setSelectedColumns([
      ...head.prompts.map((_, idx) => `Prompt ${idx + 1}`),
      ...head.vars.map((_, idx) => `Variable ${idx + 1}`),
    ]);
  }, [head]);

  return (
    <div>
      <Paper py="md">
        <Stack direction="row" spacing={2}>
          <Box>
            <FormControl sx={{ m: 1, width: 300 }}>
              <InputLabel id="visible-columns-label">Visible columns</InputLabel>
              <Select
                labelId="visible-columns-label"
                id="visible-columns"
                multiple
                value={selectedColumns}
                onChange={handleChange}
                input={<OutlinedInput label="Visible columns" />}
                renderValue={(selected: string[]) => selected.join(', ')}
              >
                {columnData.map((column) => (
                  <MenuItem dense key={column.value} value={column.value}>
                    <Checkbox checked={selectedColumns.indexOf(column.value) > -1} />
                    <ListItemText primary={column.label} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          <Box>
            <Typography mt={2}>Max text length: {maxTextLength}</Typography>
            <Slider
              min={25}
              max={1000}
              value={maxTextLength}
              onChange={(_, val: number | number[]) => setMaxTextLength(val as number)}
            />
          </Box>
        </Stack>
      </Paper>
      <ResultsTable
        headers={head}
        data={body}
        maxTextLength={maxTextLength}
        columnVisibility={columnVisibility}
      />
    </div>
  );
}
