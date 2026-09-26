import { useCallback, useEffect, useRef, useState } from 'react';

import { Alert, AlertContent, AlertDescription } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import { Spinner } from '@app/components/ui/spinner';
import { EVAL_ROUTES } from '@app/constants/routes';
import { useEvalHistoryRefresh } from '@app/hooks/useEvalHistoryRefresh';
import { useToast } from '@app/hooks/useToast';
import { useStore } from '@app/stores/evalConfig';
import { callApi } from '@app/utils/api';
import { formatDuration } from '@promptfoo/util/formatDuration';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  countTests,
  normalizePrompts,
  normalizePromptsForJob,
  normalizeProviders,
} from './setupReadiness';
import type { CreateJobResponse, GetJobResponse } from '@promptfoo/types/api/eval';

const RunTestSuiteButton = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { config } = useStore();
  const { signalEvalCompleted } = useEvalHistoryRefresh();
  const { showToast } = useToast();
  const {
    defaultTest,
    derivedMetrics,
    description,
    env,
    evaluateOptions,
    prompts,
    providers,
    scenarios,
    tests,
    tracing,
    extensions,
  } = config;
  const [isRunning, setIsRunning] = useState(false);
  const [caseProgress, setCaseProgress] = useState({ completed: 0, total: 0 });
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [runError, setRunError] = useState<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);

  const clearPollInterval = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      clearPollInterval();
    };
  }, [clearPollInterval]);

  useEffect(() => {
    if (!isRunning) {
      return;
    }
    const startedAt = Date.now();
    const elapsedInterval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(elapsedInterval);
  }, [isRunning]);

  const normalizedProviders = normalizeProviders(providers);
  const normalizedPrompts = normalizePrompts(prompts);
  const jobPrompts = normalizePromptsForJob(prompts);
  const testCount = countTests(tests);

  const isDisabled =
    isRunning ||
    normalizedProviders.length === 0 ||
    normalizedPrompts.length === 0 ||
    testCount === 0;

  const runTestSuite = async () => {
    setIsRunning(true);
    setRunError(null);
    setCaseProgress({ completed: 0, total: 0 });
    setElapsedSeconds(0);

    const sourceEvalId =
      location.state &&
      typeof location.state === 'object' &&
      'sourceEvalId' in location.state &&
      typeof location.state.sourceEvalId === 'string'
        ? location.state.sourceEvalId
        : undefined;
    const testSuite = {
      defaultTest,
      derivedMetrics,
      description,
      env,
      evaluateOptions,
      prompts: jobPrompts,
      providers,
      scenarios,
      tests, // Note: This is 'tests' in the API, not 'testCases'
      tracing,
      extensions,
      ...(sourceEvalId && { sourceEvalId }),
    };

    const handleRunError = (error: unknown) => {
      if (!isMountedRef.current) {
        return;
      }

      const message = error instanceof Error ? error.message : 'An unknown error occurred';
      setIsRunning(false);
      setRunError(message);
      showToast(`An error occurred: ${message}`, 'error');
    };

    try {
      const response = await callApi('/eval/job', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testSuite),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const job: CreateJobResponse = await response.json();
      if (!isMountedRef.current) {
        return;
      }

      clearPollInterval();
      const intervalId = setInterval(async () => {
        try {
          const progressResponse = await callApi(`/eval/job/${job.id}/`);
          if (!isMountedRef.current) {
            clearPollInterval();
            return;
          }

          if (!progressResponse.ok) {
            clearPollInterval();
            throw new Error(`HTTP error! status: ${progressResponse.status}`);
          }

          const progressData: GetJobResponse = await progressResponse.json();
          if (!isMountedRef.current) {
            clearPollInterval();
            return;
          }

          if (progressData.status === 'complete') {
            clearPollInterval();
            setIsRunning(false);
            signalEvalCompleted();
            if (progressData.evalId) {
              navigate(EVAL_ROUTES.DETAIL(progressData.evalId));
            }
          } else if (progressData.status === 'error') {
            clearPollInterval();
            setIsRunning(false);
            throw new Error(progressData.logs?.join('\n') || 'Job failed');
          } else {
            setCaseProgress({ completed: progressData.progress, total: progressData.total });
          }
        } catch (error) {
          clearPollInterval();
          handleRunError(error);
        }
      }, 1000);
      pollIntervalRef.current = intervalId;
    } catch (error) {
      handleRunError(error);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        onClick={runTestSuite}
        disabled={isDisabled}
        className="dark:bg-blue-600 dark:hover:bg-blue-500"
      >
        {isRunning ? (
          <span className="flex items-center gap-2">
            <Spinner className="size-4" />
            Running eval
          </span>
        ) : (
          'Run Eval'
        )}
      </Button>
      {isRunning && (
        <div className="space-y-1 text-sm text-muted-foreground">
          <p role="status" aria-live="polite">
            {caseProgress.total > 0
              ? `${caseProgress.completed} of ${caseProgress.total} cases completed`
              : 'Waiting for case results'}
            {' · '}
            <span aria-live="off">{formatDuration(elapsedSeconds)} elapsed</span>
          </p>
          <p>
            Progress updates when a case completes; an individual operation may take several
            minutes.
          </p>
        </div>
      )}
      {runError && (
        <Alert variant="destructive">
          <AlertContent>
            <AlertDescription>{runError}</AlertDescription>
          </AlertContent>
        </Alert>
      )}
    </div>
  );
};

export default RunTestSuiteButton;
