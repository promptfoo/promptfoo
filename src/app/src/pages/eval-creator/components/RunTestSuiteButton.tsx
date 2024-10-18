import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@app/stores/evalConfig';
import { callApi } from '@app/utils/api';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';

const RunTestSuiteButton: React.FC = () => {
  const navigate = useNavigate();
  const {
    defaultTest,
    description,
    env,
    evaluateOptions,
    prompts,
    providers,
    scenarios,
    testCases,
  } = useStore();
  const [isRunning, setIsRunning] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);

  const runTestSuite = async () => {
    setIsRunning(true);

    const testSuite = {
      defaultTest,
      description,
      env,
      evaluateOptions,
      prompts,
      providers,
      scenarios,
      tests: testCases,
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

      const intervalId = setInterval(async () => {
        const progressResponse = await callApi(`/eval/job/${job.id}/`);

        if (!progressResponse.ok) {
          clearInterval(intervalId);
          throw new Error(`HTTP error! status: ${progressResponse.status}`);
        }

        const progressData = await progressResponse.json();

        if (progressData.status === 'complete') {
          clearInterval(intervalId);
          setIsRunning(false);

          // TODO(ian): This just redirects to the eval page, which shows the most recent eval.  Redirect to this specific eval to avoid race.
          navigate('/eval');
        } else if (progressData.status === 'failed') {
          clearInterval(intervalId);
          setIsRunning(false);
          throw new Error('Job failed');
        } else {
          const percent =
            progressData.total === 0
              ? 0
              : Math.round((progressData.progress / progressData.total) * 100);
          setProgressPercent(percent);
        }
      }, 1000);
    } catch (error) {
      console.error(error);
      setIsRunning(false);
      alert(`An error occurred: ${(error as Error).message}`);
    }
  };

  return (
    <Button variant="contained" color="primary" onClick={runTestSuite} disabled={isRunning}>
      {isRunning ? (
        <>
          <CircularProgress size={24} sx={{ marginRight: 2 }} />
          {progressPercent.toFixed(0)}% complete
        </>
      ) : (
        'Run Evaluation'
      )}
    </Button>
  );
};

export default RunTestSuiteButton;
