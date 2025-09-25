import React, { useEffect, useState } from 'react';

import { callApi } from '@app/utils/api';
import InfoIcon from '@mui/icons-material/Info';
import Alert from '@mui/material/Alert';
import Link from '@mui/material/Link';

interface EnterpriseBannerProps {
  evalId?: string;
  sx?: any; // Use any for MUI sx prop
}

/**
 * Enterprise Banner component that shows information about community edition
 * Displays only when in redteam mode and when user is not logged into cloud
 */
const EnterpriseBanner = ({ evalId, sx }: EnterpriseBannerProps) => {
  const [isCloudEnabled, setIsCloudEnabled] = useState<boolean | null>(null);
  const [isRedteamEval, setIsRedteamEval] = useState<boolean | null>(null);

  useEffect(() => {
    // Check both cloud status and if this is a redteam eval
    const checkEvalDetails = async () => {
      try {
        // If no evalId is provided, we can't check properly
        if (!evalId) {
          setIsCloudEnabled(true); // Don't show banner if no evalId
          setIsRedteamEval(false);
          return;
        }

        // Check cloud status
        const cloudResponse = await callApi(`/results/share/check-domain?id=${evalId}`);
        let cloudEnabled = false;
        if (cloudResponse.ok) {
          const cloudData = await cloudResponse.json();
          cloudEnabled = cloudData.isCloudEnabled;
        }

        // Check if this is a redteam eval by fetching eval config
        const evalResponse = await callApi(`/eval/${evalId}`);
        let isRedteam = false;
        if (evalResponse.ok) {
          const evalData = await evalResponse.json();
          isRedteam = Boolean(evalData.config?.redteam);
        }

        setIsCloudEnabled(cloudEnabled);
        setIsRedteamEval(isRedteam);
      } catch (error) {
        console.error('Error checking eval details:', error);
        setIsCloudEnabled(false);
        setIsRedteamEval(false);
      }
    };

    checkEvalDetails();
  }, [evalId]);

  // Only show if:
  // 1. Not loading
  // 2. Cloud is not enabled
  // 3. This is a redteam evaluation
  if (isCloudEnabled === null || isRedteamEval === null) {
    return null; // Still loading
  }

  if (isCloudEnabled === true || isRedteamEval === false) {
    return null; // Don't show banner
  }

  return (
    <Alert
      severity="info"
      icon={<InfoIcon />}
      sx={{
        '& a': {
          color: 'primary.main',
          fontWeight: 'bold',
          textDecoration: 'underline',
        },
        ...sx,
      }}
    >
      You're using the community edition of Promptfoo's red teaming suite. For advanced capabilities
      and support, learn more about{' '}
      <Link href="https://www.promptfoo.dev/docs/enterprise/" target="_blank" rel="noopener">
        Promptfoo Enterprise
      </Link>
      .
    </Alert>
  );
};

export default EnterpriseBanner;
