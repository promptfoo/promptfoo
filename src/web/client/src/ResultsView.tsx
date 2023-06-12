import * as React from 'react';

import invariant from 'tiny-invariant';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
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
import ShareIcon from '@mui/icons-material/Share';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { styled } from '@mui/system';

import ResultsTable from './ResultsTable.js';
import ConfigModal from './ConfigModal';
import ShareModal from './ShareModal';
import { useStore } from './store.js';

import type { VisibilityState } from '@tanstack/table-core';
import type { FilterMode } from './types.js';

const ResponsiveStack = styled(Stack)(({ theme }) => ({
  maxWidth: '100%',
  flexWrap: 'wrap',
  [theme.breakpoints.down('sm')]: {
    flexDirection: 'column',
  },
}));

export default function ResultsView() {
  const { table } = useStore();
  const [maxTextLength, setMaxTextLength] = React.useState(250);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [selectedColumns, setSelectedColumns] = React.useState<string[]>([]);

  const [failureFilter, setFailureFilter] = React.useState<{ [key: string]: boolean }>({});
  const handleFailureFilterToggle = (columnId: string, checked: boolean) => {
    setFailureFilter((prevFailureFilter) => ({ ...prevFailureFilter, [columnId]: checked }));
  };

  const [filterMode, setFilterMode] = React.useState<FilterMode>('all');
  const handleFilterModeChange = (event: SelectChangeEvent<unknown>) => {
    const mode = event.target.value as FilterMode;
    setFilterMode(mode);

    const newFailureFilter: { [key: string]: boolean } = {};
    head.prompts.forEach((_, idx) => {
      const columnId = `Prompt ${idx + 1}`;
      newFailureFilter[columnId] = mode === 'failures';
    });
    setFailureFilter(newFailureFilter);
  };

  const [wordBreak, setWordBreak] = React.useState<'break-word' | 'break-all'>('break-all');
  const handleWordBreakChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setWordBreak(event.target.checked ? 'break-all' : 'break-word');
  };

  const [shareModalOpen, setShareModalOpen] = React.useState(false);
  const [shareUrl, setShareUrl] = React.useState('');
  const [shareLoading, setShareLoading] = React.useState(false);

  const handleShareButtonClick = async () => {
    setShareLoading(true);
    try {
      const response = await fetch('https://api.promptfoo.dev/eval', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: {
            version: 1,
            table,
          },
        }),
      });

      const { id } = await response.json();
      const shareUrl = `https://app.promptfoo.dev/eval/${id}`;
      setShareUrl(shareUrl);
      setShareModalOpen(true);
    } catch {
      alert('Sorry, something went wrong.');
    } finally {
      setShareLoading(false);
    }
  };

  const [configModalOpen, setConfigModalOpen] = React.useState(false);

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
            <FormControl sx={{ m: 1, minWidth: 200 }} size="small">
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
            <FormControl sx={{ minWidth: 180 }} size="small">
              <InputLabel id="failure-filter-mode-label">Filter</InputLabel>
              <Select
                labelId="filter-mode-label"
                id="filter-mode"
                value={filterMode}
                onChange={handleFilterModeChange}
                label="Filter"
              >
                <MenuItem value="all">Show all results</MenuItem>
                <MenuItem value="failures">Show only failures</MenuItem>
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
          <Box flexGrow={1} />
          <Box display="flex" justifyContent="flex-end">
            <ResponsiveStack direction="row" spacing={2}>
              <Tooltip title="View config">
                <Button
                  color="primary"
                  onClick={() => setConfigModalOpen(true)}
                  startIcon={<VisibilityIcon />}
                >
                  Config
                </Button>
              </Tooltip>
              <Tooltip title="Generate a unique URL that others can access">
                <Button
                  color="primary"
                  onClick={handleShareButtonClick}
                  disabled={shareLoading}
                  startIcon={shareLoading ? <CircularProgress size={16} /> : <ShareIcon />}
                >
                  Share
                </Button>
              </Tooltip>
            </ResponsiveStack>
          </Box>
        </ResponsiveStack>
      </Paper>
      <ResultsTable
        maxTextLength={maxTextLength}
        columnVisibility={columnVisibility}
        wordBreak={wordBreak}
        filterMode={filterMode}
        failureFilter={failureFilter}
        onFailureFilterToggle={handleFailureFilterToggle}
      />
      <ConfigModal open={configModalOpen} onClose={() => setConfigModalOpen(false)} />
      <ShareModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        shareUrl={shareUrl}
      />
    </div>
  );
}
