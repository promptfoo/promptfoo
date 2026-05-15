import React from 'react';

import { Button } from '@app/components/ui/button';
import { Card, CardContent } from '@app/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@app/components/ui/dialog';
import { DropdownMenuItem, DropdownMenuItemIcon } from '@app/components/ui/dropdown-menu';
import invariant from '@promptfoo/util/invariant';
import { removeEmpty } from '@promptfoo/util/objectUtils';
import yaml from 'js-yaml';
import { CheckCircle, Copy, Download, Loader2 } from 'lucide-react';
import { DownloadFormat, downloadBlob, useDownloadEval } from '../../../hooks/useDownloadEval';
import { useToast } from '../../../hooks/useToast';
import { fetchEvalConfig, fetchEvalResultDetail, prefetchEvalConfig } from '../../../utils/api';
import { useTableStore as useResultsViewStore } from './store';
import type { EvaluateTableOutput, EvaluateTableRow, UnifiedConfig } from '@promptfoo/types';
import type { EvalResultDetailResponse } from '@promptfoo/types/api/eval';

const DETAIL_EXPORT_CONCURRENCY = 8;

// Server placeholder emitted by stripOversizedStrings when a string exceeds the
// oversized-string limit. Used to detect cells that need full detail hydration
// instead of falling back to the lean table value.
const OVERSIZED_PLACEHOLDER_RE = /^\[content omitted: \d+ characters\]$/;

function hasPlaceholder(value: unknown): boolean {
  if (typeof value === 'string') {
    return OVERSIZED_PLACEHOLDER_RE.test(value);
  }
  if (Array.isArray(value)) {
    return value.some(hasPlaceholder);
  }
  return false;
}

type AdvancedExportName = 'failed-tests' | 'dpo' | 'human-eval' | 'burp';

async function mapWithConcurrency<T, U>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<U>,
): Promise<U[]> {
  const results = new Array<U>(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}

interface DownloadMenuItemProps {
  onClick: () => void;
}

/**
 * Menu item that triggers the download dialog.
 */
export function DownloadMenuItem({ onClick }: DownloadMenuItemProps) {
  return (
    <DropdownMenuItem onSelect={onClick}>
      <DropdownMenuItemIcon>
        <Download className="size-4" />
      </DropdownMenuItemIcon>
      Download
    </DropdownMenuItem>
  );
}

interface CommandBlockProps {
  fileName: string;
  helpText?: string;
  isDownloaded: boolean;
  onCopy: (commandText: string) => void;
}

function CommandBlock({ fileName, helpText, isDownloaded, onCopy }: CommandBlockProps) {
  const commandText = `promptfoo eval -c ${fileName}`;

  return (
    <div className="mt-4 p-4 bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.08] dark:border-white/[0.08] rounded-lg">
      {helpText && (
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-muted-foreground">{helpText}</span>
          {isDownloaded && (
            <div className="flex items-center">
              <CheckCircle className="size-4 text-emerald-500 mr-1" />
              <span className="text-sm font-medium text-emerald-500">Downloaded</span>
            </div>
          )}
        </div>
      )}
      <div className="flex flex-col items-stretch gap-2 rounded-md border border-black/15 bg-white/80 p-3 dark:border-white/15 dark:bg-black/40 sm:flex-row sm:items-center">
        <code className="flex-1 font-mono text-sm font-medium">{commandText}</code>
        <button
          type="button"
          onClick={() => onCopy(commandText)}
          className="self-end rounded p-1 text-primary transition-colors hover:bg-primary/15 sm:ml-2 sm:self-auto"
          aria-label="Copy command"
        >
          <Copy className="size-4" />
        </button>
      </div>
    </div>
  );
}

interface DownloadDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Dialog that lets users export evaluation data (configuration files, table exports, and advanced formats),
 * copy related CLI commands, and track downloaded files.
 */
export function DownloadDialog({ open, onClose }: DownloadDialogProps) {
  const { table, config, evalId } = useResultsViewStore();
  const [downloadedFiles, setDownloadedFiles] = React.useState<Set<string>>(new Set());
  const [isDownloadingConfig, setIsDownloadingConfig] = React.useState(false);
  const [advancedExportInProgress, setAdvancedExportInProgress] =
    React.useState<AdvancedExportName | null>(null);
  const [advancedExportProgress, setAdvancedExportProgress] = React.useState<{
    current: number;
    total: number;
  } | null>(null);
  const detailHydrationFailuresRef = React.useRef(0);
  const { showToast } = useToast();

  // Use the new hooks for CSV and JSON downloads
  const { download: downloadCsvApi, isLoading: isLoadingCsv } = useDownloadEval(
    DownloadFormat.CSV,
    {
      onSuccess: (fileName) => setDownloadedFiles((prev) => new Set([...prev, fileName])),
    },
  );
  const { download: downloadJsonApi, isLoading: isLoadingJson } = useDownloadEval(
    DownloadFormat.JSON,

    {
      onSuccess: (fileName) => setDownloadedFiles((prev) => new Set([...prev, fileName])),
    },
  );

  const openDownloadDialog = (blob: Blob, downloadName: string) => {
    downloadBlob(blob, downloadName);
    setDownloadedFiles((prev) => new Set([...prev, downloadName]));
  };

  const handleClose = () => {
    onClose();
    // Reset download states when dialog is closed
    setDownloadedFiles(new Set());
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        showToast('Command copied to clipboard', 'success');
      })
      .catch((err) => {
        console.error('Failed to copy text: ', err);
        showToast('Failed to copy command', 'error');
      });
  };

  /**
   * Helper function to download YAML configuration
   * @param configToDownload Configuration object to download
   * @param fileName Name of the downloaded file
   * @param successMessage Message to show in the success toast
   * @param options Additional options (skipInvalid for yaml.dump)
   */
  const downloadYamlConfig = (
    configToDownload: Partial<UnifiedConfig>,
    fileName: string,
    successMessage: string,
    options: { skipInvalid?: boolean } = {},
  ) => {
    const schemaLine = '# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json\n';

    // Clean top-level empty properties
    const cleanConfig = removeEmpty(configToDownload);

    // Convert to YAML
    const configData = yaml.dump(cleanConfig, options);

    // Create the blob and download
    const mimeType = 'text/yaml;charset=utf-8';
    const blob = new Blob([schemaLine + configData], { type: mimeType });
    openDownloadDialog(blob, fileName);
    showToast(successMessage, 'success');
    // No longer closing the dialog after download
  };

  const getFilename = (suffix: string): string => {
    invariant(evalId, 'evalId is required for file downloads');

    return `${evalId}-${suffix}`;
  };

  const prefetchFullConfig = React.useCallback(() => {
    if (evalId) {
      void prefetchEvalConfig(evalId);
    }
  }, [evalId]);

  const setExportProgressTotal = (total: number) => {
    setAdvancedExportProgress(total > 0 ? { current: 0, total } : null);
  };

  const incrementExportProgress = () => {
    setAdvancedExportProgress((progress) =>
      progress
        ? {
            current: Math.min(progress.current + 1, progress.total),
            total: progress.total,
          }
        : progress,
    );
  };

  const getAdvancedExportLabel = (
    exportName: AdvancedExportName,
    idleLabel: string,
    activeLabel: string,
  ) => {
    if (advancedExportInProgress !== exportName) {
      return idleLabel;
    }

    if (advancedExportProgress && advancedExportProgress.total > 0) {
      return `${activeLabel} ${advancedExportProgress.current}/${advancedExportProgress.total}...`;
    }

    return `${activeLabel}...`;
  };

  const getDownloadIcon = (active: boolean) =>
    active ? (
      <Loader2 className="size-4 mr-2 animate-spin" />
    ) : (
      <Download className="size-4 mr-2" />
    );

  const getOutputDetail = async (
    output?: EvaluateTableOutput | null,
  ): Promise<EvalResultDetailResponse | null> => {
    if (!evalId || !output?.id || output.detail?.available === false) {
      return null;
    }

    try {
      return await fetchEvalResultDetail(output.evalId || evalId, output.id);
    } catch {
      detailHydrationFailuresRef.current += 1;
      return null;
    }
  };

  const getFirstOutput = (row: EvaluateTableRow): EvaluateTableOutput | null =>
    row.outputs.find((output): output is EvaluateTableOutput => Boolean(output)) ?? null;

  const getFullConfigTest = (
    fullConfig: Partial<UnifiedConfig>,
    row: EvaluateTableRow,
  ): EvaluateTableRow['test'] | undefined => {
    if (!Array.isArray(fullConfig.tests) || !Number.isInteger(row.testIdx)) {
      return undefined;
    }

    const test = fullConfig.tests[row.testIdx];
    if (test && typeof test === 'object' && !Array.isArray(test)) {
      return test as EvaluateTableRow['test'];
    }

    return undefined;
  };

  const getRowVars = (
    row: EvaluateTableRow,
    detail?: EvalResultDetailResponse | null,
  ): Record<string, unknown> => {
    const detailVars = detail?.testCase?.vars;
    if (detailVars && typeof detailVars === 'object' && !Array.isArray(detailVars)) {
      return detailVars as Record<string, unknown>;
    }

    if (row.test?.vars) {
      return row.test.vars as Record<string, unknown>;
    }

    return Object.fromEntries(
      (table?.head.vars ?? []).map((varName, idx) => [varName, row.vars[idx]]),
    );
  };

  const runAdvancedExport = async (exportName: AdvancedExportName, action: () => Promise<void>) => {
    if (advancedExportInProgress) {
      return;
    }

    setAdvancedExportInProgress(exportName);
    setAdvancedExportProgress(null);
    detailHydrationFailuresRef.current = 0;
    try {
      await action();
      const detailHydrationFailures = detailHydrationFailuresRef.current;
      if (detailHydrationFailures > 0) {
        showToast(
          `Export used table data for ${detailHydrationFailures} result${
            detailHydrationFailures === 1 ? '' : 's'
          } because full result details could not be loaded.`,
          'warning',
        );
      }
    } catch (error) {
      showToast(
        `Failed to export ${exportName.replace('-', ' ')}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        'error',
      );
    } finally {
      setAdvancedExportInProgress(null);
      setAdvancedExportProgress(null);
    }
  };

  const downloadConfig = async () => {
    if (!evalId || !config) {
      showToast('No evaluation ID or configuration available', 'error');
      return;
    }
    setIsDownloadingConfig(true);
    try {
      const { config: fullConfig } = await fetchEvalConfig(evalId);
      const fileName = getFilename('config.yaml');
      downloadYamlConfig(fullConfig, fileName, 'Configuration downloaded successfully');
    } catch (error) {
      showToast(
        `Failed to download configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
    } finally {
      setIsDownloadingConfig(false);
    }
  };

  const downloadFailedTestsConfig = async () => {
    if (!config || !table) {
      showToast('No configuration or results available', 'error');
      return;
    }

    if (!evalId) {
      showToast('No evaluation ID', 'error');
      return;
    }

    await runAdvancedExport('failed-tests', async () => {
      const failedRows = table.body.filter((row) => row.outputs.some((output) => !output?.pass));

      if (failedRows.length === 0) {
        showToast('No failed tests found', 'info');
        return;
      }

      setExportProgressTotal(failedRows.length);

      const { config: fullConfig } = await fetchEvalConfig(evalId);
      const failedTests = await mapWithConcurrency(
        failedRows,
        DETAIL_EXPORT_CONCURRENCY,
        async (row) => {
          try {
            const failedOutput =
              row.outputs.find((output): output is EvaluateTableOutput =>
                Boolean(output && !output.pass),
              ) ?? getFirstOutput(row);
            const detail = await getOutputDetail(failedOutput);
            return detail?.testCase ?? getFullConfigTest(fullConfig, row) ?? row.test;
          } finally {
            incrementExportProgress();
          }
        },
      );

      const configCopy = { ...fullConfig, tests: failedTests };
      const fileName = getFilename('failed-tests.yaml');

      downloadYamlConfig(
        configCopy,
        fileName,
        `Downloaded config with ${failedTests.length} failed tests`,
        { skipInvalid: true },
      );
    });
  };

  const downloadDpoJson = async () => {
    if (!table) {
      showToast('No table data', 'error');
      return;
    }
    if (!evalId) {
      showToast('No evaluation ID', 'error');
      return;
    }

    await runAdvancedExport('dpo', async () => {
      setExportProgressTotal(table.body.reduce((total, row) => total + row.outputs.length, 0));

      const formattedData = await mapWithConcurrency(
        table.body,
        DETAIL_EXPORT_CONCURRENCY,
        async (row) => {
          // Only hit the detail endpoint for cells where the lean payload was
          // trimmed (oversized text or var value) — otherwise the table data
          // is already the full value.
          const rowNeedsDetail = hasPlaceholder(row.vars);
          const details = await Promise.all(
            row.outputs.map(async (output) => {
              try {
                if (!rowNeedsDetail && !hasPlaceholder(output?.text)) {
                  return null;
                }
                return await getOutputDetail(output);
              } finally {
                incrementExportProgress();
              }
            }),
          );
          const getOutputText = (output: EvaluateTableOutput, idx: number) =>
            details[idx]?.text ?? output.text ?? '';
          const firstDetail = details.find(Boolean);

          return {
            chosen: row.outputs
              .map((output, idx) => (output?.pass ? getOutputText(output, idx) : null))
              .filter((text): text is string => text != null),
            rejected: row.outputs
              .map((output, idx) => (output && !output.pass ? getOutputText(output, idx) : null))
              .filter((text): text is string => text != null),
            vars: getRowVars(row, firstDetail),
            providers: table.head.prompts.map((prompt) => prompt.provider),
            prompts: table.head.prompts.map(
              (prompt) => prompt.label || prompt.display || prompt.raw,
            ),
          };
        },
      );
      const blob = new Blob([JSON.stringify(formattedData, null, 2)], { type: 'application/json' });
      openDownloadDialog(blob, getFilename('dpo.json'));
      handleClose();
    });
  };

  const downloadTable = async () => {
    if (!evalId) {
      showToast('No evaluation ID', 'error');
      return;
    }
    try {
      await downloadJsonApi(evalId);
    } catch {
      // Error is already handled by the hook
    }
  };

  const downloadCsv = async () => {
    if (!evalId) {
      showToast('No evaluation ID', 'error');
      return;
    }
    try {
      await downloadCsvApi(evalId);
    } catch {
      // Error is already handled by the hook
    }
  };

  const downloadHumanEvalTestCases = async () => {
    if (!table) {
      showToast('No table data', 'error');
      return;
    }
    if (!evalId) {
      showToast('No evaluation ID', 'error');
      return;
    }

    await runAdvancedExport('human-eval', async () => {
      const rowsWithOutputs = table.body.filter((row) =>
        row.outputs.some((output) => output != null),
      );
      setExportProgressTotal(rowsWithOutputs.length);
      const humanEvalCases = await mapWithConcurrency(
        rowsWithOutputs,
        DETAIL_EXPORT_CONCURRENCY,
        async (row) => {
          const output = getFirstOutput(row);
          try {
            const detail = await getOutputDetail(output);
            const outputText = detail?.text ?? output?.text ?? '';
            const metadata = detail?.metadata ?? output?.metadata;

            return {
              vars: {
                ...getRowVars(row, detail),
                output: outputText.includes('---') ? outputText.split('---\n')[1] : outputText,
                redteamFinalPrompt: metadata?.redteamFinalPrompt,
                ...(output?.gradingResult?.comment
                  ? { comment: output.gradingResult.comment }
                  : {}),
              },
              assert: [
                {
                  type: 'javascript',
                  value: `${output?.pass ? '' : '!'}JSON.parse(output).pass`,
                },
              ],
              metadata: detail?.testCase?.metadata ?? row.test.metadata,
            };
          } finally {
            incrementExportProgress();
          }
        },
      );

      const yamlContent = yaml.dump(humanEvalCases);
      const blob = new Blob([yamlContent], { type: 'application/x-yaml' });
      openDownloadDialog(blob, getFilename('human-eval-cases.yaml'));
      handleClose();
    });
  };

  const downloadBurpPayloads = async () => {
    if (!table) {
      showToast('No table data', 'error');
      return;
    }

    if (!config?.redteam) {
      showToast('No redteam config', 'error');
      return;
    }

    if (!evalId) {
      showToast('No evaluation ID', 'error');
      return;
    }

    const varName = config.redteam.injectVar || 'prompt';
    await runAdvancedExport('burp', async () => {
      setExportProgressTotal(table.body.length);
      const payloads = await mapWithConcurrency(
        table.body,
        DETAIL_EXPORT_CONCURRENCY,
        async (row) => {
          try {
            // Burp only needs the injectVar value; fetch detail only when the
            // lean row value is a placeholder (trimmed by the server).
            const detail = hasPlaceholder(row.vars)
              ? await getOutputDetail(getFirstOutput(row))
              : null;
            const vars = getRowVars(row, detail);
            return String(vars?.[varName] || '');
          } finally {
            incrementExportProgress();
          }
        },
      );
      const encodedPayloads = payloads.filter(Boolean).map((input) => {
        const jsonEscaped = JSON.stringify(input).slice(1, -1); // Remove surrounding quotes
        return encodeURIComponent(jsonEscaped);
      });

      const uniquePayloads = [...new Set(encodedPayloads)];

      const content = uniquePayloads.join('\n');
      const blob = new Blob([content], { type: 'text/plain' });
      openDownloadDialog(blob, getFilename('burp-payloads.burp'));
      handleClose();
    });
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Download Options</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          {/* Configuration Files Section */}
          <Card className="border border-border">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-4">Configuration Files</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="h-full">
                  <p className="text-sm text-muted-foreground mb-4">
                    Complete configuration file for this evaluation
                  </p>
                  <Button
                    onClick={downloadConfig}
                    className="w-full mb-2"
                    onFocus={prefetchFullConfig}
                    onMouseEnter={prefetchFullConfig}
                    disabled={isDownloadingConfig}
                  >
                    {getDownloadIcon(isDownloadingConfig)}
                    {isDownloadingConfig ? 'Downloading...' : 'Download YAML Config'}
                  </Button>
                  {evalId && (
                    <CommandBlock
                      fileName={getFilename('config.yaml')}
                      helpText="Run this command to execute the eval again:"
                      isDownloaded={downloadedFiles.has(getFilename('config.yaml'))}
                      onCopy={copyToClipboard}
                    />
                  )}
                </div>

                <div className="h-full">
                  <p className="text-sm text-muted-foreground mb-4">
                    Configuration with only failed tests for focused debugging
                  </p>
                  <Button
                    onClick={downloadFailedTestsConfig}
                    variant="outline"
                    className="w-full mb-2"
                    onFocus={prefetchFullConfig}
                    onMouseEnter={prefetchFullConfig}
                    disabled={
                      !table ||
                      !table.body ||
                      table.body.every((row) => row.outputs.every((output) => output?.pass)) ||
                      advancedExportInProgress !== null
                    }
                  >
                    {getDownloadIcon(advancedExportInProgress === 'failed-tests')}
                    {getAdvancedExportLabel('failed-tests', 'Download Failed Tests', 'Downloading')}
                  </Button>
                  {evalId && (
                    <CommandBlock
                      fileName={getFilename('failed-tests.yaml')}
                      helpText="Run this command to re-run just the failed tests:"
                      isDownloaded={downloadedFiles.has(getFilename('failed-tests.yaml'))}
                      onCopy={copyToClipboard}
                    />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Table Data Section */}
          <Card className="border border-border">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-2">Export Results</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Export evaluation results in standard formats for further analysis or reporting.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Button
                  onClick={downloadCsv}
                  variant="outline"
                  className="h-12"
                  disabled={isLoadingCsv}
                >
                  {getDownloadIcon(isLoadingCsv)}
                  {isLoadingCsv ? 'Downloading...' : 'Download Results CSV'}
                </Button>

                <Button
                  onClick={downloadTable}
                  variant="outline"
                  className="h-12"
                  disabled={isLoadingJson}
                >
                  {getDownloadIcon(isLoadingJson)}
                  {isLoadingJson ? 'Downloading...' : 'Download Results JSON'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Advanced Options Section */}
          <Card className="border border-border">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-2">Advanced Exports</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Specialized formats for security testing, machine learning training, and human
                evaluation workflows.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Button
                  onClick={downloadBurpPayloads}
                  variant="outline"
                  className="h-12"
                  disabled={advancedExportInProgress !== null}
                >
                  {getDownloadIcon(advancedExportInProgress === 'burp')}
                  {getAdvancedExportLabel('burp', 'Burp Payloads', 'Exporting')}
                </Button>

                <Button
                  onClick={downloadDpoJson}
                  variant="outline"
                  className="h-12"
                  disabled={advancedExportInProgress !== null}
                >
                  {getDownloadIcon(advancedExportInProgress === 'dpo')}
                  {getAdvancedExportLabel('dpo', 'DPO JSON', 'Exporting')}
                </Button>

                <Button
                  onClick={downloadHumanEvalTestCases}
                  variant="outline"
                  className="h-12"
                  disabled={advancedExportInProgress !== null}
                >
                  {getDownloadIcon(advancedExportInProgress === 'human-eval')}
                  {getAdvancedExportLabel('human-eval', 'Human Eval YAML', 'Exporting')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
