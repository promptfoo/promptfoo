import React, { useState } from 'react';

import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { Input } from '@app/components/ui/input';

interface SetScoreDialogProps {
  open: boolean;
  currentScore: number;
  onClose: () => void;
  onSave: (score: number) => void;
}

export default function SetScoreDialog({
  open,
  currentScore,
  onClose,
  onSave,
}: SetScoreDialogProps) {
  const [scoreValue, setScoreValue] = useState(String(currentScore));
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    const parsed = Number.parseFloat(scoreValue);
    if (Number.isNaN(parsed) || parsed < 0.0 || parsed > 1.0) {
      setError('Please enter a value between 0.0 and 1.0.');
      return;
    }
    onSave(parsed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Set test score</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <label htmlFor="score-input" className="text-sm text-muted-foreground">
            Score (0.0 - 1.0)
          </label>
          <Input
            id="score-input"
            autoFocus
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={scoreValue}
            onChange={(e) => {
              setScoreValue(e.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
