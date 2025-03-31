import { useMemo, useEffect, useState } from 'react';
import { callApi } from '@app/utils/api';
import { Box } from '@mui/material';
import {
  DataGrid,
  type GridColDef,
  GridToolbarContainer,
  GridToolbarColumnsButton,
  GridToolbarFilterButton,
  GridToolbarDensitySelector,
  GridToolbarExport,
  GridToolbarQuickFilter,
} from '@mui/x-data-grid';

type Eval = {
  createdAt: number;
  datasetId: string;
  description: string | null;
  evalId: string;
  isRedteam: number;
  label: string;
  numTests: number;
};

// augment the props for the toolbar slot
declare module '@mui/x-data-grid' {
  interface ToolbarPropsOverrides {
    showUtilityButtons: boolean;
  }
}

function CustomToolbar({ showUtilityButtons }: { showUtilityButtons: boolean }) {
  return (
    <GridToolbarContainer>
      {showUtilityButtons && (
        <>
          <GridToolbarColumnsButton />
          <GridToolbarFilterButton />
          <GridToolbarDensitySelector />
          <GridToolbarExport />
        </>
      )}
      <Box sx={{ flexGrow: 1 }} />
      <GridToolbarQuickFilter />
    </GridToolbarContainer>
  );
}

/**
 * Displays a list of evals.
 *
 * @param onEvalSelected - Callback to handle when an eval is selected (via clicking on its id cell).
 * @param focusedEvalId - An optional ID of the eval to focus when the grid loads.
 */
export default function EvalsDataGrid({
  onEvalSelected,
  focusedEvalId,
  showUtilityButtons = false,
}: {
  onEvalSelected: (evalId: string) => void;
  focusedEvalId?: string;
  showUtilityButtons?: boolean;
}) {
  const [evals, setEvals] = useState<Eval[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Fetch evals from the API.
   */
  useEffect(() => {
    const fetchEvals = async () => {
      try {
        const response = await callApi('/results', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error('Failed to fetch evals');
        }
        const body = (await response.json()) as { data: Eval[] };
        setEvals(body.data);
      } catch (error) {
        setError(error as Error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchEvals();
  }, []);

  const handleCellClick = (params: any) => onEvalSelected(params.row.evalId);

  const columns: GridColDef<Eval>[] = useMemo(
    () =>
      [
        {
          field: 'evalId',
          headerName: 'ID',
          flex: 1,
        },
        {
          field: 'createdAt',
          headerName: 'Created',
          flex: 1,
          valueFormatter: (value: Eval['createdAt']) => new Date(value).toLocaleString(),
        },
        {
          field: 'description',
          headerName: 'Description',
          flex: 1,
          valueGetter: (value: Eval['description'], row: Eval) => value ?? row.label,
        },
        {
          field: 'numTests',
          headerName: '# Tests',
          flex: 1,
        },
      ].filter(Boolean) as GridColDef<Eval>[],
    [],
  );

  return (
    <DataGrid
      rows={evals}
      columns={columns}
      loading={isLoading}
      getRowId={(row) => row.evalId}
      slots={{
        toolbar: CustomToolbar,
        noRowsOverlay: () => (error ? <div>Error loading evals</div> : <div>No evals found</div>),
      }}
      slotProps={{ toolbar: { showUtilityButtons } }}
      onCellClick={handleCellClick}
      sx={{
        '& .MuiDataGrid-row': {
          cursor: 'pointer',
        },
      }}
    />
  );
}
