import React from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import StepContent from '@mui/material/StepContent';
import Link from '@mui/material/Link';

interface OnboardingDialogProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

const steps = [
  {
    label: 'What is an Eval?',
    content: (
      <>
        <Typography paragraph>
          An evaluation (eval) systematically tests AI prompts across multiple scenarios to find
          what works best.
        </Typography>
        <Typography paragraph>
          Think of it like A/B testing for AI - you can compare different prompts, models, and
          configurations to optimize quality and reliability.
        </Typography>
      </>
    ),
  },
  {
    label: 'Add Your Prompts',
    content: (
      <>
        <Typography paragraph>
          Start by adding the prompts you want to test. Use <code>{`{{variables}}`}</code> to create
          dynamic placeholders.
        </Typography>
        <Typography paragraph>
          <strong>Example:</strong> "Summarize this article about {`{{topic}}`} for a{' '}
          {`{{audience}}`}"
        </Typography>
      </>
    ),
  },
  {
    label: 'Choose AI Providers',
    content: (
      <>
        <Typography paragraph>
          Select which AI models to test your prompts with. You can compare GPT-4, Claude, Gemini,
          and more.
        </Typography>
        <Typography paragraph>
          Each provider will receive the same prompts, allowing you to see which performs best for
          your use case.
        </Typography>
      </>
    ),
  },
  {
    label: 'Create Test Cases',
    content: (
      <>
        <Typography paragraph>
          Test cases provide different values for your variables. Each combination creates a unique
          scenario to test.
        </Typography>
        <Typography paragraph>
          You can generate test cases automatically or create them manually. Assertions help verify
          the AI responses meet your requirements.
        </Typography>
      </>
    ),
  },
  {
    label: 'Run and Analyze',
    content: (
      <>
        <Typography paragraph>
          Click "Run Evaluation" to test all combinations. You'll get a detailed report comparing
          outputs across all providers and test cases.
        </Typography>
        <Typography paragraph>
          <Link href="https://docs.promptfoo.dev" target="_blank" rel="noopener">
            Learn more in our documentation →
          </Link>
        </Typography>
      </>
    ),
  },
];

export const OnboardingDialog: React.FC<OnboardingDialogProps> = ({
  open,
  onClose,
  onComplete,
}) => {
  const [activeStep, setActiveStep] = React.useState(0);

  const handleNext = () => {
    if (activeStep === steps.length - 1) {
      onComplete();
    } else {
      setActiveStep((prevActiveStep) => prevActiveStep + 1);
    }
  };

  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
  };

  const handleSkip = () => {
    onComplete();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Welcome to Eval Creator
        <Typography variant="body2" color="text.secondary">
          Let's quickly walk through how to create your first evaluation
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ maxWidth: 400 }}>
          <Stepper activeStep={activeStep} orientation="vertical">
            {steps.map((step, index) => (
              <Step key={step.label}>
                <StepLabel>{step.label}</StepLabel>
                <StepContent>
                  <Box sx={{ mb: 2 }}>{step.content}</Box>
                  <Box sx={{ mb: 2 }}>
                    <Button variant="contained" onClick={handleNext} sx={{ mt: 1, mr: 1 }}>
                      {index === steps.length - 1 ? 'Get Started' : 'Continue'}
                    </Button>
                    {index > 0 && (
                      <Button onClick={handleBack} sx={{ mt: 1, mr: 1 }}>
                        Back
                      </Button>
                    )}
                  </Box>
                </StepContent>
              </Step>
            ))}
          </Stepper>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleSkip} color="inherit">
          Skip Tutorial
        </Button>
      </DialogActions>
    </Dialog>
  );
};
