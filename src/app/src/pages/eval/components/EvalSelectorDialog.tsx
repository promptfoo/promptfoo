import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import EvalsDataGrid from '../../evals/components/EvalsDataGrid';

type Props = {
  open: boolean;
  onClose: () => void;
  onEvalSelected: (evalId: string) => void;
  title?: string;
  description?: string;
  focusedEvalId?: string;
  filterByDatasetId?: boolean;
  onOpenFocusSearch?: boolean;
};

const EvalSelectorDialog = ({
  open,
  onClose,
  onEvalSelected,
  title,
  description,
  focusedEvalId,
  filterByDatasetId,
  onOpenFocusSearch = false,
}: Props) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      {title ? (
        <DialogTitle sx={{ pb: 0 }}>
          {title}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {description || 'Click a row to select an evaluation'}
          </Typography>
        </DialogTitle>
      ) : null}
      <DialogContent sx={{ pt: 1 }}>
        <Box sx={{ width: '100%' }}>
          <EvalsDataGrid
            onEvalSelected={onEvalSelected}
            focusedEvalId={focusedEvalId}
            filterByDatasetId={filterByDatasetId}
            focusQuickFilterOnMount={onOpenFocusSearch}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={onClose}>
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EvalSelectorDialog;
