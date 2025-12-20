import React, { useCallback, useMemo, useRef, useState } from 'react';

import { useApiHealth } from '@app/hooks/useApiHealth';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { useToast } from '@app/hooks/useToast';
import { callApi } from '@app/utils/api';
import AddIcon from '@mui/icons-material/Add';
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
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import {
  DataGrid,
  type GridColDef,
  type GridRenderCellParams,
  type GridRowSelectionModel,
  GridToolbarContainer,
  useGridApiRef,
} from '@mui/x-data-grid';
import { makeDefaultPolicyName, makeInlinePolicyId } from '@promptfoo/redteam/plugins/policy/utils';
import { parse } from 'csv-parse/browser/esm/sync';
import { useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import { TestCaseGenerateButton } from '../TestCaseDialog';
import { useTestCaseGeneration } from '../TestCaseGenerationProvider';
import { PolicySuggestionsSidebar } from './PolicySuggestionsSidebar';
import type { PolicyObject } from '@promptfoo/redteam/types';

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
  id: string;
  name: string;
  policyText: string;
};

type PolicyDialogState = {
  open: boolean;
  mode: 'create' | 'edit';
  editingPolicy: PolicyRow | null;
  formData: {
    name: string;
    policyText: string;
  };
  errors: {
    name?: string;
    policyText?: string;
  };
};

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
  const { recordEvent } = useTelemetry();
  const apiRef = useGridApiRef();
  const [generatingPolicyId, setGeneratingPolicyId] = useState<string | null>(null);
  const [isUploadingCsv, setIsUploadingCsv] = useState(false);
  const [isGeneratingPolicies, setIsGeneratingPolicies] = useState(false);
  const [suggestedPolicies, setSuggestedPolicies] = useState<PolicyObject[]>([]);
  const [rowSelectionModel, setRowSelectionModel] = useState<GridRowSelectionModel>({
    type: 'include',
    ids: new Set([]),
  });
  const isGeneratingPoliciesRef = useRef(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Policy dialog state
  const [policyDialog, setPolicyDialog] = useState<PolicyDialogState>({
    open: false,
    mode: 'create',
    editingPolicy: null,
    formData: {
      name: '',
      policyText: '',
    },
    errors: {},
  });

  const {
    data: { status: apiHealthStatus },
  } = useApiHealth();

  // For policy generation, we'll try regardless of Cloud status since it can work with local servers
  const canGeneratePolicies = Boolean(config.applicationDefinition?.purpose);

  // Test case generation state - now from context
  const { generateTestCase, isGenerating: generatingTestCase } = useTestCaseGeneration();

  // Track custom names for policies (by policy ID)
  const [policyNames, setPolicyNames] = useState<Record<string, string>>({});

  // Get policy plugins from config
  const policyPlugins = config.plugins.filter(
    (p) => typeof p === 'object' && p.id === 'policy',
  ) as Array<{
    id: string;
    config: { policy: string | { id: string; text: string; name?: string } };
  }>;

  // Convert policies to rows for the data grid
  const rows: PolicyRow[] = useMemo(() => {
    if (policyPlugins.length === 0) {
      return [];
    }
    return policyPlugins.map((p, index) => {
      // Handle both string and PolicyObject formats
      let policyText: string;
      let policyId: string;
      let policyName: string;

      if (typeof p.config.policy === 'string') {
        policyText = p.config.policy;
        policyId = makeInlinePolicyId(policyText);
        policyName = makeDefaultPolicyName(index);
      } else {
        policyText = p.config.policy.text;
        policyId = p.config.policy.id;
        policyName = p.config.policy.name || policyNames[policyId] || makeDefaultPolicyName(index);
      }

      return {
        id: policyId,
        name: policyName,
        policyText: policyText,
      };
    });
  }, [policyPlugins, policyNames]);

  // Validate policy text uniqueness
  const validatePolicyText = useCallback(
    (text: string, currentPolicyId?: string): string | undefined => {
      const trimmedText = text.trim();
      if (!trimmedText) {
        return 'Policy text is required';
      }

      // Check if this policy text already exists (excluding current policy being edited)
      const duplicateExists = policyPlugins.some((p) => {
        const existingText =
          typeof p.config.policy === 'string' ? p.config.policy : p.config.policy.text;
        const existingId =
          typeof p.config.policy === 'string'
            ? makeInlinePolicyId(p.config.policy)
            : p.config.policy.id;

        return existingText === trimmedText && existingId !== currentPolicyId;
      });

      if (duplicateExists) {
        return 'This policy text already exists. Policy texts must be unique.';
      }

      return undefined;
    },
    [policyPlugins],
  );

  const handleAddPolicy = () => {
    setPolicyDialog({
      open: true,
      mode: 'create',
      editingPolicy: null,
      formData: {
        name: '',
        policyText: '',
      },
      errors: {},
    });
  };

  const handleEditPolicy = (policy: PolicyRow) => {
    setPolicyDialog({
      open: true,
      mode: 'edit',
      editingPolicy: policy,
      formData: {
        name: policy.name,
        policyText: policy.policyText,
      },
      errors: {},
    });
  };

  const handleClosePolicyDialog = () => {
    setPolicyDialog((prev) => ({
      ...prev,
      open: false,
      errors: {},
    }));
  };

  const handleSavePolicy = () => {
    const { formData, mode, editingPolicy } = policyDialog;
    const trimmedText = formData.policyText.trim();
    const trimmedName = formData.name.trim();

    // Validate
    const errors: typeof policyDialog.errors = {};

    if (!trimmedName) {
      errors.name = 'Name is required';
    }

    const policyTextError = validatePolicyText(
      trimmedText,
      mode === 'edit' ? editingPolicy?.id : undefined,
    );
    if (policyTextError) {
      errors.policyText = policyTextError;
    }

    if (Object.keys(errors).length > 0) {
      setPolicyDialog((prev) => ({ ...prev, errors }));
      return;
    }

    const otherPlugins = config.plugins.filter((p) =>
      typeof p === 'string' ? true : p.id !== 'policy',
    );

    const newPolicyId = makeInlinePolicyId(trimmedText);

    if (mode === 'create') {
      // Add new policy
      const newPolicies = [
        ...policyPlugins.map((p) => ({
          id: 'policy',
          config: { policy: p.config.policy },
        })),
        {
          id: 'policy',
          config: {
            policy: {
              id: newPolicyId,
              text: trimmedText,
              name: trimmedName,
            },
          },
        },
      ];
      updateConfig('plugins', [...otherPlugins, ...newPolicies]);
      recordEvent('redteam_policy_added', {
        source: 'manual',
        policy_name: trimmedName,
        policy_text: trimmedText,
      });
      toast.showToast('Policy added successfully', 'success');
    } else {
      // Update existing policy
      const updatedPolicies = policyPlugins.map((p) => {
        const currentPolicyId =
          typeof p.config.policy === 'string'
            ? makeInlinePolicyId(p.config.policy)
            : p.config.policy.id;

        if (currentPolicyId === editingPolicy?.id) {
          return {
            id: 'policy',
            config: {
              policy: {
                id: newPolicyId,
                text: trimmedText,
                name: trimmedName,
              },
            },
          };
        }
        return {
          id: 'policy',
          config: { policy: p.config.policy },
        };
      });
      updateConfig('plugins', [...otherPlugins, ...updatedPolicies]);
      toast.showToast('Policy updated successfully', 'success');
    }

    handleClosePolicyDialog();
  };

  const handleDeleteSelected = () => {
    if (!rowSelectionModel?.ids || rowSelectionModel.ids.size === 0) {
      return;
    }
    setConfirmDeleteOpen(true);
  };

  const handleConfirmDelete = () => {
    if (!rowSelectionModel?.ids) {
      return;
    }
    const otherPlugins = config.plugins.filter((p) =>
      typeof p === 'string' ? true : p.id !== 'policy',
    );

    const selectedIds = rowSelectionModel.ids;
    const remainingPolicies = policyPlugins
      .filter((p) => {
        const policyId =
          typeof p.config.policy === 'string'
            ? makeInlinePolicyId(p.config.policy)
            : p.config.policy.id;
        return !selectedIds.has(policyId);
      })
      .map((p) => ({
        id: 'policy',
        config: { policy: p.config.policy },
      }));

    // Clean up policy names for removed policies
    const newPolicyNames = { ...policyNames };
    selectedIds.forEach((id) => {
      delete newPolicyNames[id];
    });

    setPolicyNames(newPolicyNames);
    updateConfig('plugins', [...otherPlugins, ...remainingPolicies]);
    setRowSelectionModel({ type: 'include', ids: new Set() });
    setConfirmDeleteOpen(false);
  };

  const handleCancelDelete = () => {
    setConfirmDeleteOpen(false);
  };

  const handleGeneratePolicies = useCallback(async () => {
    if (!config.applicationDefinition?.purpose) {
      return;
    }

    // Guard against multiple simultaneous requests
    if (isGeneratingPoliciesRef.current) {
      return;
    }

    isGeneratingPoliciesRef.current = true;
    setIsGeneratingPolicies(true);
    try {
      // Get existing policy texts to avoid duplicates (both active and suggested)
      const existingPolicies = [
        ...rows.map((row) => row.policyText),
        ...suggestedPolicies.map((p) => p.text || ''),
      ];

      const response = await callApi('/redteam/generate-custom-policy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          applicationDefinition: config.applicationDefinition,
          existingPolicies,
        }),
      });

      if (!response.ok) {
        let errorMessage = 'Failed to generate policies';
        try {
          const error = await response.json();
          errorMessage = error.details ?? error.error ?? errorMessage;
        } catch {
          // If response is not JSON, use status text
          errorMessage = `Failed to generate policies: ${response.statusText || response.status}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      const generatedPolicies: Array<{ name: string; text: string }> = data.policies || [];

      if (generatedPolicies.length === 0) {
        toast.showToast(
          'No policies were generated. Try adjusting your application definition.',
          'warning',
        );
        setSuggestedPolicies([]);
        return;
      }

      // Map to PolicyObject with generated IDs
      const policyObjects: PolicyObject[] = generatedPolicies.map((p) => ({
        id: makeInlinePolicyId(p.text),
        text: p.text,
        name: p.name,
      }));

      // Store as suggested policies instead of directly adding them
      setSuggestedPolicies(policyObjects);
    } catch (error) {
      console.error('Error generating policies:', error);
      let errorMessage = 'Failed to generate policies';

      if (error instanceof Error) {
        // Handle network errors
        if (error.message.includes('fetch') || error.message.includes('network')) {
          errorMessage = 'Network error. Please check your connection and try again.';
        } else if (error.message.includes('timeout')) {
          errorMessage = 'Request timed out. Please try again.';
        } else {
          errorMessage = error.message;
        }
      } else {
        errorMessage = 'An unexpected error occurred while generating policies.';
      }

      toast.showToast(errorMessage, 'error', 7500);
      setSuggestedPolicies([]);
    } finally {
      isGeneratingPoliciesRef.current = false;
      setIsGeneratingPolicies(false);
    }
  }, [config.applicationDefinition, rows, suggestedPolicies, toast]);

  const handleAddSuggestedPolicy = useCallback(
    (policy: PolicyObject) => {
      const otherPlugins = config.plugins.filter((p) =>
        typeof p === 'string' ? true : p.id !== 'policy',
      );

      const policyId = policy.id || makeInlinePolicyId(policy.text || '');
      const newPolicy = {
        id: 'policy',
        config: {
          policy: {
            id: policyId,
            text: policy.text,
            name: policy.name,
          },
        },
      };

      const allPolicies = [
        ...policyPlugins.map((p) => ({
          id: 'policy',
          config: { policy: p.config.policy },
        })),
        newPolicy,
      ];

      updateConfig('plugins', [...otherPlugins, ...allPolicies]);

      // Remove from suggested policies
      setSuggestedPolicies((prev) => prev.filter((p) => p.id !== policy.id));

      recordEvent('redteam_policy_added', {
        source: 'suggestion',
        policy_name: policy.name,
        policy_text: policy.text,
      });
      toast.showToast('Policy added successfully', 'success');
    },
    [config.plugins, policyPlugins, updateConfig, toast, recordEvent],
  );

  const handleRemoveSuggestedPolicy = useCallback(
    (policy: PolicyObject) => {
      // Remove from suggested policies
      setSuggestedPolicies((prev) => prev.filter((p) => p.id !== policy.id));

      // Log to PostHog
      recordEvent('redteam_policy_dismissed', {
        policy_name: policy.name,
        policy_text: policy.text,
        application_description: JSON.stringify(config.applicationDefinition || {}),
      });
    },
    [recordEvent, config.applicationDefinition],
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

          const currentPolicyCount = policyPlugins.length;
          const allPolicies = [
            ...policyPlugins.map((p) => ({
              id: 'policy',
              config: { policy: p.config.policy },
            })),
            ...newPolicies.map((policy, index) => {
              const policyText = policy.trim();
              const policyId = makeInlinePolicyId(policyText);
              return {
                id: 'policy',
                config: {
                  policy: {
                    id: policyId,
                    text: policyText,
                    name: makeDefaultPolicyName(currentPolicyCount + index),
                  },
                },
              };
            }),
          ];

          updateConfig('plugins', [...otherPlugins, ...allPolicies]);

          recordEvent('redteam_policies_added_csv', {
            count: newPolicies.length,
          });

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

      setGeneratingPolicyId(row.id);

      await generateTestCase(
        { id: 'policy', config: { policy: row.policyText }, isStatic: true },
        { id: 'basic', config: {}, isStatic: true },
        function onSuccess() {
          setGeneratingPolicyId(null);
        },
        function onError() {
          setGeneratingPolicyId(null);
        },
      );
    },
    [toast, generateTestCase],
  );

  const columns: GridColDef<PolicyRow>[] = useMemo(
    () => [
      {
        field: 'name',
        headerName: 'Name',
        flex: 0.75,
      },
      {
        field: 'policyText',
        headerName: 'Policy Text',
        flex: 3,
      },
      {
        field: 'actions',
        headerName: 'Actions',
        flex: 0.5,
        minWidth: 160,
        sortable: false,
        filterable: false,
        renderCell: (params: GridRenderCellParams<PolicyRow>) => (
          <Box
            sx={{
              display: 'flex',
              gap: 0.5,
              alignItems: 'center',
              height: '100%',
              py: 1,
            }}
          >
            <Tooltip title="Edit">
              <IconButton size="small" onClick={() => handleEditPolicy(params.row)}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <TestCaseGenerateButton
              onClick={() => handleGenerateTestCase(params.row)}
              disabled={
                apiHealthStatus !== 'connected' ||
                (generatingTestCase && generatingPolicyId === params.row.id)
              }
              isGenerating={generatingTestCase && generatingPolicyId === params.row.id}
              tooltipTitle={
                apiHealthStatus === 'connected'
                  ? undefined
                  : 'Promptfoo Cloud connection is required for test generation'
              }
            />
          </Box>
        ),
      },
    ],
    [
      generatingTestCase,
      generatingPolicyId,
      handleEditPolicy,
      handleGenerateTestCase,
      apiHealthStatus,
    ],
  );

  const containerRef = useRef<HTMLDivElement>(null);

  // Determine if we should show the suggestions sidebar - show whenever policy generation is possible
  const showSuggestionsSidebar = canGeneratePolicies;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }} ref={containerRef}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: showSuggestionsSidebar ? '1fr 380px' : '1fr',
          gap: 2,
          height: 600,
          minHeight: 400,
        }}
      >
        {/* Main table area */}
        <Box sx={{ height: '100%', minWidth: 0 }}>
          <DataGrid
            apiRef={apiRef}
            rows={rows}
            columns={columns}
            checkboxSelection
            disableRowSelectionOnClick
            slots={{ toolbar: CustomToolbar }}
            slotProps={{
              toolbar: {
                selectedCount: rowSelectionModel?.ids?.size ?? 0,
                onDeleteSelected: handleDeleteSelected,
                onAddPolicy: handleAddPolicy,
                onUploadCsv: handleCsvUpload,
                isUploadingCsv,
              },
            }}
            onRowSelectionModelChange={setRowSelectionModel}
            rowSelectionModel={rowSelectionModel}
            showToolbar
          />
        </Box>

        {/* Suggested Policies Sidebar */}
        {showSuggestionsSidebar && (
          <PolicySuggestionsSidebar
            isGeneratingPolicies={isGeneratingPolicies}
            suggestedPolicies={suggestedPolicies}
            onGeneratePolicies={handleGeneratePolicies}
            onAddSuggestedPolicy={handleAddSuggestedPolicy}
            onRemoveSuggestedPolicy={handleRemoveSuggestedPolicy}
          />
        )}
      </Box>

      {/* Delete confirmation dialog */}
      <Dialog open={confirmDeleteOpen} onClose={handleCancelDelete}>
        <DialogTitle>
          Delete {rowSelectionModel?.ids?.size ?? 0} polic
          {(rowSelectionModel?.ids?.size ?? 0) === 1 ? 'y' : 'ies'}?
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete the selected polic
            {(rowSelectionModel?.ids?.size ?? 0) === 1 ? 'y' : 'ies'}? This action cannot be undone.
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

      {/* Policy edit/create dialog */}
      <Dialog open={policyDialog.open} onClose={handleClosePolicyDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          {policyDialog.mode === 'create' ? 'Add New Policy' : 'Edit Policy'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Name"
              value={policyDialog.formData.name}
              onChange={(e) =>
                setPolicyDialog((prev) => ({
                  ...prev,
                  formData: { ...prev.formData, name: e.target.value },
                  errors: { ...prev.errors, name: undefined },
                }))
              }
              error={!!policyDialog.errors.name}
              helperText={policyDialog.errors.name}
              placeholder="e.g., Data Privacy Policy"
              fullWidth
            />
            <TextField
              label="Policy Text"
              value={policyDialog.formData.policyText}
              onChange={(e) =>
                setPolicyDialog((prev) => ({
                  ...prev,
                  formData: { ...prev.formData, policyText: e.target.value },
                  errors: { ...prev.errors, policyText: undefined },
                }))
              }
              error={!!policyDialog.errors.policyText}
              helperText={policyDialog.errors.policyText}
              multiline
              rows={8}
              fullWidth
              placeholder="Enter the policy text that describes what should be checked..."
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClosePolicyDialog} variant="outlined">
            Cancel
          </Button>
          <Button
            onClick={handleSavePolicy}
            variant="contained"
            color="primary"
            disabled={
              !policyDialog.formData.name.trim() || !policyDialog.formData.policyText.trim()
            }
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
