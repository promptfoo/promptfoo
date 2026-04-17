import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { Textarea } from '@app/components/ui/textarea';

interface CommentDialogProps {
  open: boolean;
  contextText: string;
  commentText: string;
  onClose: () => void;
  onSave: () => void;
  onChange: (text: string) => void;
}

const CommentDialog = ({
  open,
  contextText,
  commentText,
  onClose,
  onSave,
  onChange,
}: CommentDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Comment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <pre
            data-testid="context-text"
            className="p-4 mb-4 whitespace-pre-wrap break-words font-inherit bg-muted rounded"
          >
            {contextText}
          </pre>
          <Textarea
            autoFocus
            rows={4}
            value={commentText}
            onChange={(e) => onChange(e.target.value)}
            className="w-full"
          />
        </div>
        <DialogFooter>
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button onClick={onSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CommentDialog;
