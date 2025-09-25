import { useEffect, useState } from 'react';

import { callApi } from '@app/utils/api';
import InfoIcon from '@mui/icons-material/Info';
import Alert from '@mui/material/Alert';
import Link from '@mui/material/Link';
import { useTableStore } from '@app/pages/eval/components/store';

interface EnterpriseBannerProps {
  evalId?: string;
  sx?: any; // Use any for MUI sx prop
}

/**
 * Enterprise Banner component that shows information about community edition
 * Displays only when in redteam mode and when user is not logged into cloud
 */
const EnterpriseBanner = ({ evalId, sx }: EnterpriseBannerProps) => {
  const { config } = useTableStore();
  const [isCloudEnabled, setIsCloudEnabled] = useState<boolean | null>(null);

  // Get redteam status from the already-loaded config in the store
  const isRedteamEval = Boolean(config?.redteam);

  useEffect(() => {
    // Only check cloud status - we get redteam info from the store
    const checkCloudStatus = async () => {
      try {
        // If no evalId is provided, show banner (original behavior)
        if (!evalId) {
          setIsCloudEnabled(false);
          return;
        }

        const response = await callApi(`/results/share/check-domain?id=${evalId}`);

        if (response.ok) {
          const data = await response.json();
          setIsCloudEnabled(data.isCloudEnabled);
        } else {
          // If we can't check, default to showing the banner (original behavior)
          setIsCloudEnabled(false);
        }
      } catch (error) {
        console.error('Error checking cloud status:', error);
        setIsCloudEnabled(false);
      }
    };

    checkCloudStatus();
  }, [evalId]);

  // Show banner if:
  // 1. Cloud status has loaded
  // 2. Cloud is not enabled
  // 3. This is a redteam evaluation (from store config)
  if (isCloudEnabled === null) {
    return null; // Still loading cloud status
  }

  if (isCloudEnabled === true || !isRedteamEval) {
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
