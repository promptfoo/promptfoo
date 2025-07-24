import React from 'react';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useTableStore } from './store';

const EvalMetricsTable: React.FC = () => {
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

  // Extract all unique metric names from all outputs (individual metrics)
  const outputMetricNames = React.useMemo(() => {
    const metrics = new Set<string>();
    table.body.forEach((row) => {
      row.outputs.forEach((output) => {
        if (output.namedScores) {
          Object.keys(output.namedScores).forEach((metric) => metrics.add(metric));
        }
      });
    });
    return Array.from(metrics).sort();
  }, [table.body]);

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

  const hasMetrics = outputMetricNames.length > 0 || promptMetricNames.length > 0;

  if (!hasMetrics) {
    return (
      <Box p={4} textAlign="center">
        <Typography variant="h6" color="text.secondary">
          No custom metrics found in evaluation results
        </Typography>
      </Box>
    );
  }

  const getScoreColor = (score: number) => {
    if (score >= 0.8) {
      return 'success.main';
    }
    if (score >= 0.5) {
      return 'warning.main';
    }
    return 'error.main';
  };

  const formatAggregatedScore = (score: number, count?: number, total?: number): string => {
    if (total !== undefined && total > 0) {
      const percentage = (score / total) * 100;
      return `${percentage.toFixed(2)}% (${score.toFixed(2)}/${total.toFixed(2)})`;
    } else if (count !== undefined && count > 0) {
      const average = score / count;
      return `${average.toFixed(2)} (${score.toFixed(2)}/${count})`;
    }
    return score.toFixed(2);
  };

  return (
    <Box sx={{ p: 2 }}>
      {/* Aggregated Prompt Metrics Section */}
      {promptMetricNames.length > 0 && (
        <TableContainer component={Paper}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', minWidth: 200 }}>Metric</TableCell>
                {table.head.prompts.map((prompt, idx) => (
                  <TableCell key={idx} align="center" sx={{ fontWeight: 'bold' }}>
                    {prompt.label || prompt.display || `Prompt ${idx + 1}`}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {promptMetricNames.map((metric) => (
                <TableRow key={metric} hover>
                  <TableCell component="th" scope="row">
                    <Typography variant="body2" fontWeight="medium">
                      {metric}
                    </Typography>
                  </TableCell>
                  {table.head.prompts.map((prompt, idx) => {
                    const score = prompt.metrics?.namedScores?.[metric];
                    const count = prompt.metrics?.namedScoresCount?.[metric];
                    const hasScore = score !== undefined;

                    return (
                      <TableCell key={idx} align="center">
                        {hasScore ? (
                          <Chip
                            label={formatAggregatedScore(score, count, count)}
                            size="small"
                            sx={{
                              backgroundColor: 'transparent',
                              color:
                                count && count > 0
                                  ? getScoreColor(score / count)
                                  : getScoreColor(score),
                              fontWeight: 'bold',
                              border: '1px solid',
                              borderColor:
                                count && count > 0
                                  ? getScoreColor(score / count)
                                  : getScoreColor(score),
                            }}
                          />
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            -
                          </Typography>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

export default EvalMetricsTable;
