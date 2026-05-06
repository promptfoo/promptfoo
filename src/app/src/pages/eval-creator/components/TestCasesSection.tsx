import React from 'react';

import { Alert, AlertContent, AlertDescription, AlertTitle } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import {
  AlertTriangleIcon,
  ContentCopyIcon,
  DeleteIcon,
  EditIcon,
  UploadIcon,
} from '@app/components/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { useToast } from '@app/hooks/useToast';
import { cn } from '@app/lib/utils';
import { useStore } from '@app/stores/evalConfig';
import { testCaseFromCsvRow } from '@promptfoo/csv';
import TestCaseDialog from './TestCaseDialog';
import type { CsvRow, TestCase, TestGeneratorConfig } from '@promptfoo/types';

interface TestCasesSectionProps {
  varsList: string[];
  onOpenYamlEditor?: () => void;
}

// Validation function for TestCase structure
function isValidTestCase(obj: unknown): obj is TestCase {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const testCase = obj as Record<string, unknown>;

  // Check required structure - vars should be an object if present
  if (testCase.vars && typeof testCase.vars !== 'object') {
    return false;
  }

  // Check assert array if present
  if (testCase.assert && !Array.isArray(testCase.assert)) {
    return false;
  }

  // Check options if present
  if (testCase.options && typeof testCase.options !== 'object') {
    return false;
  }

  return true;
}

function isTestGeneratorConfig(obj: unknown): obj is TestGeneratorConfig {
  return obj !== null && typeof obj === 'object' && 'path' in obj;
}

function isInlineTestCase(obj: unknown): obj is TestCase {
  return isValidTestCase(obj) && !isTestGeneratorConfig(obj);
}

const getManagedTestsLabel = (tests: unknown): string => {
  if (typeof tests === 'string') {
    return tests;
  }

  if (Array.isArray(tests)) {
    return `${tests.length} YAML test entr${tests.length === 1 ? 'y' : 'ies'}`;
  }

  if (isTestGeneratorConfig(tests) && typeof tests.path === 'string') {
    return tests.path;
  }

  return 'YAML test configuration';
};

const TestCasesSection = ({ varsList, onOpenYamlEditor }: TestCasesSectionProps) => {
  const { config, updateConfig } = useStore();
  const rawTests = config.tests;
  const canEditInlineTests =
    rawTests === undefined || (Array.isArray(rawTests) && rawTests.every(isInlineTestCase));
  const testCases = canEditInlineTests ? ((rawTests || []) as TestCase[]) : [];
  const setTestCases = (cases: TestCase[]) => updateConfig({ tests: cases });
  const [editingTestCaseIndex, setEditingTestCaseIndex] = React.useState<number | null>(null);
  const [testCaseDialogOpen, setTestCaseDialogOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [testCaseToDelete, setTestCaseToDelete] = React.useState<number | null>(null);
  const { showToast } = useToast();

  const handleAddTestCase = (testCase: TestCase, shouldClose: boolean) => {
    if (editingTestCaseIndex === null) {
      setTestCases([...testCases, testCase]);
    } else {
      const updatedTestCases = testCases.map((tc, index) =>
        index === editingTestCaseIndex ? testCase : tc,
      );
      setTestCases(updatedTestCases);
      setEditingTestCaseIndex(null);
    }

    if (shouldClose) {
      setTestCaseDialogOpen(false);
    }
  };

  const handleAddTestCaseFromFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    event.stopPropagation();
    event.preventDefault();

    const file = event.target.files?.[0];
    if (file) {
      const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
      if (file.size > MAX_FILE_SIZE) {
        showToast('File size exceeds 50MB limit. Please use a smaller file.', 'error');
        event.target.value = ''; // Reset file input
        return;
      }

      const fileName = file.name.toLowerCase();
      const reader = new FileReader();
      reader.onload = async (e) => {
        const text = e.target?.result?.toString();
        if (!text || text.trim() === '') {
          showToast('The file appears to be empty. Please select a file with content.', 'error');
          event.target.value = ''; // Reset file input
          return;
        }

        try {
          let newTestCases: TestCase[] = [];

          if (fileName.endsWith('.csv')) {
            // Handle CSV files
            const { parse: parseCsv } = await import('csv-parse/browser/esm/sync');
            const rows: CsvRow[] = parseCsv(text, { columns: true });
            newTestCases = rows.map((row) => testCaseFromCsvRow(row) as TestCase);
          } else if (fileName.endsWith('.yaml') || fileName.endsWith('.yml')) {
            // Handle YAML files
            const yaml = await import('js-yaml');
            const parsedYaml = yaml.load(text);

            if (Array.isArray(parsedYaml)) {
              // Validate array of test cases
              const validTestCases = parsedYaml.filter(isValidTestCase);
              if (validTestCases.length === 0) {
                throw new Error(
                  'No valid test cases found in YAML file. Please ensure test cases have proper structure.',
                );
              }
              if (validTestCases.length < parsedYaml.length) {
                showToast(
                  `Warning: ${parsedYaml.length - validTestCases.length} invalid test cases were skipped.`,
                  'warning',
                );
              }
              newTestCases = validTestCases;
            } else if (parsedYaml && isValidTestCase(parsedYaml)) {
              // Single test case
              newTestCases = [parsedYaml];
            } else {
              throw new Error(
                'Invalid YAML format. Expected an array of test cases or a single test case object with valid structure.',
              );
            }
          } else {
            showToast(
              'Unsupported file type. Please upload a CSV (.csv) or YAML (.yaml, .yml) file.',
              'error',
            );
            event.target.value = ''; // Reset file input
            return;
          }

          if (newTestCases.length === 0) {
            showToast('No test cases found in the file.', 'warning');
            event.target.value = ''; // Reset file input
            return;
          }

          // Add description only for YAML files if missing
          if (fileName.endsWith('.yaml') || fileName.endsWith('.yml')) {
            newTestCases = newTestCases.map((tc, idx) => ({
              ...tc,
              description: tc.description || `Test Case #${testCases.length + idx + 1}`,
            }));
          }

          setTestCases([...testCases, ...newTestCases]);
          showToast(
            `Successfully imported ${newTestCases.length} test case${newTestCases.length === 1 ? '' : 's'}`,
            'success',
          );
        } catch (error) {
          console.error('Error parsing file:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';

          if (fileName.endsWith('.csv')) {
            showToast(
              'Failed to parse CSV file. Please ensure it has valid CSV format with headers.',
              'error',
            );
          } else if (fileName.endsWith('.yaml') || fileName.endsWith('.yml')) {
            showToast(
              errorMessage.includes('Invalid YAML') || errorMessage.includes('No valid test cases')
                ? errorMessage
                : 'Failed to parse YAML file. Please ensure it contains valid YAML syntax.',
              'error',
            );
          }
        }

        // Reset file input
        event.target.value = '';
      };
      reader.readAsText(file);
    }
  };

  const handleRemoveTestCase = (event: React.MouseEvent, index: number) => {
    event.stopPropagation();
    setTestCaseToDelete(index);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteTestCase = () => {
    if (testCaseToDelete !== null) {
      setTestCases(testCases.filter((_, i) => i !== testCaseToDelete));
      setTestCaseToDelete(null);
    }
    setDeleteDialogOpen(false);
  };

  const cancelDeleteTestCase = () => {
    setTestCaseToDelete(null);
    setDeleteDialogOpen(false);
  };

  const handleDuplicateTestCase = (event: React.MouseEvent, index: number) => {
    event.stopPropagation();
    const duplicatedTestCase = JSON.parse(JSON.stringify(testCases[index]));
    setTestCases([...testCases, duplicatedTestCase]);
  };

  return (
    <div className="space-y-4">
      {!canEditInlineTests && (
        <Alert variant="info" className="flex-col items-start sm:flex-row sm:items-center">
          <AlertContent>
            <AlertTitle>Managed in YAML</AlertTitle>
            <AlertDescription>
              This test configuration is loaded from{' '}
              <code className="rounded bg-background/80 px-1 py-0.5 text-xs">
                {getManagedTestsLabel(rawTests)}
              </code>
              . Use the YAML editor to update it.
            </AlertDescription>
          </AlertContent>
          {onOpenYamlEditor && (
            <Button variant="outline" size="sm" onClick={onOpenYamlEditor}>
              Edit YAML
            </Button>
          )}
        </Alert>
      )}

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-xl font-semibold">Test Cases</h3>
        <div className="flex flex-wrap items-center gap-2">
          {canEditInlineTests && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <label className="cursor-pointer" aria-label="Upload test cases from CSV or YAML">
                    <Button variant="ghost" size="icon" asChild>
                      <span>
                        <UploadIcon className="size-4" />
                      </span>
                    </Button>
                    <input
                      type="file"
                      accept=".csv,.yaml,.yml"
                      onChange={handleAddTestCaseFromFile}
                      className="hidden"
                    />
                  </label>
                </TooltipTrigger>
                <TooltipContent>Upload test cases from CSV or YAML</TooltipContent>
              </Tooltip>

              <Button
                onClick={() => setTestCaseDialogOpen(true)}
                className="dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                Add Test Case
              </Button>

              {testCases.length === 0 && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    const exampleTestCase: TestCase = {
                      description: 'Fun animal adventure story',
                      vars: {
                        animal: 'penguin',
                        location: 'tropical island',
                      },
                      assert: [
                        {
                          type: 'contains-any',
                          value: ['penguin', 'adventure', 'tropical', 'island'],
                        },
                        {
                          type: 'llm-rubric',
                          value:
                            'Is this a fun, child-friendly story featuring a penguin on a tropical island adventure?\n\nCriteria:\n1. Does it mention a penguin as the main character?\n2. Does the story take place on a tropical island?\n3. Is it entertaining and appropriate for children?\n4. Does it have a sense of adventure?',
                        },
                      ],
                    };
                    setTestCases([...testCases, exampleTestCase]);
                  }}
                >
                  Add Example
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Test Cases Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px]">
          <thead className="bg-muted/50">
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left text-sm font-semibold">Description</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Assertions</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Variables</th>
              <th className="w-[120px] px-4 py-3 text-right text-sm font-semibold">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {canEditInlineTests ? (
              testCases.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-muted-foreground">
                    No test cases added yet.
                  </td>
                </tr>
              ) : (
                testCases.map((testCase, index) => {
                  const testCaseVars = Object.keys(testCase.vars || {});
                  const missingVars = varsList.filter((v) => !testCaseVars.includes(v));
                  const hasMissingVars = varsList.length > 0 && missingVars.length > 0;

                  return (
                    <tr
                      key={index}
                      onClick={() => {
                        setEditingTestCaseIndex(index);
                        setTestCaseDialogOpen(true);
                      }}
                      className={cn(
                        'border-b border-border cursor-pointer',
                        'hover:bg-muted/50 transition-colors',
                        hasMissingVars && 'bg-amber-50/50 dark:bg-amber-950/20',
                      )}
                    >
                      <td className="px-4 py-3 text-sm">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setEditingTestCaseIndex(index);
                            setTestCaseDialogOpen(true);
                          }}
                          aria-label={`Open test case ${index + 1} for editing`}
                          className="flex w-full items-center gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {hasMissingVars && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertTriangleIcon className="size-4 text-amber-500 shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent>
                                Missing variables: {missingVars.join(', ')}
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {hasMissingVars && (
                            <span className="sr-only">
                              Missing variables: {missingVars.join(', ')}.
                            </span>
                          )}
                          {testCase.description || (
                            <span className="text-muted-foreground italic">
                              Test Case #{index + 1}
                            </span>
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {testCase.assert?.length ? (
                          `${testCase.assert.length} assertion${testCase.assert.length === 1 ? '' : 's'}`
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                        {Object.keys(testCase.vars || {}).length > 0 ? (
                          Object.entries(testCase.vars || {})
                            .map(([k, v]) => `${k}=${v}`)
                            .join(', ')
                        ) : (
                          <span className="font-sans text-muted-foreground/60">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingTestCaseIndex(index);
                                  setTestCaseDialogOpen(true);
                                }}
                                aria-label={`Edit test case ${index + 1}`}
                              >
                                <EditIcon className="size-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(event) => handleDuplicateTestCase(event, index)}
                                aria-label={`Duplicate test case ${index + 1}`}
                              >
                                <ContentCopyIcon className="size-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Duplicate</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(event) => handleRemoveTestCase(event, index)}
                                aria-label={`Delete test case ${index + 1}`}
                              >
                                <DeleteIcon className="size-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete</TooltipContent>
                          </Tooltip>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )
            ) : (
              <tr>
                <td colSpan={4} className="p-8 text-center text-muted-foreground">
                  Test entries from YAML are not editable in the UI editor.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Test Case Dialog */}
      {canEditInlineTests && (
        <TestCaseDialog
          open={testCaseDialogOpen}
          onAdd={handleAddTestCase}
          varsList={varsList}
          initialValues={
            editingTestCaseIndex === null ? undefined : testCases[editingTestCaseIndex]
          }
          onCancel={() => {
            setEditingTestCaseIndex(null);
            setTestCaseDialogOpen(false);
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => !open && cancelDeleteTestCase()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete test case?</DialogTitle>
            <DialogDescription>
              This removes the test case from this evaluation. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={cancelDeleteTestCase}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteTestCase}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TestCasesSection;
