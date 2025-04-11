import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import EvalsDataGrid from '../../evals/components/EvalsDataGrid';

const EvalSelectorDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  onEvalSelected: (evalId: string) => void;
  title?: string;
  description?: string;
  focusedEvalId?: string;
}> = ({ open, onClose, onEvalSelected, title, description, focusedEvalId }) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      {title ? <DialogTitle>{title}</DialogTitle> : null}
      <DialogContent>
        {description ? <Box sx={{ mb: 4 }}>{description}</Box> : null}
        <Box sx={{ width: '100%', mt: 2 }}>
          <EvalsDataGrid onEvalSelected={onEvalSelected} focusedEvalId={focusedEvalId} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
};

export default EvalSelectorDialog;
