import React from 'react';

import { Label } from '@app/components/ui/label';
import { Switch } from '@app/components/ui/switch';

import type { HttpProviderOptions } from '../../../types';

interface TokenEstimationTabProps {
  selectedTarget: HttpProviderOptions;
  updateCustomTarget: (field: string, value: unknown) => void;
}

const TokenEstimationTab: React.FC<TokenEstimationTabProps> = ({
  selectedTarget,
  updateCustomTarget,
}) => {
  return (
    <>
      <p className="mb-4">
        Enable word-based token estimation for APIs that don't return token usage information. See{' '}
        <a
          href="https://www.promptfoo.dev/docs/providers/http/#token-estimation"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          docs
        </a>{' '}
        for more information.
      </p>

      <div className="flex items-center gap-2">
        <Switch
          id="token-estimation"
          checked={!!selectedTarget.config?.tokenEstimation?.enabled}
          onCheckedChange={(checked) => {
            if (checked) {
              updateCustomTarget('tokenEstimation', {
                enabled: true,
                multiplier: selectedTarget.config?.tokenEstimation?.multiplier ?? 1.3,
              });
            } else {
              updateCustomTarget('tokenEstimation', { enabled: false });
            }
          }}
        />
        <Label htmlFor="token-estimation">Enable token estimation</Label>
      </div>
    </>
  );
};

export default TokenEstimationTab;
