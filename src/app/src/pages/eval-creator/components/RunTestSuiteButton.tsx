import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@app/stores/evalConfig';
import { callApi } from '@app/utils/api';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';

const RunTestSuiteButton: React.FC = () => {
  const navigate = useNavigate();
  const {
    defaultTest,
    derivedMetrics,
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
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  const cancelEvaluation = async () => {
    if (!currentJobId) {
      return;
    }

    try {
      const response = await callApi(`/eval/job/${currentJobId}/cancel`, {
        method: 'POST',
      });

      if (response.ok) {
        setIsRunning(false);
        setCurrentJobId(null);
        setProgressPercent(0);
        console.log('Evaluation cancelled successfully');
      } else {
        console.error('Failed to cancel evaluation');
      }
    } catch (error) {
      console.error('Error cancelling evaluation:', error);
    }
  };

  const runTestSuite = async () => {
    setIsRunning(true);
    setProgressPercent(0);

    const testSuite = {
      defaultTest,
      derivedMetrics,
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
      setCurrentJobId(job.id);

      const intervalId = setInterval(async () => {
        try {
          const progressResponse = await callApi(`/eval/job/${job.id}/`);

          if (!progressResponse.ok) {
            clearInterval(intervalId);
            throw new Error(`HTTP error! status: ${progressResponse.status}`);
          }

          const progressData = await progressResponse.json();

          if (progressData.status === 'complete') {
            clearInterval(intervalId);
            setIsRunning(false);
            setCurrentJobId(null);
            if (progressData.evalId) {
              navigate(`/eval/${progressData.evalId}`);
            }
          } else if (['failed', 'error'].includes(progressData.status)) {
            clearInterval(intervalId);
            setIsRunning(false);
            setCurrentJobId(null);

            // Check if it was cancelled by user
            const wasCancelled = progressData.logs?.some(
              (log: string) => log.includes('cancelled by user') || log.includes('Job cancelled'),
            );

            if (!wasCancelled) {
              throw new Error(progressData.logs?.join('\n') || 'Job failed');
            }
          } else {
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
          setCurrentJobId(null);
          alert(`An error occurred: ${(error as Error).message}`);
        }
      }, 1000);
    } catch (error) {
      console.error(error);
      setIsRunning(false);
      setCurrentJobId(null);
      alert(`An error occurred: ${(error as Error).message}`);
    }
  };

  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
      <Button
        variant="contained"
        color="primary"
        onClick={runTestSuite}
        disabled={isRunning}
        startIcon={isRunning ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />}
      >
        {isRunning ? `${progressPercent.toFixed(0)}% complete` : 'Run Eval'}
      </Button>

      {isRunning && (
        <Button
          variant="contained"
          color="error"
          onClick={cancelEvaluation}
          startIcon={<StopIcon />}
        >
          Cancel
        </Button>
      )}
    </Box>
  );
};

export default RunTestSuiteButton;
