'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, CircularProgress } from '@mui/material';

import { useStore } from '@/util/store';
import { API_BASE_URL } from '@/util/api';

const RunTestSuiteButton: React.FC = () => {
  const router = useRouter();
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
      const response = await fetch(`${API_BASE_URL}/api/eval`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testSuite),
      });
      const job = await response.json();

      const intervalId = setInterval(async () => {
        const progressResponse = await fetch(`${API_BASE_URL}/api/eval/${job.id}`);
        const progressData = await progressResponse.json();

        if (progressData.status === 'completed') {
          clearInterval(intervalId);
          setIsRunning(false);
          router.push('/eval');
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
