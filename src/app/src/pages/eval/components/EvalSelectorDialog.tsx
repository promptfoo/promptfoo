import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import EvalsTable from '../../evals/components/EvalsTable';

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
}: Props) => {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-5xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title || 'Select Evaluation'}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="flex-1 overflow-auto rounded-lg border border-border">
          <EvalsTable
            onEvalSelected={onEvalSelected}
            focusedEvalId={focusedEvalId}
            filterByDatasetId={filterByDatasetId}
            showUtilityButtons
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EvalSelectorDialog;
