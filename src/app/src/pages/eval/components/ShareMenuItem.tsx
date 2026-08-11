import React from 'react';

import { DropdownMenuItem } from '@app/components/ui/dropdown-menu';
import { Spinner } from '@app/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { IS_RUNNING_LOCALLY } from '@app/constants';
import { Share } from 'lucide-react';
import { checkShareAvailability, isAbortError, ShareAvailabilityError } from './shareApi';

interface ShareMenuItemProps {
  evalId: string;
  onClick: () => void;
  loading?: boolean;
}

type ShareAvailabilityState =
  | { evalId: string; status: 'checking' }
  | { evalId: string; status: 'enabled' }
  | { evalId: string; status: 'disabled'; reason: string; retryable: boolean };

function initialState(evalId: string): ShareAvailabilityState {
  return {
    evalId,
    status: !IS_RUNNING_LOCALLY || !evalId ? 'enabled' : 'checking',
  };
}

/**
 * Menu item that triggers the share dialog.
 * Keeps unavailable states focusable so keyboard users can discover the reason and retry.
 */
export default function ShareMenuItem({ evalId, onClick, loading = false }: ShareMenuItemProps) {
  const [availability, setAvailability] = React.useState<ShareAvailabilityState>(() =>
    initialState(evalId),
  );
  const [retryAttempt, setRetryAttempt] = React.useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: retryAttempt intentionally retriggers the request
  React.useEffect(() => {
    if (!IS_RUNNING_LOCALLY || !evalId) {
      setAvailability({ evalId, status: 'enabled' });
      return;
    }

    let active = true;
    const controller = new AbortController();
    setAvailability({ evalId, status: 'checking' });

    checkShareAvailability(evalId, controller.signal)
      .then((result) => {
        if (!active) {
          return;
        }
        setAvailability(
          result.sharingEnabled
            ? { evalId, status: 'enabled' }
            : {
                evalId,
                status: 'disabled',
                reason: result.sharingDisabledReason ?? 'Sharing is unavailable.',
                retryable: result.isRetryable,
              },
        );
      })
      .catch((error: unknown) => {
        if (!active || isAbortError(error)) {
          return;
        }
        setAvailability({
          evalId,
          status: 'disabled',
          reason: error instanceof Error ? error.message : 'Failed to check sharing availability.',
          retryable: error instanceof ShareAvailabilityError ? error.retryable : true,
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [evalId, retryAttempt]);

  const currentAvailability = availability.evalId === evalId ? availability : initialState(evalId);
  const checking = currentAvailability.status === 'checking';
  const disabled = currentAvailability.status === 'disabled';
  const retryable = disabled && currentAvailability.retryable;
  const inactive = checking || (disabled && !retryable) || loading;
  const reason = loading
    ? 'A share link is already being generated.'
    : checking
      ? 'Checking whether sharing is available.'
      : disabled
        ? currentAvailability.reason
        : 'Share this evaluation.';
  const label = loading
    ? 'Sharing...'
    : checking
      ? 'Checking sharing...'
      : retryable
        ? 'Retry sharing check'
        : 'Share';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <DropdownMenuItem
          aria-busy={checking || loading}
          aria-disabled={inactive}
          className={inactive ? 'aria-disabled:opacity-50' : undefined}
          onSelect={(event) => {
            if (retryable) {
              event.preventDefault();
              setAvailability({ evalId, status: 'checking' });
              setRetryAttempt((attempt) => attempt + 1);
              return;
            }
            if (inactive) {
              event.preventDefault();
              return;
            }
            onClick();
          }}
        >
          {checking || loading ? (
            <Spinner className="size-4 mr-2" />
          ) : (
            <Share className="size-4 mr-2" />
          )}
          {label}
        </DropdownMenuItem>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-xs">
        <p>{reason}</p>
      </TooltipContent>
    </Tooltip>
  );
}
