import { useEffect, useRef, useState } from 'react';

import { Alert } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import { useVersionCheck } from '@app/hooks/useVersionCheck';
import { cn } from '@app/lib/utils';
import { Check, Copy, ExternalLink, RefreshCw, X } from 'lucide-react';

const COPY_COMMAND_LABELS = {
  docker: 'Copy Docker Command',
  npx: 'Copy npx Command',
  npm: 'Copy Update Command',
} as const;

export default function UpdateBanner() {
  const { versionInfo, loading, error, dismissed, dismiss } = useVersionCheck();
  const [copied, setCopied] = useState(false);
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const dismissLabel = "Don't remind me of this version";
  const shouldShowBanner = !loading && !error && !!versionInfo?.updateAvailable && !dismissed;

  useEffect(() => {
    if (!shouldShowBanner) {
      document.documentElement.style.removeProperty('--update-banner-height');
      return;
    }

    const element = bannerRef.current;

    if (!element) {
      return () => {
        document.documentElement.style.removeProperty('--update-banner-height');
      };
    }

    const updateHeight = () => {
      const height = element.offsetHeight;
      document.documentElement.style.setProperty('--update-banner-height', `${height}px`);
    };

    updateHeight();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        updateHeight();
      });
      observer.observe(element);

      return () => {
        observer.disconnect();
        document.documentElement.style.removeProperty('--update-banner-height');
      };
    }

    window.addEventListener('resize', updateHeight);

    return () => {
      window.removeEventListener('resize', updateHeight);
      document.documentElement.style.removeProperty('--update-banner-height');
    };
  }, [shouldShowBanner]);

  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [copied]);

  const handleCopyCommand = async () => {
    const command = versionInfo?.updateCommands?.primary;

    if (command) {
      const onSuccess = () => {
        setCopied(true);
      };

      try {
        await navigator.clipboard.writeText(command);
        onSuccess();
      } catch (err) {
        // Fallback for browsers that don't support clipboard API or when it fails
        console.error('Failed to copy to clipboard:', err);
        // Create a temporary textarea element as fallback
        const textarea = document.createElement('textarea');
        textarea.value = command;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
          // execCommand reports rejection via its return value, not by throwing. Without this
          // check a refused copy would still render the "Copied!" success state.
          if (!document.execCommand('copy')) {
            throw new Error('Fallback copy command was rejected');
          }
          onSuccess();
        } catch (fallbackError) {
          console.error('Fallback copy also failed:', fallbackError);
          // Show the command in an alert as last resort
          alert(`Failed to copy. Command: ${command}`);
        } finally {
          document.body.removeChild(textarea);
        }
      }
    }
  };

  // Don't show banner if loading, error, no update available, or dismissed
  if (!shouldShowBanner) {
    return null;
  }

  return (
    <Alert
      ref={bannerRef}
      variant="info"
      // An available update is informational, not urgent. `Alert` defaults to role="alert",
      // which is an assertive live region and interrupts screen readers; role="group" keeps
      // the banner passive and lets the inner polite live region own announcements.
      role="group"
      aria-label="Update available"
      className={cn(
        'relative z-(--z-banner) rounded-none px-4 py-2',
        'flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4',
        // Use solid background to prevent content showing through the banner
        'dark:bg-blue-950',
      )}
    >
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="flex items-start gap-3 sm:items-center"
      >
        <RefreshCw className="size-4 shrink-0" />
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium">
            Update available: v{versionInfo.latestVersion}
          </span>
          <span className="text-sm text-muted-foreground">
            (current: v{versionInfo.currentVersion})
          </span>
          {versionInfo.commandType === 'docker' &&
            !versionInfo.updateCommands?.isCustomContainer && (
              <span className="text-sm text-muted-foreground">
                If this is a derived image, update its Promptfoo base and rebuild before
                redeploying.
              </span>
            )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <Button variant="ghost" size="sm" asChild className="gap-1.5 text-xs">
          <a
            href="https://github.com/promptfoo/promptfoo/releases/latest"
            target="_blank"
            rel="noopener noreferrer"
          >
            Release Notes
            <ExternalLink className="size-3" />
          </a>
        </Button>
        {/* Custom containers have no copyable command: the image owner has to update the
            Promptfoo source or parent image and rebuild. Without this branch the banner would
            render version numbers and no instruction at all. */}
        {versionInfo?.updateCommands?.isCustomContainer ? (
          <span className="text-xs text-muted-foreground">
            Update the Promptfoo source, dependency, or parent image, then rebuild and redeploy the
            container.
          </span>
        ) : (
          versionInfo?.updateCommands?.primary && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyCommand}
              title={versionInfo.updateCommands.primary}
              className="gap-1.5 text-xs"
            >
              {copied ? (
                <Check className="size-3 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Copy className="size-3" />
              )}
              {copied ? 'Copied' : COPY_COMMAND_LABELS[versionInfo.commandType ?? 'npm']}
            </Button>
          )
        )}
        {/* Polite live region so screen readers get the copy confirmation the icon swap alone
            does not convey. */}
        <span aria-live="polite" aria-atomic="true" className="sr-only">
          {copied ? 'Update command copied to clipboard' : ''}
        </span>
        <button
          type="button"
          onClick={dismiss}
          aria-label={dismissLabel}
          title={dismissLabel}
          className={cn(
            'inline-flex size-6 items-center justify-center rounded-md',
            'text-current opacity-70 hover:opacity-100',
            'hover:bg-black/10 dark:hover:bg-white/10',
            'cursor-pointer transition-colors',
          )}
        >
          <X className="size-4" />
        </button>
      </div>
    </Alert>
  );
}
