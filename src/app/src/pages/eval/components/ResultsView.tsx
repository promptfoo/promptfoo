import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { IS_RUNNING_LOCALLY } from '@app/constants';
import { useToast } from '@app/hooks/useToast';
import { useStore as useMainStore } from '@app/stores/evalConfig';
import { callApi, fetchUserEmail, updateEvalAuthor } from '@app/utils/api';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SettingsIcon from '@mui/icons-material/Settings';
import ShareIcon from '@mui/icons-material/Share';
import SearchIcon from '@mui/icons-material/Source';
import EyeIcon from '@mui/icons-material/Visibility';
import VisibilityIcon from '@mui/icons-material/Visibility';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import InputAdornment from '@mui/material/InputAdornment';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import type { SelectChangeEvent } from '@mui/material/Select';
import type { StackProps } from '@mui/material/Stack';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import { styled } from '@mui/material/styles';
import { convertResultsToTable } from '@promptfoo/util/convertEvalResultsToTable';
import invariant from '@promptfoo/util/invariant';
import type { VisibilityState } from '@tanstack/table-core';
import { useDebounce } from 'use-debounce';
import { AuthorChip } from './AuthorChip';
import { ColumnSelector } from './ColumnSelector';
import CompareEvalMenuItem from './CompareEvalMenuItem';
import ConfigModal from './ConfigModal';
import DownloadMenu from './DownloadMenu';
import { EvalIdChip } from './EvalIdChip';
import EvalSelectorDialog from './EvalSelectorDialog';
import EvalSelectorKeyboardShortcut from './EvalSelectorKeyboardShortcut';
import { FilterModeSelector } from './FilterModeSelector';
import ResultsCharts from './ResultsCharts';
import ResultsTable from './ResultsTable';
import SettingsModal from './ResultsViewSettingsModal';
import ShareModal from './ShareModal';
import { useStore as useResultsViewStore } from './store';
import type { EvaluateTable, FilterMode, ResultLightweightWithLabel } from './types';
import './ResultsView.css';

const ResponsiveStack = styled(Stack)(({ theme }) => ({
  maxWidth: '100%',
  flexWrap: 'wrap',
  [theme.breakpoints.down('sm')]: {
    flexDirection: 'column',
  },
})) as React.FC<StackProps>;

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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    author,
    table,
    setTable,
    config,
    setConfig,
    maxTextLength,
    wordBreak,
    showInferenceDetails,
    evalId,
    setInComparisonMode,
    columnStates,
    setColumnState,
    setAuthor,
  } = useResultsViewStore();
  const { setStateFromConfig } = useMainStore();
  const { showToast } = useToast();
  const [searchText, setSearchText] = React.useState(searchParams.get('search') || '');
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
  const [shareLoading, setShareLoading] = React.useState(false);

  // State for anchor element
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);

  const currentEvalId = evalId || defaultEvalId || 'default';

  // Handle menu close
  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  // Function to open the eval actions menu
  const handleOpenMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleShareButtonClick = async () => {
    if (IS_RUNNING_LOCALLY) {
      setShareLoading(true);
      setShareModalOpen(true);
    } else {
      // For non-local instances, just show the modal
      setShareModalOpen(true);
    }
  };

  const handleShare = async (id: string): Promise<string> => {
    try {
      if (!IS_RUNNING_LOCALLY) {
        // For non-local instances, just return the URL directly
        return `${window.location.host}/eval/?evalId=${id}`;
      }

      const response = await callApi('/results/share', {
        method: 'POST',
        body: JSON.stringify({ id }),
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error('Failed to generate share URL');
      }
      const { url } = await response.json();
      return url;
    } catch (error) {
      console.error('Failed to generate share URL:', error);
      throw error;
    } finally {
      setShareLoading(false);
    }
  };

  const handleComparisonEvalSelected = async (compareEvalId: string) => {
    setAnchorEl(null);
    try {
      const response = await callApi(`/results/${compareEvalId}`, {
        cache: 'no-store',
      });
      const body = await response.json();
      const comparisonTable =
        body.data.version < 4
          ? (body.data.results.table as EvaluateTable)
          : convertResultsToTable(body.data);

      // Combine the comparison table with the current table
      const combinedTable: EvaluateTable = {
        head: {
          prompts: [
            ...table.head.prompts.map((prompt) => ({
              ...prompt,
              label: `[${evalId || defaultEvalId || 'Eval A'}] ${prompt.label || ''}`,
            })),
            ...comparisonTable.head.prompts.map((prompt) => ({
              ...prompt,
              label: `[${compareEvalId}] ${prompt.label || ''}`,
            })),
          ],
          vars: table.head.vars, // Assuming vars are the same
        },
        body: table.body.map((row, index) => ({
          ...row,
          outputs: [...row.outputs, ...(comparisonTable.body[index]?.outputs || [])],
        })),
      };
      // Update the state with the combined table
      setTable(combinedTable);

      // Update other relevant state if needed
      setConfig({
        ...config,
        ...body.data.config,
        description: `Combined: "${config?.description || 'Eval A'}" and "${body.data.config?.description || 'Eval B'}"`,
      });
      setInComparisonMode(true);
    } catch (error) {
      console.error('Error fetching comparison eval:', error);
      alert('Failed to load comparison eval. Please try again.');
    }
  };

  const hasAnyDescriptions = React.useMemo(
    () => table.body?.some((row) => row.description),
    [table.body],
  );

  const promptOptions = head.prompts.map((prompt, idx) => {
    const label = prompt.label || prompt.display || prompt.raw;
    const provider = prompt.provider || 'unknown';
    const displayLabel = [
      label && `"${label.slice(0, 60)}${label.length > 60 ? '...' : ''}"`,
      provider && `[${provider}]`,
    ]
      .filter(Boolean)
      .join(' ');

    return {
      value: `Prompt ${idx + 1}`,
      label: displayLabel,
      description: label,
      group: 'Prompts',
    };
  });

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
      ...promptOptions,
    ];
  }, [head.vars, promptOptions, hasAnyDescriptions]);

  const [configModalOpen, setConfigModalOpen] = React.useState(false);
  const [viewSettingsModalOpen, setViewSettingsModalOpen] = React.useState(false);

  const allColumns = React.useMemo(
    () => [
      ...(hasAnyDescriptions ? ['description'] : []),
      ...head.vars.map((_, idx) => `Variable ${idx + 1}`),
      ...head.prompts.map((_, idx) => `Prompt ${idx + 1}`),
    ],
    [hasAnyDescriptions, head.vars, head.prompts],
  );

  const currentColumnState = columnStates[currentEvalId] || {
    selectedColumns: allColumns,
    columnVisibility: allColumns.reduce((acc, col) => ({ ...acc, [col]: true }), {}),
  };

  const updateColumnVisibility = React.useCallback(
    (columns: string[]) => {
      const newColumnVisibility: VisibilityState = {};
      allColumns.forEach((col) => {
        newColumnVisibility[col] = columns.includes(col);
      });
      setColumnState(currentEvalId, {
        selectedColumns: columns,
        columnVisibility: newColumnVisibility,
      });
    },
    [allColumns, setColumnState, currentEvalId],
  );

  const handleChange = React.useCallback(
    (event: SelectChangeEvent<string[]>) => {
      const newSelectedColumns =
        typeof event.target.value === 'string' ? event.target.value.split(',') : event.target.value;

      updateColumnVisibility(newSelectedColumns);
    },
    [updateColumnVisibility],
  );

  const handleDescriptionClick = async () => {
    invariant(config, 'Config must be loaded before clicking its description');
    const newDescription = window.prompt('Enter new description:', config.description);
    if (newDescription !== null && newDescription !== config.description) {
      const newConfig = { ...config, description: newDescription };
      try {
        const response = await callApi(`/eval/${evalId}`, {
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
        const response = await callApi(`/eval/${evalId}`, {
          method: 'DELETE',
        });
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        navigate('/');
      } catch (error) {
        console.error('Failed to delete evaluation:', error);
        alert('Failed to delete evaluation');
      }
    }
  };

  const [evalSelectorDialogOpen, setEvalSelectorDialogOpen] = React.useState(false);

  const handleEvalIdCopyClick = () => {
    if (evalId) {
      navigator.clipboard.writeText(evalId).then(
        () => {
          showToast('Eval ID copied to clipboard', 'success');
        },
        () => {
          showToast('Failed to copy Eval ID to clipboard', 'error');
          console.error('Failed to copy to clipboard');
        },
      );
    }
  };

  const [currentUserEmail, setCurrentUserEmail] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetchUserEmail().then((email) => {
      setCurrentUserEmail(email);
    });
  }, []);

  const handleEditAuthor = async (newAuthor: string) => {
    if (evalId) {
      try {
        await updateEvalAuthor(evalId, newAuthor);
        setAuthor(newAuthor);
      } catch (error) {
        console.error('Failed to update author:', error);
        throw error;
      }
    }
  };

  return (
    <div style={{ marginLeft: '1rem', marginRight: '1rem' }}>
      <ResponsiveStack
        direction="row"
        mb={3}
        spacing={1}
        alignItems="center"
        className="eval-header"
      >
        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', maxWidth: 250 }}>
          <TextField
            variant="outlined"
            size="small"
            fullWidth
            value={config?.description || evalId || ''}
            InputProps={{
              readOnly: true,
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <ArrowDropDownIcon />
                </InputAdornment>
              ),
            }}
            onClick={() => setEvalSelectorDialogOpen(true)}
            placeholder="Search or select an eval..."
            sx={{ cursor: 'pointer' }}
          />
          <EvalSelectorDialog
            open={evalSelectorDialogOpen}
            onClose={() => setEvalSelectorDialogOpen(false)}
            recentEvals={recentEvals}
            onRecentEvalSelected={onRecentEvalSelected}
            title="Select an Eval"
          />
        </Box>
        {evalId && <EvalIdChip evalId={evalId} onCopy={handleEvalIdCopyClick} />}
        <AuthorChip
          author={author}
          onEditAuthor={handleEditAuthor}
          currentUserEmail={currentUserEmail}
          editable
        />
        {Object.keys(config?.tags || {}).map((tag) => (
          <Chip
            key={tag}
            size="small"
            label={`${tag}: ${config?.tags?.[tag]}`}
            sx={{ opacity: 0.7 }}
          />
        ))}
      </ResponsiveStack>
      <ResponsiveStack direction="row" spacing={1} alignItems="center" sx={{ gap: 2 }}>
        <Box>
          <FilterModeSelector filterMode={filterMode} onChange={handleFilterModeChange} />
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
            <ColumnSelector
              columnData={columnData}
              selectedColumns={currentColumnState.selectedColumns}
              onChange={handleChange}
            />
            <Tooltip title="Edit table view settings" placement="bottom">
              <Button
                color="primary"
                onClick={() => setViewSettingsModalOpen(true)}
                startIcon={<SettingsIcon />}
              >
                Table Settings
              </Button>
            </Tooltip>
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
                <Tooltip title="Edit the name of this eval" placement="left">
                  <MenuItem onClick={handleDescriptionClick}>
                    <ListItemIcon>
                      <EditIcon fontSize="small" />
                    </ListItemIcon>
                    Edit name
                  </MenuItem>
                </Tooltip>
                <Tooltip title="Edit this eval in the web UI" placement="left">
                  <MenuItem
                    onClick={() => {
                      setStateFromConfig(config);
                      navigate('/setup/');
                    }}
                  >
                    <ListItemIcon>
                      <PlayArrowIcon fontSize="small" />
                    </ListItemIcon>
                    Edit and re-run
                  </MenuItem>
                </Tooltip>
                <CompareEvalMenuItem
                  initialEvals={recentEvals}
                  onComparisonEvalSelected={handleComparisonEvalSelected}
                />
                <Tooltip title="View the configuration that defines this eval" placement="left">
                  <MenuItem onClick={() => setConfigModalOpen(true)}>
                    <ListItemIcon>
                      <VisibilityIcon fontSize="small" />
                    </ListItemIcon>
                    View YAML
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
            {/* TODO(Michael): Remove config.metadata.redteam check (2024-08-18) */}
            {(config?.redteam || config?.metadata?.redteam) && (
              <Tooltip title="View vulnerability scan report" placement="bottom">
                <Button
                  color="primary"
                  variant="contained"
                  startIcon={<EyeIcon />}
                  onClick={() => navigate(`/report/?evalId=${evalId || defaultEvalId}`)}
                >
                  Vulnerability Report
                </Button>
              </Tooltip>
            )}
          </ResponsiveStack>
        </Box>
      </ResponsiveStack>
      <ResultsCharts
        columnVisibility={currentColumnState.columnVisibility}
        recentEvals={recentEvals}
      />
      <ResultsTable
        maxTextLength={maxTextLength}
        columnVisibility={currentColumnState.columnVisibility}
        wordBreak={wordBreak}
        showStats={showInferenceDetails}
        filterMode={filterMode}
        failureFilter={failureFilter}
        searchText={debouncedSearchText}
        onFailureFilterToggle={handleFailureFilterToggle}
        onSearchTextChange={handleSearchTextChange}
        setFilterMode={setFilterMode}
      />
      <ConfigModal open={configModalOpen} onClose={() => setConfigModalOpen(false)} />
      <ShareModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        evalId={currentEvalId}
        onShare={handleShare}
      />
      <SettingsModal open={viewSettingsModalOpen} onClose={() => setViewSettingsModalOpen(false)} />
      <EvalSelectorKeyboardShortcut
        recentEvals={recentEvals}
        onRecentEvalSelected={onRecentEvalSelected}
      />
    </div>
  );
}
