import React, { memo, useCallback, useState } from 'react';

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

const PolicyInput = memo(
  ({
    index,
    value,
    onChange,
  }: {
    index: number;
    value: string;
    onChange: (index: number, value: string) => void;
  }) => {
    const [debouncedChange] = useDebounce(onChange, 300);

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        debouncedChange(index, e.target.value);
      },
      [index, debouncedChange],
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
  const [testCaseDialogOpen, setTestCaseDialogOpen] = useState(false);
  const [generatingPolicyIndex, setGeneratingPolicyIndex] = useState<number | null>(null);
  const [generatedTestCase, setGeneratedTestCase] = useState<{
    prompt: string;
    context?: string;
  } | null>(null);
  const [generatingTestCase, setGeneratingTestCase] = useState(false);
  const [isUploadingCsv, setIsUploadingCsv] = useState(false);
  
  // Track which policies are expanded (by index)
  const [expandedPolicies, setExpandedPolicies] = useState<Set<number>>(() => new Set([0]));
  
  // Track custom names for policies (by index)
  const [policyNames, setPolicyNames] = useState<Record<number, string>>({});

  // Get policy plugins from config
  const policyPlugins = config.plugins.filter(
    (p) => typeof p === 'object' && p.id === 'policy',
  ) as Array<{ id: string; config: { policy: string } }>;

  // Always show at least one empty policy if none exist
  const policies =
    policyPlugins.length > 0
      ? policyPlugins.map((p) => p.config.policy)
      : [''];

  const handlePolicyChange = useCallback(
    (index: number, newValue: string) => {
      const otherPlugins = config.plugins.filter((p) =>
        typeof p === 'string' ? true : p.id !== 'policy',
      );

      const updatedPolicies = [...policies];
      updatedPolicies[index] = newValue;

      // Filter out empty policies for storage
      const nonEmptyPolicies = updatedPolicies
        .filter((policy) => policy.trim() !== '')
        .map((policy) => ({
          id: 'policy',
          config: { policy },
        }));

      updateConfig('plugins', [...otherPlugins, ...nonEmptyPolicies]);
    },
    [config.plugins, policies, updateConfig],
  );

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

    updateConfig('plugins', [...otherPlugins, ...newPolicies]);
    
    // Expand the newly added policy
    setExpandedPolicies((prev) => new Set([...prev, newPolicies.length - 1]));
  };

  const handleRemovePolicy = (index: number) => {
    const otherPlugins = config.plugins.filter((p) =>
      typeof p === 'string' ? true : p.id !== 'policy',
    );

    const updatedPolicies = policies
      .filter((_, i) => i !== index)
      .filter((policy) => policy.trim() !== '')
      .map((policy) => ({
        id: 'policy',
        config: { policy },
      }));

    updateConfig('plugins', [...otherPlugins, ...updatedPolicies]);
    
    // Clean up UI state for removed policy
    setPolicyNames((prev) => {
      const newNames = { ...prev };
      delete newNames[index];
      // Adjust indices for policies after the removed one
      const adjusted: Record<number, string> = {};
      Object.entries(newNames).forEach(([key, value]) => {
        const oldIndex = Number.parseInt(key);
        if (oldIndex > index) {
          adjusted[oldIndex - 1] = value;
        } else {
          adjusted[oldIndex] = value;
        }
      });
      return adjusted;
    });
    
    setExpandedPolicies((prev) => {
      const newExpanded = new Set<number>();
      prev.forEach((i) => {
        if (i < index) {
          newExpanded.add(i);
        } else if (i > index) {
          newExpanded.add(i - 1);
        }
      });
      return newExpanded;
    });
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

  const handleGenerateTestCase = async (index: number) => {
    const policy = policies[index];
    if (!policy || !policy.trim()) {
      toast.showToast('Please enter a policy before generating a test case', 'warning');
      return;
    }

    setGeneratingPolicyIndex(index);
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
            policy: policy,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate test case');
      }

      const data = await response.json();
      setGeneratedTestCase({
        prompt: data.prompt || '',
        context: data.context || policy,
      });
    } catch (error) {
      console.error('Error generating test case:', error);
      toast.showToast(
        `Failed to generate test case: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
      setTestCaseDialogOpen(false);
    } finally {
      setGeneratingTestCase(false);
    }
  };

  const handleCloseTestCaseDialog = () => {
    setTestCaseDialogOpen(false);
    setGeneratingPolicyIndex(null);
    setGeneratedTestCase(null);
    setGeneratingTestCase(false);
  };

  const toggleExpanded = (index: number) => {
    setExpandedPolicies((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const getPolicyName = (index: number) => {
    return policyNames[index] || `Custom Policy ${index + 1}`;
  };

  const setPolicyName = (index: number, name: string) => {
    setPolicyNames((prev) => ({ ...prev, [index]: name }));
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
        {policies.map((policy, index) => (
          <Box
            key={index}
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
                value={getPolicyName(index)}
                onChange={(e) => setPolicyName(index, e.target.value)}
                size="small"
                fullWidth
              />
              <TestCaseGenerateButton
                onClick={() => handleGenerateTestCase(index)}
                disabled={generatingTestCase && generatingPolicyIndex === index}
                isGenerating={generatingTestCase && generatingPolicyIndex === index}
              />
              <IconButton
                onClick={() => handleRemovePolicy(index)}
                color="error"
                disabled={policies.length === 1 && !policy.trim()}
              >
                <DeleteIcon />
              </IconButton>
              <IconButton onClick={() => toggleExpanded(index)}>
                {expandedPolicies.has(index) ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            </Box>

            <Collapse in={expandedPolicies.has(index)}>
              <Box sx={{ mt: 2 }}>
                <PolicyInput index={index} value={policy} onChange={handlePolicyChange} />
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
        mode="result"
      />
    </Box>
  );
};
