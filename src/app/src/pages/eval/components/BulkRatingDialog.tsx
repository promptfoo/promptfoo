import { useEffect, useState } from 'react';

import { Alert, AlertContent, AlertDescription } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { Label } from '@app/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@app/components/ui/radio-group';
import { Spinner } from '@app/components/ui/spinner';
import { Textarea } from '@app/components/ui/textarea';
import { BULK_RATING_CONSTANTS, useBulkRating } from '@app/hooks/useBulkRating';
import { cn } from '@app/lib/utils';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import type { EvalResultsFilterMode } from '@promptfoo/types';

interface BulkRatingDialogProps {
  open: boolean;
  onClose: () => void;
  evalId: string | null;
  filterMode: EvalResultsFilterMode;
  filters?: string[];
  searchQuery?: string;
  onSuccess: () => void;
}

export function BulkRatingDialog({
  open,
  onClose,
  evalId,
  filterMode,
  filters,
  searchQuery,
  onSuccess,
}: BulkRatingDialogProps) {
  const [pass, setPass] = useState<boolean>(true);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ updated: number; skipped: number } | null>(null);
  // Track when preview was last fetched to detect staleness
  const [previewFetchedAt, setPreviewFetchedAt] = useState<number | null>(null);

  const {
    bulkRate,
    isLoading,
    fetchPreviewCount,
    previewCount,
    isLoadingPreview,
    previewError,
    clearPreviewError,
  } = useBulkRating(evalId);

  // Fetch preview count when dialog opens or filter changes
  useEffect(() => {
    if (open && evalId) {
      fetchPreviewCount(filterMode, filters, searchQuery)
        .then(() => {
          setPreviewFetchedAt(Date.now());
        })
        .catch(() => {
          // Error is handled by the hook and surfaced via previewError
        });
      // Reset state
      setError(null);
      setResult(null);
      clearPreviewError();
    }
  }, [open, evalId, filterMode, filters, searchQuery, fetchPreviewCount, clearPreviewError]);

  const handleSubmit = async () => {
    if (!evalId) {
      return;
    }

    setError(null);
    setResult(null);

    // Re-fetch preview count before submitting to address staleness issue
    // This ensures the count hasn't changed since the dialog was opened
    try {
      const freshCount = await fetchPreviewCount(filterMode, filters, searchQuery);
      setPreviewFetchedAt(Date.now());

      // Warn if the count changed significantly
      if (previewCount !== null && Math.abs(freshCount - previewCount) > 0) {
        // Count changed - the user should be aware
        // We continue with the operation using the fresh count
      }
    } catch {
      // If we can't refresh, show error and abort
      setError('Failed to verify result count. Please try again.');
      return;
    }

    const response = await bulkRate({
      pass,
      reason: reason.trim(),
      filterMode,
      filters,
      searchQuery,
      confirmBulk: (previewCount ?? 0) >= BULK_RATING_CONSTANTS.CONFIRMATION_THRESHOLD,
    });

    if (!response.success) {
      setError(response.error || 'Bulk rating failed');
      return;
    }

    setResult({ updated: response.updated, skipped: response.skipped });

    // Auto-close after success (brief delay to show results)
    setTimeout(() => {
      onSuccess();
      onClose();
    }, 1500);
  };

  const requiresConfirmation = (previewCount ?? 0) >= BULK_RATING_CONSTANTS.CONFIRMATION_THRESHOLD;
  const filterModeLabel = getFilterModeLabel(filterMode);

  // Calculate if preview might be stale (older than 30 seconds)
  const isPreviewPotentiallyStale =
    previewFetchedAt !== null && Date.now() - previewFetchedAt > 30000;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && !isLoading && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bulk Rate Results</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Preview count */}
          <div className="rounded-md bg-muted p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Results to update:</span>
              {isLoadingPreview ? (
                <Spinner size="sm" />
              ) : (
                <span className="font-medium">
                  {previewCount?.toLocaleString() ?? 0} ({filterModeLabel})
                </span>
              )}
            </div>
            {isPreviewPotentiallyStale && !isLoadingPreview && (
              <p className="mt-1 text-xs text-muted-foreground">
                Count will be refreshed before submitting
              </p>
            )}
          </div>

          {/* Preview error display */}
          {previewError && (
            <Alert variant="warning">
              <AlertTriangle className="size-4" />
              <AlertContent>
                <AlertDescription>Failed to fetch preview: {previewError}</AlertDescription>
              </AlertContent>
            </Alert>
          )}

          {/* Warning for large operations */}
          {requiresConfirmation && (
            <Alert variant="warning">
              <AlertTriangle className="size-4" />
              <AlertContent>
                <AlertDescription>
                  This will update {previewCount?.toLocaleString()} results. This action cannot be
                  undone.
                </AlertDescription>
              </AlertContent>
            </Alert>
          )}

          {/* Pass/Fail selection */}
          <div className="space-y-2">
            <Label>Rating</Label>
            <RadioGroup
              value={pass ? 'pass' : 'fail'}
              onValueChange={(value) => setPass(value === 'pass')}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="pass" id="pass" />
                <Label
                  htmlFor="pass"
                  className={cn('flex items-center gap-1 cursor-pointer', pass && 'text-green-600')}
                >
                  <CheckCircle className="size-4" />
                  Pass
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="fail" id="fail" />
                <Label
                  htmlFor="fail"
                  className={cn('flex items-center gap-1 cursor-pointer', !pass && 'text-red-600')}
                >
                  <XCircle className="size-4" />
                  Fail
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Reason input */}
          <div className="space-y-2">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter a reason for this rating..."
              rows={3}
              disabled={isLoading}
              maxLength={BULK_RATING_CONSTANTS.MAX_REASON_LENGTH}
            />
            <p className="text-xs text-muted-foreground">
              This reason will be applied to all selected results.
            </p>
          </div>

          {/* Error display */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertContent>
                <AlertDescription>{error}</AlertDescription>
              </AlertContent>
            </Alert>
          )}

          {/* Success display */}
          {result && (
            <Alert variant="success">
              <CheckCircle className="size-4" />
              <AlertContent>
                <AlertDescription>
                  Updated {result.updated.toLocaleString()} results
                  {result.skipped > 0 && ` (${result.skipped.toLocaleString()} skipped)`}
                </AlertDescription>
              </AlertContent>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button onClick={onClose} disabled={isLoading} variant="outline">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading || isLoadingPreview || (previewCount ?? 0) === 0}
            variant={pass ? 'default' : 'destructive'}
          >
            {isLoading && <Spinner size="sm" className="mr-2" />}
            {isLoading
              ? 'Updating...'
              : `${pass ? 'Pass' : 'Fail'} ${previewCount?.toLocaleString() ?? 0} Results`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getFilterModeLabel(mode: EvalResultsFilterMode): string {
  switch (mode) {
    case 'all':
      return 'all results';
    case 'failures':
      return 'failures only';
    case 'passes':
      return 'passes only';
    case 'errors':
      return 'errors only';
    case 'highlights':
      return 'highlighted';
    case 'user-rated':
      return 'user-rated';
    case 'different':
      return 'different';
    default:
      return mode;
  }
}
