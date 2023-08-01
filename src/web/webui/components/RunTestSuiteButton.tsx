import React, { useState } from 'react';
import { Button, CircularProgress } from '@mui/material';

interface RunTestSuiteButtonProps {
  testSuite: any;
}

const RunTestSuiteButton: React.FC<RunTestSuiteButtonProps> = ({ testSuite }) => {
  const [isRunning, setIsRunning] = useState(false);

  const runTestSuite = async () => {
    setIsRunning(true);
    try {
      const response = await fetch('/run-test-suite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(testSuite)
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
      {isRunning ? <CircularProgress size={24} /> : 'Run Test Suite'}
    </Button>
  );
};

export default RunTestSuiteButton;
