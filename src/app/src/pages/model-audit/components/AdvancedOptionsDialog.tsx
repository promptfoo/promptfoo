import { useEffect, useState } from 'react';

import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { HelperText } from '@app/components/ui/helper-text';
import { XIcon } from '@app/components/ui/icons';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { NumberInput } from '@app/components/ui/number-input';
import { Switch } from '@app/components/ui/switch';

import type { ScanOptions } from '../ModelAudit.types';

interface AdvancedOptionsDialogProps {
  open: boolean;
  onClose: () => void;
  scanOptions: ScanOptions;
  onOptionsChange: (options: ScanOptions) => void;
}

const defaultScanOptions: ScanOptions = {
  blacklist: [],
  timeout: 3600,
  maxSize: undefined,
  strict: false,
};

export default function AdvancedOptionsDialog({
  open,
  onClose,
  scanOptions,
  onOptionsChange,
}: AdvancedOptionsDialogProps) {
  const [blacklistInput, setBlacklistInput] = useState('');
  const [localOptions, setLocalOptions] = useState({
    ...defaultScanOptions,
    ...scanOptions,
  });

  // Update local options when scanOptions prop changes or when dialog opens
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    setLocalOptions({
      ...defaultScanOptions,
      ...scanOptions,
    });
  }, [scanOptions, open]);

  const handleAddBlacklist = () => {
    if (blacklistInput.trim()) {
      setLocalOptions({
        ...localOptions,
        blacklist: [...localOptions.blacklist, blacklistInput.trim()],
      });
      setBlacklistInput('');
    }
  };

  const handleRemoveBlacklist = (index: number) => {
    setLocalOptions({
      ...localOptions,
      blacklist: localOptions.blacklist.filter((_, i) => i !== index),
    });
  };

  const handleSave = () => {
    onOptionsChange(localOptions);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Advanced Scan Options</DialogTitle>
          <DialogDescription>Configure additional options for your security scan</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Blacklist Patterns */}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Blacklist Patterns</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Add patterns for disallowed model names (regex supported)
              </p>
            </div>
            <div className="flex gap-2">
              <Input
                aria-label="Add pattern"
                placeholder="Add pattern"
                value={blacklistInput}
                onChange={(e) => setBlacklistInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddBlacklist()}
                className="flex-1"
              />
              <Button
                type="button"
                onClick={handleAddBlacklist}
                disabled={!blacklistInput.trim()}
                variant="secondary"
              >
                Add
              </Button>
            </div>
            {localOptions.blacklist.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {localOptions.blacklist.map((pattern, index) => (
                  <Badge key={index} variant="secondary" className="gap-1">
                    {pattern}
                    <button
                      type="button"
                      onClick={() => handleRemoveBlacklist(index)}
                      className="ml-1 hover:bg-secondary-foreground/20 rounded-full p-0.5"
                      aria-label={`Remove ${pattern}`}
                    >
                      <XIcon className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Timeout */}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Scan Timeout</h3>
            </div>
            <NumberInput
              fullWidth
              value={localOptions.timeout}
              onChange={(v) =>
                setLocalOptions({
                  ...localOptions,
                  // @ts-expect-error - undefined will be clamped to 3600 onBlur.  This approach resolves issue where user cannot clear the field.  This would be better addressed using a more robust form approach and setting default on submit.
                  timeout: v,
                })
              }
              min={0}
              onBlur={() => {
                setLocalOptions(({ timeout, ...options }) => ({
                  ...options,
                  timeout: timeout !== undefined ? timeout : 3600,
                }));
              }}
              endAdornment={<span className="text-sm text-muted-foreground">seconds</span>}
            />
          </div>

          {/* Max Size */}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Maximum Size Limit</h3>
            </div>
            <Input
              placeholder="e.g., 1GB, 500MB"
              value={localOptions.maxSize || ''}
              onChange={(e) =>
                setLocalOptions({
                  ...localOptions,
                  maxSize: e.target.value || undefined,
                })
              }
            />
            <HelperText>
              Format examples: <strong>500MB</strong>, <strong>2GB</strong>, <strong>1.5TB</strong>,{' '}
              <strong>100KB</strong>
            </HelperText>
          </div>

          {/* Strict Mode */}
          <div className="flex items-start space-x-3 space-y-0 rounded-lg border border-border p-4">
            <Switch
              id="strict-mode"
              checked={localOptions.strict || false}
              onCheckedChange={(checked) => setLocalOptions({ ...localOptions, strict: checked })}
            />
            <div className="space-y-1 leading-none">
              <Label htmlFor="strict-mode" className="text-sm font-semibold cursor-pointer">
                Strict Mode
              </Label>
              <p className="text-sm text-muted-foreground">
                Fail on warnings, scan all file types, strict license validation
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Options</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
