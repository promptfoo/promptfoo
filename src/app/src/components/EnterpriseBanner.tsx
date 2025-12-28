import React, { useEffect, useState } from 'react';

import { callApiTyped } from '@app/utils/apiClient';
import InfoIcon from '@mui/icons-material/Info';
import Alert from '@mui/material/Alert';
import Link from '@mui/material/Link';
import type { CheckShareDomainResponse } from '@promptfoo/dtos';

interface EnterpriseBannerProps {
  evalId?: string;
  sx?: React.CSSProperties;
}

/**
 * Enterprise Banner component that shows information about community edition
 * Displays only when in redteam mode and when user is not logged into cloud
 */
const EnterpriseBanner = ({ evalId, sx }: EnterpriseBannerProps) => {
  const [isCloudEnabled, setIsCloudEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    // Use the same API endpoint the server uses to check cloud status
    const checkCloudStatus = async () => {
      try {
        // If no evalId is provided, we can't check cloud status properly
        if (!evalId) {
          console.warn('EnterpriseBanner: No evalId provided, defaulting to showing banner');
          setIsCloudEnabled(false);
          return;
        }

        const data = await callApiTyped<CheckShareDomainResponse>(
          `/results/share/check-domain?id=${evalId}`,
        );
        setIsCloudEnabled(data.isCloudEnabled);
      } catch (error) {
        console.error('Error checking cloud status:', error);
        setIsCloudEnabled(false);
      }
    };

    checkCloudStatus();
  }, [evalId]);

  // If still loading or cloud is enabled, don't show banner
  if (isCloudEnabled === null || isCloudEnabled === true) {
    return null;
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
