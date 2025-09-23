import { useMemo } from 'react';

import { formatDataGridDate } from '@app/utils/date';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
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
import type { EvalSummary } from '@promptfoo/types';

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

interface RedTeamsDataGridProps {
  data: EvalSummary[];
  isLoading: boolean;
  onRowSelected: (evalId: string) => void;
}

export default function RedTeamsDataGrid({ data, isLoading, onRowSelected }: RedTeamsDataGridProps) {
  const columns: GridColDef<EvalSummary>[] = useMemo(
    () => [
      {
        field: 'description',
        headerName: 'Name',
        type: 'string',
        flex: 1,
        valueGetter: (params: GridRenderCellParams<EvalSummary>) => {
          if (params?.row?.description && params.row.description.trim().length > 0) {
            return params.row.description;
          }

          return 'Untitled Evaluation';
        },
        renderCell: (params: GridRenderCellParams<EvalSummary>) => {
          const description =
            params.row.description && params.row.description.trim().length > 0
              ? params.row.description
              : 'Untitled Evaluation';

          const handleClick = () => {
            if (params.row.evalId) {
              onRowSelected(params.row.evalId);
            }
          };

          return (
            <Link
              component="button"
              onClick={handleClick}
              data-testid={
                params.row.evalId ? `redteams-description-${params.row.evalId}` : undefined
              }
              sx={{
                fontWeight: 500,
                cursor: 'pointer',
                color: 'primary.main',
                '&:hover': {
                  textDecoration: 'underline',
                },
              }}
            >
              {description}
            </Link>
          );
        },
        cellClassName: 'dg-cursor-pointer',
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
        field: 'passRate',
        headerName: 'Attack Success Rate',
        type: 'number',
        flex: 1,
        renderCell: (params: GridRenderCellParams<EvalSummary>) => (
          <Typography
            variant="body2"
            color="success.main"
            sx={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'end',
              fontWeight: 500,
            }}
          >
            {params.value.toFixed(2)}%
          </Typography>
        ),
        valueFormatter: (value: number) => `${value.toFixed(2)}%`,
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
              data-testid={
                params.row.evalId ? `redteams-eval-id-${params.row.evalId}` : undefined
              }
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
    [onRowSelected],
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
          onRowSelected(params.row.evalId);
        }
      }}
    />
  );
}
