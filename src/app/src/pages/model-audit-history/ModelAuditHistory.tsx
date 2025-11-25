import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { useModelAuditHistoryStore } from '@app/pages/model-audit/stores';
import type { HistoricalScan } from '@app/pages/model-audit/stores/useModelAuditHistoryStore';
import { formatDataGridDate } from '@app/utils/date';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import Paper from '@mui/material/Paper';
import { useTheme, useMediaQuery } from '@mui/material';
import Typography from '@mui/material/Typography';
import {
  DataGrid,
  type GridCellParams,
  type GridColDef,
  GridCsvExportMenuItem,
  type GridRenderCellParams,
  type GridRowSelectionModel,
  GridToolbarColumnsButton,
  GridToolbarContainer,
  GridToolbarDensitySelector,
  GridToolbarExportContainer,
  GridToolbarFilterButton,
  GridToolbarQuickFilter,
  type GridToolbarQuickFilterProps,
} from '@mui/x-data-grid';
import { useLocation } from 'react-router-dom';

// Use the store's type for consistency
type ModelAuditScan = HistoricalScan;

// augment the props for the toolbar slot
declare module '@mui/x-data-grid' {
  interface ToolbarPropsOverrides {
    showUtilityButtons: boolean;
    focusQuickFilterOnMount: boolean;
  }
}

const GridToolbarExport = () => (
  <GridToolbarExportContainer>
    <GridCsvExportMenuItem />
  </GridToolbarExportContainer>
);

const QuickFilter = forwardRef<HTMLInputElement, GridToolbarQuickFilterProps>((props, ref) => {
  const theme = useTheme();
  return (
    <GridToolbarQuickFilter
      {...props}
      inputRef={ref}
      placeholder="Search scans..."
      aria-label="Search model audit scans"
      slotProps={{
        input: {
          'aria-label': 'Search model audit scans',
        },
      }}
      sx={{
        '& .MuiInputBase-root': {
          borderRadius: 2,
          backgroundColor: theme.palette.background.paper,
          '&:focus-within': {
            outline: `2px solid ${theme.palette.primary.main}`,
            outlineOffset: 2,
          },
        },
      }}
    />
  );
});

QuickFilter.displayName = 'QuickFilter';

function CustomToolbar({
  showUtilityButtons,
  focusQuickFilterOnMount,
}: {
  showUtilityButtons: boolean;
  focusQuickFilterOnMount: boolean;
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const quickFilterRef = useRef<HTMLInputElement>(null);
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);

  useEffect(() => {
    if (focusQuickFilterOnMount && quickFilterRef.current) {
      quickFilterRef.current.focus();
    }
  }, [focusQuickFilterOnMount]);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setMenuAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setMenuAnchorEl(null);
  };

  return (
    <GridToolbarContainer
      sx={{
        p: 1,
        borderBottom: `1px solid ${theme.palette.divider}`,
        spacing: { xs: 0.5, sm: 1 },
      }}
    >
      {showUtilityButtons &&
        (isMobile ? (
          // Mobile: Show kebab menu with utility buttons
          <>
            <IconButton
              onClick={handleMenuOpen}
              size="small"
              aria-label="Open table options menu"
              sx={{ mr: 1 }}
            >
              <MoreVertIcon />
            </IconButton>
            <Menu
              anchorEl={menuAnchorEl}
              open={Boolean(menuAnchorEl)}
              onClose={handleMenuClose}
              anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'left',
              }}
            >
              <MenuItem onClick={handleMenuClose} sx={{ p: 0 }}>
                <GridToolbarColumnsButton />
              </MenuItem>
              <MenuItem onClick={handleMenuClose} sx={{ p: 0 }}>
                <GridToolbarFilterButton />
              </MenuItem>
              <MenuItem onClick={handleMenuClose} sx={{ p: 0 }}>
                <GridToolbarDensitySelector />
              </MenuItem>
              <MenuItem onClick={handleMenuClose} sx={{ p: 0 }}>
                <GridToolbarExport />
              </MenuItem>
            </Menu>
          </>
        ) : (
          // Desktop: Show buttons in a row
          <Box sx={{ display: 'flex', gap: 1 }}>
            <GridToolbarColumnsButton />
            <GridToolbarFilterButton />
            <GridToolbarDensitySelector />
            <GridToolbarExport />
          </Box>
        ))}
      <Box sx={{ flexGrow: 1 }} />
      <QuickFilter ref={quickFilterRef} />
    </GridToolbarContainer>
  );
}

/**
 * Displays a list of model audit scans.
 *
 * @param onScanSelected - Callback to handle when a scan is selected (via clicking on its id cell).
 * @param focusedScanId - An optional ID of the scan to focus when the grid loads.
 * @param showUtilityButtons - Whether to show utility buttons in the toolbar.
 * @param focusQuickFilterOnMount - Whether to focus the quick filter on mount.
 */
export default function ModelAuditHistory({
  onScanSelected,
  focusedScanId,
  showUtilityButtons = true,
  focusQuickFilterOnMount = false,
}: {
  onScanSelected?: (scanId: string) => void;
  focusedScanId?: string;
  showUtilityButtons?: boolean;
  focusQuickFilterOnMount?: boolean;
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.down('md'));

  // Use history store for data management
  const {
    historicalScans: scans,
    isLoadingHistory: isLoading,
    historyError,
    pageSize,
    currentPage,
    sortModel,
    searchQuery,
    fetchHistoricalScans,
    setPageSize,
    setCurrentPage,
    setSortModel,
    setSearchQuery,
  } = useModelAuditHistoryStore();

  // Convert history error to Error object for compatibility
  const error = historyError ? new Error(historyError) : null;

  const [rowSelectionModel, setRowSelectionModel] = useState<GridRowSelectionModel>(
    focusedScanId ? [focusedScanId] : [],
  );

  // Use React Router's location to detect navigation
  const location = useLocation();

  useEffect(() => {
    // Fetch scans whenever we navigate to this page or when pagination/search changes
    fetchHistoricalScans();
  }, [
    location.pathname,
    location.search,
    pageSize,
    currentPage,
    sortModel,
    searchQuery,
    fetchHistoricalScans,
  ]);

  /**
   * Construct dataset rows:
   * 1. Filter out the focused scan from the list.
   */
  const rows = useMemo(() => {
    let rows_ = scans;

    if (focusedScanId && rows_.length > 0) {
      // Filter out the focused scan from the list
      rows_ = rows_.filter(({ id }: ModelAuditScan) => id !== focusedScanId);
    }

    return rows_;
  }, [scans, focusedScanId]);

  const handleCellClick = (params: GridCellParams<ModelAuditScan>) => {
    if (onScanSelected) {
      onScanSelected(params.row.id);
    }
  };

  const getSeverityColor = (hasErrors: boolean) => {
    return hasErrors ? 'error' : 'success';
  };

  const columns: GridColDef<ModelAuditScan>[] = useMemo(
    () => [
      {
        field: 'id',
        headerName: 'ID',
        flex: 0.5,
        minWidth: 120,
        renderCell: (params: GridRenderCellParams<ModelAuditScan>) =>
          params.row.id === focusedScanId ? (
            params.row.id
          ) : (
            <Link
              href={`/model-audit/history/${params.row.id}`}
              /**
               * Prevent the default behavior of the link, which is to navigate to the href.
               * Instead, we want to call the onScanSelected callback which may or may not navigate.
               */
              onClick={(e) => {
                e.preventDefault();
                if (onScanSelected) {
                  onScanSelected(params.row.id);
                }
                return false;
              }}
            >
              {params.row.id}
            </Link>
          ),
      },
      {
        field: 'createdAt',
        headerName: 'Created',
        flex: 0.9,
        minWidth: 140,
        valueGetter: (value: ModelAuditScan['createdAt'], _row: ModelAuditScan) => {
          return new Date(value);
        },
        valueFormatter: (value: ModelAuditScan['createdAt']) => formatDataGridDate(value),
      },
      {
        field: 'name',
        headerName: 'Name',
        flex: 1.5,
        minWidth: 150,
        renderCell: (params: GridRenderCellParams<ModelAuditScan>) => {
          const displayName = params.row.name ?? `Scan ${params.row.id.slice(-8)}`;
          return (
            <Typography variant="body2" noWrap sx={{ maxWidth: '100%' }} title={displayName}>
              {displayName}
            </Typography>
          );
        },
      },
      {
        field: 'modelPath',
        headerName: 'Model Path',
        flex: 2,
        minWidth: 200,
        renderCell: (params: GridRenderCellParams<ModelAuditScan>) => (
          <Typography variant="body2" noWrap sx={{ maxWidth: '100%' }} title={params.value}>
            {params.value}
          </Typography>
        ),
      },
      {
        field: 'status',
        headerName: 'Status',
        flex: 0.7,
        minWidth: 110,
        renderCell: (params: GridRenderCellParams<ModelAuditScan>) => (
          <Chip
            label={params.row.hasErrors ? 'Issues Found' : 'Clean'}
            color={getSeverityColor(params.row.hasErrors)}
            size="small"
            variant="filled"
            sx={{
              fontWeight: 500,
              minWidth: 90,
            }}
          />
        ),
      },
      {
        field: 'issues',
        headerName: 'Issues Found',
        flex: 1,
        minWidth: 150,
        renderCell: (params: GridRenderCellParams<ModelAuditScan>) => {
          const issues = params.row.results?.issues;
          if (!issues || issues.length === 0) {
            return (
              <Typography variant="body2" color="text.secondary">
                None
              </Typography>
            );
          }

          const criticalCount = issues.filter((i) => i.severity === 'critical').length;
          const errorCount = issues.filter((i) => i.severity === 'error').length;
          const warningCount = issues.filter((i) => i.severity === 'warning').length;

          return (
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {criticalCount > 0 && (
                <Chip
                  label={`${criticalCount} Critical`}
                  color="error"
                  size="small"
                  variant="filled"
                  sx={{ fontSize: '0.75rem', height: 22 }}
                />
              )}
              {errorCount > 0 && (
                <Chip
                  label={`${errorCount} Error${errorCount > 1 ? 's' : ''}`}
                  color="error"
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: '0.75rem', height: 22 }}
                />
              )}
              {warningCount > 0 && (
                <Chip
                  label={`${warningCount} Warning${warningCount > 1 ? 's' : ''}`}
                  color="warning"
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: '0.75rem', height: 22 }}
                />
              )}
            </Box>
          );
        },
      },
      {
        field: 'checks',
        headerName: 'Checks',
        flex: 0.7,
        minWidth: 100,
        renderCell: (params: GridRenderCellParams<ModelAuditScan>) => {
          if (params.row.totalChecks === null || params.row.totalChecks === undefined) {
            return (
              <Typography variant="body2" color="text.secondary">
                -
              </Typography>
            );
          }
          return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="body2" color="success.main">
                {params.row.passedChecks || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                /
              </Typography>
              <Typography variant="body2">{params.row.totalChecks}</Typography>
            </Box>
          );
        },
      },
    ],
    [focusedScanId, onScanSelected],
  );

  // Responsive column visibility: hide less critical columns on smaller screens
  const columnVisibilityModel = useMemo(
    () => ({
      // On mobile (xs), only show ID, Name, and Status
      createdAt: !isMobile,
      modelPath: !isMobile,
      issues: !isMobile,
      checks: !isTablet, // Hide checks on mobile and tablet
    }),
    [isMobile, isTablet],
  );

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: (theme) =>
          theme.palette.mode === 'dark' ? theme.palette.background.default : theme.palette.grey[50],
        py: 4,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <Paper elevation={2} sx={{ height: '100%', mx: { xs: 0, sm: 2, md: 4 } }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={isLoading}
          getRowId={(row) => row.id}
          slots={{
            toolbar: CustomToolbar,
            loadingOverlay: () => (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  gap: 2,
                }}
              >
                <CircularProgress />
                <Typography variant="body2" color="text.secondary">
                  Loading model audit scans...
                </Typography>
              </Box>
            ),
            noRowsOverlay: () => (
              <Box
                sx={{
                  textAlign: 'center',
                  color: 'text.secondary',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  p: 3,
                }}
              >
                {error ? (
                  <>
                    <Box sx={{ fontSize: '2rem', mb: 2 }}>⚠️</Box>
                    <Typography variant="h6" gutterBottom color="error">
                      Error loading scans
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {error.message}
                    </Typography>
                  </>
                ) : (
                  <>
                    <Box sx={{ fontSize: '2rem', mb: 2 }}>🔍</Box>
                    <Typography variant="h6" gutterBottom>
                      No scans found
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Run your first model audit scan to see it appear here
                    </Typography>
                  </>
                )}
              </Box>
            ),
          }}
          slotProps={{
            toolbar: {
              showUtilityButtons,
              focusQuickFilterOnMount,
            },
          }}
          onCellClick={(params) => {
            if (params.id !== focusedScanId) {
              handleCellClick(params);
            }
          }}
          getRowClassName={(params) => (params.id === focusedScanId ? 'focused-row' : '')}
          sx={{
            border: 'none',
            '& .MuiDataGrid-row': {
              cursor: 'pointer',
              transition: 'background-color 0.2s ease',
              '&:hover': {
                backgroundColor: 'action.hover',
              },
            },
            '& .MuiDataGrid-row--disabled': {
              cursor: 'default',
              opacity: 0.7,
              pointerEvents: 'none',
            },
            '& .focused-row': {
              backgroundColor: 'action.selected',
              cursor: 'default',
              '&:hover': {
                backgroundColor: 'action.selected',
              },
            },
            '& .MuiDataGrid-cell': {
              borderColor: 'divider',
            },
            '& .MuiDataGrid-columnHeaders': {
              backgroundColor: 'background.default',
              borderColor: 'divider',
            },
            '& .MuiDataGrid-selectedRow': {
              backgroundColor: 'action.selected',
            },
            '--DataGrid-overlayHeight': '300px',
          }}
          onRowSelectionModelChange={setRowSelectionModel}
          rowSelectionModel={rowSelectionModel}
          // Controlled pagination
          paginationMode="server"
          paginationModel={{ page: currentPage, pageSize }}
          onPaginationModelChange={(model) => {
            setCurrentPage(model.page);
            setPageSize(model.pageSize);
          }}
          rowCount={-1} // Use -1 to show that we don't know total count yet
          // Controlled sorting
          sortingMode="server"
          sortModel={sortModel}
          onSortModelChange={(model) =>
            setSortModel(
              model.filter((item) => item.sort !== undefined) as Array<{
                field: string;
                sort: 'asc' | 'desc';
              }>,
            )
          }
          // Controlled filtering
          filterMode="server"
          onFilterModelChange={(model) => {
            // Extract search query from quick filter
            const quickFilterValue = model.quickFilterValues?.[0] || '';
            if (quickFilterValue !== searchQuery) {
              setSearchQuery(quickFilterValue);
              setCurrentPage(0); // Reset to first page when searching
            }
          }}
          // Column visibility
          initialState={{
            columns: {
              columnVisibilityModel,
            },
          }}
          pageSizeOptions={[10, 25, 50, 100]}
          isRowSelectable={(params) => params.id !== focusedScanId}
        />
      </Paper>
    </Box>
  );
}
