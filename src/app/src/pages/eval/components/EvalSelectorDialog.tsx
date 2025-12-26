import { Dialog, DialogContent, DialogTitle } from '@app/components/ui/dialog';
import EvalsTable from '../../evals/components/EvalsTable';

type Props = {
  open: boolean;
  onClose: () => void;
  onEvalSelected: (evalId: string) => void;
  focusedEvalId?: string;
  filterByDatasetId?: boolean;
};

const EvalSelectorDialog = ({
  open,
  onClose,
  onEvalSelected,
  focusedEvalId,
  filterByDatasetId,
}: Props) => {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-5xl h-[80vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogTitle className="sr-only">Select Evaluation</DialogTitle>
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden px-4 pt-10 pb-2">
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
