import React from 'react';

import RefreshIcon from '@mui/icons-material/Refresh';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListSubheader from '@mui/material/ListSubheader';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { SelectChangeEvent } from '@mui/material/Select';

import type { ColumnVisibilityByName } from './store';

interface ColumnData {
  value: string;
  label: string;
  group?: string;
  description?: string;
  /** The semantic name for the column (e.g., "context" for "Variable 1: context") */
  semanticName?: string;
}

interface ColumnSelectorProps {
  columnData: ColumnData[];
  selectedColumns: string[];
  onChange: (event: SelectChangeEvent<string[]>) => void;
  /** Current name-based column visibility preferences */
  columnVisibilityByName?: ColumnVisibilityByName;
  /** Callback when a column's visibility preference should be saved by name */
  onSaveColumnPreference?: (semanticName: string, visible: boolean) => void;
  /** Callback to clear a column's saved preference */
  onClearColumnPreference?: (semanticName: string) => void;
  /** Callback to reset all column preferences */
  onResetAllPreferences?: () => void;
  /** Callback to set global variable visibility default */
  onSetGlobalVariableVisibility?: (visible: boolean) => void;
  /** Callback to set global prompt visibility default */
  onSetGlobalPromptVisibility?: (visible: boolean) => void;
  /** Callback to clear per-eval column state (for migrating from legacy state) */
  onClearPerEvalState?: () => void;
  /** Whether there are any saved preferences */
  hasPreferences?: boolean;
}

export const ColumnSelector = ({
  columnData,
  selectedColumns,
  onChange,
  columnVisibilityByName = {},
  onSaveColumnPreference,
  onClearColumnPreference,
  onResetAllPreferences,
  onSetGlobalVariableVisibility,
  onSetGlobalPromptVisibility,
  onClearPerEvalState,
  hasPreferences = false,
}: ColumnSelectorProps) => {
  const [open, setOpen] = React.useState(false);

  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  const createSelectEvent = (value: string[]) =>
    ({
      target: { value, name: 'visible-columns' },
      currentTarget: { value, name: 'visible-columns' },
      bubbles: true,
      cancelBubble: false,
      cancelable: false,
      composed: false,
      defaultPrevented: false,
      eventPhase: 0,
      isTrusted: true,
      returnValue: true,
      type: 'change',
    }) as unknown as SelectChangeEvent<string[]>;

  const handleToggle = (column: ColumnData) => {
    const isCurrentlySelected = selectedColumns.includes(column.value);
    const newSelected = isCurrentlySelected
      ? selectedColumns.filter((item) => item !== column.value)
      : [...selectedColumns, column.value];
    onChange(createSelectEvent(newSelected));

    // Save the preference by semantic name if available
    if (onSaveColumnPreference && column.semanticName) {
      onSaveColumnPreference(column.semanticName, !isCurrentlySelected);
    }
  };

  const handleShowAll = () => {
    onChange(createSelectEvent(columnData.map((col) => col.value)));
    // When showing all, also update the global defaults for both variables and prompts
    if (onSetGlobalVariableVisibility) {
      onSetGlobalVariableVisibility(true);
    }
    if (onSetGlobalPromptVisibility) {
      onSetGlobalPromptVisibility(true);
    }
  };

  const handleResetToDefaults = () => {
    // Clear all name-based preferences
    if (onResetAllPreferences) {
      onResetAllPreferences();
    }
    // Clear per-eval column state for current eval (legacy migration)
    if (onClearPerEvalState) {
      onClearPerEvalState();
    }
    // Reset global defaults to show all
    if (onSetGlobalVariableVisibility) {
      onSetGlobalVariableVisibility(true);
    }
    if (onSetGlobalPromptVisibility) {
      onSetGlobalPromptVisibility(true);
    }
    // Show all columns after reset
    onChange(createSelectEvent(columnData.map((col) => col.value)));
  };

  // Get all variable columns with their semantic names
  const variableColumns = columnData.filter((col) => col.value.startsWith('Variable'));
  const variableColumnIds = variableColumns.map((col) => col.value);

  // Check if all variables are currently visible
  const variablesVisible =
    variableColumnIds.length > 0 && variableColumnIds.every((col) => selectedColumns.includes(col));

  const handleToggleVariables = () => {
    const newVariablesVisible = !variablesVisible;

    if (newVariablesVisible) {
      // Show all variables - add all variable columns that aren't already selected
      const newSelected = [...selectedColumns];
      variableColumnIds.forEach((col) => {
        if (!newSelected.includes(col)) {
          newSelected.push(col);
        }
      });
      onChange(createSelectEvent(newSelected));
    } else {
      // Hide all variables - keep non-variable columns
      const newSelected = selectedColumns.filter((col) => !col.startsWith('Variable'));
      onChange(createSelectEvent(newSelected));
    }

    // Save the global variable visibility preference
    if (onSetGlobalVariableVisibility) {
      onSetGlobalVariableVisibility(newVariablesVisible);
    }

    // Also save individual column preferences
    if (onSaveColumnPreference) {
      variableColumns.forEach((col) => {
        if (col.semanticName) {
          onSaveColumnPreference(col.semanticName, newVariablesVisible);
        }
      });
    }
  };

  // Group columns by their group property
  const groupedColumns = columnData.reduce(
    (acc, column) => {
      const group = column?.group || 'Other';
      if (!acc[group]) {
        acc[group] = [];
      }
      acc[group].push(column);
      return acc;
    },
    {} as Record<string, ColumnData[]>,
  );

  // Check if a column has a saved preference
  const hasColumnPreference = (column: ColumnData): boolean => {
    return column.semanticName ? columnVisibilityByName[column.semanticName] !== undefined : false;
  };

  return (
    <>
      <Button onClick={handleOpen} startIcon={<ViewColumnIcon />} variant="text">
        Columns ({selectedColumns.length})
      </Button>

      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">Select Columns</Typography>
            <Stack direction="row" spacing={1}>
              <Button size="small" onClick={handleShowAll} variant="outlined">
                Show All
              </Button>
              {variableColumnIds.length > 0 && (
                <Tooltip
                  title={
                    variablesVisible
                      ? 'Hide all variable columns (saves preference)'
                      : 'Show all variable columns (saves preference)'
                  }
                >
                  <Button
                    size="small"
                    onClick={handleToggleVariables}
                    variant={variablesVisible ? 'contained' : 'outlined'}
                    color={variablesVisible ? 'primary' : 'inherit'}
                    startIcon={variablesVisible ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  >
                    Variables
                  </Button>
                </Tooltip>
              )}
              {hasPreferences && onResetAllPreferences && (
                <Tooltip title="Clear all saved column preferences and show all columns">
                  <Button
                    size="small"
                    onClick={handleResetToDefaults}
                    variant="outlined"
                    color="inherit"
                    startIcon={<RefreshIcon />}
                  >
                    Reset
                  </Button>
                </Tooltip>
              )}
            </Stack>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ mb: 2, px: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Column visibility preferences are saved and apply across all evals with matching
              column names.
            </Typography>
          </Box>
          {Object.entries(groupedColumns).map(([group, columns]) => (
            <List
              key={group}
              subheader={
                <ListSubheader component="div" sx={{ bgcolor: 'background.paper' }}>
                  {group}
                </ListSubheader>
              }
            >
              {columns.map((column) => {
                const hasPref = hasColumnPreference(column);
                return (
                  <ListItem key={column.value} dense disablePadding>
                    <FormControlLabel
                      control={
                        <Checkbox
                          edge="start"
                          checked={selectedColumns.includes(column.value)}
                          onChange={() => handleToggle(column)}
                        />
                      }
                      label={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Tooltip title={column.description || column.label} placement="right">
                            <Typography
                              variant="body2"
                              sx={{
                                maxWidth: '400px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {column.label}
                            </Typography>
                          </Tooltip>
                          {hasPref && (
                            <Tooltip title="This column has a saved preference. Click the column checkbox to update it.">
                              <Chip
                                size="small"
                                label="saved"
                                sx={{
                                  height: 18,
                                  fontSize: '0.7rem',
                                  '& .MuiChip-label': { px: 0.75 },
                                }}
                                onDelete={
                                  onClearColumnPreference && column.semanticName
                                    ? () => onClearColumnPreference(column.semanticName!)
                                    : undefined
                                }
                              />
                            </Tooltip>
                          )}
                        </Box>
                      }
                      sx={{ ml: 1, width: '100%' }}
                    />
                  </ListItem>
                );
              })}
            </List>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
