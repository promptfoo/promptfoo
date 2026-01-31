import { useEffect, useState } from 'react';

import { Alert } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import { useVersionCheck } from '@app/hooks/useVersionCheck';
import { cn } from '@app/lib/utils';
import { Check, Copy, ExternalLink, RefreshCw, X } from 'lucide-react';

export default function UpdateBanner() {
  const { versionInfo, loading, error, dismissed, dismiss } = useVersionCheck();
  const [copied, setCopied] = useState(false);

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

  // Don't show banner if loading, error, no update available, or dismissed
  if (loading || error || !versionInfo?.updateAvailable || dismissed) {
    return null;
  }

  return (
    <div
      className={cn(
        'fixed top-16 right-4 z-(--z-banner)',
        'animate-in slide-in-from-top-2 fade-in duration-300',
      )}
    >
      <Alert
        variant="info"
        className={cn(
          'py-3 px-4 shadow-lg',
          'flex flex-col gap-3',
          'max-w-sm',
          'bg-white dark:bg-blue-950',
          'border border-blue-200 dark:border-blue-800',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <RefreshCw className="size-4 shrink-0 text-blue-600 dark:text-blue-400" />
            <div className="flex flex-col">
              <span className="text-sm font-medium">
                Update available: v{versionInfo.latestVersion}
              </span>
              <span className="text-xs text-muted-foreground">
                current: v{versionInfo.currentVersion}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss update notification"
            title="Don't remind me for this version"
            className={cn(
              'inline-flex size-6 items-center justify-center rounded-md shrink-0',
              'text-current opacity-70 hover:opacity-100',
              'hover:bg-black/10 dark:hover:bg-white/10',
              'transition-colors',
            )}
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
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
          {versionInfo?.updateCommands?.primary && (
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
        </div>
      </Alert>
    </div>
  );
}
