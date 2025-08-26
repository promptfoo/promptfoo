import React, { useEffect, useRef, useState } from 'react';

import { callApi } from '@app/utils/api';
import CheckIcon from '@mui/icons-material/Check';
import FileCopyIcon from '@mui/icons-material/FileCopy';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  evalId: string;
  onShare: (id: string) => Promise<string>;
}

const ShareModal: React.FC<ShareModalProps> = ({ open, onClose, evalId, onShare }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [showNeedsSignup, setShowNeedsSignup] = useState(false);
  const [shareUrl, setShareUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <Dialog open={open} onClose={handleClose}>
        <DialogTitle>Error</DialogTitle>
        <DialogContent>
          <DialogContentText color="error">{error}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} color="primary">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      PaperProps={{ style: { minWidth: 'min(660px, 100%)' } }}
    >
      {showNeedsSignup ? (
        <>
          <DialogTitle>Share Evaluation</DialogTitle>
          <DialogContent>
            <DialogContentText>
              You need to be logged in to your Promptfoo cloud account to share your evaluation.
              <br />
              <br />
              Sign up for free or login to your existing account at{' '}
              <a href="https://promptfoo.app" target="_blank" rel="noopener noreferrer">
                https://www.promptfoo.app
              </a>
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose} color="primary">
              Close
            </Button>
            <Button
              onClick={handleConfirm}
              color="primary"
              variant="contained"
              disabled={isLoading}
            >
              Take me there
            </Button>
          </DialogActions>
        </>
      ) : shareUrl ? (
        <>
          <DialogTitle>Your eval is ready to share</DialogTitle>
          <DialogContent>
            <TextField
              inputRef={inputRef}
              value={shareUrl}
              fullWidth
              InputProps={{
                readOnly: true,
                endAdornment: (
                  <IconButton onClick={handleCopyClick}>
                    {copied ? <CheckIcon /> : <FileCopyIcon />}
                  </IconButton>
                ),
              }}
            />
            <DialogContentText sx={{ fontSize: '0.75rem' }}>
              {shareUrl.includes('api.promptfoo.dev')
                ? 'Shared URLs are deleted after 2 weeks.'
                : 'This URL is accessible to users with access to your organization.'}
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose} color="primary">
              Close
            </Button>
          </DialogActions>
        </>
      ) : (
        <DialogContent>
          <DialogContentText>Generating share link...</DialogContentText>
        </DialogContent>
      )}
    </Dialog>
  );
};

export default ShareModal;
