import React from 'react';

import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';

import type { HttpProviderOptions } from '../../../types';

interface RetryConfigTabProps {
  selectedTarget: HttpProviderOptions;
  updateCustomTarget: (field: string, value: unknown) => void;
}

const DEFAULT_MAX_RETRIES = 4;

const RetryConfigTab: React.FC<RetryConfigTabProps> = ({ selectedTarget, updateCustomTarget }) => {
  const currentMaxRetries = selectedTarget.config?.maxRetries ?? DEFAULT_MAX_RETRIES;

  const handleMaxRetriesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '') {
      updateCustomTarget('maxRetries', undefined);
    } else {
      const numValue = Number.parseInt(value, 10);
      if (!Number.isNaN(numValue) && numValue >= 0) {
        updateCustomTarget('maxRetries', numValue);
      }
    }
  };

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        Configure retry behavior for failed HTTP requests. When a request fails due to timeout or
        transient errors, it will be retried up to the specified number of times. See{' '}
        <a
          href="https://www.promptfoo.dev/docs/providers/http/#error-handling"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          docs
        </a>{' '}
        for more details.
      </p>

      <div className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="maxRetries">Max Retries</Label>
          <Input
            id="maxRetries"
            type="number"
            min={0}
            max={10}
            value={currentMaxRetries}
            onChange={handleMaxRetriesChange}
            placeholder={`Default: ${DEFAULT_MAX_RETRIES}`}
            className="max-w-[200px]"
          />
          <p className="text-xs text-muted-foreground">
            Number of retry attempts after initial request fails. Set to 0 to disable retries.
            Default is {DEFAULT_MAX_RETRIES} retries (5 total attempts).
          </p>
        </div>
      </div>
    </>
  );
};

export default RetryConfigTab;
