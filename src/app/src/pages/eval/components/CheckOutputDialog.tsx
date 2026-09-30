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
import type { CheckOutputRequest, CheckOutputResponse } from '@promptfoo/types/api/eval';

type AssertionType = CheckOutputRequest['assertion']['type'];
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

export default function CheckOutputDialog({
  evalId,
  resultId,
  onClose,
}: {
  evalId: string;
  resultId: string;
  onClose: () => void;
}) {
  const [type, setType] = useState<AssertionType>('contains');
  const [value, setValue] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CheckOutputResponse | null>(null);
  const needsValue = type !== 'is-json' && type !== 'not-is-json';

  async function checkOutput() {
    setIsChecking(true);
    setError('');
    setResult(null);
    try {
      const assertion = type === 'is-json' || type === 'not-is-json' ? { type } : { type, value };
      const response = await callApi(
        `/eval/${encodeURIComponent(evalId)}/results/${encodeURIComponent(resultId)}/check`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assertion }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Failed to check saved output',
        );
      }
      setResult(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to check saved output');
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isChecking) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Check saved output</DialogTitle>
          <DialogDescription>
            Preview a check on this response without another model call. The preview does not change
            saved assertions, scores, or ratings.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="saved-output-check-type">Check</Label>
          <Select
            value={type}
            onValueChange={(next) => {
              setType(next as AssertionType);
              setResult(null);
            }}
            disabled={isChecking}
          >
            <SelectTrigger id="saved-output-check-type">
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
            <Label htmlFor="saved-output-check-value">Text</Label>
            <Textarea
              id="saved-output-check-value"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setResult(null);
              }}
              maxLength={10000}
              disabled={isChecking}
            />
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {result && (
          <div role="status" className="space-y-1 rounded border p-3 text-sm">
            <p>
              {result.pass ? 'Pass' : 'Fail'} · Score: {result.score}
            </p>
            <p>{result.reason}</p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isChecking}>
            Close preview
          </Button>
          <Button
            onClick={() => void checkOutput()}
            disabled={isChecking || (needsValue && type !== 'equals' && value.length === 0)}
          >
            {isChecking ? 'Checking…' : 'Check output'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
