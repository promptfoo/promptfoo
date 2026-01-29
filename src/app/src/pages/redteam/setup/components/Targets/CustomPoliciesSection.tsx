import React, { useCallback, useMemo, useRef, useState } from 'react';

import { DataTable } from '@app/components/data-table/data-table';
import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { HelperText } from '@app/components/ui/helper-text';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { Textarea } from '@app/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { useApiHealth } from '@app/hooks/useApiHealth';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { useToast } from '@app/hooks/useToast';
import { callApi } from '@app/utils/api';
import { makeDefaultPolicyName, makeInlinePolicyId } from '@promptfoo/redteam/plugins/policy/utils';
import { Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import { TestCaseGenerateButton } from '../TestCaseDialog';
import { useTestCaseGeneration } from '../TestCaseGenerationProvider';
import { PolicySuggestionsSidebar } from './PolicySuggestionsSidebar';
import type { PolicyObject } from '@promptfoo/redteam/types';
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table';

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

export const CustomPoliciesSection = () => {
  const { config, updateConfig } = useRedTeamConfig();
  const toast = useToast();
  const { recordEvent } = useTelemetry();
  const [generatingPolicyId, setGeneratingPolicyId] = useState<string | null>(null);
  const [isUploadingCsv, setIsUploadingCsv] = useState(false);
  const [isGeneratingPolicies, setIsGeneratingPolicies] = useState(false);
  const [suggestedPolicies, setSuggestedPolicies] = useState<PolicyObject[]>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
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

  // Get policy plugins from config - memoized to prevent infinite re-renders
  const policyPlugins = useMemo(
    () =>
      config.plugins.filter((p) => typeof p === 'object' && p.id === 'policy') as Array<{
        id: string;
        config: { policy: string | { id: string; text: string; name?: string } };
      }>,
    [config.plugins],
  );

  // Convert policies to rows for the data grid
  const [rows, setRows] = useState<PolicyRow[]>([]);

  React.useEffect(() => {
    let cancelled = false;

    async function buildRows() {
      try {
        if (policyPlugins.length === 0) {
          if (!cancelled) {
            setRows([]);
          }
          return;
        }

        const result: PolicyRow[] = [];
        for (let index = 0; index < policyPlugins.length; index++) {
          const p = policyPlugins[index];
          // Handle both string and PolicyObject formats
          let policyText: string;
          let policyId: string;
          let policyName: string;

          if (typeof p.config.policy === 'string') {
            policyText = p.config.policy;
            policyId = await makeInlinePolicyId(policyText);
            policyName = makeDefaultPolicyName(index);
          } else {
            policyText = p.config.policy.text;
            policyId = p.config.policy.id;
            policyName =
              p.config.policy.name || policyNames[policyId] || makeDefaultPolicyName(index);
          }

          result.push({
            id: policyId,
            name: policyName,
            policyText: policyText,
          });
        }

        if (!cancelled) {
          setRows(result);
        }
      } catch (error) {
        console.error('Error building policy rows:', error);
        if (!cancelled) {
          setRows([]);
        }
      }
    }

    buildRows();

    return () => {
      cancelled = true;
    };
  }, [policyPlugins, policyNames]);

  // Validate policy text uniqueness
  const validatePolicyText = useCallback(
    async (text: string, currentPolicyId?: string): Promise<string | undefined> => {
      const trimmedText = text.trim();
      if (!trimmedText) {
        return 'Policy text is required';
      }

      // Check if this policy text already exists (excluding current policy being edited)
      for (const p of policyPlugins) {
        const existingText =
          typeof p.config.policy === 'string' ? p.config.policy : p.config.policy.text;
        const existingId =
          typeof p.config.policy === 'string'
            ? await makeInlinePolicyId(p.config.policy)
            : p.config.policy.id;

        if (existingText === trimmedText && existingId !== currentPolicyId) {
          return 'This policy text already exists. Policy texts must be unique.';
        }
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

  const handleSavePolicy = async () => {
    const { formData, mode, editingPolicy } = policyDialog;
    const trimmedText = formData.policyText.trim();
    const trimmedName = formData.name.trim();

    // Validate
    const errors: typeof policyDialog.errors = {};

    if (!trimmedName) {
      errors.name = 'Name is required';
    }

    const policyTextError = await validatePolicyText(
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

    const newPolicyId = await makeInlinePolicyId(trimmedText);

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
      const updatedPolicies: Array<{
        id: string;
        config: { policy: string | { id: string; text: string; name?: string } };
      }> = [];
      for (const p of policyPlugins) {
        const currentPolicyId =
          typeof p.config.policy === 'string'
            ? await makeInlinePolicyId(p.config.policy)
            : p.config.policy.id;

        if (currentPolicyId === editingPolicy?.id) {
          updatedPolicies.push({
            id: 'policy',
            config: {
              policy: {
                id: newPolicyId,
                text: trimmedText,
                name: trimmedName,
              },
            },
          });
        } else {
          updatedPolicies.push({
            id: 'policy',
            config: { policy: p.config.policy },
          });
        }
      }
      updateConfig('plugins', [...otherPlugins, ...updatedPolicies]);
      toast.showToast('Policy updated successfully', 'success');
    }

    handleClosePolicyDialog();
  };

  const handleDeleteSelected = () => {
    const selectedCount = Object.keys(rowSelection).filter((key) => rowSelection[key]).length;
    if (selectedCount === 0) {
      return;
    }
    setConfirmDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    const selectedIds = Object.keys(rowSelection).filter((key) => rowSelection[key]);
    if (selectedIds.length === 0) {
      return;
    }
    const otherPlugins = config.plugins.filter((p) =>
      typeof p === 'string' ? true : p.id !== 'policy',
    );

    const selectedIdsSet = new Set(selectedIds);
    const remainingPolicies: Array<{
      id: string;
      config: { policy: string | { id: string; text: string; name?: string } };
    }> = [];

    for (const p of policyPlugins) {
      const policyId =
        typeof p.config.policy === 'string'
          ? await makeInlinePolicyId(p.config.policy)
          : p.config.policy.id;
      if (!selectedIdsSet.has(policyId)) {
        remainingPolicies.push({
          id: 'policy',
          config: { policy: p.config.policy },
        });
      }
    }

    // Clean up policy names for removed policies
    const newPolicyNames = { ...policyNames };
    selectedIds.forEach((id) => {
      delete newPolicyNames[id];
    });

    setPolicyNames(newPolicyNames);
    updateConfig('plugins', [...otherPlugins, ...remainingPolicies]);
    setRowSelection({});
    setConfirmDeleteOpen(false);
  };

  const handleCancelDelete = () => {
    setConfirmDeleteOpen(false);
  };

  /**
   * Generates custom policies for an application given its definition and a sample of existing
   * policies. Generation occurs remotely in Promptfoo Cloud.
   */
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

      // Send the request to `/redteam/:taskId`:
      const response = await callApi('/redteam/custom-policy-generation-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationDefinition: config.applicationDefinition,
          existingPolicies,
        }),
      });

      // Parse the request body prior to handling success/error cases.
      let data;
      try {
        data = (await response.json()) as {
          result: PolicyObject[];
          error: string | null;
          task: string;
          details?: string; // Optionally set in `logAndSendError`
        };
      } catch (error) {
        // Handle JSON parsing errors
        toast.showToast(
          `Failed to generate policies: ${error instanceof Error ? error.message : String(error)}`,
          'error',
        );
        return;
      }

      // Handle potential errors:
      if (!response.ok || data.error) {
        const errorMessage =
          data?.details ??
          data?.error ??
          `Failed to generate policies: ${response.statusText || response.status}`;
        throw new Error(errorMessage);
      }

      // Otherwise, handle success:
      const generatedPolicies: PolicyObject[] = data.result ?? [];

      if (generatedPolicies.length === 0) {
        toast.showToast(
          'No policies were generated. Try adjusting your application definition.',
          'warning',
        );
      }

      // Store as suggested policies instead of directly adding them
      setSuggestedPolicies(generatedPolicies);
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
    async (policy: PolicyObject) => {
      const otherPlugins = config.plugins.filter((p) =>
        typeof p === 'string' ? true : p.id !== 'policy',
      );

      const policyId = policy.id || (await makeInlinePolicyId(policy.text || ''));
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
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
        const { parse } = await import('csv-parse/browser/esm/sync');
        const records = parse<Record<string, string>>(text, {
          skip_empty_lines: true,
          columns: true,
          trim: true,
        });

        // Extract policies from the first column
        const newPolicies = records
          .map((record) => Object.values(record)[0] as string)
          .filter((policy: string) => policy && policy.trim() !== '');

        if (newPolicies.length > 0) {
          const otherPlugins = config.plugins.filter((p) =>
            typeof p === 'string' ? true : p.id !== 'policy',
          );

          const currentPolicyCount = policyPlugins.length;
          const newPolicyPlugins = await Promise.all(
            newPolicies.map(async (policy, index) => {
              const policyText = policy.trim();
              const policyId = await makeInlinePolicyId(policyText);
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
          );

          const allPolicies = [
            ...policyPlugins.map((p) => ({
              id: 'policy',
              config: { policy: p.config.policy },
            })),
            ...newPolicyPlugins,
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

  const columns: ColumnDef<PolicyRow>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        size: 200,
      },
      {
        accessorKey: 'policyText',
        header: 'Policy Text',
        size: 600,
      },
      {
        id: 'actions',
        header: 'Actions',
        size: 160,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex h-full items-center gap-1 py-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => handleEditPolicy(row.original)}
                >
                  <Pencil className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit</TooltipContent>
            </Tooltip>
            <TestCaseGenerateButton
              onClick={() => handleGenerateTestCase(row.original)}
              disabled={
                apiHealthStatus !== 'connected' ||
                (generatingTestCase && generatingPolicyId === row.original.id)
              }
              isGenerating={generatingTestCase && generatingPolicyId === row.original.id}
              tooltipTitle={
                apiHealthStatus === 'connected'
                  ? undefined
                  : 'Promptfoo Cloud connection is required for test generation'
              }
            />
          </div>
        ),
      },
    ],
    [
      generatingTestCase,
      generatingPolicyId,
      // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
      handleEditPolicy,
      handleGenerateTestCase,
      apiHealthStatus,
    ],
  );

  const containerRef = useRef<HTMLDivElement>(null);

  // Determine if we should show the suggestions sidebar - show whenever policy generation is possible
  const showSuggestionsSidebar = canGeneratePolicies;

  // Get selected count
  const selectedCount = Object.keys(rowSelection).filter((key) => rowSelection[key]).length;

  // Custom toolbar actions
  const toolbarActions = (
    <>
      <Button size="sm" onClick={handleAddPolicy}>
        <Plus className="mr-2 size-4" />
        Add Policy
      </Button>
      <Button variant="outline" size="sm" asChild disabled={isUploadingCsv}>
        <label className="cursor-pointer">
          <Upload className="mr-2 size-4" />
          {isUploadingCsv ? 'Uploading...' : 'Upload CSV'}
          <input
            type="file"
            hidden
            accept=".csv"
            onChange={handleCsvUpload}
            onClick={(e) => {
              (e.target as HTMLInputElement).value = '';
            }}
            disabled={isUploadingCsv}
          />
        </label>
      </Button>
      {selectedCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive"
          onClick={handleDeleteSelected}
        >
          <Trash2 className="mr-2 size-4" />
          Delete ({selectedCount})
        </Button>
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-4" ref={containerRef}>
      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: showSuggestionsSidebar ? '1fr 380px' : '1fr',
          height: 600,
          minHeight: 400,
        }}
      >
        {/* Main table area */}
        <div className="min-w-0" style={{ height: '100%' }}>
          <DataTable
            data={rows}
            columns={columns}
            enableRowSelection
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
            getRowId={(row) => row.id}
            toolbarActions={toolbarActions}
            showToolbar
            showPagination={false}
            emptyMessage="No custom policies configured. Add your first policy using the 'Add Policy' button above."
          />
        </div>

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
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {selectedCount} polic{selectedCount === 1 ? 'y' : 'ies'}?
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the selected polic
              {selectedCount === 1 ? 'y' : 'ies'}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelDelete}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              <Trash2 className="mr-2 size-4" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Policy edit/create dialog */}
      <Dialog open={policyDialog.open} onOpenChange={(open) => !open && handleClosePolicyDialog()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {policyDialog.mode === 'create' ? 'Add New Policy' : 'Edit Policy'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="policy-name">Name</Label>
              <Input
                id="policy-name"
                value={policyDialog.formData.name}
                onChange={(e) =>
                  setPolicyDialog((prev) => ({
                    ...prev,
                    formData: { ...prev.formData, name: e.target.value },
                    errors: { ...prev.errors, name: undefined },
                  }))
                }
                placeholder="e.g., Data Privacy Policy"
              />
              {policyDialog.errors.name && (
                <HelperText error>{policyDialog.errors.name}</HelperText>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="policy-text">Policy Text</Label>
              <Textarea
                id="policy-text"
                value={policyDialog.formData.policyText}
                onChange={(e) =>
                  setPolicyDialog((prev) => ({
                    ...prev,
                    formData: { ...prev.formData, policyText: e.target.value },
                    errors: { ...prev.errors, policyText: undefined },
                  }))
                }
                rows={8}
                placeholder="Enter the policy text that describes what should be checked..."
              />
              {policyDialog.errors.policyText && (
                <HelperText error>{policyDialog.errors.policyText}</HelperText>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleClosePolicyDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleSavePolicy}
              disabled={
                !policyDialog.formData.name.trim() || !policyDialog.formData.policyText.trim()
              }
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
