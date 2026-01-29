import React from 'react';

import { DropdownMenuItem } from '@app/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { IS_RUNNING_LOCALLY } from '@app/constants';
import { callApi } from '@app/utils/api';
import { Share } from 'lucide-react';

interface ShareMenuItemProps {
  evalId: string;
  onClick: () => void;
}

/**
 * Menu item that triggers the share dialog.
 * Checks if sharing is enabled and shows a disabled state with tooltip if not.
 */
export default function ShareMenuItem({ evalId, onClick }: ShareMenuItemProps) {
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

  if (sharingEnabled === false) {
    return (
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
    );
  }

  return (
    <DropdownMenuItem onSelect={onClick} disabled={sharingEnabled === null}>
      <Share className="size-4 mr-2" />
      Share
    </DropdownMenuItem>
  );
}
