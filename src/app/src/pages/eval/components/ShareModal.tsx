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
import { callApi } from '@app/utils/api';
import { Check, Copy } from 'lucide-react';

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  evalId: string;
  onShare: (id: string) => Promise<string>;
}

const ShareModal = ({ open, onClose, evalId, onShare }: ShareModalProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [showNeedsSignup, setShowNeedsSignup] = useState(false);
  const [shareUrl, setShareUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when evalId changes to prevent stale data
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    setCopied(false);
    setShowNeedsSignup(false);
    setShareUrl('');
    setError(null);
  }, [evalId]);

  useEffect(() => {
    const handleShare = async () => {
      if (!open || !evalId || shareUrl) {
        return;
      }

      try {
        const response = await callApi(`/results/share/check-domain?id=${evalId}`);
        const data = (await response.json()) as {
          domain: string;
          isCloudEnabled: boolean;
          error?: string;
        };

        if (response.ok) {
          const isPublicDomain = data.domain.includes('promptfoo.app');
          if (isPublicDomain && !data.isCloudEnabled) {
            setShowNeedsSignup(true);
            return;
          }

          // If it's not a public domain or we already have a URL, no need to generate
          if (!shareUrl && !error) {
            setIsLoading(true);
            try {
              const url = await onShare(evalId);
              setShareUrl(url);
            } catch (error) {
              console.error('Failed to generate share URL:', error);
              setError('Failed to generate share URL');
            } finally {
              setIsLoading(false);
            }
          }
        } else {
          setError(data.error || 'Failed to check share domain');
        }
      } catch (error) {
        console.error('Failed to check share domain:', error);
        setError('Failed to check share domain');
      }
    };

    handleShare();
  }, [open, evalId, shareUrl, error, onShare]);

  const handleCopyClick = () => {
    if (inputRef.current) {
      inputRef.current.select();
      document.execCommand('copy');
      setCopied(true);
    }
  };

  const handleClose = () => {
    onClose();
    setCopied(false);
    setShareUrl('');
    setError(null);
  };

  const handleConfirm = async () => {
    window.open('https://www.promptfoo.app', '_blank');
  };

  if (error) {
    return (
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Error</DialogTitle>
          </DialogHeader>
          <DialogDescription className="text-destructive">{error}</DialogDescription>
          <DialogFooter>
            <Button onClick={handleClose} variant="outline">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-[660px]">
        {showNeedsSignup ? (
          <>
            <DialogHeader>
              <DialogTitle>Share Evaluation</DialogTitle>
            </DialogHeader>
            <DialogDescription className="py-4">
              You need to be logged in to your Promptfoo cloud account to share your evaluation.
              <br />
              <br />
              Sign up for free or login to your existing account at{' '}
              <a
                href="https://promptfoo.app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                https://www.promptfoo.app
              </a>
            </DialogDescription>
            <DialogFooter>
              <Button onClick={handleClose} variant="outline">
                Close
              </Button>
              <Button onClick={handleConfirm} disabled={isLoading}>
                Take me there
              </Button>
            </DialogFooter>
          </>
        ) : shareUrl ? (
          <>
            <DialogHeader>
              <DialogTitle>Your eval is ready to share</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-3">
              <div className="flex items-center gap-2">
                <Input ref={inputRef} value={shareUrl} readOnly className="flex-1" />
                <button
                  type="button"
                  onClick={handleCopyClick}
                  className="p-2 rounded hover:bg-muted transition-colors"
                  aria-label="Copy share URL"
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
