import { useEffect, useRef, useState } from 'react';

import { Alert } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { useVersionCheck } from '@app/hooks/useVersionCheck';
import { cn } from '@app/lib/utils';
import { getRuntimeNoticeReminderIntervalDays } from '@app/utils/runtimeCompatibility';
import { Check, Copy, ExternalLink, RefreshCw, TriangleAlert, X } from 'lucide-react';

function formatRemovalDate(removalDate: string): string {
  const parsed = new Date(`${removalDate}T00:00:00.000Z`);
  // The Web UI does not validate /version responses; fall back to the raw value rather than
  // letting Intl.DateTimeFormat throw a RangeError on an unexpected/invalid date string.
  if (Number.isNaN(parsed.getTime())) {
    return removalDate;
  }
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
    year: 'numeric',
  }).format(parsed);
}

function getReminderLabel(reminderIntervalDays: 1 | 7): string {
  return reminderIntervalDays === 1 ? 'Remind me tomorrow' : 'Remind me in 7 days';
}

function hasRuntimeSupportEnded(removalDate: string, now = Date.now()): boolean {
  const removalTimestamp = Date.parse(`${removalDate}T00:00:00.000Z`);
  return !Number.isNaN(removalTimestamp) && now >= removalTimestamp;
}

export default function UpdateBanner() {
  const {
    versionInfo,
    loading,
    error,
    dismissed,
    dismiss,
    runtimeNoticeDismissed,
    updateDismissed,
    dismissRuntimeNotice,
    dismissUpdate,
    runtimePolicyUpdatedAt,
  } = useVersionCheck();
  const { isInitialized, recordEvent } = useTelemetry();
  const [copied, setCopied] = useState(false);
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const recordedRuntimeNoticeRef = useRef<string | null>(null);
  const runtimeNotice = versionInfo?.runtimeNotice ?? null;
  const isRuntimeNoticeDismissed = runtimeNoticeDismissed ?? dismissed;
  const isUpdateDismissed = updateDismissed ?? (runtimeNotice ? false : dismissed);
  const activeRuntimeNotice = runtimeNotice && !isRuntimeNoticeDismissed ? runtimeNotice : null;
  const runtimeSupportEndDate =
    runtimeNotice?.removalDate ?? versionInfo?.runtimePolicy?.supportEndDate;
  const runtimeSupportEnded = runtimeSupportEndDate
    ? hasRuntimeSupportEnded(runtimeSupportEndDate, runtimePolicyUpdatedAt)
    : false;
  const updateBlockedByRuntime =
    !!versionInfo?.updateBlockedByRuntime ||
    (runtimeSupportEnded && versionInfo?.commandType !== 'docker');
  const shouldShowRuntimeNotice = !!activeRuntimeNotice;
  const shouldShowUpdate =
    !activeRuntimeNotice &&
    !isUpdateDismissed &&
    !!versionInfo?.updateAvailable &&
    !updateBlockedByRuntime;
  const shouldShowBanner = !loading && !error && (shouldShowRuntimeNotice || shouldShowUpdate);
  const dismissLabel = "Don't remind me of this version";

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

  useEffect(() => {
    if (!shouldShowBanner || !activeRuntimeNotice) {
      recordedRuntimeNoticeRef.current = null;
      return;
    }

    if (isInitialized && recordedRuntimeNoticeRef.current !== activeRuntimeNotice.id) {
      recordEvent('feature_used', {
        action: 'shown',
        feature: 'runtime_compatibility_notice',
        noticeId: activeRuntimeNotice.id,
        runtimeMajor: activeRuntimeNotice.currentMajor,
        surface: 'webui_banner',
      });
      recordedRuntimeNoticeRef.current = activeRuntimeNotice.id;
    }
  }, [activeRuntimeNotice, isInitialized, recordEvent, shouldShowBanner]);

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
          document.execCommand('copy');
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

  const handleDismiss = () => {
    if (activeRuntimeNotice) {
      recordEvent('feature_used', {
        action: 'remind_later',
        feature: 'runtime_compatibility_notice',
        noticeId: activeRuntimeNotice.id,
        runtimeMajor: activeRuntimeNotice.currentMajor,
        surface: 'webui_banner',
      });
      (dismissRuntimeNotice ?? dismiss)();
      return;
    }
    (dismissUpdate ?? dismiss)();
  };

  const handleRuntimeGuideClick = () => {
    if (!activeRuntimeNotice) {
      return;
    }
    recordEvent('feature_used', {
      action: 'guide_clicked',
      feature: 'runtime_compatibility_notice',
      noticeId: activeRuntimeNotice.id,
      runtimeMajor: activeRuntimeNotice.currentMajor,
      surface: 'webui_banner',
    });
  };

  // Render only the highest-priority active notice. A snoozed runtime notice may
  // yield to an ordinary update while that update is still compatible.
  if (!shouldShowBanner || !versionInfo) {
    return null;
  }

  return (
    <Alert
      ref={bannerRef}
      variant={activeRuntimeNotice ? 'warning' : 'info'}
      className={cn(
        'relative z-(--z-banner) rounded-none px-4 py-2',
        'flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4',
        // Use solid background to prevent content showing through the banner
        activeRuntimeNotice ? 'dark:bg-amber-950' : 'dark:bg-blue-950',
      )}
    >
      <div className="flex items-start gap-3 sm:items-center">
        {activeRuntimeNotice ? (
          <TriangleAlert className="size-4 shrink-0" />
        ) : (
          <RefreshCw className="size-4 shrink-0" />
        )}
        {activeRuntimeNotice ? (
          <div className="flex max-w-4xl flex-col gap-0.5">
            <span className="text-sm font-medium">
              Node.js 20 support {runtimeSupportEnded ? 'ended' : 'ends'}{' '}
              {formatRemovalDate(activeRuntimeNotice.removalDate)}
            </span>
            <span className="text-sm text-muted-foreground">
              This Promptfoo server is running {activeRuntimeNotice.currentVersion}. Upgrade to
              Node.js {activeRuntimeNotice.minimumVersion} or newer; Node.js{' '}
              {activeRuntimeNotice.recommendedVersion} is recommended. Upgrading also lets promptfoo
              move to Node&apos;s built-in SQLite, removing a platform-specific database binding.
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium">
              Update available: v{versionInfo.latestVersion}
            </span>
            <span className="text-sm text-muted-foreground">
              (current: v{versionInfo.currentVersion})
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {activeRuntimeNotice ? (
          <Button variant="ghost" size="sm" asChild className="gap-1.5 text-xs">
            <a
              href={activeRuntimeNotice.documentationUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleRuntimeGuideClick}
            >
              View upgrade guide
              <ExternalLink className="size-3" />
            </a>
          </Button>
        ) : (
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
        )}
        {!activeRuntimeNotice && versionInfo?.updateCommands?.primary && (
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
            {versionInfo.commandType === 'docker'
              ? 'Copy Docker Command'
              : versionInfo.commandType === 'npx'
                ? 'Copy npx Command'
                : 'Copy Update Command'}
          </Button>
        )}
        {activeRuntimeNotice ? (
          <Button variant="ghost" size="sm" onClick={handleDismiss} className="text-xs">
            {getReminderLabel(
              getRuntimeNoticeReminderIntervalDays(activeRuntimeNotice, runtimePolicyUpdatedAt),
            )}
          </Button>
        ) : (
          <button
            type="button"
            onClick={handleDismiss}
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
        )}
      </div>
    </Alert>
  );
}
