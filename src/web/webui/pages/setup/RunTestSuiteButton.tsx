import React, { useState } from 'react';
import { Button, CircularProgress } from '@mui/material';

import { useStore } from '../../util/store';

const RunTestSuiteButton: React.FC = () => {
  const { description, providers, prompts, testCases } = useStore();
  const [isRunning, setIsRunning] = useState(false);

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
      const data = await response.json();
      console.log(data);
    } catch (error) {
      console.error(error);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Button variant="contained" color="primary" onClick={runTestSuite} disabled={isRunning}>
      {isRunning && <CircularProgress size={24} sx={{ marginRight: 2 }} />} Run Test Suite
    </Button>
  );
};

export default RunTestSuiteButton;
