import React, { useRef, useState } from 'react';
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
  shareUrl: string;
}

const ShareModal: React.FC<ShareModalProps> = ({ open, onClose, shareUrl }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

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
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      PaperProps={{ style: { minWidth: 'min(660px, 100%)' } }}
    >
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
          Shared URLs are deleted after 2 weeks.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="primary">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ShareModal;
