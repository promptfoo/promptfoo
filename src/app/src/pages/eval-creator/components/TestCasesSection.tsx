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

interface ParsedTestCaseImport {
  isYaml: boolean;
  skippedCount: number;
  testCases: TestCase[];
}

interface PendingTestCaseImport {
  fileName: string;
  skippedCount: number;
  testCases: TestCase[];
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

async function parseImportedTestCases(
  fileName: string,
  text: string,
): Promise<ParsedTestCaseImport> {
  if (fileName.endsWith('.csv')) {
    const { parse: parseCsv } = await import('csv-parse/browser/esm/sync');
    const rows: CsvRow[] = parseCsv(text, { columns: true });
    return {
      isYaml: false,
      skippedCount: 0,
      testCases: rows.map((row) => testCaseFromCsvRow(row) as TestCase),
    };
  }

  const yaml = await import('js-yaml');
  const parsedYaml = yaml.load(text);

  if (Array.isArray(parsedYaml)) {
    const validTestCases = parsedYaml.filter(isValidTestCase);
    if (validTestCases.length === 0) {
      throw new Error(
        'No valid test cases found in YAML file. Please ensure test cases have proper structure.',
      );
    }
    return {
      isYaml: true,
      skippedCount: parsedYaml.length - validTestCases.length,
      testCases: validTestCases,
    };
  }

  if (parsedYaml && isValidTestCase(parsedYaml)) {
    return { isYaml: true, skippedCount: 0, testCases: [parsedYaml] };
  }

  throw new Error(
    'Invalid YAML format. Expected an array of test cases or a single test case object with valid structure.',
  );
}

function getImportErrorMessage(fileName: string, error: unknown): string {
  if (fileName.endsWith('.csv')) {
    return 'Failed to parse CSV file. Please ensure it has valid CSV format with headers.';
  }

  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  if (errorMessage.includes('Invalid YAML') || errorMessage.includes('No valid test cases')) {
    return errorMessage;
  }

  return 'Failed to parse YAML file. Please ensure it contains valid YAML syntax.';
}

const DEFAULT_STARTER_VALUES: Record<string, string> = {
  animal: 'penguin',
  location: 'tropical island',
};

function getStarterExample(varsList: string[]): TestCase {
  const starterVars = varsList.length > 0 ? varsList : ['animal', 'location'];
  const vars = Object.fromEntries(
    starterVars.map((variable) => [
      variable,
      DEFAULT_STARTER_VALUES[variable] ?? `example ${variable.replace(/_/g, ' ')}`,
    ]),
  );
  const isStoryStarter =
    starterVars.length === 2 && starterVars.includes('animal') && starterVars.includes('location');

  return {
    description: isStoryStarter ? 'Fun animal adventure story' : 'Starter example',
    vars,
    assert: [
      {
        type: 'contains-any',
        value: isStoryStarter
          ? ['penguin', 'adventure', 'tropical', 'island']
          : Object.values(vars),
      },
    ],
  };
}

const TestCasesSection = ({ varsList, onOpenYamlEditor }: TestCasesSectionProps) => {
  const { config, updateConfig } = useStore();
  const rawTests = config.tests;
  const defaultTest =
    config.defaultTest &&
    typeof config.defaultTest === 'object' &&
    !Array.isArray(config.defaultTest)
      ? (config.defaultTest as TestCase)
      : undefined;
  const defaultTestVars = Object.keys(defaultTest?.vars || {});
  const canEditInlineTests =
    rawTests === undefined || (Array.isArray(rawTests) && rawTests.every(isInlineTestCase));
  const testCases = canEditInlineTests ? ((rawTests || []) as TestCase[]) : [];
  const setTestCases = (cases: TestCase[]) => updateConfig({ tests: cases });
  const [editingTestCaseIndex, setEditingTestCaseIndex] = React.useState<number | null>(null);
  const [testCaseDialogOpen, setTestCaseDialogOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [testCaseToDelete, setTestCaseToDelete] = React.useState<number | null>(null);
  const [pendingImport, setPendingImport] = React.useState<PendingTestCaseImport | null>(null);
  const testCaseFileInputRef = React.useRef<HTMLInputElement>(null);
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
      const isYamlFile = fileName.endsWith('.yaml') || fileName.endsWith('.yml');
      if (!fileName.endsWith('.csv') && !isYamlFile) {
        showToast(
          'Unsupported file type. Please upload a CSV (.csv) or YAML (.yaml, .yml) file.',
          'error',
        );
        event.target.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = async (e) => {
        const text = e.target?.result?.toString();
        if (!text || text.trim() === '') {
          showToast('The file appears to be empty. Please select a file with content.', 'error');
          event.target.value = '';
          return;
        }

        try {
          const parsedImport = await parseImportedTestCases(fileName, text);
          let newTestCases = parsedImport.testCases;

          if (newTestCases.length === 0) {
            showToast('No test cases found in the file.', 'warning');
            event.target.value = '';
            return;
          }

          if (parsedImport.isYaml) {
            newTestCases = newTestCases.map((tc, idx) => ({
              ...tc,
              description: tc.description || `Test Case #${testCases.length + idx + 1}`,
            }));
          }

          setPendingImport({
            fileName: file.name,
            skippedCount: parsedImport.skippedCount,
            testCases: newTestCases,
          });
        } catch (error) {
          console.error('Error parsing file:', error);
          showToast(getImportErrorMessage(fileName, error), 'error');
        }

        event.target.value = '';
      };
      reader.onerror = () => {
        showToast('Unable to read this file. Please try again or choose another file.', 'error');
        event.target.value = '';
      };
      reader.readAsText(file);
    }
  };

  const confirmImport = () => {
    if (!pendingImport) {
      return;
    }

    setTestCases([...testCases, ...pendingImport.testCases]);
    if (pendingImport.skippedCount > 0) {
      showToast(
        `Warning: ${pendingImport.skippedCount} invalid test cases were skipped.`,
        'warning',
      );
    }
    showToast(
      `Successfully imported ${pendingImport.testCases.length} test case${pendingImport.testCases.length === 1 ? '' : 's'}`,
      'success',
    );
    setPendingImport(null);
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
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => testCaseFileInputRef.current?.click()}
                >
                  <UploadIcon className="mr-2 size-4" />
                  Import CSV or YAML
                </Button>
                <input
                  ref={testCaseFileInputRef}
                  type="file"
                  accept=".csv,.yaml,.yml"
                  onChange={handleAddTestCaseFromFile}
                  className="hidden"
                  aria-label="Upload test cases from CSV or YAML"
                />
              </div>

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
                    setTestCases([...testCases, getStarterExample(varsList)]);
                  }}
                >
                  Add Starter Example
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      {canEditInlineTests && testCases.length === 0 && (
        <p className="text-sm text-muted-foreground">
          The starter example uses your prompt variables when available and a deterministic text
          check. Add model-graded assertions later for subjective quality checks; those may add
          cost.
        </p>
      )}

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
                  const missingVars = varsList.filter(
                    (v) => !testCaseVars.includes(v) && !defaultTestVars.includes(v),
                  );
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

      <Dialog
        open={pendingImport !== null}
        onOpenChange={(open) => !open && setPendingImport(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Import {pendingImport?.testCases.length ?? 0} test case
              {pendingImport?.testCases.length === 1 ? '' : 's'}?
            </DialogTitle>
            <DialogDescription>
              {pendingImport?.fileName} will be added to your existing {testCases.length} test case
              {testCases.length === 1 ? '' : 's'}. Each test case runs across every prompt and
              provider, so larger imports increase requests and potential cost.
            </DialogDescription>
          </DialogHeader>
          {pendingImport && pendingImport.skippedCount > 0 && (
            <Alert variant="warning">
              <AlertContent>
                <AlertTitle>Some entries will not be imported</AlertTitle>
                <AlertDescription>
                  {pendingImport.skippedCount} invalid test case
                  {pendingImport.skippedCount === 1 ? ' was' : 's were'} skipped while reading this
                  file.
                </AlertDescription>
              </AlertContent>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingImport(null)}>
              Cancel
            </Button>
            <Button onClick={confirmImport}>
              Import {pendingImport?.testCases.length ?? 0} test case
              {pendingImport?.testCases.length === 1 ? '' : 's'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
