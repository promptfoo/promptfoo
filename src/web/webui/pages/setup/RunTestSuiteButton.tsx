import React, { useState } from 'react';
import { Button, CircularProgress } from '@mui/material';

import { useStore } from '../../util/store';

const RunTestSuiteButton: React.FC = () => {
  const { description, providers, prompts, testCases } = useStore();
  const [isRunning, setIsRunning] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);

  const runTestSuite = async () => {
    setIsRunning(true);

    const testSuite = {
      description,
      providers,
      prompts,
      tests: testCases,
    };

    try {
      const response = await fetch('/api/eval', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testSuite),
      });
      const job = await response.json();

      const intervalId = setInterval(async () => {
        const progressResponse = await fetch(`/api/eval/${job.id}`);
        const progressData = await progressResponse.json();

        if (progressData.status === 'completed') {
          clearInterval(intervalId);
          setIsRunning(false);
          window.open('/eval', '_blank');
        } else {
          const percent = Math.round((progressData.progress / progressData.total) * 100);
          setProgressPercent(percent);
        }
      }, 1000);
    } catch (error) {
      console.error(error);
      setIsRunning(false);
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
