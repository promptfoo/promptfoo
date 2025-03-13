import React from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';

interface PromptDialogProps {
  open: boolean;
  prompt: string;
  index: number;
  onAdd: (prompt: string) => void;
  onCancel: () => void;
}

const PromptDialog: React.FC<PromptDialogProps> = ({ open, prompt, index, onAdd, onCancel }) => {
  const [editingPrompt, setEditingPrompt] = React.useState(prompt);
  const textFieldRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setEditingPrompt(prompt);
  }, [prompt]);

  const handleAdd = (close: boolean) => {
    onAdd(editingPrompt);
    setEditingPrompt('');
    if (close) {
      onCancel();
    } else if (textFieldRef.current) {
      textFieldRef.current.focus();
    }
  };

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="md">
      <DialogTitle>{`Edit Prompt ${index + 1}`}</DialogTitle>
      <DialogContent>
        <TextField
          value={editingPrompt}
          onChange={(e) => setEditingPrompt(e.target.value)}
          fullWidth
          margin="normal"
          multiline
          placeholder="The quick brown {{animal1}} jumps over the lazy {{animal2}}."
          helperText="Tip: use the {{varname}} syntax to add variables to your prompt."
          inputRef={textFieldRef}
        />
      </DialogContent>
      <DialogActions>
        <Button
          onClick={handleAdd.bind(null, true)}
          color="primary"
          variant="contained"
          disabled={!editingPrompt.length}
        >
          Add
        </Button>
        <Button
          onClick={handleAdd.bind(null, false)}
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
