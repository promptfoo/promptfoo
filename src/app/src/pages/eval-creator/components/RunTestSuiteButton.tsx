import { useState } from 'react';

import { Button } from '@app/components/ui/button';
import { Spinner } from '@app/components/ui/spinner';
import { useStore } from '@app/stores/evalConfig';
import { callApiTyped } from '@app/utils/apiClient';
import { useNavigate } from 'react-router-dom';
import type { CreateJobResponse, GetJobResponse } from '@promptfoo/dtos';

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

  const isDisabled =
    isRunning ||
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
      const job = await callApiTyped<CreateJobResponse>('/eval/job', {
        method: 'POST',
        body: testSuite,
      });

      const intervalId = setInterval(async () => {
        try {
          const progressData = await callApiTyped<GetJobResponse>(`/eval/job/${job.id}/`);

          if (progressData.status === 'complete') {
            clearInterval(intervalId);
            setIsRunning(false);
            if (progressData.evalId) {
              navigate(`/eval/${progressData.evalId}`);
            }
          } else if (progressData.status === 'error') {
            clearInterval(intervalId);
            setIsRunning(false);
            throw new Error(progressData.logs?.join('\n') || 'Job failed');
          } else if (progressData.status === 'in-progress') {
            const percent =
              progressData.total === 0
                ? 0
                : Math.round((progressData.progress / progressData.total) * 100);
            setProgressPercent(percent);
          }
        } catch (error) {
          clearInterval(intervalId);
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
          <Spinner className="h-4 w-4" />
          {progressPercent.toFixed(0)}% complete
        </span>
      ) : (
        'Run Eval'
      )}
    </Button>
  );
};

export default RunTestSuiteButton;
