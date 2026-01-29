import { useEffect, useRef, useState } from 'react';

import { Alert, AlertContent, AlertDescription } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { Spinner } from '@app/components/ui/spinner';
import { cn } from '@app/lib/utils';
import { isInputComposing } from '@app/utils/keyboard';
import { AlertTriangle } from 'lucide-react';

interface ConfirmEvalNameDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  label: string;
  currentName: string;
  actionButtonText: string;
  helperText?: string;
  onConfirm: (newName: string) => Promise<void>;
  // Optional: for large eval warnings (copy only)
  showSizeWarning?: boolean;
  itemCount?: number;
  itemLabel?: string;
}

export const ConfirmEvalNameDialog = ({
  open,
  onClose,
  title,
  label,
  currentName,
  actionButtonText,
  helperText,
  onConfirm,
  showSizeWarning = false,
  itemCount,
  itemLabel = 'items',
}: ConfirmEvalNameDialogProps) => {
  const [name, setName] = useState(currentName);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Determine if this is a large operation
  const isLargeOperation = showSizeWarning && itemCount && itemCount > 10000;
  const isVeryLargeOperation = showSizeWarning && itemCount && itemCount > 50000;

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setName(currentName);
      setError(null);
      setIsLoading(false);
      // Auto-focus and select text after dialog opens
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
    }
  }, [open, currentName]);

  const handleConfirm = async () => {
    // Validation: prevent empty/whitespace-only names
    if (isLoading || !name.trim()) {
      return;
    }

    // For rename (no itemCount), if name hasn't changed, just close
    // For copy operations (has itemCount), always proceed even with default name
    if (name.trim() === currentName && itemCount === undefined) {
      onClose();
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await onConfirm(name.trim());
      onClose();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Operation failed';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isInputComposing(e)) {
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleConfirm();
    }
  };

  const displayHelperText =
    error ||
    (isLoading && itemCount
      ? `Processing ${itemCount.toLocaleString()} ${itemLabel}...`
      : helperText || `Enter a ${label.toLowerCase()} for this evaluation`);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && !isLoading && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {isLargeOperation && (
            <Alert variant={isVeryLargeOperation ? 'warning' : 'info'}>
              {isVeryLargeOperation && <AlertTriangle className="size-4" />}
              <AlertContent>
                <AlertDescription>
                  <strong>
                    This evaluation has {itemCount?.toLocaleString()} {itemLabel}.
                  </strong>{' '}
                  {isVeryLargeOperation
                    ? 'This operation may take several minutes. Please be patient.'
                    : 'This operation may take up to a minute.'}
                </AlertDescription>
              </AlertContent>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="eval-name">{label}</Label>
            <Input
              id="eval-name"
              ref={inputRef}
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              className={cn(error && 'border-destructive')}
            />
            <p className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>
              {displayHelperText}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose} disabled={isLoading} variant="outline">
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={
              isLoading || !name.trim() || (name.trim() === currentName && itemCount === undefined)
            }
          >
            {isLoading && <Spinner size="sm" className="mr-2" />}
            {isLoading ? 'Processing...' : actionButtonText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
