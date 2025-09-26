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
  const [evalData, setEvalData] = useState<{ isRedteam: boolean } | null>(null);

  // Get redteam status from store if available, otherwise from fetched data
  const isRedteamEval = config?.redteam !== undefined ? Boolean(config.redteam) : evalData?.isRedteam ?? false;

  useEffect(() => {
    const checkEvalStatus = async () => {
      try {
        // If no evalId is provided, show banner for redteam evals (original behavior)
        if (!evalId) {
          setIsCloudEnabled(false);
          // If no store config available, assume it's a redteam eval to maintain original behavior
          if (config?.redteam === undefined) {
            setEvalData({ isRedteam: true });
          }
          return;
        }

        // If store has config, only check cloud status
        if (config?.redteam !== undefined) {
          const cloudResponse = await callApi(`/results/share/check-domain?id=${evalId}`);
          let cloudEnabled = false;
          if (cloudResponse.ok) {
            const cloudData = await cloudResponse.json();
            cloudEnabled = cloudData.isCloudEnabled;
          }
          setIsCloudEnabled(cloudEnabled);
        } else {
          // If store doesn't have config (e.g., reports page), fetch both in parallel
          const [cloudResponse, evalResponse] = await Promise.all([
            callApi(`/results/share/check-domain?id=${evalId}`),
            callApi(`/eval/${evalId}`),
          ]);

          let cloudEnabled = false;
          if (cloudResponse.ok) {
            const cloudData = await cloudResponse.json();
            cloudEnabled = cloudData.isCloudEnabled;
          }
          setIsCloudEnabled(cloudEnabled);

          if (evalResponse.ok) {
            const data = await evalResponse.json();
            setEvalData({ isRedteam: Boolean(data.config?.redteam) });
          } else {
            // If we can't fetch eval data, assume redteam to show banner (safer fallback)
            setEvalData({ isRedteam: true });
          }
        }
      } catch (error) {
        console.error('Error checking eval status:', error);
        setIsCloudEnabled(false);
        // On error, assume redteam to show banner (safer fallback)
        if (config?.redteam === undefined) {
          setEvalData({ isRedteam: true });
        }
      }
    };

    checkEvalStatus();
  }, [evalId, config?.redteam]);

  // Show banner if:
  // 1. Cloud status has loaded
  // 2. Cloud is not enabled
  // 3. This is a redteam evaluation (from store or fetched data)
  // 4. We have redteam status determined
  if (isCloudEnabled === null) {
    return null; // Still loading cloud status
  }

  // If we're still waiting for redteam status and store doesn't have it
  if (config?.redteam === undefined && evalData === null) {
    return null; // Still loading redteam status
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
