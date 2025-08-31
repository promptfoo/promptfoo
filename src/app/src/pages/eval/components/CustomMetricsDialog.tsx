import React from 'react';

import FilterAltIcon from '@mui/icons-material/FilterAlt';
import Box from '@mui/material/Box';
import { green, orange, red } from '@mui/material/colors';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import IconButton from '@mui/material/IconButton';
import { alpha, useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import {
  DataGrid,
  type GridColDef,
  GridColumnGroupingModel,
  GridToolbarContainer,
  GridToolbarFilterButton,
  GridToolbarQuickFilter,
} from '@mui/x-data-grid';
import { useTableStore } from './store';

type MetricScore = {
  score: number;
  count: number;
  hasScore: boolean;
};

interface MetricRow {
  id: string;
  metric: string;
  [key: string]: any; // For dynamic prompt columns
}

const MetricsTable: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { table, filters, addFilter } = useTableStore();
  const theme = useTheme();

  if (!table || !table.head || !table.head.prompts) {
    return null;
  }

  /**
   * Given the pass rate percentages, calculates the color and text color for the cell.
   * Uses a diverging RdYlGn scale.
   * @param percentage - The pass rate percentage.
   * @returns The background color and text color for the cell.
   * @see https://observablehq.com/@d3/color-schemes#diverging
   */
  function getPercentageColors(percentage: number) {
    let backgroundColor;
    let color;

    if (percentage >= 75) {
      let shade = 700;
      if (percentage >= 90) {
        shade = 900;
      } else if (percentage >= 80) {
        shade = 800;
      }
      color = theme.palette.success.contrastText;
      backgroundColor = alpha(green[shade as keyof typeof green], percentage / 100);
    } else if (percentage >= 50) {
      let shade = 700;
      if (percentage >= 70) {
        shade = 900;
      } else if (percentage >= 60) {
        shade = 800;
      }
      color = theme.palette.warning.contrastText;
      backgroundColor = alpha(orange[shade as keyof typeof orange], percentage / 100);
    } else {
      let shade = 400;
      if (percentage <= 10) {
        shade = 900;
      } else if (percentage <= 20) {
        shade = 800;
      } else if (percentage <= 30) {
        shade = 600;
      } else if (percentage <= 40) {
        shade = 500;
      }
      color = theme.palette.error.contrastText;
      backgroundColor = alpha(red[shade as keyof typeof red], 1 - percentage / 100);
    }

    return {
      backgroundColor,
      color,
    };
  }

  /**
   * Applies the metric as a filter and switches to the results tab.
   */
  const handleMetricFilterClick = React.useCallback(
    (metric: string | null) => {
      if (!metric) {
        return;
      }

      const filter = {
        type: 'metric' as const,
        operator: 'equals' as const,
        value: metric,
        logicOperator: 'or' as const,
      };

      // If this filter is already applied, do not re-apply it.
      if (
        Object.values(filters.values).find(
          (f) =>
            f.type === filter.type &&
            f.value === filter.value &&
            f.operator === filter.operator &&
            f.logicOperator === filter.logicOperator,
        )
      ) {
        return;
      }

      addFilter(filter);
      onClose();
    },
    [addFilter, filters.values],
  );

  // Extract aggregated metric names from prompts
  const promptMetricNames = React.useMemo(() => {
    const metrics = new Set<string>();
    table.head.prompts.forEach((prompt) => {
      if (prompt.metrics?.namedScores) {
        Object.keys(prompt.metrics.namedScores).forEach((metric) => metrics.add(metric));
      }
    });
    return Array.from(metrics).sort();
  }, [table.head.prompts]);

  // Create columns for DataGrid
  const columns: GridColDef[] = React.useMemo(() => {
    const cols: GridColDef[] = [
      {
        field: 'metric',
        headerName: 'Metric',
        flex: 1,
        headerAlign: 'left',
        renderCell: (params) => {
          const metricName = params.row.metric;
          return (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                justifyContent: 'space-between',
                width: '100%',
                position: 'relative',
                '& .filter-icon': {
                  opacity: 0,
                },
                '.MuiDataGrid-row:hover &': {
                  '& .filter-icon': {
                    opacity: 1,
                  },
                },
              }}
            >
              <Typography variant="body2" component="span" sx={{ lineHeight: 1.5 }}>
                {metricName}
              </Typography>
              <span style={{ display: 'flex', alignItems: 'center' }}>
                <IconButton
                  className="filter-icon"
                  size="small"
                  sx={{
                    color: 'text.disabled',
                    '&:hover': {
                      color: 'primary.main',
                      backgroundColor: 'action.hover',
                    },
                  }}
                  aria-label={`Filter by ${metricName}`}
                  onClick={() => handleMetricFilterClick(metricName)}
                >
                  <FilterAltIcon />
                </IconButton>
              </span>
            </Box>
          );
        },
      },
    ];

    // Add a column for each prompt
    table.head.prompts.forEach((prompt, idx) => {
      const columnId = `prompt_${idx}`;

      cols.push({
        field: `${columnId}_pass_rate`,
        headerName: 'Pass Rate',
        flex: 0.5,
        type: 'number',
        valueGetter: (_, row) => {
          const { hasScore, score, count } = row[columnId] as MetricScore;
          return hasScore && typeof count === 'number' && count > 0 ? (score / count) * 100 : 0;
        },
        renderCell: (params) => {
          const { backgroundColor, color } = getPercentageColors(params.value);
          return (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                height: '100%',
              }}
            >
              <Box
                component="span"
                sx={{
                  backgroundColor,
                  color,
                  borderRadius: '4px',
                  width: '80px',
                  height: '24px',
                  display: 'inline-flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  fontWeight: 500,
                  fontSize: '0.875rem',
                  lineHeight: 1,
                }}
              >
                {params.value.toFixed(2)}%
              </Box>
            </Box>
          );
        },
      });
      cols.push({
        field: `${columnId}_score`,
        headerName: 'Pass Count',
        flex: 0.5,
        type: 'number',
        valueGetter: (_, row) => {
          const { hasScore, score } = row[columnId] as MetricScore;
          return hasScore ? score : 0;
        },
      });
      cols.push({
        field: `${columnId}_count`,
        headerName: 'Test Count',
        flex: 0.5,
        type: 'number',
        valueGetter: (_, row) => {
          const { count } = row[columnId] as MetricScore;
          return count;
        },
      });
    });

    cols.push({
      field: 'avg_pass_rate',
      headerName: 'Avg. Pass Rate',
      flex: 1,
      type: 'number',
      valueGetter: (_, row) => {
        let promptCount = 0;
        let totalPassRate = 0;
        Object.entries(row).forEach(([key, value]) => {
          if (key.startsWith('prompt_')) {
            const { score, count, hasScore } = value as MetricScore;
            if (hasScore && typeof count === 'number' && count > 0) {
              promptCount++;
              totalPassRate += (score / count) * 100;
            }
          }
        });
        return promptCount > 0 ? totalPassRate / promptCount : 0;
      },
      renderCell: (params) => {
        const { backgroundColor, color } = getPercentageColors(params.value);
        return (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              height: '100%',
            }}
          >
            <Box
              component="span"
              sx={{
                backgroundColor,
                color,
                borderRadius: '4px',
                width: '80px',
                height: '24px',
                display: 'inline-flex',
                justifyContent: 'center',
                alignItems: 'center',
                fontWeight: 500,
                fontSize: '0.875rem',
                lineHeight: 1,
              }}
            >
              {params.value.toFixed(2)}%
            </Box>
          </Box>
        );
      },
    });

    return cols;
  }, [table.head.prompts, promptMetricNames]);

  const columnGroupingModel: GridColumnGroupingModel = React.useMemo(() => {
    return table.head.prompts.map((prompt, idx) => ({
      groupId: `prompt_${idx}`,
      headerName: prompt.provider,
      children: [
        { field: `prompt_${idx}_pass_rate` },
        { field: `prompt_${idx}_score` },
        { field: `prompt_${idx}_count` },
      ],
    }));
  }, [table.head.prompts]);

  // Create rows for DataGrid
  const rows: MetricRow[] = React.useMemo(() => {
    return promptMetricNames.map((metric) => {
      const row: MetricRow = {
        id: metric,
        metric,
      };

      // Add data for each prompt
      table.head.prompts.forEach((prompt, idx) => {
        const score = prompt.metrics?.namedScores?.[metric];
        const count = prompt.metrics?.namedScoresCount?.[metric];
        const hasScore = score !== undefined;

        row[`prompt_${idx}`] = {
          score,
          count,
          hasScore,
        };
      });

      return row;
    });
  }, [promptMetricNames, table.head.prompts]);

  if (promptMetricNames.length === 0) {
    return null;
  }

  return (
    <DataGrid
      rows={rows}
      columns={columns}
      columnGroupingModel={columnGroupingModel}
      density="compact"
      disableRowSelectionOnClick
      initialState={{
        sorting: {
          sortModel: [{ field: 'metric', sort: 'asc' }],
        },
        pagination: { paginationModel: { pageSize: 50 } },
      }}
      sx={{
        '& .MuiDataGrid-row:hover': {
          backgroundColor: 'action.hover',
        },
      }}
      slots={{
        toolbar: () => (
          <GridToolbarContainer sx={{ p: 1, borderBottom: `1px solid ${theme.palette.divider}` }}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <GridToolbarFilterButton />
            </Box>
            <Box sx={{ flexGrow: 1 }} />
            <GridToolbarQuickFilter
              sx={{
                '& .MuiInputBase-root': {
                  borderRadius: 2,
                  backgroundColor: theme.palette.background.paper,
                },
              }}
            />
          </GridToolbarContainer>
        ),
      }}
    />
  );
};

export default function CustomMetricsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogContent sx={{ height: '80vh' }}>
        <MetricsTable onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}
