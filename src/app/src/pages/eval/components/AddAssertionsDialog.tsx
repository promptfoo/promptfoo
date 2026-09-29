import { useState } from 'react';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import { Textarea } from '@app/components/ui/textarea';
import { callApi } from '@app/utils/api';
import type { AddResultAssertionRequest } from '@promptfoo/types/api/eval';

type AssertionType = AddResultAssertionRequest['assertion']['type'];
const ASSERTIONS: { type: AssertionType; label: string }[] = [
  { type: 'contains', label: 'Contains text' },
  { type: 'icontains', label: 'Contains text (ignore case)' },
  { type: 'not-contains', label: 'Does not contain text' },
  { type: 'not-icontains', label: 'Does not contain text (ignore case)' },
  { type: 'equals', label: 'Equals text' },
  { type: 'starts-with', label: 'Starts with text' },
  { type: 'is-json', label: 'Is valid JSON' },
  { type: 'not-is-json', label: 'Is not valid JSON' },
];

export default function AddAssertionsDialog({
  evalId,
  resultId,
  onClose,
  onApplied,
}: {
  evalId: string;
  resultId: string;
  onClose: () => void;
  onApplied: () => void | Promise<void>;
}) {
  const [type, setType] = useState<AssertionType>('contains');
  const [value, setValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const needsValue = type !== 'is-json' && type !== 'not-is-json';

  async function save() {
    setIsSaving(true);
    setError('');
    try {
      const assertion = type === 'is-json' || type === 'not-is-json' ? { type } : { type, value };
      const response = await callApi(
        `/eval/${encodeURIComponent(evalId)}/results/${encodeURIComponent(resultId)}/assertions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assertion }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to add assertion');
      }
      await onApplied();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to add assertion');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isSaving) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add assertion</DialogTitle>
          <DialogDescription>
            Check this saved output without calling the model again. Existing assertions and human
            ratings are preserved.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="posthoc-assertion-type">Check</Label>
          <Select
            value={type}
            onValueChange={(next) => setType(next as AssertionType)}
            disabled={isSaving}
          >
            <SelectTrigger id="posthoc-assertion-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSERTIONS.map((item) => (
                <SelectItem key={item.type} value={item.type}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {needsValue && (
          <div className="space-y-2">
            <Label htmlFor="posthoc-assertion-value">Text</Label>
            <Textarea
              id="posthoc-assertion-value"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              maxLength={10000}
              disabled={isSaving}
            />
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            onClick={() => void save()}
            disabled={isSaving || (needsValue && type !== 'equals' && value.length === 0)}
          >
            {isSaving ? 'Adding…' : 'Add assertion'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
