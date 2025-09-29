import React from 'react';

import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import type { ProviderOptions } from '@promptfoo/types';

interface TokenEstimationTabProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: any) => void;
}

const TokenEstimationTab: React.FC<TokenEstimationTabProps> = ({
  selectedTarget,
  updateCustomTarget,
}) => {
  return (
    <>
      <Typography variant="body1" sx={{ mb: 2 }}>
        Enable word-based token estimation for APIs that don't return token usage information. See{' '}
        <a
          href="https://www.promptfoo.dev/docs/providers/http/#token-estimation"
          target="_blank"
          rel="noopener noreferrer"
        >
          docs
        </a>{' '}
        for more information.
      </Typography>

      <FormControlLabel
        control={
          <Switch
            checked={!!selectedTarget.config.tokenEstimation?.enabled}
            onChange={(event) => {
              if (event.target.checked) {
                updateCustomTarget('tokenEstimation', {
                  enabled: true,
                  multiplier: selectedTarget.config.tokenEstimation?.multiplier ?? 1.3,
                });
              } else {
                updateCustomTarget('tokenEstimation', { enabled: false });
              }
            }}
          />
        }
        label="Enable token estimation"
      />
    </>
  );
};

export default TokenEstimationTab;
