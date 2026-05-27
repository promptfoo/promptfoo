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
import useCloudConfig from '@app/hooks/useCloudConfig';
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

function getServiceName(isEnterprise: boolean) {
  return isEnterprise ? 'Promptfoo Enterprise' : 'Promptfoo Cloud';
}

function getBrowserSafeAppUrl(appUrl: string | null) {
  if (!appUrl) {
    return null;
  }

  try {
    const parsedUrl = new URL(appUrl);
    if (
      !['http:', 'https:'].includes(parsedUrl.protocol) ||
      parsedUrl.username ||
      parsedUrl.password
    ) {
      return null;
    }
    return appUrl;
  } catch {
    return null;
  }
}

function getConnectDestination(isEnterprise: boolean, safeAppUrl: string | null) {
  if (isEnterprise && safeAppUrl) {
    return {
      href: safeAppUrl,
      label: new URL(safeAppUrl).hostname,
    };
  }

  return {
    href: 'https://www.promptfoo.app/welcome',
    label: 'promptfoo.app',
  };
}

export default function CloudStatusIndicator() {
  const { data, isLoading, error, refetch } = useCloudConfig();
  const [showDialog, setShowDialog] = useState(false);
  const { recordEvent } = useTelemetry();

  const isConfigured = data?.isEnabled ?? false;
  const appUrl = getBrowserSafeAppUrl(data?.appUrl ?? null);
  const isEnterprise = data?.isEnterprise ?? false;
  const serviceName = getServiceName(isEnterprise);
  const teamName = isEnterprise ? 'organization' : 'team';
  const hasInvalidAppUrl = isConfigured && !appUrl;
  const status = (() => {
    if (isLoading) {
      return 'loading';
    }
    if (error) {
      return 'error';
    }
    if (hasInvalidAppUrl) {
      return 'invalid-url';
    }
    if (isConfigured) {
      return 'configured';
    }
    return 'unconfigured';
  })();
  const canOpenDashboard = status === 'configured' && Boolean(appUrl);
  const connectDestination = getConnectDestination(isEnterprise, appUrl);

  const statusLabel = (() => {
    if (status === 'loading') {
      return 'Checking cloud configuration';
    }
    if (status === 'error') {
      return 'Unable to check cloud configuration';
    }
    if (status === 'invalid-url') {
      return `${serviceName} configuration has an invalid application URL.`;
    }
    if (status === 'configured') {
      return `Configured for ${serviceName}. Open dashboard.`;
    }
    return `${serviceName} is not configured. Learn more.`;
  })();

  const StatusIcon = (() => {
    if (status === 'loading') {
      return Loader2;
    }
    if (status !== 'configured') {
      return CloudOff;
    }
    return Cloud;
  })();

  const handleIconClick = () => {
    recordEvent('feature_used', {
      feature: 'cloud_status_icon_click',
      configured: isConfigured,
    });

    if (canOpenDashboard && appUrl) {
      window.open(appUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    setShowDialog(true);
  };

  const handlePromptfooAppClick = () => {
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
              canOpenDashboard && 'text-emerald-600 hover:text-emerald-700',
              (status === 'error' || status === 'invalid-url') &&
                'text-destructive hover:text-destructive',
            )}
            aria-label={statusLabel}
          >
            <StatusIcon
              className={cn('size-5', status === 'loading' && 'animate-spin')}
              data-testid={canOpenDashboard ? 'CloudIcon' : 'CloudOffIcon'}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{statusLabel}</TooltipContent>
      </Tooltip>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent hideDescription={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CloudCog className="size-5 text-primary" />
              Configure {serviceName}
            </DialogTitle>
            <DialogDescription>
              Configure {serviceName} to unlock {isEnterprise ? 'enterprise' : 'team'} workflows.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-3 rounded-md border border-border p-3">
              <div className="flex items-center gap-2 text-sm">
                <Share2 className="size-4 text-primary" />
                <span>Share evaluation results with your {teamName}</span>
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
                    href={connectDestination.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={handlePromptfooAppClick}
                    className="font-medium underline text-primary hover:text-primary/80"
                  >
                    {connectDestination.label}
                  </a>
                  .
                </AlertDescription>
              </AlertContent>
            </Alert>

            {(error || hasInvalidAppUrl) && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertContent>
                  <AlertDescription>
                    {hasInvalidAppUrl
                      ? 'The configured Cloud application URL is invalid. Re-authenticate or update your Cloud configuration before opening the dashboard.'
                      : 'Unable to check cloud configuration. Please check your connection and try again.'}
                  </AlertDescription>
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
