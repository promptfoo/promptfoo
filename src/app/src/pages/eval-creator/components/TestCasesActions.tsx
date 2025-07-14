import React from 'react';
import AutoAwesome from '@mui/icons-material/AutoAwesome';
import Publish from '@mui/icons-material/Publish';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

interface TestCasesActionsProps {
  hasTestCases: boolean;
  hasPrompts: boolean;
  onAddExample: () => void;
  onGenerate: () => void;
  onQuickGenerate: () => void;
  onAdd: () => void;
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

const TestCasesActions = React.memo<TestCasesActionsProps>(
  ({ hasTestCases, hasPrompts, onAddExample, onGenerate, onQuickGenerate, onAdd, onUpload }) => {
    const fileInputId = React.useId();

    return (
      <Stack direction="row" spacing={2} mb={2} justifyContent="space-between">
        <Typography variant="h5">Test Cases</Typography>
        <div>
          <label htmlFor={fileInputId}>
            <Tooltip title="Upload test cases from CSV file">
              <span>
                <IconButton component="span" aria-label="Upload test cases from CSV">
                  <Publish />
                </IconButton>
                <input
                  id={fileInputId}
                  type="file"
                  accept=".csv"
                  onChange={onUpload}
                  style={{ display: 'none' }}
                  aria-label="Upload CSV file with test cases"
                />
              </span>
            </Tooltip>
          </label>

          {!hasTestCases && (
            <Button color="secondary" onClick={onAddExample} sx={{ mr: 1 }}>
              Add Example
            </Button>
          )}

          <Button
            color="primary"
            onClick={onQuickGenerate}
            variant="text"
            startIcon={<AutoAwesome />}
            disabled={!hasPrompts}
            sx={{ mr: 0.5 }}
            size="small"
          >
            Quick Generate
          </Button>
          
          <Button
            color="primary"
            onClick={onGenerate}
            variant="outlined"
            startIcon={<AutoAwesome />}
            disabled={!hasPrompts}
            sx={{ mr: 1 }}
          >
            Generate Multiple
          </Button>

          <Button color="primary" onClick={onAdd} variant="contained">
            Add Test Case
          </Button>
        </div>
      </Stack>
    );
  },
);

TestCasesActions.displayName = 'TestCasesActions';

export default TestCasesActions;
