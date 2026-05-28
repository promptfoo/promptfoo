import React, { useCallback, useEffect, useState } from 'react';

import { Alert, AlertDescription } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@app/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import { Check, Copy, LoaderCircle, Rocket, RotateCcw, X } from 'lucide-react';
import { type DiscoveredConfig, useConfigAgent } from '../../hooks/useConfigAgent';
import ConfigAgentChat from './ConfigAgentChat';

interface ConfigAgentDrawerProps {
  open: boolean;
  onClose: () => void;
  initialUrl?: string;
  onConfigDiscovered?: (config: DiscoveredConfig, baseUrl: string) => void;
}

const PHASES = [
  { key: 'initializing', label: 'Init' },
  { key: 'probing', label: 'Probe' },
  { key: 'analyzing', label: 'Analyze' },
  { key: 'confirming', label: 'Verify' },
  { key: 'complete', label: 'Done' },
] as const;

export default function ConfigAgentDrawer({
  open,
  onClose,
  initialUrl = '',
  onConfigDiscovered,
}: ConfigAgentDrawerProps) {
  const [urlInput, setUrlInput] = useState(initialUrl);
  const [started, setStarted] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const {
    messages,
    session,
    isLoading,
    error,
    finalConfig,
    startSession,
    sendMessage,
    selectOption,
    submitApiKey,
    cancelSession,
    reset,
  } = useConfigAgent();

  useEffect(() => {
    if (initialUrl) {
      setUrlInput(initialUrl);
    }
  }, [initialUrl]);

  const handleStart = useCallback(async () => {
    const url = urlInput.trim();
    if (!url) {
      return;
    }

    setStarted(await startSession(url));
  }, [startSession, urlInput]);

  const handleClose = useCallback(() => {
    cancelSession();
    reset();
    setStarted(false);
    onClose();
  }, [cancelSession, onClose, reset]);

  const handleStartOver = useCallback(() => {
    cancelSession();
    reset();
    setStarted(false);
  }, [cancelSession, reset]);

  const handleApplyConfig = useCallback(() => {
    if (!finalConfig || !onConfigDiscovered || !session) {
      return;
    }

    onConfigDiscovered(finalConfig, session.baseUrl);
    handleClose();
  }, [finalConfig, handleClose, onConfigDiscovered, session]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleStart();
      }
    },
    [handleStart],
  );

  const handleCopyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(urlInput);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    } catch {
      // Clipboard can be unavailable in embedded browser contexts.
    }
  }, [urlInput]);

  const currentPhaseIndex = Math.max(
    0,
    PHASES.findIndex((phase) => phase.key === session?.phase),
  );
  const canApplyConfig = session?.phase === 'complete' && Boolean(finalConfig);

  const handleSelectOption = useCallback(
    (optionId: string) => {
      if (optionId === 'apply' && canApplyConfig) {
        handleApplyConfig();
        return;
      }

      selectOption(optionId);
    },
    [canApplyConfig, handleApplyConfig, selectOption],
  );

  return (
    <TooltipProvider delayDuration={0}>
      <Sheet
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            handleClose();
          }
        }}
      >
        <SheetContent
          side="right"
          hideCloseButton
          className="flex h-full w-full max-w-[480px] flex-col gap-0 overflow-hidden bg-background p-0 sm:max-w-[480px]"
        >
          <header className="border-b border-border bg-muted/20">
            <div className="flex items-start justify-between gap-4 px-4 pb-3 pt-4">
              <SheetHeader className="flex-row items-center gap-3 space-y-0 text-left">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
                  <Rocket className="size-5" />
                </span>
                <span>
                  <SheetTitle className="text-base">Config Assistant</SheetTitle>
                  <SheetDescription className="text-xs">
                    Auto-discover API configuration
                  </SheetDescription>
                </span>
              </SheetHeader>

              <div className="flex items-center gap-1">
                {started && (
                  <IconButton label="Start over" onClick={handleStartOver}>
                    <RotateCcw />
                  </IconButton>
                )}
                <IconButton label="Close" onClick={handleClose}>
                  <X />
                </IconButton>
              </div>
            </div>

            {started && urlInput && (
              <div className="px-4 pb-3">
                <div className="flex items-center gap-2 rounded-md border border-border bg-background/80 px-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                    {urlInput}
                  </span>
                  <IconButton label={urlCopied ? 'Copied!' : 'Copy URL'} onClick={handleCopyUrl}>
                    {urlCopied ? <Check /> : <Copy />}
                  </IconButton>
                </div>
              </div>
            )}

            {started && session && (
              <div className="px-4 pb-4">
                <div className="flex items-center gap-1">
                  {PHASES.map((phase, index) => (
                    <React.Fragment key={phase.key}>
                      <PhaseStep
                        label={phase.label}
                        active={index === currentPhaseIndex}
                        complete={index < currentPhaseIndex}
                        error={session.phase === 'error' && index === currentPhaseIndex}
                      />
                      {index < PHASES.length - 1 && (
                        <span
                          className={cn(
                            'h-px w-4 rounded-full bg-border',
                            index < currentPhaseIndex && 'bg-emerald-500',
                          )}
                        />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}
          </header>

          <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {started ? (
              <>
                {error && (
                  <div className="px-4 pt-4">
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  </div>
                )}
                <div className="min-h-0 flex-1">
                  <ConfigAgentChat
                    messages={messages}
                    isLoading={isLoading}
                    onSendMessage={sendMessage}
                    onSelectOption={handleSelectOption}
                    onSubmitApiKey={submitApiKey}
                  />
                </div>

                {canApplyConfig && (
                  <div className="border-t border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
                    <Button type="button" className="w-full" onClick={handleApplyConfig}>
                      <Check />
                      Apply Configuration
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <section className="space-y-4 overflow-y-auto p-6">
                <p className="text-sm leading-6 text-muted-foreground">
                  Enter the endpoint URL to detect its request format, authentication, and response
                  path.
                </p>

                <div className="space-y-2">
                  <Label htmlFor="config-agent-url">Endpoint URL</Label>
                  <Input
                    id="config-agent-url"
                    value={urlInput}
                    placeholder="https://api.example.com"
                    onChange={(event) => setUrlInput(event.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isLoading}
                    autoComplete="off"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    OpenAI, Anthropic, Azure, and custom REST APIs are supported.
                  </p>
                </div>

                <Button
                  type="button"
                  className="w-full"
                  onClick={handleStart}
                  disabled={!urlInput.trim() || isLoading}
                >
                  {isLoading ? <LoaderCircle className="animate-spin" /> : <Rocket />}
                  {isLoading ? 'Starting Discovery...' : 'Start Auto-Discovery'}
                </Button>

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </section>
            )}
          </main>
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  );
}

function PhaseStep({
  active,
  complete,
  error,
  label,
}: {
  active: boolean;
  complete: boolean;
  error: boolean;
  label: string;
}) {
  return (
    <span className="flex min-w-0 flex-1 flex-col items-center gap-1">
      <span
        className={cn(
          'size-2 rounded-full bg-muted-foreground/30',
          complete && 'bg-emerald-500',
          active && 'animate-pulse bg-primary',
          error && 'bg-destructive',
        )}
      />
      <span
        className={cn(
          'text-[10px] uppercase text-muted-foreground',
          complete && 'text-emerald-600 dark:text-emerald-300',
          active && 'font-semibold text-primary',
          error && 'text-destructive',
        )}
      >
        {label}
      </span>
    </span>
  );
}

function IconButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8 shrink-0 text-muted-foreground"
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
