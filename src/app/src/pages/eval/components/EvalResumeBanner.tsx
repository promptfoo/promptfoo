import { useState } from 'react';

import { Alert, AlertContent, AlertDescription, AlertTitle } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import { IS_RUNNING_LOCALLY } from '@app/constants';
import { callApi } from '@app/utils/api';
import { AlertTriangle, Loader2, Play } from 'lucide-react';
import { useTableStore } from './store';
import type { EvaluateStats } from '@promptfoo/types';

interface EvalResumeBannerProps {
  evalId: string;
  stats: EvaluateStats | null;
}

export default function EvalResumeBanner({ evalId, stats }: EvalResumeBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const { fetchEvalData } = useTableStore();

  if (!IS_RUNNING_LOCALLY || dismissed) {
    return null;
  }

  // Only show for incomplete evals: status is not 'complete' and we have an expectedTestCount
  if (!stats || stats.status === 'complete' || stats.expectedTestCount == null) {
    return null;
  }

  const actualCount = (stats.successes ?? 0) + (stats.failures ?? 0) + (stats.errors ?? 0);
  if (actualCount >= stats.expectedTestCount) {
    return null;
  }

  const handleResume = async () => {
    setResuming(true);
    try {
      const resp = await callApi(`/eval/${evalId}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!resp.ok) {
        throw new Error('Failed to start resume');
      }

      const { id: jobId } = await resp.json();

      // Poll for progress
      const pollInterval = setInterval(async () => {
        try {
          const jobResp = await callApi(`/eval/job/${jobId}`);
          if (!jobResp.ok) {
            clearInterval(pollInterval);
            setResuming(false);
            return;
          }

          const job = await jobResp.json();

          if (job.status === 'complete') {
            clearInterval(pollInterval);
            setResuming(false);
            // Refresh eval data in-place
            await fetchEvalData(evalId);
          } else if (job.status === 'error') {
            clearInterval(pollInterval);
            setResuming(false);
          } else {
            setProgress({ current: job.progress, total: job.total });
          }
        } catch {
          clearInterval(pollInterval);
          setResuming(false);
        }
      }, 1000);
    } catch {
      setResuming(false);
    }
  };

  return (
    <Alert variant="warning" onDismiss={() => setDismissed(true)}>
      <AlertTriangle className="size-4" />
      <AlertContent>
        <AlertTitle>Evaluation Incomplete</AlertTitle>
        <AlertDescription>
          This evaluation completed {actualCount} of {stats.expectedTestCount} test cases. It may
          have been paused or interrupted.
        </AlertDescription>
      </AlertContent>
      {resuming ? (
        <div className="flex items-center gap-2 text-sm shrink-0">
          <Loader2 className="size-4 animate-spin" />
          <span>Resuming{progress ? `... (${progress.current}/${progress.total})` : '...'}</span>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={handleResume} className="shrink-0">
          <Play className="size-3 mr-1" />
          Resume
        </Button>
      )}
    </Alert>
  );
}
