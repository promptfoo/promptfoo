import { useEffect, useState } from 'react';

import { Alert, AlertContent, AlertDescription } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import { Card, CardContent } from '@app/components/ui/card';
import { AddIcon, HistoryIcon, SecurityIcon } from '@app/components/ui/icons';
import { MODEL_AUDIT_ROUTES } from '@app/constants/routes';
import { callApi } from '@app/utils/api';
import { Link as RouterLink } from 'react-router-dom';
import { LatestScanSkeleton } from '../model-audit/components/ModelAuditSkeleton';
import ResultsTab from '../model-audit/components/ResultsTab';
import ScannedFilesDialog from '../model-audit/components/ScannedFilesDialog';
import ScanResultHeader from '../model-audit/components/ScanResultHeader';
import { useSeverityCounts } from '../model-audit/hooks';

import type { HistoricalScan } from '../model-audit/stores';

export default function ModelAuditResultLatestPage() {
  const [latestScan, setLatestScan] = useState<HistoricalScan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilesDialog, setShowFilesDialog] = useState(false);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchLatestScan = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await callApi('/model-audit/scans?limit=1&sort=createdAt&order=desc', {
          signal: abortController.signal,
        });

        if (abortController.signal.aborted) {
          return;
        }

        if (!response.ok) {
          throw new Error('Failed to fetch latest scan');
        }

        const data = await response.json();
        const scans = data.scans || [];

        if (scans.length > 0) {
          setLatestScan(scans[0]);
        } else {
          setLatestScan(null);
        }
      } catch (err) {
        if (abortController.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
          return;
        }
        const errorMessage = err instanceof Error ? err.message : 'Failed to load latest scan';
        setError(errorMessage);
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    fetchLatestScan();

    return () => abortController.abort();
  }, []);

  const severityCounts = useSeverityCounts(latestScan?.results?.issues);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-8">
        <div className="container max-w-7xl mx-auto px-4">
          <LatestScanSkeleton />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-8">
        <div className="container max-w-2xl mx-auto px-4">
          <Alert variant="destructive" className="mb-6">
            <AlertContent>
              <AlertDescription>{error}</AlertDescription>
            </AlertContent>
          </Alert>
          <div className="flex gap-3">
            <Button asChild>
              <RouterLink to={MODEL_AUDIT_ROUTES.SETUP}>Go to Setup</RouterLink>
            </Button>
            <Button variant="outline" asChild>
              <RouterLink to={MODEL_AUDIT_ROUTES.LIST}>View History</RouterLink>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Empty state - no scans yet
  if (!latestScan) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-16">
        <div className="container max-w-2xl mx-auto px-4">
          <Card className="text-center bg-white dark:bg-zinc-900">
            <CardContent className="py-12">
              <SecurityIcon className="size-16 text-primary mx-auto mb-6" />
              <h1 className="text-2xl font-bold mb-2">No Model Scans Yet</h1>
              <p className="text-muted-foreground mb-4">
                Run your first security scan to detect vulnerabilities in ML models.
              </p>
              <p className="text-sm text-muted-foreground mb-8">
                Model Audit scans models for security issues like pickle exploits, unsafe
                deserialization, and malicious code injection.{' '}
                <a
                  href="https://www.promptfoo.dev/docs/model-audit/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Learn more
                </a>
              </p>
              <Button size="lg" asChild>
                <RouterLink to={MODEL_AUDIT_ROUTES.SETUP}>
                  <AddIcon className="size-4 mr-2" />
                  Run Your First Scan
                </RouterLink>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <ScanResultHeader
        name={latestScan.name || 'Latest Scan Results'}
        modelPath={latestScan.modelPath}
        createdAt={new Date(latestScan.createdAt).toISOString()}
        severityCounts={severityCounts}
        size="sm"
      />

      {/* Main Content */}
      <div className="container max-w-7xl mx-auto px-4 py-8">
        {/* Action Toolbar */}
        <div className="flex items-center justify-end gap-2 mb-4">
          <Button variant="outline" size="sm" asChild>
            <RouterLink to={MODEL_AUDIT_ROUTES.LIST}>
              <HistoryIcon className="size-4 mr-2" />
              History
            </RouterLink>
          </Button>
          <Button size="sm" asChild>
            <RouterLink to={MODEL_AUDIT_ROUTES.SETUP}>
              <AddIcon className="size-4 mr-2" />
              New Scan
            </RouterLink>
          </Button>
        </div>

        <Card className="bg-white dark:bg-zinc-900">
          <CardContent className="pt-6">
            {latestScan.results && (
              <ResultsTab
                scanResults={latestScan.results}
                onShowFilesDialog={() => setShowFilesDialog(true)}
                totalChecks={latestScan.totalChecks}
                passedChecks={latestScan.passedChecks}
                failedChecks={latestScan.failedChecks}
              />
            )}
          </CardContent>
        </Card>

        {latestScan.results && (
          <ScannedFilesDialog
            open={showFilesDialog}
            onClose={() => setShowFilesDialog(false)}
            scanResults={latestScan.results}
            paths={((latestScan.metadata?.originalPaths as string[] | undefined) ?? []).map(
              (p: string) => ({
                path: p,
                type: p.endsWith('/') ? ('directory' as const) : ('file' as const),
                name: p.split('/').filter(Boolean).pop() || p,
              }),
            )}
          />
        )}
      </div>
    </div>
  );
}
