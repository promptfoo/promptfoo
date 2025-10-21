import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';

import { useApiHealth } from '@app/hooks/useApiHealth';
import { useToast } from '@app/hooks/useToast';
import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import {
  DataGrid,
  type GridColDef,
  type GridRenderCellParams,
  type GridRenderEditCellParams,
  type GridRowSelectionModel,
  type GridRowEditStartParams,
  type GridRowEditStopParams,
  GridToolbarContainer,
  useGridApiContext,
  useGridApiRef,
} from '@mui/x-data-grid';
import { parse } from 'csv-parse/browser/esm/sync';
import { useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import { TestCaseGenerateButton } from '../TestCaseDialog';
import { useTestCaseGeneration } from '../TestCaseGenerationProvider';

// Augment the toolbar props interface
declare module '@mui/x-data-grid' {
  interface ToolbarPropsOverrides {
    selectedCount: number;
    onDeleteSelected: () => void;
    onAddPolicy: () => void;
    onUploadCsv: (event: React.ChangeEvent<HTMLInputElement>) => void;
    isUploadingCsv: boolean;
  }
}

type PolicyRow = {
  id: number;
  name: string;
  policyText: string;
};

// Custom multiline edit component for policy text
function MultilineEditCell(props: GridRenderEditCellParams<PolicyRow>) {
  const { id, field, value } = props;
  const apiRef = useGridApiContext();

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      apiRef.current.setEditCellValue({
        id,
        field,
        value: event.target.value,
      });
    },
    [apiRef, id, field],
  );

  return (
    <textarea
      value={value || ''}
      onChange={handleChange}
      style={{
        width: '100%',
        height: '100%',
        minHeight: '120px',
        border: 'none',
        outline: 'none',
        padding: '8px',
        fontFamily: 'inherit',
        fontSize: 'inherit',
        resize: 'vertical',
        backgroundColor: 'transparent',
      }}
      autoFocus
    />
  );
}

function CustomToolbar({
  selectedCount,
  onDeleteSelected,
  onAddPolicy,
  onUploadCsv,
  isUploadingCsv,
}: {
  selectedCount: number;
  onDeleteSelected: () => void;
  onAddPolicy: () => void;
  onUploadCsv: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isUploadingCsv: boolean;
}) {
  return (
    <GridToolbarContainer sx={{ p: 1, gap: 1 }}>
      <Button
        startIcon={<AddIcon />}
        onClick={onAddPolicy}
        variant="contained"
        color="primary"
        size="small"
      >
        Add Policy
      </Button>
      <Button
        component="label"
        variant="outlined"
        startIcon={isUploadingCsv ? null : <FileUploadIcon />}
        disabled={isUploadingCsv}
        size="small"
      >
        {isUploadingCsv ? 'Uploading...' : 'Upload CSV'}
        <input
          type="file"
          hidden
          accept=".csv"
          onChange={onUploadCsv}
          onClick={(e) => {
            (e.target as HTMLInputElement).value = '';
          }}
          disabled={isUploadingCsv}
        />
      </Button>
      {selectedCount > 0 && (
        <Button
          color="error"
          variant="outlined"
          size="small"
          onClick={onDeleteSelected}
          startIcon={<DeleteIcon />}
          sx={{ border: 0 }}
        >
          Delete ({selectedCount})
        </Button>
      )}
    </GridToolbarContainer>
  );
}

export const CustomPoliciesSection = () => {
  const { config, updateConfig } = useRedTeamConfig();
  const toast = useToast();
  const apiRef = useGridApiRef();
  const [generatingPolicyIndex, setGeneratingPolicyIndex] = useState<number | null>(null);
  const [isUploadingCsv, setIsUploadingCsv] = useState(false);
  const [rowSelectionModel, setRowSelectionModel] = useState<GridRowSelectionModel>([]);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [editingRowId, setEditingRowId] = useState<number | null>(null);
  const [autoEditRowId, setAutoEditRowId] = useState<number | null>(null);

  const {
    data: { status: apiHealthStatus },
  } = useApiHealth();

  // Test case generation state - now from context
  const { generateTestCase, isGenerating: generatingTestCase } = useTestCaseGeneration();

  // Track custom names for policies (by index)
  const [policyNames, setPolicyNames] = useState<Record<number, string>>({});

  // Get policy plugins from config
  const policyPlugins = config.plugins.filter(
    (p) => typeof p === 'object' && p.id === 'policy',
  ) as Array<{ id: string; config: { policy: string } }>;

  // Convert policies to rows for the data grid
  const rows: PolicyRow[] = useMemo(() => {
    if (policyPlugins.length === 0) {
      return [];
    }
    return policyPlugins.map((p, index) => ({
      id: index,
      name: policyNames[index] || `Custom Policy ${index + 1}`,
      policyText: p.config.policy,
    }));
  }, [policyPlugins, policyNames]);

  // Auto-edit newly added rows
  useEffect(() => {
    if (autoEditRowId !== null && rows.some((row) => row.id === autoEditRowId)) {
      // Row has been rendered, start edit mode
      apiRef.current.startRowEditMode({ id: autoEditRowId });
      setEditingRowId(autoEditRowId);
      setAutoEditRowId(null);
    }
  }, [autoEditRowId, rows, apiRef]);

  const handleAddPolicy = () => {
    const otherPlugins = config.plugins.filter((p) =>
      typeof p === 'string' ? true : p.id !== 'policy',
    );

    const newPolicies = [
      ...policyPlugins.map((p) => ({
        id: 'policy',
        config: { policy: p.config.policy },
      })),
      {
        id: 'policy',
        config: { policy: '' },
      },
    ];

    // Update the config state
    updateConfig('plugins', [...otherPlugins, ...newPolicies]);

    // Set the new row to be auto-edited (id will be the current length)
    setAutoEditRowId(policyPlugins.length);
  };

  const handleDeleteSelected = () => {
    if (rowSelectionModel.length === 0) {
      return;
    }
    setConfirmDeleteOpen(true);
  };

  const handleConfirmDelete = () => {
    const otherPlugins = config.plugins.filter((p) =>
      typeof p === 'string' ? true : p.id !== 'policy',
    );

    const selectedIndices = new Set(rowSelectionModel as number[]);
    const remainingPolicies = policyPlugins
      .filter((_, index) => !selectedIndices.has(index))
      .map((p) => ({
        id: 'policy',
        config: { policy: p.config.policy },
      }));

    // Clean up policy names for removed policies
    const newPolicyNames: Record<number, string> = {};
    let newIndex = 0;
    policyPlugins.forEach((_, oldIndex) => {
      if (!selectedIndices.has(oldIndex) && policyNames[oldIndex]) {
        newPolicyNames[newIndex] = policyNames[oldIndex];
        newIndex++;
      }
    });

    setPolicyNames(newPolicyNames);
    updateConfig('plugins', [...otherPlugins, ...remainingPolicies]);
    setRowSelectionModel([]);
    setConfirmDeleteOpen(false);
  };

  const handleCancelDelete = () => {
    setConfirmDeleteOpen(false);
  };

  const processRowUpdate = useCallback(
    (newRow: PolicyRow, oldRow: PolicyRow) => {
      const otherPlugins = config.plugins.filter((p) =>
        typeof p === 'string' ? true : p.id !== 'policy',
      );

      const updatedPolicies = policyPlugins.map((p, index) => {
        if (index === newRow.id) {
          return {
            id: 'policy',
            config: { policy: newRow.policyText },
          };
        }
        return {
          id: 'policy',
          config: { policy: p.config.policy },
        };
      });

      // Update policy name if changed
      if (newRow.name !== oldRow.name) {
        setPolicyNames((prev) => ({
          ...prev,
          [newRow.id]: newRow.name,
        }));
      }

      updateConfig('plugins', [...otherPlugins, ...updatedPolicies]);
      setEditingRowId(null);
      return newRow;
    },
    [config.plugins, policyPlugins, updateConfig],
  );

  const handleCsvUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];

      if (!file) {
        return;
      }

      setIsUploadingCsv(true);
      try {
        const text = await file.text();

        // Parse CSV and take the first column regardless of header name
        const records = parse(text, {
          skip_empty_lines: true,
          columns: true,
          trim: true,
        });

        // Extract policies from the first column
        const newPolicies = records
          .map((record: any) => Object.values(record)[0] as string)
          .filter((policy: string) => policy && policy.trim() !== '');

        if (newPolicies.length > 0) {
          const otherPlugins = config.plugins.filter((p) =>
            typeof p === 'string' ? true : p.id !== 'policy',
          );

          const allPolicies = [
            ...policyPlugins.map((p) => ({
              id: 'policy',
              config: { policy: p.config.policy },
            })),
            ...newPolicies.map((policy) => ({
              id: 'policy',
              config: { policy: policy.trim() },
            })),
          ];

          updateConfig('plugins', [...otherPlugins, ...allPolicies]);

          toast.showToast(
            `Successfully imported ${newPolicies.length} policies from CSV`,
            'success',
          );
        } else {
          toast.showToast('No valid policies found in CSV file', 'warning');
        }
      } catch (error) {
        toast.showToast(`Error parsing CSV: ${error}`, 'error');
        console.error('Error parsing CSV:', error);
      } finally {
        setIsUploadingCsv(false);
      }
    },
    [config.plugins, policyPlugins, toast, updateConfig],
  );

  const handleGenerateTestCase = useCallback(
    async (row: PolicyRow) => {
      if (!row.policyText || !row.policyText.trim()) {
        toast.showToast('Please enter a policy before generating a test case', 'warning');
        return;
      }

      setGeneratingPolicyIndex(row.id);

      await generateTestCase(
        'policy',
        {
          policy: row.policyText,
        },
        {
          telemetryFeature: 'redteam_policy_generate_test_case',
          mode: 'result',
          onSuccess: () => {
            setGeneratingPolicyIndex(null);
          },
          onError: () => {
            setGeneratingPolicyIndex(null);
          },
        },
      );
    },
    [toast],
  );

  const handleEditClick = useCallback(
    (row: PolicyRow) => {
      setEditingRowId(row.id);
      apiRef.current.startRowEditMode({ id: row.id });
    },
    [apiRef],
  );

  const handleSaveClick = useCallback(
    (row: PolicyRow) => {
      apiRef.current.stopRowEditMode({ id: row.id });
      setEditingRowId(null);
    },
    [apiRef],
  );

  const handleCancelClick = useCallback(
    (row: PolicyRow) => {
      apiRef.current.stopRowEditMode({ id: row.id, ignoreModifications: true });
      setEditingRowId(null);
    },
    [apiRef],
  );

  const handleRowEditStart = useCallback((params: GridRowEditStartParams) => {
    setEditingRowId(params.id as number);
  }, []);

  const handleRowEditStop = useCallback((_params: GridRowEditStopParams) => {
    setEditingRowId(null);
  }, []);

  const columns: GridColDef<PolicyRow>[] = useMemo(
    () => [
      {
        field: 'name',
        headerName: 'Name',
        flex: 1,
        minWidth: 150,
        editable: true,
      },
      {
        field: 'policyText',
        headerName: 'Policy Text',
        flex: 2,
        minWidth: 300,
        editable: true,
        renderCell: (params: GridRenderCellParams<PolicyRow>) => (
          <Box
            sx={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              width: '100%',
            }}
          >
            {params.value || '(empty)'}
          </Box>
        ),
        renderEditCell: (params: GridRenderEditCellParams<PolicyRow>) => (
          <MultilineEditCell {...params} />
        ),
      },
      {
        field: 'actions',
        headerName: 'Actions',
        flex: 0.7,
        minWidth: 160,
        sortable: false,
        filterable: false,
        renderCell: (params: GridRenderCellParams<PolicyRow>) => {
          const isEditing = editingRowId === params.row.id;

          return (
            <Box
              sx={{
                display: 'flex',
                gap: 0.5,
                alignItems: 'center',
                height: '100%',
                py: 1,
              }}
            >
              {isEditing ? (
                <>
                  <Tooltip title="Save">
                    <IconButton
                      size="small"
                      onClick={() => handleSaveClick(params.row)}
                      color="primary"
                    >
                      <CheckIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Cancel">
                    <IconButton
                      size="small"
                      onClick={() => handleCancelClick(params.row)}
                      color="error"
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </>
              ) : (
                <>
                  <Tooltip title="Edit">
                    <IconButton size="small" onClick={() => handleEditClick(params.row)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <TestCaseGenerateButton
                    onClick={() => handleGenerateTestCase(params.row)}
                    disabled={
                      apiHealthStatus !== 'connected' ||
                      (generatingTestCase && generatingPolicyIndex === params.row.id)
                    }
                    isGenerating={generatingTestCase && generatingPolicyIndex === params.row.id}
                    tooltipTitle={
                      apiHealthStatus === 'connected'
                        ? undefined
                        : 'Promptfoo Cloud connection is required for test generation'
                    }
                  />
                </>
              )}
            </Box>
          );
        },
      },
    ],
    [
      generatingTestCase,
      generatingPolicyIndex,
      editingRowId,
      handleEditClick,
      handleSaveClick,
      handleCancelClick,
      handleGenerateTestCase,
    ],
  );

  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }} ref={containerRef}>
      <Box sx={{ height: containerRef.current?.clientHeight ?? 500 }}>
        <DataGrid
          apiRef={apiRef}
          rows={rows}
          columns={columns}
          checkboxSelection
          disableRowSelectionOnClick
          processRowUpdate={processRowUpdate}
          slots={{ toolbar: CustomToolbar }}
          slotProps={{
            toolbar: {
              selectedCount: rowSelectionModel.length,
              onDeleteSelected: handleDeleteSelected,
              onAddPolicy: handleAddPolicy,
              onUploadCsv: handleCsvUpload,
              isUploadingCsv,
            },
          }}
          onRowSelectionModelChange={setRowSelectionModel}
          rowSelectionModel={rowSelectionModel}
          onRowEditStart={handleRowEditStart}
          onRowEditStop={handleRowEditStop}
          editMode="row"
          getRowHeight={(params) => (params.id === editingRowId ? 'auto' : 52)}
        />
      </Box>

      {/* Delete confirmation dialog */}
      <Dialog open={confirmDeleteOpen} onClose={handleCancelDelete}>
        <DialogTitle>
          Delete {rowSelectionModel.length} polic{rowSelectionModel.length === 1 ? 'y' : 'ies'}?
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete the selected polic
            {rowSelectionModel.length === 1 ? 'y' : 'ies'}? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDelete} variant="outlined">
            Cancel
          </Button>
          <Button
            onClick={handleConfirmDelete}
            color="error"
            variant="contained"
            startIcon={<DeleteIcon />}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
