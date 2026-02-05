import React from 'react';

import { Button } from '@app/components/ui/button';
import { Card, CardContent } from '@app/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@app/components/ui/dialog';
import { DropdownMenuItem, DropdownMenuItemIcon } from '@app/components/ui/dropdown-menu';
import invariant from '@promptfoo/util/invariant';
import { removeEmpty } from '@promptfoo/util/objectUtils';
import yaml from 'js-yaml';
import { CheckCircle, Copy, Download } from 'lucide-react';
import { DownloadFormat, downloadBlob, useDownloadEval } from '../../../hooks/useDownloadEval';
import { useToast } from '../../../hooks/useToast';
import { useTableStore as useResultsViewStore } from './store';
import type { UnifiedConfig } from '@promptfoo/types';

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

  const downloadConfig = () => {
    if (!evalId || !config) {
      showToast('No evaluation ID or configuration available', 'error');
      return;
    }
    const fileName = getFilename('config.yaml');
    downloadYamlConfig(config, fileName, 'Configuration downloaded successfully');
  };

  const downloadFailedTestsConfig = () => {
    if (!config || !table) {
      showToast('No configuration or results available', 'error');
      return;
    }

    if (!evalId) {
      showToast('No evaluation ID', 'error');
      return;
    }

    // Find the failed tests
    const failedTests = table.body
      .filter((row) => row.outputs.some((output) => !output?.pass))
      .map((row) => row.test);

    if (failedTests.length === 0) {
      showToast('No failed tests found', 'info');
      return;
    }

    // Create a modified copy of the config with only failed tests
    const configCopy = { ...config, tests: failedTests };

    // Create the file name
    const fileName = getFilename('failed-tests.yaml');

    downloadYamlConfig(
      configCopy,
      fileName,
      `Downloaded config with ${failedTests.length} failed tests`,
      { skipInvalid: true },
    );
  };

  const downloadDpoJson = () => {
    if (!table) {
      showToast('No table data', 'error');
      return;
    }
    if (!evalId) {
      showToast('No evaluation ID', 'error');
      return;
    }
    const formattedData = table.body.map((row) => ({
      chosen: row.outputs.filter((output) => output?.pass).map((output) => output!.text),
      rejected: row.outputs.filter((output) => output && !output.pass).map((output) => output.text),
      vars: row.test.vars,
      providers: table.head.prompts.map((prompt) => prompt.provider),
      prompts: table.head.prompts.map((prompt) => prompt.label || prompt.display || prompt.raw),
    }));
    const blob = new Blob([JSON.stringify(formattedData, null, 2)], { type: 'application/json' });
    openDownloadDialog(blob, getFilename('dpo.json'));
    handleClose();
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

  const downloadHumanEvalTestCases = () => {
    if (!table) {
      showToast('No table data', 'error');
      return;
    }
    if (!evalId) {
      showToast('No evaluation ID', 'error');
      return;
    }

    const humanEvalCases = table.body
      .filter((row) => row.outputs.some((output) => output != null))
      .map((row) => ({
        vars: {
          ...row.test.vars,
          output: row.outputs[0]?.text.includes('---')
            ? row.outputs[0]!.text.split('---\n')[1]
            : (row.outputs[0]?.text ?? ''),
          redteamFinalPrompt: row.outputs[0]?.metadata?.redteamFinalPrompt,
          ...(row.outputs[0]?.gradingResult?.comment
            ? { comment: row.outputs[0]!.gradingResult!.comment }
            : {}),
        },
        assert: [
          {
            type: 'javascript',
            value: `${row.outputs[0]?.pass ? '' : '!'}JSON.parse(output).pass`,
          },
        ],
        metadata: row.test.metadata,
      }));

    const yamlContent = yaml.dump(humanEvalCases);
    const blob = new Blob([yamlContent], { type: 'application/x-yaml' });
    openDownloadDialog(blob, getFilename('human-eval-cases.yaml'));
    handleClose();
  };

  const downloadBurpPayloads = () => {
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
    const payloads = table.body
      .map((row) => {
        const vars = row.test.vars as Record<string, unknown>;
        return String(vars?.[varName] || '');
      })
      .filter(Boolean)
      .map((input) => {
        const jsonEscaped = JSON.stringify(input).slice(1, -1); // Remove surrounding quotes
        return encodeURIComponent(jsonEscaped);
      });

    const uniquePayloads = [...new Set(payloads)];

    const content = uniquePayloads.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    openDownloadDialog(blob, getFilename('burp-payloads.burp'));
    handleClose();
  };

  // Generate the command text based on filename
  const getCommandText = (fileName: string) => {
    return `promptfoo eval -c ${fileName}`;
  };

  // Create a component for the command with copy button
  const CommandBlock = ({ fileName, helpText }: { fileName: string; helpText?: string }) => {
    const commandText = getCommandText(fileName);
    const isDownloaded = downloadedFiles.has(fileName);

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
        <div className="flex items-center bg-white/80 dark:bg-black/40 border border-black/15 dark:border-white/15 rounded-md p-3">
          <code className="flex-1 font-mono text-sm font-medium">{commandText}</code>
          <button
            type="button"
            onClick={() => copyToClipboard(commandText)}
            className="ml-2 p-1 text-primary hover:bg-primary/15 rounded transition-colors"
            aria-label="Copy command"
          >
            <Copy className="size-4" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Download Options</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          {/* Configuration Files Section */}
          <Card className="border">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-4">Configuration Files</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="h-full">
                  <p className="text-sm text-muted-foreground mb-4">
                    Complete configuration file for this evaluation
                  </p>
                  <Button onClick={downloadConfig} className="w-full mb-2">
                    <Download className="size-4 mr-2" />
                    Download YAML Config
                  </Button>
                  {evalId && (
                    <CommandBlock
                      fileName={getFilename('config.yaml')}
                      helpText="Run this command to execute the eval again:"
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
                    disabled={
                      !table ||
                      !table.body ||
                      table.body.every((row) => row.outputs.every((output) => output?.pass))
                    }
                  >
                    <Download className="size-4 mr-2" />
                    Download Failed Tests
                  </Button>
                  {evalId && (
                    <CommandBlock
                      fileName={getFilename('failed-tests.yaml')}
                      helpText="Run this command to re-run just the failed tests:"
                    />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Table Data Section */}
          <Card className="border">
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
                  <Download className="size-4 mr-2" />
                  {isLoadingCsv ? 'Downloading...' : 'Download Results CSV'}
                </Button>

                <Button
                  onClick={downloadTable}
                  variant="outline"
                  className="h-12"
                  disabled={isLoadingJson}
                >
                  <Download className="size-4 mr-2" />
                  {isLoadingJson ? 'Downloading...' : 'Download Results JSON'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Advanced Options Section */}
          <Card className="border">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-2">Advanced Exports</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Specialized formats for security testing, machine learning training, and human
                evaluation workflows.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Button onClick={downloadBurpPayloads} variant="outline" className="h-12">
                  <Download className="size-4 mr-2" />
                  Burp Payloads
                </Button>

                <Button onClick={downloadDpoJson} variant="outline" className="h-12">
                  <Download className="size-4 mr-2" />
                  DPO JSON
                </Button>

                <Button onClick={downloadHumanEvalTestCases} variant="outline" className="h-12">
                  <Download className="size-4 mr-2" />
                  Human Eval YAML
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
