import * as React from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';

interface CommentDialogProps {
  open: boolean;
  contextText: string;
  commentText: string;
  onClose: () => void;
  onSave: () => void;
  onChange: (text: string) => void;
}

const CommentDialog: React.FC<CommentDialogProps> = ({
  open,
  contextText,
  commentText,
  onClose,
  onSave,
  onChange,
}) => (
  <Dialog open={open} onClose={onClose} fullWidth={true} maxWidth="sm">
    <DialogTitle>Edit Comment</DialogTitle>
    <DialogContent>
      <Box sx={{ backgroundColor: '#f0f0f0', padding: 2, marginBottom: 2 }}>{contextText}</Box>
      <TextField
        autoFocus
        margin="dense"
        type="text"
        fullWidth
        multiline
        rows={4}
        value={commentText}
        onChange={(e) => onChange(e.target.value)}
      />
    </DialogContent>
    <DialogActions>
      <Button onClick={onSave} color="primary" variant="contained">
        Save
      </Button>
      <Button onClick={onClose} color="primary">
        Cancel
      </Button>
    </DialogActions>
  </Dialog>
);

export default CommentDialog;
