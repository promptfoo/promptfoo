/**
 * GenerationProgressDialog - Displays animated progress during generation.
 * Features:
 * - Phase-based progress with visual indicators
 * - Elapsed time tracking
 * - Live preview of streamed results
 * - Cancel button
 * - Smooth animations
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { Progress } from '@app/components/ui/progress';
import { cn } from '@app/lib/utils';
import { CheckCircle, Circle, FileText, Loader2, Sparkles, XCircle } from 'lucide-react';
import type { Assertion } from '@promptfoo/types';

interface ProgressPhase {
  id: string;
  label: string;
  status: 'pending' | 'in-progress' | 'complete' | 'error';
  detail?: string;
  timestamp?: number;
}

interface GenerationProgressDialogProps {
  open: boolean;
  onCancel: () => void;
  title: string;
  description?: string;
  progress: number;
  total: number;
  phase: string;
  status: 'pending' | 'in-progress' | 'complete' | 'error';
  error?: string | null;
  /** Phases to display in the progress log */
  phases?: ProgressPhase[];
  /** Streamed test cases for live preview */
  streamedTestCases?: Array<Record<string, string>>;
  /** Streamed assertions for live preview */
  streamedAssertions?: Assertion[];
  /** Show the live preview panel */
  showLivePreview?: boolean;
}

export function GenerationProgressDialog({
  open,
  onCancel,
  title,
  description,
  progress,
  total,
  phase,
  status,
  error,
  phases: externalPhases,
  streamedTestCases = [],
  streamedAssertions = [],
  showLivePreview = false,
}: GenerationProgressDialogProps) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [startTime] = useState(() => Date.now());
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Track elapsed time
  useEffect(() => {
    if (!open || status === 'complete' || status === 'error') {
      return;
    }

    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [open, status, startTime]);

  // Reset elapsed time when dialog opens
  useEffect(() => {
    if (open) {
      setElapsedTime(0);
    }
  }, [open]);

  // Auto-scroll when new items arrive
  useEffect(() => {
    if (scrollAreaRef.current && (streamedTestCases.length > 0 || streamedAssertions.length > 0)) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [streamedTestCases.length, streamedAssertions.length]);

  // Check if we have streamed items to show
  const hasStreamedItems =
    showLivePreview && (streamedTestCases.length > 0 || streamedAssertions.length > 0);

  // Calculate progress percentage
  const progressPercent = useMemo(() => {
    if (total === 0) {
      return 0;
    }
    return Math.min(100, Math.round((progress / total) * 100));
  }, [progress, total]);

  // Format elapsed time
  const formattedTime = useMemo(() => {
    const minutes = Math.floor(elapsedTime / 60);
    const seconds = elapsedTime % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, [elapsedTime]);

  // Default phases if not provided
  const phases = useMemo((): ProgressPhase[] => {
    if (externalPhases) {
      return externalPhases;
    }

    // Infer phases from the current phase string
    // Backend phases: Initializing, Extracting concepts, Generating personas,
    // Generating test cases, Generating edge cases, Measuring diversity, Iterative refinement
    const defaultPhases: ProgressPhase[] = [
      {
        id: 'init',
        label: 'Initializing',
        status: 'pending',
      },
      {
        id: 'personas',
        label: 'Generating personas',
        status: 'pending',
      },
      {
        id: 'generate',
        label: 'Generating test cases',
        status: 'pending',
      },
      {
        id: 'finalize',
        label: 'Finalizing results',
        status: 'pending',
      },
    ];

    // Update status based on current phase
    const phaseLower = phase.toLowerCase();

    if (status === 'complete') {
      defaultPhases.forEach((p) => (p.status = 'complete'));
    } else if (phaseLower.includes('initial') || phaseLower.includes('start')) {
      defaultPhases[0].status = 'in-progress';
    } else if (phaseLower.includes('extract') || phaseLower.includes('concept')) {
      defaultPhases[0].status = 'complete';
      defaultPhases[1].status = 'in-progress';
      defaultPhases[1].detail = 'Analyzing prompts';
    } else if (phaseLower.includes('persona')) {
      defaultPhases[0].status = 'complete';
      defaultPhases[1].status = 'in-progress';
      defaultPhases[1].detail = phase;
    } else if (phaseLower.includes('test case') || phaseLower.includes('edge')) {
      defaultPhases[0].status = 'complete';
      defaultPhases[1].status = 'complete';
      defaultPhases[2].status = 'in-progress';
      defaultPhases[2].detail = phase;
    } else if (
      phaseLower.includes('measur') ||
      phaseLower.includes('divers') ||
      phaseLower.includes('iterati') ||
      phaseLower.includes('final')
    ) {
      defaultPhases[0].status = 'complete';
      defaultPhases[1].status = 'complete';
      defaultPhases[2].status = 'complete';
      defaultPhases[3].status = 'in-progress';
      defaultPhases[3].detail = phase;
    } else if (phaseLower.includes('generat')) {
      // Generic generating state
      defaultPhases[0].status = 'complete';
      defaultPhases[1].status = 'in-progress';
      defaultPhases[1].detail = phase;
    }

    return defaultPhases;
  }, [externalPhases, phase, status]);

  const renderPhaseIcon = (phaseStatus: ProgressPhase['status']) => {
    switch (phaseStatus) {
      case 'complete':
        return <CheckCircle className="size-4 text-emerald-600 dark:text-emerald-400" />;
      case 'in-progress':
        return <Loader2 className="size-4 text-amber-500 animate-spin" />;
      case 'error':
        return <XCircle className="size-4 text-red-600 dark:text-red-400" />;
      default:
        return <Circle className="size-4 text-muted-foreground/40" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className={cn('sm:max-w-md', hasStreamedItems && 'sm:max-w-2xl')}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-amber-500" />
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{phase || 'Starting...'}</span>
              <span className="font-mono text-muted-foreground">{formattedTime}</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
            <div className="flex justify-end">
              <span className="text-xs text-muted-foreground">{progressPercent}%</span>
            </div>
          </div>

          {/* Phase list */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            {phases.map((p) => (
              <div
                key={p.id}
                className={cn(
                  'flex items-start gap-3 text-sm transition-opacity duration-200',
                  p.status === 'pending' && 'opacity-50',
                )}
              >
                <div className="mt-0.5">{renderPhaseIcon(p.status)}</div>
                <div className="flex-1 min-w-0">
                  <div
                    className={cn(
                      'font-medium',
                      p.status === 'complete' && 'text-muted-foreground',
                      p.status === 'in-progress' && 'text-foreground',
                    )}
                  >
                    {p.label}
                  </div>
                  {p.detail && (
                    <div className="text-xs text-muted-foreground truncate">{p.detail}</div>
                  )}
                </div>
                {p.timestamp && (
                  <span className="text-xs text-muted-foreground font-mono">
                    {Math.floor(p.timestamp / 60)}:{(p.timestamp % 60).toString().padStart(2, '0')}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Live preview of streamed items */}
          {hasStreamedItems && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-muted-foreground" />
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Live Preview ({streamedTestCases.length + streamedAssertions.length} items)
                </span>
              </div>
              <div
                ref={scrollAreaRef}
                className="h-40 overflow-y-auto rounded-lg border border-border bg-muted/30 p-2 space-y-1.5"
              >
                {streamedTestCases.map((tc, index) => (
                  <div
                    key={`tc-${index}`}
                    className="rounded border border-border/60 bg-background p-2 animate-in slide-in-from-bottom-2 duration-200"
                  >
                    <div className="flex items-start gap-2">
                      <span className="flex-shrink-0 text-xs font-medium text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                        #{index + 1}
                      </span>
                      <p className="text-xs text-foreground truncate flex-1">
                        {Object.entries(tc)
                          .slice(0, 2)
                          .map(([key, value]) => `${key}: ${String(value).slice(0, 50)}`)
                          .join(' | ')}
                        {Object.keys(tc).length > 2 && ' ...'}
                      </p>
                    </div>
                  </div>
                ))}
                {streamedAssertions.map((assertion, index) => (
                  <div
                    key={`assertion-${index}`}
                    className={cn(
                      'rounded border p-2 animate-in slide-in-from-bottom-2 duration-200',
                      'border-blue-200 dark:border-blue-800/50',
                      'bg-blue-50/50 dark:bg-blue-950/20',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span className="flex-shrink-0 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/50 rounded px-1.5 py-0.5">
                        Assertion
                      </span>
                      <p className="text-xs text-blue-700 dark:text-blue-300 truncate flex-1">
                        {assertion.type}
                        {assertion.value && `: ${String(assertion.value).slice(0, 40)}...`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/30 p-3">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
