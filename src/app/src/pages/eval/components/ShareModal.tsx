import { useEffect, useRef, useState } from 'react';

import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { Input } from '@app/components/ui/input';
import { Spinner } from '@app/components/ui/spinner';
import { Check, Copy } from 'lucide-react';
import logger from '../../../../../logger';
import {
  checkShareAvailability,
  isAbortError,
  parseShareUrl,
  ShareAvailabilityError,
  ShareRequestError,
} from './shareApi';

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  evalId: string;
  onShare: (id: string, signal: AbortSignal) => Promise<string>;
  requiresAvailabilityCheck?: boolean;
}

type ShareState =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'error'; message: string; retryable: boolean };

async function generateShareState(
  evalId: string,
  onShare: ShareModalProps['onShare'],
  requiresAvailabilityCheck: boolean,
  signal: AbortSignal,
): Promise<ShareState> {
  if (requiresAvailabilityCheck) {
    const availability = await checkShareAvailability(evalId, signal);
    if (!availability.sharingEnabled) {
      return {
        status: 'error',
        message: availability.sharingDisabledReason ?? 'Sharing is unavailable.',
        retryable: availability.isRetryable,
      };
    }
  }

  signal.throwIfAborted();
  const url = parseShareUrl(await onShare(evalId, signal));
  if (!url) {
    return {
      status: 'error',
      message: 'The server did not return a valid share URL.',
      retryable: true,
    };
  }
  return { status: 'ready', url };
}

const ShareModal = ({
  open,
  onClose,
  evalId,
  onShare,
  requiresAvailabilityCheck = true,
}: ShareModalProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);
  const [copied, setCopied] = useState(false);
  const [shareState, setShareState] = useState<ShareState>({ status: 'idle' });
  const [retryAttempt, setRetryAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: retryAttempt intentionally retriggers the request
  useEffect(() => {
    if (!open || !evalId) {
      return;
    }

    const requestId = ++requestIdRef.current;
    const controller = new AbortController();
    const isCurrent = () => requestIdRef.current === requestId;
    setCopied(false);
    setShareState({ status: 'loading' });

    const share = async () => {
      try {
        const nextState = await generateShareState(
          evalId,
          onShare,
          requiresAvailabilityCheck,
          controller.signal,
        );
        if (!isCurrent()) {
          return;
        }
        setShareState(nextState);
      } catch (error) {
        if (!isCurrent() || isAbortError(error)) {
          return;
        }
        logger.error('Failed to share evaluation', { error, evalId });
        setShareState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to generate share URL',
          retryable:
            error instanceof ShareAvailabilityError || error instanceof ShareRequestError
              ? error.retryable
              : true,
        });
      }
    };

    share();
    return () => {
      if (requestIdRef.current === requestId) {
        requestIdRef.current += 1;
      }
      controller.abort();
    };
  }, [open, evalId, onShare, requiresAvailabilityCheck, retryAttempt]);

  const handleCopyClick = () => {
    if (inputRef.current) {
      inputRef.current.select();
      document.execCommand('copy');
      setCopied(true);
    }
  };

  const handleClose = () => {
    requestIdRef.current += 1;
    setCopied(false);
    setShareState({ status: 'idle' });
    onClose();
  };

  const handleRetry = () => {
    requestIdRef.current += 1;
    setCopied(false);
    setShareState({ status: 'loading' });
    setRetryAttempt((attempt) => attempt + 1);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-[660px]">
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {shareState.status === 'ready'
            ? copied
              ? 'Share URL copied.'
              : 'Share link ready.'
            : shareState.status === 'loading'
              ? 'Generating share link...'
              : ''}
        </div>
        {shareState.status === 'error' ? (
          <>
            <DialogHeader>
              <DialogTitle>Sharing unavailable</DialogTitle>
              <DialogDescription role="alert" className="text-destructive">
                {shareState.message}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={handleClose} variant="outline">
                Close
              </Button>
              {shareState.retryable && <Button onClick={handleRetry}>Retry</Button>}
            </DialogFooter>
          </>
        ) : shareState.status === 'ready' ? (
          <>
            <DialogHeader>
              <DialogTitle>Your eval is ready to share</DialogTitle>
              <DialogDescription>Copy the link to share this evaluation.</DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-3">
              <div className="flex items-center gap-2">
                <Input ref={inputRef} value={shareState.url} readOnly className="flex-1" />
                <button
                  type="button"
                  onClick={handleCopyClick}
                  className="p-2 rounded hover:bg-muted transition-colors"
                  aria-label={copied ? 'Share URL copied' : 'Copy share URL'}
                >
                  {copied ? <Check className="size-5" /> : <Copy className="size-5" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                This URL is accessible to users with access to your organization.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={handleClose} variant="outline">
                Close
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Share Evaluation</DialogTitle>
              <DialogDescription>Checking access and generating a share link.</DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-3 py-4">
              <Spinner size="sm" />
              <p className="text-muted-foreground">Generating share link...</p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ShareModal;
