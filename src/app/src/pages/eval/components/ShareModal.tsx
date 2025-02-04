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
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [shareUrl, setShareUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleShare = async () => {
      if (!open || !evalId) {
        return;
      }

      try {
        const response = await callApi(`/results/share/check-domain?id=${evalId}`);
        const data = await response.json();

        if (response.ok) {
          const isPublicDomain = data.domain.includes('app.promptfoo.dev');
          setShowConfirmation(isPublicDomain);

          // If it's not a public domain or we already have a URL, no need to generate
          if (!isPublicDomain && !shareUrl && !error) {
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
    setIsLoading(true);
    setError(null);
    try {
      const url = await onShare(evalId);
      setShareUrl(url);
      setShowConfirmation(false);
    } catch (error) {
      console.error('Failed to generate share URL:', error);
      setError('Failed to generate share URL');
    } finally {
      setIsLoading(false);
    }
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
      {showConfirmation ? (
        <>
          <DialogTitle>Share Evaluation</DialogTitle>
          <DialogContent>
            <DialogContentText>
              You are about to generate a publicly accessible link for this evaluation. Anyone with
              this link will be able to view your evaluation results.
              <br />
              <br />
              Would you like to proceed?
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose} color="primary">
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              color="primary"
              variant="contained"
              disabled={isLoading}
            >
              {isLoading ? 'Generating...' : 'Generate Share Link'}
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
