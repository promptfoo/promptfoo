/**
 * CoverageAnalysisPanel - Shows assertion coverage against requirements.
 * Features:
 * - Overall coverage score
 * - Requirements list with coverage status
 * - Gaps identification
 */
import { useMemo } from 'react';

import { Progress } from '@app/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import { AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react';

import type { CoverageAnalysis } from '../../api/generation';

interface CoverageAnalysisPanelProps {
  coverage: CoverageAnalysis | null;
  /** Compact mode for inline display */
  compact?: boolean;
  /** Callback to fill coverage gaps */
  onFillGaps?: () => void;
}

export function CoverageAnalysisPanel({
  coverage,
  compact = false,
  onFillGaps,
}: CoverageAnalysisPanelProps) {
  const scorePercent = Math.round((coverage?.overallScore ?? 0) * 100);

  const { label, colorClass } = useMemo(() => {
    const score = coverage?.overallScore ?? 0;
    if (score >= 0.8) {
      return {
        label: 'Excellent',
        colorClass: 'text-emerald-600 dark:text-emerald-400',
      };
    }
    if (score >= 0.6) {
      return {
        label: 'Good',
        colorClass: 'text-emerald-600 dark:text-emerald-400',
      };
    }
    if (score >= 0.4) {
      return {
        label: 'Fair',
        colorClass: 'text-amber-600 dark:text-amber-400',
      };
    }
    return {
      label: 'Low',
      colorClass: 'text-red-600 dark:text-red-400',
    };
  }, [coverage?.overallScore]);

  const coveredCount = useMemo(() => {
    if (!coverage?.requirements) {
      return 0;
    }
    return coverage.requirements.filter((r) => r.coverageLevel !== 'none').length;
  }, [coverage?.requirements]);

  if (!coverage) {
    return null;
  }

  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 cursor-help">
            <span className="text-xs text-muted-foreground">Coverage:</span>
            <div className="w-16">
              <Progress value={scorePercent} className="h-1.5" />
            </div>
            <span className={cn('text-xs font-medium', colorClass)}>{scorePercent}%</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {coveredCount}/{coverage.requirements.length} requirements covered
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  const getCoverageIcon = (level: 'none' | 'partial' | 'full') => {
    switch (level) {
      case 'full':
        return <CheckCircle className="size-4 text-emerald-600 dark:text-emerald-400" />;
      case 'partial':
        return <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />;
      default:
        return <XCircle className="size-4 text-red-600 dark:text-red-400" />;
    }
  };

  return (
    <div className="space-y-2 p-3 rounded-lg border border-border bg-muted/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium">Coverage</span>
          <Tooltip>
            <TooltipTrigger>
              <Info className="size-3.5 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p>
                Coverage measures how well your assertions test the requirements implied by your
                prompts.
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
        <span className={cn('text-sm font-medium', colorClass)}>{scorePercent}%</span>
      </div>

      <div className="space-y-1">
        <Progress value={scorePercent} className="h-2" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            {coveredCount}/{coverage.requirements.length} requirements
          </span>
          <span>{label}</span>
        </div>
      </div>

      {/* Requirements breakdown */}
      {coverage.requirements.length > 0 && (
        <div className="pt-2 border-t border-border/50 space-y-1.5">
          {coverage.requirements.slice(0, 5).map((req) => (
            <div key={req.id} className="flex items-start gap-2">
              {getCoverageIcon(req.coverageLevel)}
              <span className="text-xs text-muted-foreground flex-1 truncate">
                {req.description}
              </span>
            </div>
          ))}
          {coverage.requirements.length > 5 && (
            <p className="text-xs text-muted-foreground">
              ... and {coverage.requirements.length - 5} more
            </p>
          )}
        </div>
      )}

      {/* Gaps */}
      {coverage.gaps && coverage.gaps.length > 0 && (
        <div className="pt-2 border-t border-border/50">
          <p className="text-xs text-muted-foreground mb-1">Gaps to fill:</p>
          <ul className="text-xs space-y-0.5">
            {coverage.gaps.slice(0, 3).map((gap, idx) => (
              <li key={idx} className="text-amber-700 dark:text-amber-300">
                • {gap}
              </li>
            ))}
          </ul>
          {onFillGaps && (
            <button
              type="button"
              onClick={onFillGaps}
              className="text-xs text-amber-600 dark:text-amber-400 hover:underline mt-1"
            >
              Fill gaps →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
