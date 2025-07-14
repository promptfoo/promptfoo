import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useStore } from '@app/stores/evalConfig';
import { callApi } from '@app/utils/api';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import EvaluationPreview from './EvaluationPreview';
import EvalProgressBar, { type EvalProgressData } from './EvalProgressBar';
import type { TestCase, ProviderOptions } from '@promptfoo/types';
import { useErrorNotification } from '../hooks/useErrorNotification';

interface IntegratedRunButtonProps {
  disabled?: boolean;
}

const IntegratedRunButton: React.FC<IntegratedRunButtonProps> = ({ disabled }) => {
  const navigate = useNavigate();
  const { config } = useStore();
  const { showError } = useErrorNotification();
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
  } = config;
  const [isRunning, setIsRunning] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [progress, setProgress] = useState<EvalProgressData | null>(null);
  const intervalIdRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleRunClick = () => {
    if (!disabled) {
      setShowPreview(true);
    }
  };

  const runTestSuite = async () => {
    setShowPreview(false);
    setIsRunning(true);

    // Initialize progress
    setProgress({
      current: 0,
      total: 0,
      status: 'pending',
      message: 'Starting evaluation...',
    });

    const testSuite = {
      defaultTest,
      derivedMetrics,
      description,
      env,
      evaluateOptions,
      prompts,
      providers,
      scenarios,
      tests,
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

      intervalIdRef.current = setInterval(async () => {
        try {
          const progressResponse = await callApi(`/eval/job/${job.id}/`);

          if (!progressResponse.ok) {
            if (intervalIdRef.current) {
              clearInterval(intervalIdRef.current);
              intervalIdRef.current = null;
            }
            throw new Error(`HTTP error! status: ${progressResponse.status}`);
          }

          const progressData = await progressResponse.json();

          // Update progress bar
          if (progressData && progressData.status === 'in-progress') {
            setProgress({
              current: progressData.progress || 0,
              total: progressData.total || 0,
              status: 'running',
              message: `Processing test ${progressData.progress || 0} of ${progressData.total || 0}`,
            });
          }

          if (progressData.status === 'complete') {
            if (intervalIdRef.current) {
              clearInterval(intervalIdRef.current);
              intervalIdRef.current = null;
            }
            setIsRunning(false);
            setProgress(null);
            if (progressData.evalId) {
              navigate(`/eval/${progressData.evalId}`);
            }
          } else if (['failed', 'error'].includes(progressData.status)) {
            if (intervalIdRef.current) {
              clearInterval(intervalIdRef.current);
              intervalIdRef.current = null;
            }
            setIsRunning(false);
            setProgress({
              current: 0,
              total: 0,
              status: 'failed',
              message: progressData.logs?.join('\n') || 'Job failed',
            });
            // Hide progress bar after 5 seconds
            setTimeout(() => setProgress(null), 5000);
            throw new Error(progressData.logs?.join('\n') || 'Job failed');
          }
        } catch (error) {
          if (intervalIdRef.current) {
            clearInterval(intervalIdRef.current);
            intervalIdRef.current = null;
          }
          console.error(error);
          setIsRunning(false);
          showError((error as Error).message, 'Evaluation Error');
        }
      }, 1000);
    } catch (error) {
      console.error(error);
      setIsRunning(false);
      setProgress({
        current: 0,
        total: 0,
        status: 'error',
        message: (error as Error).message,
      });
      // Hide progress bar after 5 seconds
      setTimeout(() => setProgress(null), 5000);
      showError((error as Error).message, 'Failed to Start Evaluation');
    }
  };

  // Normalize prompts for preview
  // Clean up interval on unmount
  React.useEffect(() => {
    return () => {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
    };
  }, []);

  const handleCancelEvaluation = async () => {
    if (intervalIdRef.current) {
      clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    }
    setIsRunning(false);
    setProgress(null);
    // TODO: Add API call to cancel the job
  };

  const normalizedPrompts = React.useMemo(() => {
    if (!prompts || !Array.isArray(prompts)) {
      return [];
    }
    return prompts
      .map((prompt) => {
        if (typeof prompt === 'string') {
          return prompt;
        } else if (typeof prompt === 'object' && prompt !== null && 'raw' in prompt) {
          return (prompt as { raw: string }).raw;
        }
        return '';
      })
      .filter((p): p is string => p !== '');
  }, [prompts]);

  return (
    <>
      <Button
        variant="contained"
        color="primary"
        size="medium"
        startIcon={isRunning ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />}
        onClick={handleRunClick}
        disabled={disabled || isRunning}
        sx={{
          textTransform: 'none',
          fontWeight: 600,
          px: 3,
        }}
      >
        {isRunning ? 'Running...' : 'Run eval'}
      </Button>

      {/* Progress bar portal - render at top of page */}
      {progress &&
        isRunning &&
        createPortal(
          <Box
            sx={{
              position: 'fixed',
              top: 64,
              left: 0,
              right: 0,
              zIndex: 1200,
              bgcolor: 'background.paper',
              borderBottom: '1px solid',
              borderColor: 'divider',
              py: 2,
            }}
          >
            <Container maxWidth="lg">
              <EvalProgressBar progress={progress} onCancel={handleCancelEvaluation} />
            </Container>
          </Box>,
          document.body,
        )}

      <EvaluationPreview
        open={showPreview}
        onClose={() => setShowPreview(false)}
        onConfirm={runTestSuite}
        prompts={normalizedPrompts}
        providers={providers as ProviderOptions[]}
        testCases={tests as TestCase[]}
      />
    </>
  );
};

export default IntegratedRunButton;
