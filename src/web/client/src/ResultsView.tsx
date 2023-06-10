import * as React from 'react';

import invariant from 'tiny-invariant';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputLabel from '@mui/material/InputLabel';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import OutlinedInput from '@mui/material/OutlinedInput';
import Paper from '@mui/material/Box';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/system';

import ResultsTable from './ResultsTable.js';
import { useStore } from './store.js';

import type { VisibilityState } from '@tanstack/table-core';

const ResponsiveStack = styled(Stack)(({ theme }) => ({
  [theme.breakpoints.down('sm')]: {
    flexDirection: 'column',
  },
}));

export default function ResultsView() {
  const { table } = useStore();
  const [maxTextLength, setMaxTextLength] = React.useState(250);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [selectedColumns, setSelectedColumns] = React.useState<string[]>([]);

  const [wordBreak, setWordBreak] = React.useState<'break-word' | 'break-all'>('break-all');

  const handleWordBreakChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setWordBreak(event.target.checked ? 'break-all' : 'break-word');
  };

  invariant(table, 'Table data must be loaded before rendering ResultsView');
  const { head } = table;

  const handleChange = (event: SelectChangeEvent<typeof selectedColumns>) => {
    const {
      target: { value },
    } = event;
    setSelectedColumns(typeof value === 'string' ? value.split(',') : value);

    const allColumns = [
      ...head.vars.map((_, idx) => `Variable ${idx + 1}`),
      ...head.prompts.map((_, idx) => `Prompt ${idx + 1}`),
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
    ...head.vars.map((_, idx) => ({
      value: `Variable ${idx + 1}`,
      label: `Variable ${idx + 1}`,
      group: 'Variables',
    })),
    ...head.prompts.map((_, idx) => ({
      value: `Prompt ${idx + 1}`,
      label: `Prompt ${idx + 1}`,
      group: 'Prompts',
    })),
  ];

  // Set all columns as selected by default
  React.useEffect(() => {
    setSelectedColumns([
      ...head.vars.map((_, idx) => `Variable ${idx + 1}`),
      ...head.prompts.map((_, idx) => `Prompt ${idx + 1}`),
    ]);
  }, [head]);

  return (
    <div>
      <Paper py="md">
        <ResponsiveStack direction="row" spacing={8} alignItems="center">
          <Box>
            <FormControl sx={{ m: 1, minWidth: 300 }} size="small">
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
          <Box>
            <Tooltip title="Forcing line breaks makes it easier to adjust column widths to your liking">
              <FormControlLabel
                control={
                  <Checkbox checked={wordBreak === 'break-all'} onChange={handleWordBreakChange} />
                }
                label="Force line breaks"
              />
            </Tooltip>
          </Box>
        </ResponsiveStack>
      </Paper>
      <ResultsTable
        maxTextLength={maxTextLength}
        columnVisibility={columnVisibility}
        wordBreak={wordBreak}
      />
    </div>
  );
}
