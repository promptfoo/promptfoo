import { useRef, useState } from 'react';

import { Alert, AlertContent, AlertDescription } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import useCloudConfig, { type CloudConfigData } from '@app/hooks/useCloudConfig';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { cn } from '@app/lib/utils';
import { AlertCircle, Cloud, CloudOff, ExternalLink, Loader2, RefreshCw } from 'lucide-react';

type Status = 'loading' | 'error' | 'unavailable-url' | 'configured' | 'unconfigured';

interface IndicatorState {
  status: Status;
  serviceName: string;
  teamName: 'team' | 'organization';
  safeAppUrl: string | null;
  connectDestination: { href: string; label: string } | null;
  loginCommand: string;
}

function deriveIndicatorState(
  data: CloudConfigData | null,
  isLoading: boolean,
  isError: boolean,
): IndicatorState {
  const isConfigured = data?.isEnabled ?? false;
  const isEnterprise = data?.isEnterprise ?? false;
  const safeAppUrl = data?.appUrl ?? null;
  const serviceName = isEnterprise ? 'Promptfoo Enterprise' : 'Promptfoo Cloud';

  const status: Status = isLoading
    ? 'loading'
    : isError
      ? 'error'
      : isConfigured && !safeAppUrl
        ? 'unavailable-url'
        : isConfigured
          ? 'configured'
          : 'unconfigured';

  const connectDestination = isEnterprise
    ? safeAppUrl
      ? { href: safeAppUrl, label: new URL(safeAppUrl).hostname }
      : null
    : { href: 'https://www.promptfoo.app/welcome', label: 'promptfoo.app' };

  return {
    status,
    serviceName,
    teamName: isEnterprise ? 'organization' : 'team',
    safeAppUrl,
    connectDestination,
    loginCommand: isEnterprise
      ? 'promptfoo auth login --host <enterprise-dashboard-url>'
      : 'promptfoo auth login',
  };
}

function statusLabel(state: IndicatorState): string {
  switch (state.status) {
    case 'loading':
      return 'Checking cloud configuration';
    case 'error':
      return 'Unable to check cloud configuration';
    case 'unavailable-url':
      return `${state.serviceName} dashboard URL is unavailable.`;
    case 'configured':
      return `Configured for ${state.serviceName}. Open dashboard.`;
    case 'unconfigured':
      return `${state.serviceName} is not configured. Learn more.`;
  }
}

export default function CloudStatusIndicator() {
  const { data, isLoading, error, refetch } = useCloudConfig();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [showDialog, setShowDialog] = useState(false);
  const { recordEvent } = useTelemetry();

  const state = deriveIndicatorState(data, isLoading, error !== null);
  const canOpenDashboard = state.status === 'configured' && state.safeAppUrl !== null;
  const label = statusLabel(state);

  const StatusIcon =
    state.status === 'loading' ? Loader2 : state.status === 'configured' ? Cloud : CloudOff;

  const handleIconClick = () => {
    recordEvent('feature_used', {
      feature: 'cloud_status_icon_click',
      configured: state.status === 'configured',
    });
    if (canOpenDashboard && state.safeAppUrl) {
      window.open(state.safeAppUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    setShowDialog(true);
  };

  const handleConnectClick = () => {
    recordEvent('webui_action', {
      action: 'cloud_cta_signup_click',
      source: 'cloud_status_dialog',
    });
  };

  const handleRefreshClick = () => {
    recordEvent('webui_action', {
      action: 'cloud_status_refresh',
      source: 'cloud_status_dialog',
    });
    refetch();
  };

  const showFailureAlert = state.status === 'error' || state.status === 'unavailable-url';
  const failureMessage =
    state.status === 'error'
      ? 'Unable to check cloud configuration. Please check your connection and try again.'
      : `The ${state.serviceName} dashboard URL is missing or invalid. Sign in again, then refresh.`;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            ref={triggerRef}
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleIconClick}
            className={cn(
              'size-11 text-foreground/60 focus-visible:ring-2 focus-visible:ring-offset-2 sm:size-9 [&_svg]:size-5',
              canOpenDashboard &&
                'text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300',
              showFailureAlert && 'text-destructive hover:text-destructive',
            )}
            aria-label={label}
          >
            <StatusIcon className={cn('size-5', state.status === 'loading' && 'animate-spin')} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent
          hideDescription={false}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Configure {state.serviceName}</DialogTitle>
            <DialogDescription>
              Connect to share evaluation results with your {state.teamName}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Alert variant="info">
              <AlertCircle className="size-4" />
              <AlertContent>
                <AlertDescription>
                  Run <code className="rounded bg-muted px-1 py-0.5">{state.loginCommand}</code>
                  {state.connectDestination && (
                    <>
                      {' '}
                      or visit{' '}
                      <a
                        href={state.connectDestination.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={handleConnectClick}
                        className="font-medium underline text-primary hover:text-primary/80"
                      >
                        {state.connectDestination.label}
                      </a>
                    </>
                  )}
                  .
                </AlertDescription>
              </AlertContent>
            </Alert>

            {showFailureAlert && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertContent>
                  <AlertDescription>{failureMessage}</AlertDescription>
                </AlertContent>
              </Alert>
            )}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="outline"
              onClick={() => {
                recordEvent('webui_action', {
                  action: 'cloud_learn_more_click',
                  source: 'cloud_status_dialog',
                });
                window.open(
                  'https://www.promptfoo.dev/docs/usage/sharing/',
                  '_blank',
                  'noopener,noreferrer',
                );
              }}
            >
              <ExternalLink className="mr-2 size-4" />
              Learn More
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleRefreshClick} disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 size-4" />
                )}
                {isLoading ? 'Checking...' : 'Refresh Configuration'}
              </Button>
              <Button onClick={() => setShowDialog(false)}>Close</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
