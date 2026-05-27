import { useState } from 'react';

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
import {
  AlertCircle,
  Cloud,
  CloudCog,
  CloudOff,
  ExternalLink,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  Share2,
} from 'lucide-react';

type Status = 'loading' | 'error' | 'unavailable-url' | 'configured' | 'unconfigured';

interface IndicatorState {
  status: Status;
  serviceName: string;
  teamName: 'team' | 'organization';
  // Browser-safe https/http URL with no embedded credentials. `null` when
  // the API reported a configured cloud whose dashboard URL we can't trust.
  safeAppUrl: string | null;
  // Where the "connect" CTA in the dialog should send the user. For
  // enterprise we point at the configured app host; otherwise the public
  // signup page.
  connectDestination: { href: string; label: string };
}

/**
 * Browser-safe URL gate: reject non-http(s) protocols and embedded
 * credentials. The server already does this, but we re-check here in case
 * the response is forged or older clients didn't sanitize.
 */
function toBrowserSafeAppUrl(appUrl: string | null | undefined): string | null {
  if (!appUrl) {
    return null;
  }
  try {
    const parsed = new URL(appUrl);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      return null;
    }
    return appUrl;
  } catch {
    return null;
  }
}

function deriveIndicatorState(
  data: CloudConfigData | undefined,
  isLoading: boolean,
  isError: boolean,
): IndicatorState {
  const isConfigured = data?.isEnabled ?? false;
  const isEnterprise = data?.isEnterprise ?? false;
  const safeAppUrl = toBrowserSafeAppUrl(data?.appUrl);
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

  const connectDestination =
    isEnterprise && safeAppUrl
      ? { href: safeAppUrl, label: new URL(safeAppUrl).hostname }
      : { href: 'https://www.promptfoo.app/welcome', label: 'promptfoo.app' };

  return {
    status,
    serviceName,
    teamName: isEnterprise ? 'organization' : 'team',
    safeAppUrl,
    connectDestination,
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
  const { data, isLoading, isError, refetch } = useCloudConfig();
  const [showDialog, setShowDialog] = useState(false);
  const { recordEvent } = useTelemetry();

  const state = deriveIndicatorState(data, isLoading, isError);
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
      : `A safe ${state.serviceName} dashboard URL is unavailable. Sign in again or refresh after updating your configuration.`;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
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
            <StatusIcon
              className={cn('size-5', state.status === 'loading' && 'animate-spin')}
              data-testid={canOpenDashboard ? 'CloudIcon' : 'CloudOffIcon'}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        {/*
          hideDescription={false} so the explicit <DialogDescription> below
          becomes the dialog's accessible description. The primitive's default
          (`hideDescription={true}`) injects a hidden placeholder and nulls
          aria-describedby — useful when no real description is provided, but
          here we have one.
        */}
        <DialogContent hideDescription={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CloudCog className="size-5 text-primary" />
              Configure {state.serviceName}
            </DialogTitle>
            <DialogDescription>
              Configure {state.serviceName} to unlock {state.teamName} workflows.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-3 rounded-md border border-border p-3">
              <div className="flex items-center gap-2 text-sm">
                <Share2 className="size-4 text-primary" />
                <span>Share evaluation results with your {state.teamName}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <LayoutDashboard className="size-4 text-primary" />
                <span>Open centralized dashboards and reports</span>
              </div>
            </div>

            <Alert variant="info">
              <AlertCircle className="size-4" />
              <AlertContent>
                <AlertDescription>
                  Run <code className="rounded bg-muted px-1 py-0.5">promptfoo auth login</code> or
                  visit{' '}
                  <a
                    href={state.connectDestination.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={handleConnectClick}
                    className="font-medium underline text-primary hover:text-primary/80"
                  >
                    {state.connectDestination.label}
                  </a>
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
