import React, { useEffect, useState } from 'react';

import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { Textarea } from '@app/components/ui/textarea';

import type { ProviderOptions } from '../../types';

interface CustomTargetConfigurationProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: any) => void;
  rawConfigJson: string;
  setRawConfigJson: (value: string) => void;
  bodyError: string | React.ReactNode | null;
}

const CustomTargetConfiguration = ({
  selectedTarget,
  updateCustomTarget,
  rawConfigJson,
  setRawConfigJson,
  bodyError,
}: CustomTargetConfigurationProps) => {
  const [targetId, setTargetId] = useState(selectedTarget.id?.replace('file://', '') || '');

  useEffect(() => {
    setTargetId(selectedTarget.id?.replace('file://', '') || '');
  }, [selectedTarget.id]);

  const handleTargetIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setTargetId(value);

    let idToSave = value;
    if (
      value &&
      !value.startsWith('file://') &&
      !value.startsWith('http://') &&
      !value.startsWith('https://') &&
      (value.includes('.py') || value.includes('.js'))
    ) {
      idToSave = `file://${value}`;
    }
    updateCustomTarget('id', idToSave);
  };

  return (
    <div className="mt-4">
      <div className="mt-4 rounded-lg border p-4">
        <div className="space-y-2">
          <Label htmlFor="target-id">
            Target ID <span className="text-destructive">*</span>
          </Label>
          <Input
            id="target-id"
            value={targetId}
            onChange={handleTargetIdChange}
            placeholder="e.g., openai:chat:gpt-4o"
          />
          <p className="text-sm text-muted-foreground">
            The configuration string for your custom target. See{' '}
            <a
              href="https://www.promptfoo.dev/docs/red-team/configuration/#custom-providerstargets"
              className="text-primary hover:underline"
            >
              Custom Targets documentation
            </a>{' '}
            for more information.
          </p>
        </div>

        <div className="mt-4 space-y-2">
          <Label htmlFor="config-json">Custom Configuration</Label>
          <Textarea
            id="config-json"
            value={rawConfigJson}
            onChange={(e) => {
              setRawConfigJson(e.target.value);
              try {
                const config = JSON.parse(e.target.value);
                updateCustomTarget('config', config);
              } catch (error) {
                console.error('Invalid JSON configuration:', error);
              }
            }}
            rows={6}
            placeholder="Configuration (JSON)"
            className={bodyError ? 'border-destructive' : ''}
          />
          {bodyError ? (
            <p className="text-sm text-destructive">{bodyError}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Enter your custom configuration as JSON</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomTargetConfiguration;
