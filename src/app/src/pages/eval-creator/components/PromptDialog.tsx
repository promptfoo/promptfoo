import React from 'react';

import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
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
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const promptHasText = editingPrompt.trim().length > 0;
  const hasBlankPromptError = editingPrompt.length > 0 && !promptHasText;
  const promptErrorId = 'prompt-input-error';

  React.useEffect(() => {
    setEditingPrompt(prompt);
  }, [prompt]);

  const handleAdd = (close: boolean) => {
    onAdd(editingPrompt);
    setEditingPrompt('');
    if (close) {
      onCancel();
    } else if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? `Edit Prompt ${index + 1}` : 'Add Prompt'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 py-4">
          <Label htmlFor="prompt-input">Prompt</Label>
          <Textarea
            id="prompt-input"
            ref={textareaRef}
            value={editingPrompt}
            onChange={(e) => setEditingPrompt(e.target.value)}
            placeholder="The quick brown {{animal1}} jumps over the lazy {{animal2}}."
            className={cn(
              'min-h-[200px] font-mono text-sm',
              hasBlankPromptError && 'border-destructive',
            )}
            aria-invalid={hasBlankPromptError}
            aria-describedby={hasBlankPromptError ? promptErrorId : undefined}
          />
          {hasBlankPromptError ? (
            <p id={promptErrorId} className="text-sm text-destructive">
              Prompt must include text, not only spaces.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Tip: use the {'{{varname}}'} syntax to add variables to your prompt.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          {!isEditing && (
            <Button variant="secondary" onClick={() => handleAdd(false)} disabled={!promptHasText}>
              Add Another
            </Button>
          )}
          <Button onClick={() => handleAdd(true)} disabled={!promptHasText}>
            {isEditing ? 'Save' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PromptDialog;
