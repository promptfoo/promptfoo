import { useCallback, useEffect, useState } from 'react';

import { Alert, AlertContent, AlertDescription } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import { Card, CardContent } from '@app/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@app/components/ui/dropdown-menu';
import { ArrowBackIcon, DeleteIcon, DownloadIcon, MoreVertIcon } from '@app/components/ui/icons';
import { Spinner } from '@app/components/ui/spinner';
import { MODEL_AUDIT_ROUTES } from '@app/constants/routes';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { ResultPageSkeleton } from '../model-audit/components/ModelAuditSkeleton';
import ResultsTab from '../model-audit/components/ResultsTab';
import ScannedFilesDialog from '../model-audit/components/ScannedFilesDialog';
import ScanResultHeader from '../model-audit/components/ScanResultHeader';
import { useSeverityCounts } from '../model-audit/hooks';
import { useModelAuditHistoryStore } from '../model-audit/stores';

import type { HistoricalScan } from '../model-audit/stores';

export default function ModelAuditResult() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { fetchScanById, deleteHistoricalScan } = useModelAuditHistoryStore();

  const [scan, setScan] = useState<HistoricalScan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilesDialog, setShowFilesDialog] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!id) {
      setError('No scan ID provided');
      setIsLoading(false);
      return;
    }

    const abortController = new AbortController();

    const loadScan = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await fetchScanById(id, abortController.signal);
        if (abortController.signal.aborted) {
          return;
        }
        if (result) {
          setScan(result);
        } else {
          setError('Scan not found');
        }
      } catch (err) {
        if (abortController.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
          return;
        }
        const errorMessage = err instanceof Error ? err.message : 'Failed to load scan';
        setError(errorMessage);
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    loadScan();
    return () => abortController.abort();
  }, [id, fetchScanById]);

  const handleDelete = useCallback(async () => {
    if (!id) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteHistoricalScan(id);
      setDeleteDialogOpen(false);
      navigate(MODEL_AUDIT_ROUTES.LIST);
    } catch (err) {
      console.error('Failed to delete scan:', err);
    } finally {
      setIsDeleting(false);
    }
  }, [id, deleteHistoricalScan, navigate]);

  const handleDownload = useCallback(() => {
    if (!scan?.results) {
      return;
    }

    const json = JSON.stringify(scan.results, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `model-audit-${scan.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [scan]);

  const severityCounts = useSeverityCounts(scan?.results?.issues);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-8">
        <div className="container max-w-7xl mx-auto px-4">
          <ResultPageSkeleton />
        </div>
      </div>
    );
  }

  if (error || !scan) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-8">
        <div className="container max-w-2xl mx-auto px-4">
          <Alert variant="destructive" className="mb-6">
            <AlertContent>
              <AlertDescription>{error || 'Scan not found'}</AlertDescription>
            </AlertContent>
          </Alert>
          <div className="flex gap-3">
            <Button asChild>
              <RouterLink to={MODEL_AUDIT_ROUTES.LIST}>
                <ArrowBackIcon className="size-4 mr-2" />
                Back to History
              </RouterLink>
            </Button>
            <Button variant="outline" asChild>
              <RouterLink to={MODEL_AUDIT_ROUTES.SETUP}>New Scan</RouterLink>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const topBar = (
    <div className="flex items-center justify-between">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <RouterLink to={MODEL_AUDIT_ROUTES.LIST}>
          <ArrowBackIcon className="size-4 mr-2" />
          Back to History
        </RouterLink>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            Actions
            <MoreVertIcon className="size-4 ml-2" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleDownload}>
            <DownloadIcon className="size-4 mr-2" />
            Download JSON
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setDeleteDialogOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <DeleteIcon className="size-4 mr-2" />
            Delete Scan
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <ScanResultHeader
        name={scan.name || 'Model Security Scan'}
        modelPath={scan.modelPath}
        createdAt={new Date(scan.createdAt).toISOString()}
        author={scan.author ?? undefined}
        severityCounts={severityCounts}
        topBar={topBar}
      />

      {/* Main Content */}
      <div className="container max-w-7xl mx-auto px-4 py-8">
        <Card className="bg-white dark:bg-zinc-900">
          <CardContent className="pt-6">
            {scan.results && (
              <ResultsTab
                scanResults={scan.results}
                onShowFilesDialog={() => setShowFilesDialog(true)}
                totalChecks={scan.totalChecks}
                passedChecks={scan.passedChecks}
                failedChecks={scan.failedChecks}
              />
            )}
          </CardContent>
        </Card>

        {/* Scanned Files Dialog */}
        {scan.results && (
          <ScannedFilesDialog
            open={showFilesDialog}
            onClose={() => setShowFilesDialog(false)}
            scanResults={scan.results}
            paths={((scan.metadata?.originalPaths as string[] | undefined) ?? []).map(
              (p: string) => ({
                path: p,
                type: p.endsWith('/') ? ('directory' as const) : ('file' as const),
                name: p.split('/').filter(Boolean).pop() || p,
              }),
            )}
          />
        )}

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Scan?</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this scan? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteDialogOpen(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <DeleteIcon className="size-4 mr-2" />
                    Delete
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
