import React from 'react';

import { IS_RUNNING_LOCALLY } from '@app/constants';
import { useToast } from '@app/hooks/useToast';
import { useStore as useMainStore } from '@app/stores/evalConfig';
import { callApi, fetchUserEmail, updateEvalAuthor } from '@app/utils/api';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import ClearIcon from '@mui/icons-material/Clear';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
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
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import { styled } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import { displayNameOverrides } from '@promptfoo/redteam/constants/metadata';
import invariant from '@promptfoo/util/invariant';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDebounce } from 'use-debounce';
import { AuthorChip } from './AuthorChip';
import { ColumnSelector } from './ColumnSelector';
import CompareEvalMenuItem from './CompareEvalMenuItem';
import { ConfirmEvalNameDialog } from './ConfirmEvalNameDialog';
import ConfigModal from './ConfigModal';
import DownloadMenu from './DownloadMenu';
import { EvalIdChip } from './EvalIdChip';
import EvalSelectorDialog from './EvalSelectorDialog';
import EvalSelectorKeyboardShortcut from './EvalSelectorKeyboardShortcut';
import { FilterModeSelector } from './FilterModeSelector';
import ResultsCharts from './ResultsCharts';
import FiltersButton from './ResultsFilters/FiltersButton';
import FiltersForm from './ResultsFilters/FiltersForm';
import ResultsTable from './ResultsTable';
import ShareModal from './ShareModal';
import { useResultsViewSettingsStore, useTableStore } from './store';
import SettingsModal from './TableSettings/TableSettingsModal';
import type { SelectChangeEvent } from '@mui/material/Select';
import type { EvalResultsFilterMode, ResultLightweightWithLabel } from '@promptfoo/types';
import type { VisibilityState } from '@tanstack/table-core';
import './ResultsView.css';

import BarChartIcon from '@mui/icons-material/BarChart';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import { formatPolicyIdentifierAsMetric } from '@promptfoo/redteam/plugins/policy/utils';

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
    filters,
    removeFilter,
    filterMode,
    setFilterMode,
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

  const { updateConfig } = useMainStore();

  const { showToast } = useToast();
  const [searchText, setSearchText] = React.useState(searchParams.get('search') || '');
  const [debouncedSearchValue] = useDebounce(searchText, 1000);

  const handleSearchTextChange = React.useCallback(
    (text: string) => {
      setSearchParams((prev) => ({ ...prev, search: text }));
      setSearchText(text);
    },
    [setSearchParams],
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

  const handleFilterModeChange = (event: SelectChangeEvent<unknown>) => {
    const mode = event.target.value as EvalResultsFilterMode;
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

  const [filtersFormOpen, setFiltersFormOpen] = React.useState(false);
  const filtersButtonRef = React.useRef<HTMLButtonElement>(null);

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
  const [editNameDialogOpen, setEditNameDialogOpen] = React.useState(false);
  const [copyDialogOpen, setCopyDialogOpen] = React.useState(false);

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

  const handleSaveEvalName = React.useCallback(
    async (newName: string) => {
      try {
        invariant(config, 'Config must be loaded before updating its description');
        const newConfig = { ...config, description: newName };

        const response = await callApi(`/eval/${evalId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ config: newConfig }),
        });

        if (!response.ok) {
          throw new Error('Failed to update eval name');
        }

        setConfig(newConfig);
      } catch (error) {
        console.error('Failed to update eval name:', error);
        showToast(
          `Failed to update eval name: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'error',
        );
        throw error;
      }
    },
    [config, evalId, setConfig, showToast],
  );

  const handleCopyEval = React.useCallback(
    async (description: string) => {
      try {
        invariant(evalId, 'Eval ID must be set before copying');

        const response = await callApi(`/eval/${evalId}/copy`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ description }),
        });

        if (!response.ok) {
          throw new Error('Failed to copy evaluation');
        }

        const { id: newEvalId, distinctTestCount } = await response.json();

        // Open in new tab (Google Docs pattern)
        window.open(`/eval/${newEvalId}`, '_blank');

        // Show success toast
        showToast(`Copied ${distinctTestCount.toLocaleString()} results successfully`, 'success');
      } catch (error) {
        console.error('Failed to copy evaluation:', error);
        showToast(
          `Failed to copy evaluation: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'error',
        );
        throw error;
      }
    },
    [evalId, showToast],
  );

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

  // Render the charts if a) they can be rendered, and b) the viewport, at mount-time, is tall enough.
  const resultsChartsScores = React.useMemo(() => {
    if (!table?.body) {
      return [];
    }
    return table?.body
      .flatMap((row) => row.outputs.map((output) => output?.score))
      .filter((score) => typeof score === 'number' && !Number.isNaN(score));
  }, [table]);

  const canRenderResultsCharts =
    table &&
    config &&
    table.head.prompts.length > 1 &&
    // No valid scores available
    resultsChartsScores.length > 0 &&
    // All scores are the same, charts not useful.
    new Set(resultsChartsScores).size > 1;
  const [renderResultsCharts, setRenderResultsCharts] = React.useState(window.innerHeight >= 1100);

  const [resultsTableZoom, setResultsTableZoom] = React.useState(1);

  return (
    <>
      <Box px={2} pt={2}>
        <Box sx={{ transition: 'all 0.3s ease' }}>
          <ResponsiveStack direction="row" spacing={1} alignItems="center" className="eval-header">
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
              <FormControl>
                <InputLabel id="results-table-zoom-label">Zoom</InputLabel>
                <Select
                  labelId="results-table-zoom-label"
                  size="small"
                  label="Zoom"
                  value={resultsTableZoom}
                  onChange={(e: SelectChangeEvent<number>) =>
                    setResultsTableZoom(e.target.value as number)
                  }
                  sx={{ minWidth: 100 }}
                >
                  <MenuItem value={0.5}>50%</MenuItem>
                  <MenuItem value={0.75}>75%</MenuItem>
                  <MenuItem value={0.9}>90%</MenuItem>
                  <MenuItem value={1}>100%</MenuItem>
                  <MenuItem value={1.25}>125%</MenuItem>
                  <MenuItem value={1.5}>150%</MenuItem>
                  <MenuItem value={2}>200%</MenuItem>
                </Select>
              </FormControl>
            </Box>
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

            <FiltersButton
              appliedFiltersCount={filters.appliedCount}
              onClick={() => setFiltersFormOpen(true)}
              ref={filtersButtonRef}
            />
            <FiltersForm
              open={filtersFormOpen}
              onClose={() => setFiltersFormOpen(false)}
              anchorEl={filtersButtonRef.current}
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
              {searchText || filterMode !== 'all' || filters.appliedCount > 0 ? (
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
                  {filters.appliedCount > 0 &&
                    Object.values(filters.values).map((filter) => {
                      // For metadata filters with exists operator, only field is required
                      // For metric filters with is_defined operator, only field is required
                      // For other filters, check field and value requirements
                      if (filter.type === 'metadata' && filter.operator === 'exists') {
                        if (!filter.field) {
                          return null;
                        }
                      } else if (filter.type === 'metric' && filter.operator === 'is_defined') {
                        if (!filter.field) {
                          return null;
                        }
                      } else if (filter.type === 'metadata' || filter.type === 'metric') {
                        if (!filter.value || !filter.field) {
                          return null;
                        }
                      } else if (!filter.value) {
                        return null;
                      }

                      const truncatedValue =
                        filter.value.length > 50 ? filter.value.slice(0, 50) + '...' : filter.value;

                      let label: string;
                      if (filter.type === 'metric') {
                        // Show metric field and operator with value (if applicable)
                        const operatorSymbols: Record<string, string> = {
                          is_defined: 'is defined',
                          eq: '==',
                          neq: '!=',
                          gt: '>',
                          gte: '≥',
                          lt: '<',
                          lte: '≤',
                        };
                        const operatorDisplay = operatorSymbols[filter.operator] || filter.operator;
                        if (filter.operator === 'is_defined') {
                          label = `Metric: ${filter.field}`;
                        } else {
                          label = `${filter.field} ${operatorDisplay} ${truncatedValue}`;
                        }
                      } else if (filter.type === 'plugin') {
                        const displayName =
                          displayNameOverrides[filter.value as keyof typeof displayNameOverrides] ||
                          filter.value;
                        label = `Plugin: ${displayName}`;
                      } else if (filter.type === 'strategy') {
                        const displayName =
                          displayNameOverrides[filter.value as keyof typeof displayNameOverrides] ||
                          filter.value;
                        label = `Strategy: ${displayName}`;
                      } else if (filter.type === 'severity') {
                        // Capitalize the first letter of severity value for display
                        const severityDisplay =
                          filter.value.charAt(0).toUpperCase() + filter.value.slice(1);
                        label = `Severity: ${severityDisplay}`;
                      } else if (filter.type === 'policy') {
                        // For policy filters, use the policy name from the mapping
                        // This should match the display format used in the dropdown
                        const policyName = filters.policyIdToNameMap?.[filter.value];
                        label = formatPolicyIdentifierAsMetric(policyName ?? filter.value);
                      } else {
                        // metadata type
                        label = `${filter.field} ${filter.operator.replace('_', ' ')} "${truncatedValue}"`;
                      }

                      return (
                        <Chip
                          key={filter.id}
                          size="small"
                          label={label}
                          title={filter.value} // Show full value on hover
                          onDelete={() => removeFilter(filter.id)}
                          sx={{ marginLeft: '4px', height: '20px', fontSize: '0.75rem' }}
                        />
                      );
                    })}
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
                {canRenderResultsCharts && (
                  <Button
                    onClick={() => setRenderResultsCharts((prev) => !prev)}
                    variant="text"
                    startIcon={<BarChartIcon />}
                  >
                    {renderResultsCharts ? 'Hide Charts' : 'Show Charts'}
                  </Button>
                )}
                {config && (
                  <Menu
                    id="eval-actions-menu"
                    anchorEl={anchorEl}
                    keepMounted
                    open={Boolean(anchorEl)}
                    onClose={handleMenuClose}
                  >
                    <Tooltip title="Edit the name of this eval" placement="left">
                      <MenuItem onClick={() => setEditNameDialogOpen(true)}>
                        <ListItemIcon>
                          <EditIcon fontSize="small" />
                        </ListItemIcon>
                        Edit name
                      </MenuItem>
                    </Tooltip>
                    <Tooltip title="Edit this eval in the web UI" placement="left">
                      <MenuItem
                        onClick={() => {
                          updateConfig(config);
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
                    <Tooltip title="Create a copy of this evaluation" placement="left">
                      <MenuItem
                        onClick={() => {
                          handleMenuClose();
                          setCopyDialogOpen(true);
                        }}
                      >
                        <ListItemIcon>
                          <ContentCopyIcon fontSize="small" />
                        </ListItemIcon>
                        Copy
                      </MenuItem>
                    </Tooltip>
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
                      onClick={() => navigate(`/reports/?evalId=${evalId || defaultEvalId}`)}
                    >
                      Vulnerability Report
                    </Button>
                  </Tooltip>
                )}
              </ResponsiveStack>
            </Box>
          </ResponsiveStack>
          {canRenderResultsCharts && renderResultsCharts && (
            <ResultsCharts
              handleHideCharts={() => setRenderResultsCharts(false)}
              scores={resultsChartsScores}
            />
          )}
        </Box>
        <ResultsTable
          maxTextLength={maxTextLength}
          columnVisibility={currentColumnState.columnVisibility}
          wordBreak={wordBreak}
          showStats={showInferenceDetails}
          filterMode={filterMode}
          failureFilter={failureFilter}
          debouncedSearchText={debouncedSearchValue}
          onFailureFilterToggle={handleFailureFilterToggle}
          zoom={resultsTableZoom}
        />
      </Box>
      <ConfigModal open={configModalOpen} onClose={() => setConfigModalOpen(false)} />
      <ShareModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        evalId={currentEvalId}
        onShare={handleShare}
      />
      <SettingsModal open={viewSettingsModalOpen} onClose={() => setViewSettingsModalOpen(false)} />
      <ConfirmEvalNameDialog
        open={editNameDialogOpen}
        onClose={() => setEditNameDialogOpen(false)}
        title="Edit Eval Name"
        label="Description"
        currentName={config?.description || ''}
        actionButtonText="Save"
        onConfirm={handleSaveEvalName}
      />
      <ConfirmEvalNameDialog
        open={copyDialogOpen}
        onClose={() => setCopyDialogOpen(false)}
        title="Copy Evaluation"
        label="Description"
        currentName={`${config?.description || 'Evaluation'} (Copy)`}
        actionButtonText="Create Copy"
        onConfirm={handleCopyEval}
        showSizeWarning={totalResultsCount > 10000}
        itemCount={totalResultsCount}
        itemLabel="results"
      />
      <EvalSelectorKeyboardShortcut onEvalSelected={onRecentEvalSelected} />
    </>
  );
}
