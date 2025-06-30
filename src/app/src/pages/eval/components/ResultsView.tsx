import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { IS_RUNNING_LOCALLY } from '@app/constants';
import { useToast } from '@app/hooks/useToast';
import { useStore as useMainStore } from '@app/stores/evalConfig';
import { callApi, fetchUserEmail, updateEvalAuthor } from '@app/utils/api';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import ClearIcon from '@mui/icons-material/Clear';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SearchIcon from '@mui/icons-material/Search';
import SettingsIcon from '@mui/icons-material/Settings';
import ShareIcon from '@mui/icons-material/Share';
import EyeIcon from '@mui/icons-material/Visibility';
import VisibilityIcon from '@mui/icons-material/Visibility';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
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
import { MetricFilterSelector } from './MetricFilterSelector';
import ResultsCharts from './ResultsCharts';
import ResultsTable from './ResultsTable';
import ShareModal from './ShareModal';
import SettingsModal from './TableSettings/TableSettingsModal';
import { useTableStore, useResultsViewSettingsStore } from './store';
import type { FilterMode, ResultLightweightWithLabel } from './types';
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

const SearchInputField = React.memo(
  ({
    value,
    onChange,
    onKeyDown,
    placeholder = 'Search...',
  }: {
    value: string;
    onChange: (value: string) => void;
    onKeyDown?: React.KeyboardEventHandler;
    placeholder?: string;
  }) => {
    // Use local state to handle immediate updates
    const [localValue, setLocalValue] = React.useState(value);

    // Sync with parent when external value changes
    React.useEffect(() => {
      setLocalValue(value);
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      // Update local state immediately for responsive typing
      setLocalValue(newValue);
      // Notify parent of change
      onChange(newValue);
    };

    const handleClear = () => {
      setLocalValue('');
      onChange('');
    };

    return (
      <TextField
        sx={{
          width: '100%',
          maxWidth: '400px',
          '& .MuiInputBase-root': {
            borderRadius: '20px',
          },
          '& .MuiInputAdornment-root': {
            transition:
              'opacity 225ms cubic-bezier(0.4, 0, 0.2, 1), width 225ms cubic-bezier(0.4, 0, 0.2, 1), transform 225ms cubic-bezier(0.4, 0, 0.2, 1)',
          },
          '& .clear-button': {
            opacity: localValue ? 1 : 0,
            width: localValue ? 'auto' : 0,
            transform: localValue ? 'scale(1)' : 'scale(0.8)',
            transition:
              'opacity 225ms cubic-bezier(0.4, 0, 0.2, 1), width 225ms cubic-bezier(0.4, 0, 0.2, 1), transform 225ms cubic-bezier(0.4, 0, 0.2, 1)',
          },
        }}
        size="small"
        label="Search"
        placeholder={placeholder}
        value={localValue}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon color="action" fontSize="small" />
            </InputAdornment>
          ),
          endAdornment: (
            <InputAdornment position="end" className="clear-button">
              <Tooltip title="Clear search (Esc)">
                <IconButton
                  aria-label="clear search"
                  onClick={handleClear}
                  edge="end"
                  size="small"
                  sx={{
                    visibility: localValue ? 'visible' : 'hidden',
                  }}
                >
                  <ClearIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </InputAdornment>
          ),
        }}
      />
    );
  },
);

export default function ResultsView({
  recentEvals,
  onRecentEvalSelected,
  defaultEvalId,
}: ResultsViewProps) {
  const navigate = useNavigate();

  const [searchParams, setSearchParams] = useSearchParams();
  const {
    author,
    table,

    config,
    setConfig,
    evalId,
    setAuthor,
    filteredResultsCount,
    totalResultsCount,
    highlightedResultsCount,
  } = useTableStore();

  const {
    setInComparisonMode,
    columnStates,
    setColumnState,
    maxTextLength,
    wordBreak,
    showInferenceDetails,
    comparisonEvalIds,
    setComparisonEvalIds,
  } = useResultsViewSettingsStore();

  const { setStateFromConfig } = useMainStore();

  const { showToast } = useToast();
  const [searchText, setSearchText] = React.useState(searchParams.get('search') || '');
  const [debouncedSearchValue] = useDebounce(searchText, 1000);

  const handleSearchTextChange = React.useCallback(
    (text: string) => {
      setSearchParams((prev) => ({ ...prev, search: text }));
      setSearchText(text);
    },
    [searchParams],
  );

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

    setInComparisonMode(true);
    setComparisonEvalIds([...comparisonEvalIds, compareEvalId]);
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

  const visiblePromptCount = React.useMemo(
    () =>
      head.prompts.filter(
        (_, idx) => currentColumnState.columnVisibility[`Prompt ${idx + 1}`] !== false,
      ).length,
    [head.prompts, currentColumnState.columnVisibility],
  );

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

  const handleSearchKeyDown = React.useCallback<React.KeyboardEventHandler>(
    (event) => {
      if (event.key === 'Escape') {
        handleSearchTextChange('');
        event.preventDefault();
        event.stopPropagation();
      }
    },
    [handleSearchTextChange],
  );

  // Add state for metric filter and available metrics
  const [selectedMetric, setSelectedMetric] = React.useState<string | null>(null);

  const availableMetrics = React.useMemo(() => {
    if (table && table.head?.prompts) {
      const metrics = new Set<string>();
      table.head.prompts.forEach((prompt) => {
        if (prompt.metrics?.namedScores) {
          Object.keys(prompt.metrics.namedScores).forEach((metric) => metrics.add(metric));
        }
      });
      return Array.from(metrics).sort();
    }
    return [];
  }, [table]);

  // Make the function a callback that can be passed to CustomMetrics
  const handleMetricFilterChange = React.useCallback((metric: string | null) => {
    setSelectedMetric(metric);
  }, []);

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
            slotProps={{
              input: {
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
              },
            }}
            onClick={() => setEvalSelectorDialogOpen(true)}
            placeholder="Search or select an eval..."
            sx={{ cursor: 'pointer' }}
          />
          <EvalSelectorDialog
            open={evalSelectorDialogOpen}
            onClose={() => setEvalSelectorDialogOpen(false)}
            onEvalSelected={(evalId) => {
              setEvalSelectorDialogOpen(false);
              onRecentEvalSelected(evalId);
            }}
            title="Select an Eval"
            focusedEvalId={evalId ?? undefined}
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
          <FilterModeSelector
            filterMode={filterMode}
            onChange={handleFilterModeChange}
            showDifferentOption={visiblePromptCount > 1}
          />
        </Box>
        <Box>
          <SearchInputField
            value={searchText}
            onChange={handleSearchTextChange}
            onKeyDown={handleSearchKeyDown}
            placeholder="Text or regex"
          />
        </Box>
        <MetricFilterSelector
          selectedMetric={selectedMetric}
          availableMetrics={availableMetrics}
          onChange={handleMetricFilterChange}
        />
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.04)',
            borderRadius: '16px',
            padding: '4px 12px',
            fontSize: '0.875rem',
          }}
        >
          {searchText || filterMode !== 'all' || selectedMetric ? (
            <>
              <strong>{filteredResultsCount}</strong>
              <span style={{ margin: '0 4px' }}>of</span>
              <strong>{totalResultsCount}</strong>
              <span style={{ margin: '0 4px' }}>results</span>
              {searchText && (
                <Chip
                  size="small"
                  label={`Search: ${searchText.length > 4 ? searchText.substring(0, 5) + '...' : searchText}`}
                  onDelete={() => handleSearchTextChange('')}
                  sx={{ marginLeft: '4px', height: '20px', fontSize: '0.75rem' }}
                />
              )}
              {filterMode !== 'all' && (
                <Chip
                  size="small"
                  label={`Filter: ${filterMode}`}
                  onDelete={() => setFilterMode('all')}
                  sx={{ marginLeft: '4px', height: '20px', fontSize: '0.75rem' }}
                />
              )}
              {selectedMetric && (
                <Chip
                  size="small"
                  label={`Metric: ${selectedMetric}`}
                  onDelete={() => handleMetricFilterChange(null)}
                  sx={{ marginLeft: '4px', height: '20px', fontSize: '0.75rem' }}
                />
              )}
            </>
          ) : (
            <>{filteredResultsCount} results</>
          )}
        </Box>
        {highlightedResultsCount > 0 && (
          <Chip
            size="small"
            label={`${highlightedResultsCount} highlighted`}
            sx={{
              backgroundColor: 'rgba(25, 118, 210, 0.08)',
              color: 'rgba(25, 118, 210, 1)',
              border: '1px solid rgba(25, 118, 210, 0.2)',
              fontWeight: 500,
            }}
          />
        )}
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
            <Button color="primary" onClick={handleOpenMenu} endIcon={<ArrowDropDownIcon />}>
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
        searchText={searchText}
        debouncedSearchText={debouncedSearchValue}
        onFailureFilterToggle={handleFailureFilterToggle}
        onSearchTextChange={handleSearchTextChange}
        setFilterMode={setFilterMode}
        selectedMetric={selectedMetric}
        onMetricFilter={handleMetricFilterChange}
      />
      <ConfigModal open={configModalOpen} onClose={() => setConfigModalOpen(false)} />
      <ShareModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        evalId={currentEvalId}
        onShare={handleShare}
      />
      <SettingsModal open={viewSettingsModalOpen} onClose={() => setViewSettingsModalOpen(false)} />
      <EvalSelectorKeyboardShortcut onEvalSelected={onRecentEvalSelected} />
    </div>
  );
}
