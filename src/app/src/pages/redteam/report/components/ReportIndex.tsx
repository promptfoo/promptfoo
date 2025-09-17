import { useEffect, useMemo, useState } from 'react';

import { callApi } from '@app/utils/api';
import { formatDataGridDate } from '@app/utils/date';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import {
  DataGrid,
  type GridColDef,
  type GridRenderCellParams,
  GridToolbarColumnsButton,
  GridToolbarContainer,
  GridToolbarDensitySelector,
  GridToolbarFilterButton,
  GridToolbarQuickFilter,
} from '@mui/x-data-grid';
import { useNavigate } from 'react-router-dom';
import type { ResultLightweightWithLabel } from '@promptfoo/types';

function CustomToolbar() {
  return (
    <GridToolbarContainer sx={{ background: 'var(--DataGrid-containerBackground)', pt: 2 }}>
      <GridToolbarColumnsButton />
      <GridToolbarFilterButton />
      <GridToolbarDensitySelector />
      <Box sx={{ flexGrow: 1 }} />
      <GridToolbarQuickFilter />
    </GridToolbarContainer>
  );
}

function ReportsDataGrid({
  data,
  isLoading,
}: {
  data: ResultLightweightWithLabel[];
  isLoading: boolean;
}) {
  const navigate = useNavigate();

  const columns: GridColDef<ResultLightweightWithLabel>[] = useMemo(
    () => [
      {
        field: 'description',
        headerName: 'Name',
        type: 'string',
        flex: 2,
        valueGetter: (params: GridRenderCellParams<ResultLightweightWithLabel>) => {
          return params || 'Untitled Evaluation';
        },
        cellClassName: 'dg-cursor-pointer',
      },
      // {
      //   field: 'targetId',
      //   headerName: 'Target',
      //   type: 'string',
      //   flex: 1,
      //   valueGetter: (params: GridRenderCellParams<ResultLightweightWithLabel>) => {
      //     return params?.row?.providerId
      //       ? providers?.find((p) => p.id === params?.row.providerId)?.name || 'No target'
      //       : params?.row?.targetId || 'No target';
      //   },
      //   renderCell: (params: GridRenderCellParams<ResultLightweightWithLabel>) => {
      //     if (!params || !params.row) {
      //       return <Chip label="No target" size="small" />;
      //     }

      //     const targetName = params.row.providerId
      //       ? providers?.find((p) => p.id === params.row.providerId)?.name || 'No target'
      //       : params.row.targetId || 'No target';

      //     return (
      //       <Chip
      //         label={targetName}
      //         size="small"
      //         sx={{
      //           bgcolor: params.row.targetId ? 'primary.50' : 'grey.100',
      //           color: params.row.targetId ? 'primary.700' : 'text.secondary',
      //           fontWeight: 500,
      //         }}
      //       />
      //     );
      //   },
      //   cellClassName: 'dg-cursor-pointer',
      // },
      {
        field: 'createdAt',
        headerName: 'Scanned At',
        type: 'dateTime',
        flex: 1,
        valueGetter: (value: ResultLightweightWithLabel['createdAt']) =>
          value ? new Date(value) : null,
        valueFormatter: (value: ResultLightweightWithLabel['createdAt']) =>
          formatDataGridDate(value),
        cellClassName: 'dg-cursor-pointer',
      },
      {
        field: 'evalId',
        headerName: 'Eval ID',
        type: 'string',
        flex: 1,
        renderCell: (params: GridRenderCellParams<ResultLightweightWithLabel>) => {
          if (!params || params.value === undefined) {
            return null;
          }

          return (
            <Typography
              variant="body2"
              sx={{
                fontFamily: 'monospace',
                color: 'text.secondary',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                height: '100%',
              }}
            >
              {params.value}
            </Typography>
          );
        },
        cellClassName: 'dg-cursor-pointer',
      },
    ],
    [data],
  );

  return (
    <DataGrid
      rows={data}
      loading={isLoading}
      columns={columns}
      getRowId={(row) => row.evalId}
      onCellClick={(params: any) => {
        navigate(`/reports?evalId=${params.row.evalId}`);
      }}
      sx={{
        '--DataGrid-overlayHeight': '300px',
        boxShadow: 0,
        border: 0,
        '& .MuiDataGrid-cell:hover': {
          cursor: 'pointer',
        },
      }}
      slots={{ toolbar: CustomToolbar }}
    />
  );
}

export default function ReportIndex() {
  const [data, setData] = useState<ResultLightweightWithLabel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = async () => {
    try {
      // TODO: Pass the isReadteam as a query param?
      const resp = await callApi('/results', { cache: 'no-store' });
      if (!resp.ok) {
        throw new Error(`${resp.status}: ${resp.statusText}`);
      }
      const body = (await resp.json()) as { data: ResultLightweightWithLabel[] };
      // Only show redteam evals
      const redteamEvals = body.data.filter((eval_) => eval_.isRedteam);
      setData(redteamEvals);
    } catch (error) {
      setError(error as Error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <Container maxWidth="lg" sx={{ mt: 4 }}>
      <Typography variant="h4" gutterBottom>
        Vulnerability Reports
      </Typography>
      {error && <Alert severity="error">{error.message}</Alert>}
      <Box
        sx={{
          // Imprecisely locate the datagrid vertically center in the viewport.
          height: '80vh',
        }}
      >
        <Paper sx={{ height: '100%' }}>
          <ReportsDataGrid data={data} isLoading={isLoading} />
        </Paper>
      </Box>
    </Container>
  );
}
