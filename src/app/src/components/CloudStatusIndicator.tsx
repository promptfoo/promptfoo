import { useState } from 'react';

import { Alert, AlertContent, AlertDescription } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
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

export default function CloudStatusIndicator() {
  const { data, isLoading, error, refetch } = useCloudConfig();
  const [showDialog, setShowDialog] = useState(false);
  const { recordEvent } = useTelemetry();

  const isConfigured = data?.isEnabled ?? false;
  const appUrl = data?.appUrl ?? null;
  const isEnterprise = data?.isEnterprise ?? false;
  const serviceName = getServiceName(isEnterprise);
  const teamName = isEnterprise ? 'organization' : 'team';
  const hasInvalidAppUrl = isConfigured && !appUrl;

  const statusLabel = (() => {
    if (isLoading) {
      return 'Checking cloud status';
    }
    if (error) {
      return 'Unable to check cloud status';
    }
    if (hasInvalidAppUrl) {
      return `${serviceName} configuration has an invalid application URL.`;
    }
    if (isConfigured) {
      return `Configured for ${serviceName}. Open dashboard.`;
    }
    return `${serviceName} is not configured. Learn more.`;
  })();

  const StatusIcon = (() => {
    if (isLoading) {
      return Loader2;
    }
    if (error || hasInvalidAppUrl || !isConfigured) {
      return CloudOff;
    }
    return Cloud;
  })();

  const handleIconClick = () => {
    recordEvent('feature_used', {
      feature: 'cloud_status_icon_click',
      configured: isConfigured,
    });

    if (isConfigured && appUrl) {
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
          <button
            type="button"
            onClick={handleIconClick}
            className={cn(
              'inline-flex size-9 items-center justify-center rounded-md text-foreground/60 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              isConfigured && appUrl && !error && 'text-emerald-600 hover:text-emerald-700',
              (error || hasInvalidAppUrl) && 'text-destructive hover:text-destructive',
            )}
            aria-label={statusLabel}
          >
            <StatusIcon
              className={cn('size-5', isLoading && 'animate-spin')}
              data-testid={isConfigured && appUrl && !error ? 'CloudIcon' : 'CloudOffIcon'}
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{statusLabel}</TooltipContent>
      </Tooltip>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CloudCog className="size-5 text-primary" />
              Connect to {serviceName}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Connect to unlock {isEnterprise ? 'enterprise' : 'team'} workflows.
            </p>

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
                    href="https://www.promptfoo.app/welcome"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={handlePromptfooAppClick}
                    className="font-medium underline text-primary hover:text-primary/80"
                  >
                    promptfoo.app
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
                    Unable to connect to cloud service. Please check your connection and try again.
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
                {isLoading ? 'Checking...' : 'Refresh Status'}
              </Button>
              <Button onClick={() => setShowDialog(false)}>Close</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
