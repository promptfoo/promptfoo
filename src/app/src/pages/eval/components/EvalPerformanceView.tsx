import React from 'react';

import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { DataGrid } from '@mui/x-data-grid';
import { useTableStore } from './store';
import type { GridColDef, GridRenderCellParams } from '@mui/x-data-grid';

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

const MetricsTable: React.FC = () => {
  const { table } = useTableStore();

  if (!table || !table.head || !table.head.prompts) {
    return null;
  }

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

  const getScoreColor = (score: number) => {
    if (score >= 0.8) {
      return '#4caf50'; // success
    }
    if (score >= 0.5) {
      return '#ff9800'; // warning
    }
    return '#f44336'; // error
  };

  const formatAggregatedScore = (score: number, count?: number): string => {
    if (count !== undefined && count > 0) {
      const average = score / count;
      return `${average.toFixed(2)} (${score.toFixed(2)}/${count})`;
    }
    return score.toFixed(2);
  };

  // Create columns for DataGrid
  const columns: GridColDef[] = React.useMemo(() => {
    const cols: GridColDef[] = [
      {
        field: 'metric',
        headerName: 'Metric',
        width: 400,
        headerAlign: 'left',
        type: 'singleSelect',
        valueOptions: promptMetricNames,
      },
    ];

    // Add a column for each prompt
    table.head.prompts.forEach((prompt, idx) => {
      const columnId = `prompt_${idx}`;
      cols.push({
        field: columnId,
        headerName: prompt.label || prompt.display || `Prompt ${idx + 1}`,
        flex: 1,
        width: 100,
        type: 'number',
        renderHeader: (params) => <strong>{params.colDef.headerName}</strong>,
        valueGetter: (params: MetricScore) => {
          return params.hasScore ? params.score : 0;
        },
        renderCell: (params: GridRenderCellParams) => {
          const { hasScore, score, count } = params.row[params.field] as MetricScore;
          return hasScore ? (
            <>
              {((score / count) * 100).toFixed(2)}% ({score.toFixed(2)}/{count.toFixed(2)})
            </>
          ) : (
            '0%'
          );
        },
      });
    });

    return cols;
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
    <Paper sx={{ width: '100%', height: '100%' }}>
      <DataGrid
        rows={rows}
        columns={columns}
        density="compact"
        //disableColumnMenu
        disableRowSelectionOnClick
        // hideFooter={rows.length <= 10}
        initialState={{
          sorting: {
            sortModel: [{ field: 'metric', sort: 'asc' }],
          },
        }}
        // pageSizeOptions={[10, 25, 50, 100]}
        // sx={{
        //   '& .MuiDataGrid-columnHeaders': {
        //     backgroundColor: 'rgba(0, 0, 0, 0.04)',
        //   },
        //   '& .MuiDataGrid-cell': {
        //     borderBottom: '1px solid rgba(224, 224, 224, 1)',
        //   },
        // }}
      />
    </Paper>
  );
};

const EvalPerformanceView: React.FC = () => {
  const { table } = useTableStore();

  if (!table || !table.body || table.body.length === 0) {
    return (
      <Box p={4} textAlign="center">
        <Typography variant="h6" color="text.secondary">
          No evaluation data available
        </Typography>
      </Box>
    );
  }

  // Check if there are any metrics
  const hasMetrics = React.useMemo(() => {
    return table.head.prompts.some(
      (prompt) => prompt.metrics?.namedScores && Object.keys(prompt.metrics.namedScores).length > 0,
    );
  }, [table.head.prompts]);

  if (!hasMetrics) {
    return (
      <Box p={4} textAlign="center">
        <Typography variant="h6" color="text.secondary">
          No custom metrics found in evaluation results
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="h6" gutterBottom>
        Performance Metrics
      </Typography>
      <Box sx={{ flexGrow: 1, minHeight: 0 }}>
        <MetricsTable />
      </Box>
    </Box>
  );
};

export default EvalPerformanceView;
