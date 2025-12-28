import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import EvalsTable from '../../evals/components/EvalsTable';

type Props = {
  open: boolean;
  onClose: () => void;
  onEvalSelected: (evalId: string) => void;
  focusedEvalId?: string;
  filterByDatasetId?: boolean;
  description?: string;
};

const EvalSelectorDialog = ({
  open,
  onClose,
  onEvalSelected,
  focusedEvalId,
  filterByDatasetId,
  description = 'Choose an evaluation to view',
}: Props) => {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-5xl h-[80vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>Select Evaluation</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden px-4 pb-2">
          <EvalsTable
            onEvalSelected={onEvalSelected}
            focusedEvalId={focusedEvalId}
            filterByDatasetId={filterByDatasetId}
            showUtilityButtons
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EvalSelectorDialog;
