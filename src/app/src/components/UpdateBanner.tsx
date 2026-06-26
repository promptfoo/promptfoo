import { useEffect, useRef, useState } from 'react';

import { Alert } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import { useTelemetry } from '@app/hooks/useTelemetry';
import {
  type RuntimeCompatibilityNotice,
  useVersionCheck,
  type VersionInfo,
} from '@app/hooks/useVersionCheck';
import { cn } from '@app/lib/utils';
import { hasRuntimeSupportEnded, parseUtcMidnight } from '@app/utils/runtimeCompatibility';
import { Check, Copy, ExternalLink, RefreshCw, TriangleAlert, X } from 'lucide-react';

function formatRemovalDate(removalDate: string): string {
  const timestamp = parseUtcMidnight(removalDate);
  // The Web UI does not validate /version responses; fall back to the raw value rather than
  // letting Intl.DateTimeFormat throw a RangeError on an unexpected/invalid date string.
  if (timestamp === null) {
    return removalDate;
  }
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
    year: 'numeric',
  }).format(new Date(timestamp));
}

function RuntimeUpgradeMessage({
  notice,
  commandType,
  isBlockedUpdate,
}: {
  notice: RuntimeCompatibilityNotice;
  commandType: string | null | undefined;
  isBlockedUpdate: boolean;
}) {
  if (commandType === 'docker') {
    return (
      <>
        Pull the latest Promptfoo Docker image. If this is a derived image, update its Promptfoo
        base and rebuild it. Then redeploy the container to upgrade its bundled Node.js runtime.
      </>
    );
  }
  if (commandType === 'container') {
    if (isBlockedUpdate) {
      return (
        <>
          Update the Promptfoo source, dependency, or parent image to the latest release and this
          custom image&apos;s Node.js base to {notice.recommendedVersion}, then rebuild and
          redeploy.
        </>
      );
    }
    return (
      <>
        Update this custom image&apos;s Node.js base to {notice.recommendedVersion}, then rebuild
        and redeploy the container.
      </>
    );
  }
  if (isBlockedUpdate) {
    return (
      <>
        This Promptfoo server is running {notice.currentVersion}. Upgrade to Node.js{' '}
        {notice.minimumVersion} or newer, then update Promptfoo to the latest release.
      </>
    );
  }
  return (
    <>
      This Promptfoo server is running {notice.currentVersion}. Upgrade to Node.js{' '}
      {notice.minimumVersion} or newer; Node.js {notice.recommendedVersion} is recommended.
    </>
  );
}

function getCopyCommandLabel(commandType: string | null | undefined, copied: boolean): string {
  if (copied) {
    return 'Copied';
  }
  if (commandType === 'docker') {
    return 'Copy Docker Command';
  }
  if (commandType === 'npx') {
    return 'Copy npx Command';
  }
  return 'Copy Update Command';
}

function copyCommandWithFallback(command: string): void {
  const textarea = document.createElement('textarea');
  textarea.value = command;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);

  try {
    textarea.select();
    if (!document.execCommand('copy')) {
      throw new Error('Fallback copy command was rejected');
    }
  } finally {
    document.body.removeChild(textarea);
  }
}

async function copyUpdateCommand(command: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(command);
    return true;
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
  }

  try {
    copyCommandWithFallback(command);
    return true;
  } catch (error) {
    console.error('Fallback copy also failed:', error);
    alert(`Failed to copy. Command: ${command}`);
    return false;
  }
}

function getCopyStatus(copied: boolean): string {
  return copied ? 'Command copied' : '';
}

function ContainerUpdateMessage({ commandType }: { commandType: string | null | undefined }) {
  if (commandType === 'docker') {
    return (
      <span className="text-sm text-muted-foreground">
        If this is a derived image, update its Promptfoo base and rebuild before redeploying.
      </span>
    );
  }
  if (commandType === 'container') {
    return (
      <span className="text-sm text-muted-foreground">
        Update the Promptfoo source, dependency, or parent image, then rebuild and redeploy the
        container.
      </span>
    );
  }
  return null;
}

function getUpdateMode(versionInfo: VersionInfo | null): string | null | undefined {
  if (versionInfo?.updateCommands?.isCustomContainer) {
    return 'container';
  }
  return versionInfo?.commandType;
}

function getBlockedUpdateNotice(
  versionInfo: VersionInfo | null,
  updateDismissed: boolean,
  updateBlockedByRuntime: boolean,
): RuntimeCompatibilityNotice | null {
  return versionInfo?.runtimeNotice || updateDismissed || !updateBlockedByRuntime
    ? null
    : (versionInfo?.blockedUpdateNotice ?? null);
}

function getRuntimeGuidanceHeading(
  notice: RuntimeCompatibilityNotice,
  isRuntimeReminder: boolean,
  runtimeSupportEnded: boolean,
): string {
  return isRuntimeReminder
    ? `Node.js 20 support ${runtimeSupportEnded ? 'ended' : 'ends'} ${formatRemovalDate(notice.removalDate)} at 00:00 UTC`
    : 'Upgrade Node.js before updating Promptfoo';
}

function shouldRenderBanner(
  loading: boolean,
  error: Error | null,
  runtimeGuidance: RuntimeCompatibilityNotice | null,
  shouldShowUpdate: boolean,
): boolean {
  return !loading && !error && (!!runtimeGuidance || shouldShowUpdate);
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
  const updateMode = getUpdateMode(versionInfo);
  const isRuntimeNoticeDismissed = runtimeNoticeDismissed ?? dismissed;
  const isUpdateDismissed = updateDismissed ?? (runtimeNotice ? false : dismissed);
  const activeRuntimeNotice = runtimeNotice && !isRuntimeNoticeDismissed ? runtimeNotice : null;
  const runtimeSupportEndDate =
    runtimeNotice?.removalDate ??
    versionInfo?.blockedUpdateNotice?.removalDate ??
    versionInfo?.runtimePolicy?.supportEndDate;
  const runtimeSupportEnded = runtimeSupportEndDate
    ? hasRuntimeSupportEnded(runtimeSupportEndDate, runtimePolicyUpdatedAt)
    : false;
  const updateBlockedByRuntime =
    !!versionInfo?.updateBlockedByRuntime ||
    (runtimeSupportEnded && versionInfo?.commandType !== 'docker');
  const blockedUpdateNotice = getBlockedUpdateNotice(
    versionInfo,
    isUpdateDismissed,
    updateBlockedByRuntime,
  );
  const isBlockedUpdate =
    !!versionInfo?.blockedUpdateNotice && updateBlockedByRuntime && !isUpdateDismissed;
  const activeRuntimeGuidance = activeRuntimeNotice ?? blockedUpdateNotice;
  const shouldShowUpdate =
    !activeRuntimeNotice &&
    !isUpdateDismissed &&
    !!versionInfo?.updateAvailable &&
    !updateBlockedByRuntime;
  const shouldShowDockerAction =
    !!activeRuntimeNotice &&
    versionInfo?.commandType === 'docker' &&
    !!versionInfo.updateAvailable &&
    !updateBlockedByRuntime;
  const shouldShowBanner = shouldRenderBanner(
    loading,
    error,
    activeRuntimeGuidance,
    shouldShowUpdate,
  );
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

    if (command && (await copyUpdateCommand(command))) {
      setCopied(true);
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

  // Render only the highest-priority active notice. A dismissed runtime notice may
  // yield to an ordinary update while that update is still compatible.
  if (!shouldShowBanner || !versionInfo) {
    return null;
  }

  return (
    <Alert
      ref={bannerRef}
      role="group"
      aria-label={activeRuntimeNotice ? 'Node.js runtime notice' : 'Promptfoo update notice'}
      variant={activeRuntimeGuidance ? 'warning' : 'info'}
      className={cn(
        'relative z-(--z-banner) rounded-none px-4 py-2',
        'flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4',
        // Use solid background to prevent content showing through the banner
        activeRuntimeGuidance ? 'dark:bg-amber-950' : 'dark:bg-blue-950',
      )}
    >
      <div
        role={activeRuntimeGuidance && runtimeSupportEnded ? 'alert' : 'status'}
        aria-atomic="true"
        className="flex items-start gap-3 sm:items-center"
      >
        {activeRuntimeGuidance ? (
          <TriangleAlert className="size-4 shrink-0" />
        ) : (
          <RefreshCw className="size-4 shrink-0" />
        )}
        {activeRuntimeGuidance ? (
          <div className="flex max-w-4xl flex-col gap-0.5">
            <span className="text-sm font-medium">
              {getRuntimeGuidanceHeading(
                activeRuntimeGuidance,
                !!activeRuntimeNotice,
                runtimeSupportEnded,
              )}
            </span>
            <span className="text-sm text-muted-foreground dark:text-amber-200">
              <RuntimeUpgradeMessage
                notice={activeRuntimeGuidance}
                commandType={updateMode}
                isBlockedUpdate={isBlockedUpdate}
              />
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
            <ContainerUpdateMessage commandType={updateMode} />
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {getCopyStatus(copied)}
        </span>
        {activeRuntimeGuidance ? (
          <Button variant="ghost" size="sm" asChild className="gap-1.5 text-xs">
            <a
              href={activeRuntimeGuidance.documentationUrl}
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
        {(!activeRuntimeGuidance || shouldShowDockerAction) &&
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
              {getCopyCommandLabel(versionInfo.commandType, copied)}
            </Button>
          )}
        {activeRuntimeNotice ? (
          <Button variant="ghost" size="sm" onClick={handleDismiss} className="text-xs">
            Remind me later
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
