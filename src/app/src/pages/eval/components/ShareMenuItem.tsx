import React from 'react';

import { DropdownMenuItem } from '@app/components/ui/dropdown-menu';
import { Spinner } from '@app/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { IS_RUNNING_LOCALLY } from '@app/constants';
import { EVAL_ROUTES } from '@app/constants/routes';
import { callApi } from '@app/utils/api';
import { Share } from 'lucide-react';
import ShareModal from './ShareModal';

interface ShareMenuItemProps {
  evalId: string;
}

export default function ShareMenuItem({ evalId }: ShareMenuItemProps) {
  const [shareModalOpen, setShareModalOpen] = React.useState(false);
  const [shareLoading, setShareLoading] = React.useState(false);
  const [sharingEnabled, setSharingEnabled] = React.useState<boolean | null>(null);
  const [sharingDisabledReason, setSharingDisabledReason] = React.useState<string | null>(null);

  // Check if sharing is enabled for this eval
  React.useEffect(() => {
    if (!IS_RUNNING_LOCALLY || !evalId) {
      setSharingEnabled(true); // Non-local instances always allow sharing
      setSharingDisabledReason(null);
      return;
    }

    const checkSharingEnabled = async () => {
      try {
        const response = await callApi(`/results/share/check-domain?id=${evalId}`);
        if (response.ok) {
          const data = await response.json();
          setSharingEnabled(data.sharingEnabled ?? false);
          setSharingDisabledReason(
            data.authError ||
              (data.sharingEnabled
                ? null
                : 'Sharing is not configured. Run `promptfoo auth login` to enable cloud sharing.'),
          );
        } else {
          setSharingEnabled(false);
          setSharingDisabledReason('Failed to check sharing status.');
        }
      } catch {
        setSharingEnabled(false);
        setSharingDisabledReason('Failed to check sharing status.');
      }
    };

    checkSharingEnabled();
  }, [evalId]);

  const handleShareButtonClick = async () => {
    if (IS_RUNNING_LOCALLY) {
      setShareLoading(true);
      setShareModalOpen(true);
    } else {
      // For non-local instances, just show the modal
      setShareModalOpen(true);
    }
  };

  const handleShare = async (id: string): Promise<string> => {
    try {
      if (!IS_RUNNING_LOCALLY) {
        // For non-local instances, include base path in the URL
        const basePath = import.meta.env.VITE_PUBLIC_BASENAME || '';
        return `${window.location.host}${basePath}${EVAL_ROUTES.DETAIL(id)}`;
      }

      const response = await callApi('/results/share', {
        method: 'POST',
        body: JSON.stringify({ id }),
        headers: {
          'Content-Type': 'application/json',
        },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate share URL');
      }
      return data.url;
    } catch (error) {
      console.error('Failed to generate share URL:', error);
      throw error;
    } finally {
      setShareLoading(false);
    }
  };

  return (
    <>
      {sharingEnabled === false ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="w-full">
              <DropdownMenuItem disabled className="pointer-events-none w-full">
                <Share className="size-4 mr-2" />
                Share
              </DropdownMenuItem>
            </span>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-xs">
            <p>{sharingDisabledReason}</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        <DropdownMenuItem
          onClick={handleShareButtonClick}
          disabled={shareLoading || sharingEnabled === null}
        >
          {shareLoading ? <Spinner className="size-4 mr-2" /> : <Share className="size-4 mr-2" />}
          Share
        </DropdownMenuItem>
      )}
      <ShareModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        evalId={evalId}
        onShare={handleShare}
      />
    </>
  );
}
