import React, { useMemo } from 'react';
import { useStore } from '@app/stores/evalConfig';
import Box from '@mui/material/Box';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';

interface StepStatus {
  label: string;
  completed: boolean;
  description: string;
}

const ConfigProgressIndicator: React.FC = () => {
  const { config } = useStore();
  const { prompts, providers, tests } = config;

  const steps = useMemo((): StepStatus[] => {
    return [
      {
        label: 'Add Prompts',
        completed: prompts && prompts.length > 0,
        description: `${prompts?.length || 0} prompt${prompts?.length !== 1 ? 's' : ''} configured`,
      },
      {
        label: 'Select Providers',
        completed: providers && providers.length > 0,
        description: `${providers?.length || 0} provider${providers?.length !== 1 ? 's' : ''} selected`,
      },
      {
        label: 'Create Test Cases',
        completed: tests && tests.length > 0,
        description: `${tests?.length || 0} test case${tests?.length !== 1 ? 's' : ''} created`,
      },
    ];
  }, [prompts, providers, tests]);

  const allCompleted = steps.every((step) => step.completed);
  const completedCount = steps.filter((step) => step.completed).length;

  return (
    <Paper
      elevation={allCompleted ? 0 : 1}
      sx={(theme) => ({
        p: 2,
        mb: 3,
        backgroundColor: allCompleted
          ? alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.08 : 0.04)
          : theme.palette.background.paper,
        borderRadius: 1,
        border: allCompleted ? '1px solid' : 'none',
        borderColor: alpha(theme.palette.success.main, 0.3),
      })}
    >
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle1" gutterBottom fontWeight="medium">
          Set up Progress {allCompleted && '✓'}
        </Typography>
        <Typography
          variant="body2"
          sx={(theme) => ({
            color:
              theme.palette.mode === 'dark'
                ? theme.palette.text.secondary
                : theme.palette.text.primary,
            opacity: theme.palette.mode === 'dark' ? 1 : 0.7,
          })}
        >
          {allCompleted
            ? 'All set! Your eval is ready to run.'
            : `Complete ${3 - completedCount} more step${3 - completedCount !== 1 ? 's' : ''} to run your eval.`}
        </Typography>
      </Box>

      <Stepper activeStep={completedCount} alternativeLabel>
        {steps.map((step, index) => (
          <Step key={index} completed={step.completed}>
            <StepLabel
              StepIconComponent={step.completed ? CheckCircleIcon : RadioButtonUncheckedIcon}
              StepIconProps={{
                color: step.completed ? 'success' : 'action',
              }}
            >
              <Box>
                <Typography variant="body2" fontWeight={step.completed ? 600 : 400}>
                  {step.label}
                </Typography>
                <Typography
                  variant="caption"
                  sx={(theme) => ({
                    color:
                      theme.palette.mode === 'dark'
                        ? theme.palette.text.secondary
                        : theme.palette.text.primary,
                    opacity: theme.palette.mode === 'dark' ? 0.8 : 0.6,
                  })}
                >
                  {step.description}
                </Typography>
              </Box>
            </StepLabel>
          </Step>
        ))}
      </Stepper>
    </Paper>
  );
};

export default ConfigProgressIndicator;
