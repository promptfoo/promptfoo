import { useEffect, useMemo, useState } from 'react';

import { callApi } from '@app/utils/api';
import { formatDataGridDate } from '@app/utils/date';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Link from '@mui/material/Link';
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
import type { EvalSummary } from '@promptfoo/types';
import { getASRColor, formatASRForDisplay } from '@promptfoo/app/src/utils/redteam';

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

function ReportsDataGrid({ data, isLoading }: { data: EvalSummary[]; isLoading: boolean }) {
  const navigate = useNavigate();

  const columns: GridColDef<EvalSummary>[] = useMemo(
    () => [
      {
        field: 'description',
        headerName: 'Name',
        type: 'string',
        flex: 1,
        valueGetter: (params: GridRenderCellParams<EvalSummary>) => {
          return params || 'Untitled Evaluation';
        },
        cellClassName: 'dg-cursor-pointer',
        renderCell: (params: GridRenderCellParams<EvalSummary>) => {
          return <Link href={`/reports?evalId=${params.row.evalId}`}>{params.value}</Link>;
        },
      },
      {
        field: 'providers',
        headerName: 'Target',
        type: 'string',
        flex: 1,
        valueGetter: (value: EvalSummary['providers']) =>
          value.length > 0 ? (value[0].label ?? value[0].id) : null,
        renderCell: (params: GridRenderCellParams<EvalSummary>) => {
          const value = params.row.providers.length > 0 ? params.row.providers[0] : null;

          if (!params || !params.row || !value) {
            return <Chip label="No target" size="small" />;
          }

          return <Chip label={value.label ?? value.id} size="small" sx={{ fontWeight: 500 }} />;
        },
        cellClassName: 'dg-cursor-pointer',
      },
      {
        field: 'createdAt',
        headerName: 'Scanned At',
        type: 'dateTime',
        flex: 1,
        valueGetter: (value: EvalSummary['createdAt']) => (value ? new Date(value) : null),
        valueFormatter: (value: EvalSummary['createdAt']) => formatDataGridDate(value),
        cellClassName: 'dg-cursor-pointer',
      },
      {
        field: 'attackSuccessRate',
        headerName: 'Attack Success Rate',
        type: 'number',
        flex: 1,
        renderCell: (params: GridRenderCellParams<EvalSummary>) => (
          <>
            <Typography
              variant="body2"
              sx={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                // `type: number` gets overwritten by flex; manually justify content.
                justifyContent: 'end',
                color: getASRColor(params.value),
                fontWeight: 500,
              }}
            >
              {formatASRForDisplay(params.value)}%
            </Typography>
          </>
        ),
        valueFormatter: (value: number) => `${formatASRForDisplay(value)}%`,
        cellClassName: 'dg-cursor-pointer',
      },
      {
        field: 'numTests',
        headerName: '# Tests',
        type: 'number',
        flex: 0.5,
        cellClassName: 'dg-cursor-pointer',
      },
      {
        field: 'evalId',
        headerName: 'Eval ID',
        type: 'string',
        flex: 1,
        renderCell: (params: GridRenderCellParams<EvalSummary>) => {
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
    [],
  );

  return (
    <DataGrid
      rows={data}
      loading={isLoading}
      columns={columns}
      getRowId={(row) => row.evalId}
      sx={{
        '--DataGrid-overlayHeight': '300px',
        boxShadow: 0,
        border: 0,
        '& .MuiDataGrid-cell:hover': {
          cursor: 'pointer',
        },
      }}
      slots={{ toolbar: CustomToolbar }}
      initialState={{
        sorting: {
          sortModel: [{ field: 'createdAt', sort: 'desc' }],
        },
      }}
      onCellClick={(params) => {
        if (params.row.evalId) {
          navigate(`/reports?evalId=${params.row.evalId}`);
        }
      }}
      showToolbar
    />
  );
}

export default function ReportIndex() {
  const [data, setData] = useState<EvalSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = async () => {
    try {
      const resp = await callApi('/results?type=redteam&includeProviders=true', {
        cache: 'no-store',
      });
      if (!resp.ok) {
        throw new Error(`${resp.status}: ${resp.statusText}`);
      }
      const body = (await resp.json()) as { data: EvalSummary[] };
      setData(body.data);
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
    <Container maxWidth="xl" sx={{ mt: 4 }}>
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
