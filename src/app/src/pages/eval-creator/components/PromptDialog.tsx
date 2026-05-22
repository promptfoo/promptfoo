import React from 'react';

import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { Label } from '@app/components/ui/label';
import { Textarea } from '@app/components/ui/textarea';
import { cn } from '@app/lib/utils';

interface PromptDialogProps {
  open: boolean;
  prompt: string;
  index: number;
  onAdd: (prompt: string) => void;
  onCancel: () => void;
  isEditing?: boolean;
}

const PromptDialog = ({
  open,
  prompt,
  index,
  onAdd,
  onCancel,
  isEditing = false,
}: PromptDialogProps) => {
  const [editingPrompt, setEditingPrompt] = React.useState(prompt);
  const [cleanPrompt, setCleanPrompt] = React.useState(prompt);
  const [discardDialogOpen, setDiscardDialogOpen] = React.useState(false);
  const [addAnotherStatus, setAddAnotherStatus] = React.useState<string | null>(null);
  const dialogDescriptionId = React.useId();
  const discardDescriptionId = React.useId();
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const promptHasText = editingPrompt.trim().length > 0;
  const hasBlankPromptError = editingPrompt.length > 0 && !promptHasText;
  const promptErrorId = 'prompt-input-error';
  const promptHelpId = 'prompt-input-help';
  const disabledPromptActionHelpId = hasBlankPromptError ? promptErrorId : promptHelpId;
  const isDirty = editingPrompt !== cleanPrompt;

  React.useEffect(() => {
    if (open) {
      setEditingPrompt(prompt);
      setCleanPrompt(prompt);
      setDiscardDialogOpen(false);
      setAddAnotherStatus(null);
    }
  }, [open, prompt]);

  const handleAdd = (close: boolean) => {
    if (!promptHasText) {
      return;
    }

    onAdd(editingPrompt);
    setEditingPrompt('');
    if (close) {
      setAddAnotherStatus(null);
      onCancel();
    } else {
      setCleanPrompt('');
      setAddAnotherStatus('Prompt added. Enter the next prompt.');
      textareaRef.current?.focus();
    }
  };

  const requestCancel = () => {
    if (isDirty) {
      setDiscardDialogOpen(true);
      return;
    }
    onCancel();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && requestCancel()}>
        <DialogContent
          className="max-w-2xl"
          hideDescription={false}
          aria-describedby={dialogDescriptionId}
        >
          <DialogHeader>
            <DialogTitle>{isEditing ? `Edit Prompt ${index + 1}` : 'Add Prompt'}</DialogTitle>
            <DialogDescription id={dialogDescriptionId}>
              Each prompt runs once for every test case and provider. Use variables when the input
              should change between test cases.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-4">
            {addAnotherStatus && (
              <p role="status" className="rounded-md bg-muted p-3 text-sm">
                {addAnotherStatus}
              </p>
            )}
            <div className="flex items-baseline gap-1.5">
              <Label htmlFor="prompt-input">Prompt</Label>
              <span className="text-xs text-muted-foreground">(required)</span>
            </div>
            <Textarea
              id="prompt-input"
              ref={textareaRef}
              value={editingPrompt}
              onChange={(e) => {
                setEditingPrompt(e.target.value);
                setAddAnotherStatus(null);
              }}
              placeholder="The quick brown {{animal1}} jumps over the lazy {{animal2}}."
              required
              className={cn(
                'min-h-[200px] font-mono text-sm',
                hasBlankPromptError && 'border-destructive',
              )}
              aria-invalid={hasBlankPromptError}
              aria-describedby={hasBlankPromptError ? promptErrorId : promptHelpId}
            />
            {hasBlankPromptError ? (
              <p id={promptErrorId} className="text-sm text-destructive">
                Prompt must include text, not only spaces.
              </p>
            ) : (
              <p id={promptHelpId} className="text-sm text-muted-foreground">
                Required. Use the {'{{varname}}'} syntax to add variables to your prompt.
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={requestCancel}>
              Cancel
            </Button>
            {!isEditing && (
              <Button
                variant="secondary"
                onClick={() => handleAdd(false)}
                disabled={!promptHasText}
                aria-describedby={promptHasText ? undefined : disabledPromptActionHelpId}
              >
                Add and create another
              </Button>
            )}
            <Button
              onClick={() => handleAdd(true)}
              disabled={!promptHasText}
              aria-describedby={promptHasText ? undefined : disabledPromptActionHelpId}
            >
              {isEditing ? 'Save' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={discardDialogOpen}
        onOpenChange={(isOpen) => !isOpen && setDiscardDialogOpen(false)}
      >
        <DialogContent hideDescription={false} aria-describedby={discardDescriptionId}>
          <DialogHeader>
            <DialogTitle>Discard prompt changes?</DialogTitle>
            <DialogDescription id={discardDescriptionId}>
              Your unsaved prompt text will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscardDialogOpen(false)}>
              Continue editing
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setDiscardDialogOpen(false);
                onCancel();
              }}
            >
              Discard changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PromptDialog;
