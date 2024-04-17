import * as React from 'react';

import invariant from 'tiny-invariant';

import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import Autocomplete, { AutocompleteRenderInputParams } from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import ClearIcon from '@mui/icons-material/Clear';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import EditIcon from '@mui/icons-material/Edit';
import FormControl from '@mui/material/FormControl';
import Heading from '@mui/material/Typography';
import InputLabel from '@mui/material/InputLabel';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import OutlinedInput from '@mui/material/OutlinedInput';
import Paper from '@mui/material/Box';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import SettingsIcon from '@mui/icons-material/Settings';
import ShareIcon from '@mui/icons-material/Share';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { styled } from '@mui/system';
import { useRouter } from 'next/navigation';
import { useDebounce } from 'use-debounce';

import DownloadMenu from './DownloadMenu';
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
import { getApiBaseUrl } from '@/api';

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
  const { table, config, setConfig, maxTextLength, wordBreak, showInferenceDetails, evalId } =
    useResultsViewStore();
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
      const response = await fetch(`${REMOTE_API_BASE_URL}/api/eval`, {
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
  const allColumns = [
    ...head.vars.map((_, idx) => `Variable ${idx + 1}`),
    ...head.prompts.map((_, idx) => `Prompt ${idx + 1}`),
  ];

  const [columnDialogOpen, setColumnDialogOpen] = React.useState(false);
  const handleColumnDialogOpen = () => {
    setColumnDialogOpen(true);
  };
  const handleColumnDialogClose = () => {
    setColumnDialogOpen(false);
  };
  const toggleColumnVisibility = (column: {value: string; label: string; group: string}) => {
    const target = column.value;
    const updatedSelectedColumns: string [] = selectedColumns.includes(target) ? selectedColumns.filter((col) => col !== target) : [...selectedColumns, target];
    setSelectedColumns(updatedSelectedColumns);

    const newColumnVisibility: VisibilityState = {};
    allColumns.forEach((col) => {
      newColumnVisibility[col] = updatedSelectedColumns.includes(col);
    });
    setColumnVisibility(newColumnVisibility);
  };

  const [variablesVisible, setVariablesVisible] = React.useState(true);
  const handleClearAllVariables = () => {
    const newColumnVisibility: VisibilityState = {};
    if (variablesVisible) {
      allColumns.forEach((col) => {
        newColumnVisibility[col] = !col.startsWith("Variable");
      });
      setSelectedColumns(allColumns.filter((col) => !col.startsWith("Variable")));
    } else {
      allColumns.forEach((col) => {
        newColumnVisibility[col] = true;
      });
      setSelectedColumns(allColumns);
    }
    setColumnVisibility(newColumnVisibility);
    setVariablesVisible(!variablesVisible);
  };

  const handleDescriptionClick = async () => {
    invariant(config, 'Config must be loaded before clicking its description');
    const newDescription = window.prompt('Enter new description:', config.description);
    if (newDescription !== null && newDescription !== config.description) {
      const newConfig = { ...config, description: newDescription };
      try {
        const response = await fetch(`${await getApiBaseUrl()}/api/eval/${evalId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ config: newConfig }),
        });
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        setConfig(newConfig);
      } catch (error) {
        console.error('Failed to update table:', error);
      }
    }
  };

  const handleDeleteEvalClick = async () => {
    if (window.confirm('Are you sure you want to delete this evaluation?')) {
      try {
        const response = await fetch(`${await getApiBaseUrl()}/api/eval/${evalId}`, {
          method: 'DELETE',
        });
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        router.push('/');
      } catch (error) {
        console.error('Failed to delete evaluation:', error);
        alert('Failed to delete evaluation');
      }
    }
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

  // State for anchor element
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);

  // Handle menu close
  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  // Function to open the eval actions menu
  const handleOpenMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  return (
    <div style={{ marginLeft: '1rem', marginRight: '1rem' }}>
      <Box mb={2} sx={{ display: 'flex', alignItems: 'center' }}>
        <Heading variant="h5" sx={{ flexGrow: 1 }}>
          <span className="description" onClick={handleDescriptionClick}>
            {config?.description || evalId}
          </span>{' '}
          {config?.description && <span className="description-filepath">{evalId}</span>}
        </Heading>
      </Box>
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
            <Button
              color="primary"
              onClick={handleColumnDialogOpen}
              startIcon={<ViewColumnIcon />}
            >
              Open Column Dialog
            </Button>
            <Dialog
              open={columnDialogOpen}
              onClose={handleColumnDialogClose}
            >
              <DialogTitle>Select Columns to Show</DialogTitle>
              <Button
                color="primary"
                onClick={handleClearAllVariables}
                startIcon={variablesVisible ? <ClearIcon /> : <RestartAltIcon />}
              >
                {variablesVisible ? "Clear All Variables" : "Reset All Variables"}
              </Button>

              <DialogContent>
                <List sx={{ m: 1, minWidth: 200, maxWidth: 350 }}>
                  {columnData.map((column) => (
                    <ListItem
                      key={column.value}
                      value={column.value}
                      disablePadding
                    >
                      <ListItemButton
                        role={undefined}
                        onClick={(_event) => toggleColumnVisibility(column)}
                        dense
                      >
                        <ListItemIcon>
                          <Checkbox
                            checked={selectedColumns.indexOf(column.value) > -1}
                            tabIndex={-1}
                            disableRipple
                          />
                        </ListItemIcon>
                        <ListItemText primary={column.label} />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              </DialogContent>
            </Dialog>
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
              <Button color="primary" onClick={handleOpenMenu} startIcon={<ArrowDropDownIcon />}>
                Eval actions
              </Button>
              {config && (
                <Menu
                  id="eval-actions-menu"
                  anchorEl={anchorEl}
                  keepMounted
                  open={Boolean(anchorEl)}
                  onClose={handleMenuClose}
                >
                  <Tooltip title="View the configuration that defines this eval" placement="left">
                    <MenuItem onClick={() => setConfigModalOpen(true)}>
                      <ListItemIcon>
                        <VisibilityIcon fontSize="small" />
                      </ListItemIcon>
                      View YAML
                    </MenuItem>
                  </Tooltip>
                  <Tooltip title="Edit this eval in the web UI" placement="left">
                    <MenuItem
                      onClick={() => {
                        setStateFromConfig(config);
                        router.push('/setup/');
                      }}
                    >
                      <ListItemIcon>
                        <EditIcon fontSize="small" />
                      </ListItemIcon>
                      Edit Eval
                    </MenuItem>
                  </Tooltip>
                  <DownloadMenu />
                  {config?.sharing && (
                    <Tooltip title="Generate a unique URL that others can access" placement="left">
                      <MenuItem onClick={handleShareButtonClick} disabled={shareLoading}>
                        <ListItemIcon>
                          {shareLoading ? (
                            <CircularProgress size={16} />
                          ) : (
                            <ShareIcon fontSize="small" />
                          )}
                        </ListItemIcon>
                        Share
                      </MenuItem>
                    </Tooltip>
                  )}
                  <Tooltip title="Delete this eval" placement="left">
                    <MenuItem onClick={handleDeleteEvalClick}>
                      <ListItemIcon>
                        <DeleteIcon fontSize="small" />
                      </ListItemIcon>
                      Delete
                    </MenuItem>
                  </Tooltip>
                </Menu>
              )}
              <Tooltip title="Edit table view settings" placement="left">
                <Button
                  color="primary"
                  onClick={() => setViewSettingsModalOpen(true)}
                  startIcon={<SettingsIcon />}
                >
                  Table Settings
                </Button>
              </Tooltip>
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
