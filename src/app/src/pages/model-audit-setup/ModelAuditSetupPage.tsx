import { useCallback, useEffect } from 'react';

import { Alert, AlertContent, AlertDescription } from '@app/components/ui/alert';
import { Card, CardContent } from '@app/components/ui/card';
import { CheckCircleIcon, ErrorIcon, RefreshIcon, SettingsIcon } from '@app/components/ui/icons';
import { Spinner } from '@app/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { MODEL_AUDIT_ROUTES } from '@app/constants/routes';
import { callApi } from '@app/utils/api';
import { useNavigate } from 'react-router-dom';
import AdvancedOptionsDialog from '../model-audit/components/AdvancedOptionsDialog';
import ConfigurationTab from '../model-audit/components/ConfigurationTab';
import ResultsTab from '../model-audit/components/ResultsTab';
import ScannedFilesDialog from '../model-audit/components/ScannedFilesDialog';
import { useModelAuditConfigStore, useModelAuditHistoryStore } from '../model-audit/stores';

import type { ScanResult } from '../model-audit/ModelAudit.types';

export default function ModelAuditSetupPage() {
  const navigate = useNavigate();

  const {
    paths,
    scanOptions,
    isScanning,
    scanResults,
    error,
    installationStatus,
    showFilesDialog,
    showOptionsDialog,
    setPaths,
    removePath,
    setScanOptions,
    setIsScanning,
    setScanResults,
    setError,
    checkInstallation,
    setShowFilesDialog,
    setShowOptionsDialog,
    addRecentScan,
  } = useModelAuditConfigStore();

  const { fetchHistoricalScans } = useModelAuditHistoryStore();

  useEffect(() => {
    useModelAuditConfigStore.persist.rehydrate();
    checkInstallation();
  }, [checkInstallation]);

  const handleScan = useCallback(async () => {
    setIsScanning(true);
    setError(null);

    try {
      const response = await callApi('/model-audit/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paths: paths.map((p) => p.path),
          options: scanOptions,
        }),
      });

      const data: ScanResult & { auditId?: string; persisted?: boolean } = await response.json();

      if (!response.ok) {
        const errorData = data as unknown as { error: string };
        throw new Error(errorData.error || 'Failed to run security scan');
      }

      setScanResults(data);
      addRecentScan(paths);

      if (data.persisted) {
        fetchHistoricalScans();
        if (data.auditId) {
          navigate(MODEL_AUDIT_ROUTES.DETAIL(data.auditId));
          return;
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
    } finally {
      setIsScanning(false);
    }
  }, [
    paths,
    scanOptions,
    setIsScanning,
    setError,
    setScanResults,
    addRecentScan,
    fetchHistoricalScans,
    navigate,
  ]);

  const handleRemovePath = useCallback(
    (index: number) => {
      const pathToRemove = paths[index];
      if (pathToRemove) {
        removePath(pathToRemove.path);
      }
    },
    [paths, removePath],
  );

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Page Header */}
      <div className="border-b border-border bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm">
        <div className="container max-w-6xl mx-auto px-4 py-10">
          <div className="flex items-start gap-4">
            <div className="shrink-0 size-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <SettingsIcon className="size-7 text-primary" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold tracking-tight">Model Audit Setup</h1>
              <p className="text-sm text-muted-foreground mt-1.5">
                Configure and run a security scan on ML models.{' '}
                <a
                  href="https://www.promptfoo.dev/docs/model-audit/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Learn more
                </a>
              </p>
            </div>

            {/* Installation Status */}
            <div className="shrink-0">
              {installationStatus.checking ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Spinner size="sm" />
                      <span className="text-sm">Checking...</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Checking ModelAudit installation...</TooltipContent>
                </Tooltip>
              ) : installationStatus.installed === true ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                      <CheckCircleIcon className="size-4" />
                      <span className="text-sm font-medium">Ready</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>ModelAudit is installed and ready</TooltipContent>
                </Tooltip>
              ) : installationStatus.installed === false ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5">
                      <ErrorIcon className="size-4 text-destructive" />
                      <span className="text-sm font-medium text-destructive">Not Installed</span>
                      <button
                        type="button"
                        onClick={() => checkInstallation()}
                        className="p-1 hover:bg-muted rounded"
                      >
                        <RefreshIcon className="size-4 text-muted-foreground" />
                      </button>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    {installationStatus.error || 'ModelAudit is not installed'}
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container max-w-6xl mx-auto px-4 py-8">
        <Card className="bg-white dark:bg-zinc-900">
          <CardContent className="pt-6">
            {error && (
              <Alert variant="destructive" className="mb-6">
                <AlertContent>
                  <AlertDescription className="flex items-center justify-between">
                    <span>{error}</span>
                    <button
                      type="button"
                      onClick={() => setError(null)}
                      className="text-sm underline hover:no-underline"
                    >
                      Dismiss
                    </button>
                  </AlertDescription>
                </AlertContent>
              </Alert>
            )}

            <ConfigurationTab
              paths={paths}
              isScanning={isScanning}
              onAddPath={(path) => setPaths([...paths, path])}
              onRemovePath={handleRemovePath}
              onShowOptions={() => setShowOptionsDialog(true)}
              onScan={handleScan}
              error={error}
              onClearError={() => setError(null)}
              currentWorkingDir={installationStatus.cwd || ''}
              installationStatus={installationStatus}
              onRetryInstallationCheck={checkInstallation}
            />

            {/* Inline Results */}
            {scanResults && (
              <div className="mt-10 pt-8 border-t">
                <h2 className="text-2xl font-semibold tracking-tight mb-6">Scan Results</h2>
                <ResultsTab
                  scanResults={scanResults}
                  onShowFilesDialog={() => setShowFilesDialog(true)}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <AdvancedOptionsDialog
          open={showOptionsDialog}
          onClose={() => setShowOptionsDialog(false)}
          scanOptions={scanOptions}
          onOptionsChange={setScanOptions}
        />

        {scanResults && (
          <ScannedFilesDialog
            open={showFilesDialog}
            onClose={() => setShowFilesDialog(false)}
            scanResults={scanResults}
            paths={paths}
          />
        )}
      </div>
    </div>
  );
}
