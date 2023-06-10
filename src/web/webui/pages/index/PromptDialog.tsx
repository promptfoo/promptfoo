// src/components/PromptDialog.tsx
import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
} from '@mui/material';

interface PromptDialogProps {
  open: boolean;
  prompt: string;
  index: number;
  onAdd: (prompt: string) => void;
  onCancel: () => void;
}

const PromptDialog: React.FC<PromptDialogProps> = ({ open, prompt, index, onAdd, onCancel }) => {
  const [editingPrompt, setEditingPrompt] = React.useState(prompt);

  React.useEffect(() => {
    setEditingPrompt(prompt);
  }, [prompt]);

  const handleAddAnother = () => {
    onAdd('');
    setEditingPrompt('');
  };

  const handleSave = () => {
    onAdd(editingPrompt);
    onCancel();
  };

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="md">
      <DialogTitle>{`Edit Prompt ${index + 1}`}</DialogTitle>
      <DialogContent>
        <TextField
          label={`Prompt ${index + 1}`}
          value={editingPrompt}
          onChange={(e) => setEditingPrompt(e.target.value)}
          fullWidth
          margin="normal"
          multiline
        />
      </DialogContent>
      <DialogActions>
        <Button
          onClick={handleSave}
          color="primary"
          variant="contained"
          disabled={!editingPrompt.length}
        >
          Add
        </Button>
        <Button
          onClick={handleAddAnother}
          color="primary"
          variant="contained"
          disabled={!editingPrompt.length}
        >
          Add Another
        </Button>
        <Button onClick={onCancel} color="secondary">
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PromptDialog;
