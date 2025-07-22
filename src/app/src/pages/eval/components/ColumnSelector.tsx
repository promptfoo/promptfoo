import React from 'react';

import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
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

interface ColumnData {
  value: string;
  label: string;
  group?: string;
  description?: string;
}

interface ColumnSelectorProps {
  columnData: ColumnData[];
  selectedColumns: string[];
  onChange: (event: SelectChangeEvent<string[]>) => void;
}

export const ColumnSelector: React.FC<ColumnSelectorProps> = ({
  columnData,
  selectedColumns,
  onChange,
}) => {
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

  const handleToggle = (value: string) => {
    const newSelected = selectedColumns.includes(value)
      ? selectedColumns.filter((item) => item !== value)
      : [...selectedColumns, value];
    onChange(createSelectEvent(newSelected));
  };

  const handleShowAll = () => {
    onChange(createSelectEvent(columnData.map((col) => col.value)));
  };

  // Get all variable columns
  const variableColumns = columnData
    .filter((col) => col.value.startsWith('Variable'))
    .map((col) => col.value);

  // Check if all variables are currently visible
  const variablesVisible =
    variableColumns.length > 0 && variableColumns.every((col) => selectedColumns.includes(col));

  const handleToggleVariables = () => {
    if (variablesVisible) {
      // Hide all variables - keep non-variable columns
      const newSelected = selectedColumns.filter((col) => !col.startsWith('Variable'));
      onChange(createSelectEvent(newSelected));
    } else {
      // Show all variables - add all variable columns that aren't already selected
      const newSelected = [...selectedColumns];
      variableColumns.forEach((col) => {
        if (!newSelected.includes(col)) {
          newSelected.push(col);
        }
      });
      onChange(createSelectEvent(newSelected));
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
              {variableColumns.length > 0 && (
                <Tooltip
                  title={
                    variablesVisible ? 'Hide all variable columns' : 'Show all variable columns'
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
            </Stack>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          {Object.entries(groupedColumns).map(([group, columns]) => (
            <List
              key={group}
              subheader={
                <ListSubheader component="div" sx={{ bgcolor: 'background.paper' }}>
                  {group}
                </ListSubheader>
              }
            >
              {columns.map((column) => (
                <ListItem key={column.value} dense disablePadding>
                  <FormControlLabel
                    control={
                      <Checkbox
                        edge="start"
                        checked={selectedColumns.includes(column.value)}
                        onChange={() => handleToggle(column.value)}
                      />
                    }
                    label={
                      <Tooltip title={column.description || column.label} placement="right">
                        <Typography
                          variant="body2"
                          sx={{
                            maxWidth: '500px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {column.label}
                        </Typography>
                      </Tooltip>
                    }
                    sx={{ ml: 1, width: '100%' }}
                  />
                </ListItem>
              ))}
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
