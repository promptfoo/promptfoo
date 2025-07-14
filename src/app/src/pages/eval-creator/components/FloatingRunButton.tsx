import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@app/stores/evalConfig';
import { callApi } from '@app/utils/api';
import Fab from '@mui/material/Fab';
import Zoom from '@mui/material/Zoom';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import Badge from '@mui/material/Badge';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ErrorIcon from '@mui/icons-material/Error';
import CheckIcon from '@mui/icons-material/Check';
import EvaluationPreview from './EvaluationPreview';
import type { TestCase, ProviderOptions } from '@promptfoo/types';

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  completedSteps: number;
  totalSteps: number;
}

const FloatingRunButton: React.FC = () => {
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
  } = config;

  const [isRunning, setIsRunning] = useState(false);
  const [_progressPercent, setProgressPercent] = useState(0);
  const [showButton, setShowButton] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Show button when scrolled down past the header
  useEffect(() => {
    const handleScroll = () => {
      const scrollThreshold = 200; // Show after scrolling 200px
      setShowButton(window.scrollY > scrollThreshold);
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Check initial scroll position

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Validate the configuration
  const validation = useMemo((): ValidationResult => {
    const errors: string[] = [];
    let completedSteps = 0;
    const totalSteps = 3;

    // Check for prompts
    if (!prompts || prompts.length === 0) {
      errors.push('At least one prompt is required');
    } else {
      completedSteps++;
    }

    // Check for providers
    if (!providers || providers.length === 0) {
      errors.push('At least one provider is required');
    } else {
      completedSteps++;
    }

    // Check for test cases
    if (!tests || tests.length === 0) {
      errors.push('At least one test case is required');
    } else {
      completedSteps++;
    }

    return {
      isValid: errors.length === 0,
      errors,
      completedSteps,
      totalSteps,
    };
  }, [prompts, providers, tests]);

  const handleRunClick = () => {
    if (!validation.isValid) {
      // Show validation errors
      alert(`Cannot run evaluation:\n\n${validation.errors.join('\n')}`);
      return;
    }

    // Show preview dialog
    setShowPreview(true);
  };

  const runTestSuite = async () => {
    setShowPreview(false);
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
            if (progressData.evalId) {
              navigate(`/eval/${progressData.evalId}`);
            }
          } else if (['failed', 'error'].includes(progressData.status)) {
            clearInterval(intervalId);
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

  const tooltipContent = validation.isValid ? (
    'Click to run the evaluation'
  ) : (
    <div>
      <strong>Complete these steps:</strong>
      <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
        {validation.errors.map((error, index) => (
          <li key={index}>{error}</li>
        ))}
      </ul>
    </div>
  );

  const fabIcon = isRunning ? (
    <CircularProgress size={24} color="inherit" />
  ) : validation.isValid ? (
    <PlayArrowIcon />
  ) : (
    <ErrorIcon />
  );

  const fabColor = validation.isValid ? 'primary' : 'error';

  // Normalize prompts for preview
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
      <Zoom in={showButton}>
        <Tooltip title={tooltipContent} arrow placement="left">
          <Badge
            badgeContent={
              validation.isValid ? (
                <CheckIcon sx={{ fontSize: 12 }} />
              ) : (
                `${validation.completedSteps}/${validation.totalSteps}`
              )
            }
            color={validation.isValid ? 'success' : 'warning'}
            overlap="circular"
            anchorOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
          >
            <Fab
              color={fabColor}
              aria-label="Run eval"
              onClick={handleRunClick}
              disabled={isRunning}
              sx={{
                position: 'fixed',
                bottom: 32,
                right: 32,
                zIndex: 1200,
              }}
            >
              {fabIcon}
            </Fab>
          </Badge>
        </Tooltip>
      </Zoom>

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

export default FloatingRunButton;
