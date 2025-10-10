import React, { memo, useCallback, useEffect, useState } from 'react';

import { useApiHealth } from '@app/hooks/useApiHealth';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { useToast } from '@app/hooks/useToast';
import { callApi } from '@app/utils/api';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { parse } from 'csv-parse/browser/esm/sync';
import { useDebounce } from 'use-debounce';
import { useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import { TestCaseDialog, TestCaseGenerateButton } from '../TestCaseDialog';

interface PolicyInstance {
  id: string;
  name: string;
  policy: string;
  isExpanded: boolean;
}

const PolicyInput = memo(
  ({
    id,
    value,
    onChange,
  }: {
    id: string;
    value: string;
    onChange: (id: string, value: string) => void;
  }) => {
    const [debouncedChange] = useDebounce(onChange, 300);

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        debouncedChange(id, e.target.value);
      },
      [id, debouncedChange],
    );

    return (
      <TextField
        label="Policy Text"
        value={value}
        onChange={handleChange}
        multiline
        rows={4}
        fullWidth
        placeholder="Enter your policy guidelines here..."
      />
    );
  },
);

PolicyInput.displayName = 'PolicyInput';

export const CustomPoliciesSection = () => {
  const { config, updateConfig } = useRedTeamConfig();
  const { recordEvent } = useTelemetry();
  const toast = useToast();
  const { status: apiHealthStatus, checkHealth } = useApiHealth();
  const [isInitialMount, setIsInitialMount] = useState(true);
  const [testCaseDialogOpen, setTestCaseDialogOpen] = useState(false);
  const [generatingPolicyId, setGeneratingPolicyId] = useState<string | null>(null);
  const [generatedTestCase, setGeneratedTestCase] = useState<{
    prompt: string;
    context?: string;
  } | null>(null);
  const [generatingTestCase, setGeneratingTestCase] = useState(false);
  const [isUploadingCsv, setIsUploadingCsv] = useState(false);
  const [targetResponse, setTargetResponse] = useState<{ output: string; error?: string } | null>(
    null,
  );
  const [isRunningTest, setIsRunningTest] = useState(false);
  const [policies, setPolicies] = useState<PolicyInstance[]>(() => {
    // Initialize from existing config or create a default empty policy
    const existingPolicies = config.plugins
      .filter((p) => typeof p === 'object' && p.id === 'policy')
      .map((p, index) => ({
        id: `policy-${Date.now()}-${index}`,
        name: `Custom Policy ${index + 1}`,
        policy: (p as { config: { policy: string } }).config.policy,
        isExpanded: true,
      }));

    return existingPolicies.length
      ? existingPolicies
      : [
          {
            id: `policy-${Date.now()}`,
            name: 'Custom Policy 1',
            policy: '',
            isExpanded: true,
          },
        ];
  });

  const [debouncedPolicies] = useDebounce(policies, 500);

  // Check API health on mount
  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  // Sync policies to config - immediate on mount, debounced on changes
  const syncPolicies = useCallback(
    (policiesToSync: PolicyInstance[]) => {
      const policyPlugins = policiesToSync
        .filter((policy) => policy.policy.trim() !== '')
        .map((policy) => ({
          id: 'policy',
          config: {
            policy: policy.policy,
          },
        }));

      const otherPlugins = config.plugins.filter((p) =>
        typeof p === 'string' ? true : p.id !== 'policy',
      );

      const currentPolicies = JSON.stringify(
        config.plugins.filter((p) => typeof p === 'object' && p.id === 'policy'),
      );
      const newPolicies = JSON.stringify(policyPlugins);

      if (currentPolicies !== newPolicies) {
        updateConfig('plugins', [...otherPlugins, ...policyPlugins]);
      }
    },
    [config.plugins, updateConfig],
  );

  // Immediate sync on initial mount
  useEffect(() => {
    if (isInitialMount) {
      syncPolicies(policies);
      setIsInitialMount(false);
    }
  }, [isInitialMount, policies, syncPolicies]);

  // Debounced sync for subsequent changes
  useEffect(() => {
    if (!isInitialMount) {
      syncPolicies(debouncedPolicies);
    }
  }, [debouncedPolicies, isInitialMount, syncPolicies]);

  const handlePolicyChange = useCallback((policyId: string, newValue: string) => {
    setPolicies((prev) => prev.map((p) => (p.id === policyId ? { ...p, policy: newValue } : p)));
  }, []);

  const handleAddPolicy = () => {
    const newPolicy: PolicyInstance = {
      id: `policy-${Date.now()}`,
      name: `Custom Policy ${policies.length + 1}`,
      policy: '',
      isExpanded: true,
    };
    setPolicies([...policies, newPolicy]);
  };

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
          .filter((policy: string) => policy && policy.trim() !== '')
          .map((policy: string, index: number) => ({
            id: `policy-${Date.now()}-${index}`,
            name: `Custom Policy ${policies.length + index + 1}`,
            policy: policy.trim(),
            isExpanded: false,
          }));

        if (newPolicies.length > 0) {
          // Append new policies to existing ones
          setPolicies([...policies, ...newPolicies]);
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
    [policies, toast],
  );

  const handleGenerateTestCase = async (policyId: string) => {
    const policy = policies.find((p) => p.id === policyId);
    if (!policy || !policy.policy.trim()) {
      toast.showToast('Please enter a policy before generating a test case', 'warning');
      return;
    }

    setGeneratingPolicyId(policyId);
    setGeneratedTestCase(null);
    setGeneratingTestCase(true);
    setTestCaseDialogOpen(true);

    try {
      recordEvent('feature_used', {
        feature: 'redteam_policy_generate_test_case',
        plugin: 'policy',
      });

      const response = await callApi('/redteam/generate-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pluginId: 'policy',
          config: {
            policy: policy.policy,
          },
        }),
        timeout: 10000, // 10 second timeout
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate test case');
      }

      const data = await response.json();
      setGeneratedTestCase({
        prompt: data.prompt || '',
        context: data.context || policy.policy,
      });

      // Run the test case against the target
      setIsRunningTest(true);
      setTargetResponse(null);
      try {
        const testResponse = await callApi('/redteam/run-test', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: data.prompt,
            target: config.target,
          }),
          timeout: 30000, // 30 second timeout for running test
        });

        if (!testResponse.ok) {
          const errorData = await testResponse.json();
          throw new Error(errorData.error || 'Failed to run test case');
        }

        const testData = await testResponse.json();
        setTargetResponse({
          output: testData.output || '',
          error: testData.error,
        });
      } catch (error) {
        console.error('Error running test case:', error);
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to run test case: Unknown error';
        setTargetResponse({
          output: '',
          error: errorMessage,
        });
      } finally {
        setIsRunningTest(false);
      }
    } catch (error) {
      console.error('Error generating test case:', error);
      // Provide specific message for timeout errors
      const errorMessage =
        error instanceof Error
          ? error.message.includes('timed out')
            ? 'Test generation timed out. Please try again or check your connection.'
            : `Failed to generate test case: ${error.message}`
          : 'Failed to generate test case: Unknown error';
      toast.showToast(errorMessage, 'error');
      setTestCaseDialogOpen(false);
    } finally {
      setGeneratingTestCase(false);
    }
  };

  const handleCloseTestCaseDialog = () => {
    setTestCaseDialogOpen(false);
    setGeneratingPolicyId(null);
    setGeneratedTestCase(null);
    setGeneratingTestCase(false);
    setTargetResponse(null);
    setIsRunningTest(false);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="body2" color="text.secondary">
        Custom policies define rules that the AI should follow. These are used to test if the AI
        adheres to your specific guidelines and constraints. You can add policies manually or upload
        a CSV file (first column will be used as policies).
      </Typography>

      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 1,
        }}
      >
        <Button
          startIcon={<AddIcon />}
          onClick={handleAddPolicy}
          variant="contained"
          color="primary"
        >
          Add Policy
        </Button>
        <Button
          component="label"
          variant="outlined"
          startIcon={isUploadingCsv ? null : <FileUploadIcon />}
          disabled={isUploadingCsv}
        >
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
        </Button>
      </Box>

      <Stack spacing={2}>
        {policies.map((policy) => (
          <Box
            key={policy.id}
            sx={{
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
              p: 2,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TextField
                label="Policy Name"
                value={policy.name}
                onChange={(e) => {
                  setPolicies((prev) =>
                    prev.map((p) => (p.id === policy.id ? { ...p, name: e.target.value } : p)),
                  );
                }}
                size="small"
                fullWidth
              />
              <TestCaseGenerateButton
                onClick={() => handleGenerateTestCase(policy.id)}
                disabled={
                  apiHealthStatus !== 'connected' ||
                  (generatingTestCase && generatingPolicyId === policy.id)
                }
                isGenerating={generatingTestCase && generatingPolicyId === policy.id}
                tooltipTitle={
                  apiHealthStatus === 'connected'
                    ? undefined
                    : 'Promptfoo Cloud connection is required for test generation'
                }
              />
              <IconButton
                onClick={() => setPolicies((prev) => prev.filter((p) => p.id !== policy.id))}
                color="error"
              >
                <DeleteIcon />
              </IconButton>
              <IconButton
                onClick={() => {
                  setPolicies((prev) =>
                    prev.map((p) => (p.id === policy.id ? { ...p, isExpanded: !p.isExpanded } : p)),
                  );
                }}
              >
                {policy.isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            </Box>

            <Collapse in={policy.isExpanded}>
              <Box sx={{ mt: 2 }}>
                <PolicyInput id={policy.id} value={policy.policy} onChange={handlePolicyChange} />
              </Box>
            </Collapse>
          </Box>
        ))}
      </Stack>

      <TestCaseDialog
        open={testCaseDialogOpen}
        onClose={handleCloseTestCaseDialog}
        plugin="policy"
        isGenerating={generatingTestCase}
        generatedTestCase={generatedTestCase}
        targetResponse={targetResponse}
        isRunningTest={isRunningTest}
        mode="result"
      />
    </Box>
  );
};
