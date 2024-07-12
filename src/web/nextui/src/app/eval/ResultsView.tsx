import * as React from 'react';
import { REMOTE_API_BASE_URL, REMOTE_APP_BASE_URL } from '@/../../../constants';
import { getApiBaseUrl } from '@/api';
import { useStore as useMainStore } from '@/state/evalConfig';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import SettingsIcon from '@mui/icons-material/Settings';
import ShareIcon from '@mui/icons-material/Share';
import EyeIcon from '@mui/icons-material/Visibility';
import VisibilityIcon from '@mui/icons-material/Visibility';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import OutlinedInput from '@mui/material/OutlinedInput';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/system';
import type { VisibilityState } from '@tanstack/table-core';
import { useRouter, useSearchParams } from 'next/navigation';
import invariant from 'tiny-invariant';
import { useDebounce } from 'use-debounce';
import ConfigModal from './ConfigModal';
import DownloadMenu from './DownloadMenu';
import EvalSelector from './EvalSelector';
import ResultsCharts from './ResultsCharts';
import ResultsTable from './ResultsTable';
import SettingsModal from './ResultsViewSettingsModal';
import ShareModal from './ShareModal';
import { useStore as useResultsViewStore } from './store';
import type { FilterMode, ResultLightweightWithLabel } from './types';
import './ResultsView.css';

const ResponsiveStack = styled(Stack)(({ theme }) => ({
  maxWidth: '100%',
  flexWrap: 'wrap',
  [theme.breakpoints.down('sm')]: {
    flexDirection: 'column',
  },
}));

interface ResultsViewProps {
  recentEvals: ResultLightweightWithLabel[];
  onRecentEvalSelected: (file: string) => void;
  defaultEvalId?: string;
}

export default function ResultsView({
  recentEvals,
  onRecentEvalSelected,
  defaultEvalId,
}: ResultsViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    author,
    table,
    config,
    setConfig,
    maxTextLength,
    wordBreak,
    showInferenceDetails,
    evalId,
  } = useResultsViewStore();
  const { setStateFromConfig } = useMainStore();

  const [searchText, setSearchText] = React.useState(searchParams?.get('search') || '');
  const [debouncedSearchText] = useDebounce(searchText, 1000);
  const handleSearchTextChange = (text: string) => {
    setSearchText(text);
  };

  const [failureFilter, setFailureFilter] = React.useState<{ [key: string]: boolean }>({});
  const handleFailureFilterToggle = React.useCallback(
    (columnId: string, checked: boolean) => {
      setFailureFilter((prevFailureFilter) => ({ ...prevFailureFilter, [columnId]: checked }));
    },
    [setFailureFilter],
  );

  invariant(table, 'Table data must be loaded before rendering ResultsView');
  const { head } = table;

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

  const hasAnyDescriptions = React.useMemo(
    () => table.body.some((row) => row.description),
    [table.body],
  );

  const columnData = React.useMemo(() => {
    return [
      ...(hasAnyDescriptions ? [{ value: 'description', label: 'Description' }] : []),
      ...head.vars.map((_, idx) => ({
        value: `Variable ${idx + 1}`,
        label: `Var ${idx + 1}: ${
          head.vars[idx].length > 100 ? head.vars[idx].slice(0, 97) + '...' : head.vars[idx]
        }`,
        group: 'Variables',
      })),
      ...head.prompts.map((_, idx) => {
        const prompt = head.prompts[idx];
        const label = prompt.label || prompt.display || prompt.raw;
        return {
          value: `Prompt ${idx + 1}`,
          label: `Prompt ${idx + 1}: ${label.length > 100 ? label.slice(0, 97) + '...' : label}`,
          group: 'Prompts',
        };
      }),
    ];
  }, [head.vars, head.prompts, hasAnyDescriptions]);

  const [configModalOpen, setConfigModalOpen] = React.useState(false);
  const [viewSettingsModalOpen, setViewSettingsModalOpen] = React.useState(false);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [selectedColumns, setSelectedColumns] = React.useState<string[]>(
    columnData.map((col) => col.value),
  );

  const handleChange = (event: SelectChangeEvent<typeof selectedColumns>) => {
    const {
      target: { value },
    } = event;
    setSelectedColumns(typeof value === 'string' ? value.split(',') : value);

    const allColumns = [
      ...(hasAnyDescriptions ? ['description'] : []),
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

  const [evalIdCopied, setEvalIdCopied] = React.useState(false);

  const handleEvalIdCopyClick = async () => {
    if (!evalId) {
      return;
    }
    await navigator.clipboard.writeText(evalId);
    setEvalIdCopied(true);
    setTimeout(() => {
      setEvalIdCopied(false);
    }, 1000);
  };

  return (
    <div style={{ marginLeft: '1rem', marginRight: '1rem' }}>
      <ResponsiveStack
        direction="row"
        mb={2}
        spacing={1}
        alignItems="center"
        className="eval-header"
      >
        {recentEvals && recentEvals.length > 0 && (
          <EvalSelector
            recentEvals={recentEvals}
            onRecentEvalSelected={onRecentEvalSelected}
            currentEval={recentEvals.find((evl) => evl.evalId === evalId) || null}
          />
        )}
        <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center' }}>
          <Tooltip title="Click to edit description">
            <span className="description" onClick={handleDescriptionClick}>
              {config?.description || evalId}
            </span>
          </Tooltip>
        </Typography>
        {config?.description && evalId && (
          <>
            <Tooltip title="Click to copy">
              <Chip
                size="small"
                label={
                  <>
                    <strong>ID:</strong> {evalId}
                  </>
                }
                sx={{
                  opacity: 0.7,
                  cursor: 'pointer',
                }}
                onClick={handleEvalIdCopyClick}
              />
            </Tooltip>
            <Snackbar
              open={evalIdCopied}
              autoHideDuration={1000}
              onClose={() => setEvalIdCopied(false)}
              message="Eval id copied to clipboard"
            />
          </>
        )}
        <Tooltip title={!author ? 'Set eval author with `promptfoo config set email`' : ''}>
          <Chip
            size="small"
            label={
              <>
                <strong>Author:</strong> {author || 'Unknown'}
              </>
            }
            sx={{ opacity: 0.7 }}
          />
        </Tooltip>
      </ResponsiveStack>
      <ResponsiveStack direction="row" spacing={4} alignItems="center">
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
              <MenuItem value="highlights">Show highlights only</MenuItem>
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
            onChange={(e) => handleSearchTextChange(e.target.value)}
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
            <Tooltip title="Edit table view settings" placement="bottom">
              <Button
                color="primary"
                onClick={() => setViewSettingsModalOpen(true)}
                startIcon={<SettingsIcon />}
              >
                Table Settings
              </Button>
            </Tooltip>
            {config?.metadata?.redteam && (
              <Tooltip title="View vulnerability scan report" placement="bottom">
                <Button
                  color="primary"
                  startIcon={<EyeIcon />}
                  onClick={() => router.push(`/report/?evalId=${evalId}`)}
                >
                  Vulnerability Report
                </Button>
              </Tooltip>
            )}
          </ResponsiveStack>
        </Box>
      </ResponsiveStack>
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
        onSearchTextChange={handleSearchTextChange}
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
