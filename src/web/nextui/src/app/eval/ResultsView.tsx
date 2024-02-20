import * as React from 'react';

import invariant from 'tiny-invariant';

import Autocomplete, { AutocompleteRenderInputParams } from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import EditIcon from '@mui/icons-material/Edit';
import FormControl from '@mui/material/FormControl';
import Heading from '@mui/material/Typography';
import InputLabel from '@mui/material/InputLabel';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import OutlinedInput from '@mui/material/OutlinedInput';
import Paper from '@mui/material/Box';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import SettingsIcon from '@mui/icons-material/Settings';
import ShareIcon from '@mui/icons-material/Share';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { styled } from '@mui/system';
import { useRouter } from 'next/navigation';
import { useDebounce } from 'use-debounce';

import ResultsCharts from './ResultsCharts';
import ResultsTable from './ResultsTable';
import ConfigModal from './ConfigModal';
import ShareModal from './ShareModal';
import SettingsModal from './ResultsViewSettingsModal';
import { useStore as useResultsViewStore } from './store';
import { useStore as useMainStore } from '@/state/evalConfig';
import { REMOTE_API_BASE_URL, REMOTE_APP_BASE_URL } from '@/../../../constants';

import type { VisibilityState } from '@tanstack/table-core';
import type { FilterMode } from './types';

import './ResultsView.css';

const ResponsiveStack = styled(Stack)(({ theme }) => ({
  maxWidth: '100%',
  flexWrap: 'wrap',
  [theme.breakpoints.down('sm')]: {
    flexDirection: 'column',
  },
}));

interface ResultsViewProps {
  recentEvals: {
    id: string;
    label: string;
  }[];
  onRecentEvalSelected: (file: string) => void;
  defaultEvalId?: string;
}

export default function ResultsView({
  recentEvals,
  onRecentEvalSelected,
  defaultEvalId,
}: ResultsViewProps) {
  const router = useRouter();
  const { table, config, maxTextLength, wordBreak, showInferenceDetails, filePath } = useResultsViewStore();
  const { setStateFromConfig } = useMainStore();
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [selectedColumns, setSelectedColumns] = React.useState<string[]>([]);

  const [searchText, setSearchText] = React.useState('');
  const [debouncedSearchText] = useDebounce(searchText, 1000);
  const handleSearchTextChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchText(event.target.value);
  };

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

  const [shareModalOpen, setShareModalOpen] = React.useState(false);
  const [shareUrl, setShareUrl] = React.useState('');
  const [shareLoading, setShareLoading] = React.useState(false);

  const handleShareButtonClick = async () => {
    setShareLoading(true);
    try {
      const response = await fetch(`${REMOTE_API_BASE_URL}/eval`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: {
            version: 2,
            createdAt: new Date().toISOString(),
            results: {
              table,
            },
            config,
          },
        }),
      });

      const { id } = await response.json();
      const shareUrl = `${REMOTE_APP_BASE_URL}/eval/${id}`;
      setShareUrl(shareUrl);
      setShareModalOpen(true);
    } catch {
      alert('Sorry, something went wrong.');
    } finally {
      setShareLoading(false);
    }
  };

  const [configModalOpen, setConfigModalOpen] = React.useState(false);
  const [viewSettingsModalOpen, setViewSettingsModalOpen] = React.useState(false);

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
      label: `Var ${idx + 1}: ${
        head.vars[idx].length > 100 ? head.vars[idx].slice(0, 97) + '...' : head.vars[idx]
      }`,
      group: 'Variables',
    })),
    ...head.prompts.map((_, idx) => ({
      value: `Prompt ${idx + 1}`,
      label: `Prompt ${idx + 1}: ${
        head.prompts[idx].display.length > 100
          ? head.prompts[idx].display.slice(0, 97) + '...'
          : head.prompts[idx].display
      }`,
      group: 'Prompts',
    })),
  ];

  // Set all columns as selected by default
  React.useEffect(() => {
    setSelectedColumns(columnData.map((col) => col.value));
  }, [head]);

  return (
    <div style={{ marginLeft: '1rem', marginRight: '1rem' }}>
      {config?.description && (
        <Box mb={2}>
          <Heading variant="h5">{config.description} <span className="description-filepath">{filePath}</span></Heading>
        </Box>
      )}
      <Paper py="md">
        <ResponsiveStack direction="row" spacing={4} alignItems="center">
          <Box>
            {recentEvals && recentEvals.length > 0 && (
              <FormControl sx={{ m: 1, minWidth: 200 }} size="small">
                <Autocomplete
                  size="small"
                  options={recentEvals}
                  renderOption={(props, option) => (
                    <li {...props} key={option.id}>
                      {option.label}
                    </li>
                  )}
                  style={{ width: 350 }}
                  renderInput={(params: AutocompleteRenderInputParams) => (
                    <TextField {...params} label="Eval run" variant="outlined" />
                  )}
                  defaultValue={
                    recentEvals.find((evl) => evl.id === defaultEvalId) || recentEvals[0]
                  }
                  onChange={(event, newValue: { label: string; id?: string } | null) => {
                    if (newValue && newValue.id) {
                      onRecentEvalSelected(newValue.id);
                    }
                  }}
                  disableClearable
                />
              </FormControl>
            )}
          </Box>
          <Box>
            <FormControl sx={{ m: 1, minWidth: 200, maxWidth: 350 }} size="small">
              <InputLabel id="visible-columns-label">Columns</InputLabel>
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
              <InputLabel id="failure-filter-mode-label">Display</InputLabel>
              <Select
                labelId="filter-mode-label"
                id="filter-mode"
                value={filterMode}
                onChange={handleFilterModeChange}
                label="Filter"
              >
                <MenuItem value="all">Show all results</MenuItem>
                <MenuItem value="failures">Show failures only</MenuItem>
                <MenuItem value="different">Show different only</MenuItem>
              </Select>
            </FormControl>
          </Box>
          <Box>
            <TextField
              sx={{ minWidth: 180 }}
              size="small"
              label="Search"
              placeholder="Text or regex"
              value={searchText}
              onChange={handleSearchTextChange}
            />
          </Box>
          <Box flexGrow={1} />
          <Box display="flex" justifyContent="flex-end">
            <ResponsiveStack direction="row" spacing={2}>
              <Tooltip title="Edit table view settings">
                <Button
                  color="primary"
                  onClick={() => setViewSettingsModalOpen(true)}
                  startIcon={<SettingsIcon />}
                >
                  Table Settings
                </Button>
              </Tooltip>
              {config && (
                <Tooltip title="View the configuration that defines this eval">
                  <Button
                    color="primary"
                    onClick={() => setConfigModalOpen(true)}
                    startIcon={<VisibilityIcon />}
                  >
                    View YAML
                  </Button>
                </Tooltip>
              )}
              {config && (
                <Tooltip title="Edit eval">
                  <Button
                    color="primary"
                    onClick={() => {
                      setStateFromConfig(config);
                      router.push('/setup/');
                    }}
                    startIcon={<EditIcon />}
                  >
                    Edit Eval
                  </Button>
                </Tooltip>
              )}
              {config?.sharing && (
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
              )}
            </ResponsiveStack>
          </Box>
        </ResponsiveStack>
      </Paper>
      <ResultsCharts columnVisibility={columnVisibility} />
      <ResultsTable
        maxTextLength={maxTextLength}
        columnVisibility={columnVisibility}
        wordBreak={wordBreak}
        showStats={showInferenceDetails}
        filterMode={filterMode}
        failureFilter={failureFilter}
        searchText={debouncedSearchText}
        onFailureFilterToggle={handleFailureFilterToggle}
      />
      <ConfigModal open={configModalOpen} onClose={() => setConfigModalOpen(false)} />
      <ShareModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        shareUrl={shareUrl}
      />
      <SettingsModal open={viewSettingsModalOpen} onClose={() => setViewSettingsModalOpen(false)} />
    </div>
  );
}
