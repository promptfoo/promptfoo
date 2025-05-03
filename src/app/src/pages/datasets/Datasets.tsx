import React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
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
  const theme = useTheme();
  return (
    <div>
      <GridToolbarQuickFilter {...props} />
    </div>
  );
};

CustomQuickFilter.displayName = 'CustomQuickFilter';

function CustomToolbar({ showUtilityButtons }: { showUtilityButtons: boolean }) {
  const theme = useTheme();
  return (
    <GridToolbarContainer sx={{ p: 1, borderBottom: `1px solid ${theme.palette.divider}` }}>
      {showUtilityButtons && (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <GridToolbarColumnsButton />
          <GridToolbarFilterButton />
          <GridToolbarDensitySelector />
          <GridToolbarExport />
        </Box>
      )}
      <Box sx={{ flexGrow: 1 }} />
      <CustomQuickFilter />
    </GridToolbarContainer>
  );
}

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
