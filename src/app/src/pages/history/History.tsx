import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import { alpha } from '@mui/material/styles';
import HistoryDataGrid from './HistoryDataGrid';
import type { StandaloneEval } from '@promptfoo/util/database';

interface HistoryProps {
  data: StandaloneEval[];
  isLoading: boolean;
  error: string | null;
  showDatasetColumn?: boolean;
}

export default function History({
  data,
  isLoading,
  error,
  showDatasetColumn = true,
}: HistoryProps) {
  return (
    <Box
      sx={{
        position: 'absolute',
        top: 64,
        left: 0,
        right: 0,
        bottom: 0,
        bgcolor: (theme) =>
          theme.palette.mode === 'dark'
            ? alpha(theme.palette.common.black, 0.2)
            : alpha(theme.palette.grey[50], 0.5),
        p: 3,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          borderTop: 1,
          borderColor: (theme) => alpha(theme.palette.divider, 0.1),
          boxShadow: (theme) => `0 1px 2px ${alpha(theme.palette.common.black, 0.05)}`,
          bgcolor: 'background.paper',
          borderRadius: 1,
        }}
      >
        <HistoryDataGrid
          data={data}
          isLoading={isLoading}
          error={error}
          showDatasetColumn={showDatasetColumn}
        />
      </Paper>
    </Box>
  );
}
