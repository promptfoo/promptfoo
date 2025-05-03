import React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import {
  GridToolbarContainer,
  GridToolbarColumnsButton,
  GridToolbarFilterButton,
  GridToolbarDensitySelector,
  GridToolbarExport,
  GridToolbarQuickFilter,
} from '@mui/x-data-grid';
import type { TestCasesWithMetadata } from '@promptfoo/types';

// augment the props for the toolbar slot
declare module '@mui/x-data-grid' {
  interface ToolbarPropsOverrides {
    showUtilityButtons: boolean;
  }
}

// Create a custom QuickFilter component
const CustomQuickFilter = (props: any) => {
  return (
    <div>
      <GridToolbarQuickFilter {...props} />
    </div>
  );
};

CustomQuickFilter.displayName = 'CustomQuickFilter';

export default function Datasets({
  data,
  isLoading,
  error,
}: {
  data: TestCasesWithMetadata[];
  isLoading: boolean;
  error: string | null;
}) {
  return (
    <Box p={4}>
      <Typography variant="h4">Datasets</Typography>
      {isLoading ? (
        <CircularProgress />
      ) : error ? (
        <Alert severity="error">{error}</Alert>
      ) : (
        <Typography variant="body1">{data.length} datasets available</Typography>
      )}
    </Box>
  );
}
