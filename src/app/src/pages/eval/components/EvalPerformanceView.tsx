import React from 'react';

import FilterAltIcon from '@mui/icons-material/FilterAlt';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import {
  DataGrid,
  type GridColDef,
  type GridRenderCellParams,
  GridToolbarColumnsButton,
  GridToolbarContainer,
  GridToolbarFilterButton,
  GridToolbarQuickFilter,
} from '@mui/x-data-grid';
import ResultsCharts from './ResultsCharts';
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

function CustomToolbar() {
  const theme = useTheme();
  return (
    <GridToolbarContainer sx={{ p: 1, borderBottom: `1px solid ${theme.palette.divider}` }}>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <GridToolbarColumnsButton />
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
  );
}

const MetricsTable: React.FC<{ handleSwitchToResultsTab: () => void }> = ({
  handleSwitchToResultsTab,
}) => {
  const { table, filters, addFilter } = useTableStore();

  if (!table || !table.head || !table.head.prompts) {
    return null;
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
      handleSwitchToResultsTab();
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
        width: 400,
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
        field: columnId,
        headerName: prompt.provider,
        flex: 1,
        width: 100,
        type: 'number',
        renderHeader: (params) => <strong>{params.colDef.headerName}</strong>,
        valueGetter: (value: MetricScore) => {
          return value.hasScore ? value.score : 0;
        },
        renderCell: (params: GridRenderCellParams) => {
          const { hasScore, score, count } = params.row[params.field] as MetricScore;
          const percentage = hasScore ? (score / count) * 100 : 0;
          //const color = getPercentageColor(percentage);

          return (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'end' }}>
              {/* <span style={{ backgroundColor: color, width: 10, height: 10, borderRadius: 10 }} /> */}
              <span>
                {percentage.toFixed(2)}%{' '}
                {hasScore ? `(${score.toFixed(2)}/${count.toFixed(2)})` : ''}
              </span>
            </span>
          );
        },
      });
    });

    return cols;
  }, [table.head.prompts, promptMetricNames]);

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
    <Paper sx={{ width: '100%', height: '100%' }}>
      <DataGrid
        rows={rows}
        columns={columns}
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
        slots={{ toolbar: CustomToolbar }}
      />
    </Paper>
  );
};

const EvalPerformanceView: React.FC<{
  handleSwitchToResultsTab: () => void;
  renderResultsCharts: boolean;
  renderMetricsTable: boolean;
}> = ({ handleSwitchToResultsTab, renderResultsCharts, renderMetricsTable }) => {
  return (
    <Box sx={{ height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {renderResultsCharts && (
        <Box>
          <ResultsCharts />
        </Box>
      )}
      {renderMetricsTable && (
        <Box sx={{ flexGrow: 1, minHeight: 0 }}>
          <MetricsTable handleSwitchToResultsTab={handleSwitchToResultsTab} />
        </Box>
      )}
    </Box>
  );
};

export default EvalPerformanceView;
