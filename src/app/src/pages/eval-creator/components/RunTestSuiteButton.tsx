import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@app/components/ui/button';
import { Spinner } from '@app/components/ui/spinner';
import { EVAL_ROUTES } from '@app/constants/routes';
import { useStore } from '@app/stores/evalConfig';
import { callApi } from '@app/utils/api';
import { useNavigate } from 'react-router-dom';

const RunTestSuiteButton = () => {
  const navigate = useNavigate();
  const { config } = useStore();
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
    extensions,
  } = config;
  const [isRunning, setIsRunning] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const clearPollingInterval = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearPollingInterval();
    };
  }, [clearPollingInterval]);

  const isDisabled =
    isRunning ||
    !providers ||
    !Array.isArray(providers) ||
    providers.length === 0 ||
    !prompts ||
    prompts.length === 0 ||
    !tests ||
    (Array.isArray(tests) && tests.length === 0);

  const runTestSuite = async () => {
    setIsRunning(true);

    const testSuite = {
      defaultTest,
      derivedMetrics,
      description,
      env,
      evaluateOptions,
      prompts,
      providers,
      scenarios,
      tests, // Note: This is 'tests' in the API, not 'testCases'
      extensions,
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

      const job = await response.json();

      pollingIntervalRef.current = setInterval(async () => {
        try {
          const progressResponse = await callApi(`/eval/job/${job.id}/`);

          if (!progressResponse.ok) {
            clearPollingInterval();
            throw new Error(`HTTP error! status: ${progressResponse.status}`);
          }

          const progressData = await progressResponse.json();

          if (progressData.status === 'complete') {
            clearPollingInterval();
            setIsRunning(false);
            if (progressData.evalId) {
              navigate(EVAL_ROUTES.DETAIL(progressData.evalId));
            }
          } else if (['failed', 'error'].includes(progressData.status)) {
            clearPollingInterval();
            setIsRunning(false);
            throw new Error(progressData.logs?.join('\n') || 'Job failed');
          } else {
            const percent =
              progressData.total === 0
                ? 0
                : Math.round((progressData.progress / progressData.total) * 100);
            setProgressPercent(percent);
          }
        } catch (error) {
          clearPollingInterval();
          console.error(error);
          setIsRunning(false);
          alert(`An error occurred: ${(error as Error).message}`);
        }
      }, 1000);
    } catch (error) {
      console.error(error);
      setIsRunning(false);
      alert(`An error occurred: ${(error as Error).message}`);
    }
  };

  return (
    <Button onClick={runTestSuite} disabled={isDisabled}>
      {isRunning ? (
        <span className="flex items-center gap-2">
          <Spinner className="size-4" />
          {progressPercent.toFixed(0)}% complete
        </span>
      ) : (
        'Run Eval'
      )}
    </Button>
  );
};

export default RunTestSuiteButton;
