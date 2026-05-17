import { useEffect, useState } from 'react';

import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import { Checkbox } from '@app/components/ui/checkbox';
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
import { Spinner } from '@app/components/ui/spinner';
import { Switch } from '@app/components/ui/switch';
import { DEFAULT_SCAN_OPTIONS } from '../stores';

import type { ScannerCatalogEntry, ScanOptions } from '../ModelAudit.types';

interface AdvancedOptionsDialogProps {
  open: boolean;
  onClose: () => void;
  scanOptions: ScanOptions;
  onOptionsChange: (options: ScanOptions) => void;
  scannerCatalog?: ScannerCatalogEntry[];
  isLoadingScanners?: boolean;
  scannerCatalogError?: string | null;
}

export default function AdvancedOptionsDialog({
  open,
  onClose,
  scanOptions,
  onOptionsChange,
  scannerCatalog = [],
  isLoadingScanners = false,
  scannerCatalogError = null,
}: AdvancedOptionsDialogProps) {
  const [blacklistInput, setBlacklistInput] = useState('');
  const [scannerFilter, setScannerFilter] = useState('');
  const [localOptions, setLocalOptions] = useState({
    ...DEFAULT_SCAN_OPTIONS,
    ...scanOptions,
  });

  // Update local options when scanOptions prop changes or when dialog opens
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    setLocalOptions({
      ...DEFAULT_SCAN_OPTIONS,
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

  const toggleScannerOption = (
    key: 'scanners' | 'excludeScanner',
    scannerId: string,
    checked: boolean,
  ) => {
    setLocalOptions((options) => {
      const otherKey = key === 'scanners' ? 'excludeScanner' : 'scanners';
      const current = options[key] ?? [];
      const otherCurrent = options[otherKey] ?? [];
      const next = checked
        ? Array.from(new Set([...current, scannerId]))
        : current.filter((id) => id !== scannerId);

      return {
        ...options,
        [key]: next,
        [otherKey]: checked ? otherCurrent.filter((id) => id !== scannerId) : otherCurrent,
      };
    });
  };

  const filteredScanners = scannerCatalog.filter((scanner) => {
    const query = scannerFilter.trim().toLowerCase();
    if (!query) {
      return true;
    }
    return (
      scanner.id.toLowerCase().includes(query) ||
      scanner.class.toLowerCase().includes(query) ||
      scanner.description.toLowerCase().includes(query)
    );
  });

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Advanced Scan Options</DialogTitle>
          <DialogDescription>Configure additional options for your security scan</DialogDescription>
        </DialogHeader>

        <div
          data-testid="advanced-options-dialog-scroll-body"
          className="min-h-0 flex-1 space-y-6 overflow-y-auto py-4"
        >
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
                  timeout: timeout === undefined ? 3600 : timeout,
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

          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Scanner Selection</h3>
            </div>
            <Input
              aria-label="Filter scanners"
              placeholder="Filter scanners"
              value={scannerFilter}
              onChange={(e) => setScannerFilter(e.target.value)}
            />

            {isLoadingScanners && (
              <div className="flex items-center gap-2 rounded-lg border border-border p-4 text-sm text-muted-foreground">
                <Spinner size="sm" />
                Loading scanners...
              </div>
            )}

            {!isLoadingScanners && scannerCatalogError && (
              <HelperText>{scannerCatalogError}</HelperText>
            )}

            {!isLoadingScanners && !scannerCatalogError && scannerCatalog.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="grid grid-cols-[minmax(0,1fr)_6rem_6rem] border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <span>Scanner</span>
                  <span className="text-center">Only</span>
                  <span className="text-center">Exclude</span>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {filteredScanners.map((scanner) => (
                    <div
                      key={scanner.id}
                      className="grid grid-cols-[minmax(0,1fr)_6rem_6rem] items-center gap-2 border-b border-border px-3 py-2 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{scanner.id}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {scanner.class}
                        </div>
                      </div>
                      <div className="flex justify-center">
                        <Checkbox
                          aria-label={`Only run ${scanner.id}`}
                          checked={(localOptions.scanners ?? []).includes(scanner.id)}
                          onCheckedChange={(checked) =>
                            toggleScannerOption('scanners', scanner.id, checked === true)
                          }
                        />
                      </div>
                      <div className="flex justify-center">
                        <Checkbox
                          aria-label={`Exclude ${scanner.id}`}
                          checked={(localOptions.excludeScanner ?? []).includes(scanner.id)}
                          onCheckedChange={(checked) =>
                            toggleScannerOption('excludeScanner', scanner.id, checked === true)
                          }
                        />
                      </div>
                    </div>
                  ))}
                  {filteredScanners.length === 0 && (
                    <div className="px-3 py-4 text-sm text-muted-foreground">
                      No scanners match this filter.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter data-testid="advanced-options-dialog-footer" className="shrink-0">
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Options</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
