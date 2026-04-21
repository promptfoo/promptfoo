import { useEffect, useState } from 'react';

import { Alert, AlertContent, AlertDescription } from '@app/components/ui/alert';
import { cn } from '@app/lib/utils';
import { callApi } from '@app/utils/api';
import { Info } from 'lucide-react';

interface EnterpriseBannerProps {
  evalId?: string;
  className?: string;
}

/**
 * Enterprise Banner component that shows information about community edition
 * Displays only when in redteam mode and when user is not logged into cloud
 */
const EnterpriseBanner = ({ evalId, className }: EnterpriseBannerProps) => {
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

        const response = await callApi(`/results/share/check-domain?id=${evalId}`);

        if (response.ok) {
          const data = await response.json();
          setIsCloudEnabled(data.isCloudEnabled);
        } else {
          // If we can't check, default to showing the banner
          setIsCloudEnabled(false);
        }
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
    <Alert variant="info" className={cn(className)}>
      <Info className="size-4" />
      <AlertContent>
        <AlertDescription>
          You're using the community edition of Promptfoo's red teaming suite. For advanced
          capabilities and support, learn more about{' '}
          <a
            href="https://www.promptfoo.dev/docs/enterprise/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold underline text-primary hover:text-primary/80"
          >
            Promptfoo Enterprise
          </a>
          .
        </AlertDescription>
      </AlertContent>
    </Alert>
  );
};

export default EnterpriseBanner;
