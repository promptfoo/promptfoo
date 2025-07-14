import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Button,
  Fade,
  Chip,
  Stack,
  alpha,
  useTheme,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import { useStore } from '@app/stores/evalConfig';
import { useUserPreferences } from '@app/stores/userPreferences';
import { ComponentErrorBoundary } from './ComponentErrorBoundary';

interface NextStepsGuideProps {
  currentSection?: 'prompts' | 'providers' | 'tests' | 'yaml';
  onOpenTemplates?: () => void;
}

const NextStepsGuide: React.FC<NextStepsGuideProps> = ({ currentSection, onOpenTemplates }) => {
  const theme = useTheme();
  const { config } = useStore();
  const { experienceMode } = useUserPreferences();
  const prompts = config.prompts || [];
  const providers = config.providers || [];
  const tests = config.tests || [];

  // Memoize step counts to prevent unnecessary re-renders
  const hasPrompts = React.useMemo(() => prompts.length > 0, [prompts.length]);
  const hasProviders = React.useMemo(() => providers.length > 0, [providers.length]);
  const hasTests = React.useMemo(() => tests.length > 0, [tests.length]);

  // Determine completion status for each step
  const steps = React.useMemo(
    () => [
      {
        id: 'prompts',
        label: 'Add Prompts',
        completed: hasPrompts,
        description: 'Define the prompts you want to test',
        nextAction: hasPrompts ? 'Review your prompts' : 'Add your first prompt',
      },
      {
        id: 'providers',
        label: 'Select Providers',
        completed: hasProviders,
        description: 'Choose AI models to evaluate',
        nextAction: hasProviders ? 'Configure provider settings' : 'Select at least one provider',
      },
      {
        id: 'tests',
        label: 'Create Test Cases',
        completed: hasTests,
        description: 'Add test cases with variables and assertions',
        nextAction: hasTests ? 'Add assertions to test cases' : 'Add or generate test cases',
      },
      {
        id: 'run',
        label: 'Run Evaluation',
        completed: false,
        description: 'Execute your evaluation',
        nextAction: 'Run the evaluation',
      },
    ],
    [hasPrompts, hasProviders, hasTests],
  );

  // Find current step index
  const currentStepIndex = React.useMemo(() => {
    return steps.findIndex((step) => {
      if (currentSection === 'yaml') {
        return false;
      }
      if (currentSection) {
        return step.id === currentSection;
      }
      // Auto-detect based on completion
      return !step.completed;
    });
  }, [steps, currentSection]);

  // Get next incomplete step
  const nextStep = React.useMemo(() => {
    return steps.find((step, index) => {
      return index > currentStepIndex && !step.completed;
    });
  }, [steps, currentStepIndex]);

  // Don't show if all steps are complete or in YAML section or for experienced users
  if (
    currentSection === 'yaml' ||
    (hasPrompts && hasProviders && hasTests) ||
    experienceMode === 'experienced'
  ) {
    return null;
  }

  return (
    <Fade in timeout={500}>
      <Card
        variant="outlined"
        sx={{
          mb: 3,
          borderColor: alpha(theme.palette.primary.main, 0.3),
          borderWidth: 1,
          background:
            theme.palette.mode === 'dark'
              ? `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.05)} 0%, ${alpha(theme.palette.primary.main, 0.02)} 100%)`
              : `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.03)} 0%, ${alpha(theme.palette.primary.main, 0.01)} 100%)`,
        }}
      >
        <CardContent>
          <Stack spacing={2}>
            <Box display="flex" alignItems="center" gap={1}>
              <Typography variant="h6" color="primary">
                What's Next?
              </Typography>
              <Chip
                label={`${steps.filter((s) => s.completed).length} of ${steps.length - 1} steps complete`}
                size="small"
                color="primary"
                variant="outlined"
              />
            </Box>

            {/* Quick start option when nothing is configured */}
            {!currentSection && !hasPrompts && !hasProviders && !hasTests && onOpenTemplates && (
              <Box
                sx={{
                  p: 2,
                  borderRadius: 1,
                  backgroundColor: alpha(
                    theme.palette.secondary.main,
                    theme.palette.mode === 'dark' ? 0.1 : 0.05,
                  ),
                  mb: 2,
                  border: `1px solid ${alpha(theme.palette.secondary.main, 0.2)}`,
                }}
              >
                <Stack direction="row" alignItems="center" spacing={2}>
                  <RocketLaunchIcon color="secondary" />
                  <Box flex={1}>
                    <Typography variant="subtitle2" fontWeight="medium">
                      Quick Start
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={(theme) => ({
                        color:
                          theme.palette.mode === 'dark'
                            ? theme.palette.text.secondary
                            : theme.palette.text.primary,
                        opacity: theme.palette.mode === 'dark' ? 0.9 : 0.7,
                      })}
                    >
                      Use a pre-configured template to get started quickly
                    </Typography>
                  </Box>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={onOpenTemplates}
                    sx={{ textTransform: 'none' }}
                  >
                    Browse Templates
                  </Button>
                </Stack>
              </Box>
            )}

            {/* Mini progress indicator */}
            <Box display="flex" gap={1} mb={2}>
              {steps.slice(0, -1).map((step, index) => (
                <Box
                  key={step.id}
                  sx={{
                    flex: 1,
                    height: 4,
                    borderRadius: 1,
                    backgroundColor: step.completed ? 'primary.main' : 'action.disabled',
                    transition: 'background-color 0.3s',
                  }}
                />
              ))}
            </Box>

            {/* Current task guidance */}
            {currentStepIndex >= 0 && currentStepIndex < steps.length && (
              <Box
                sx={{
                  p: 2,
                  borderRadius: 1,
                  backgroundColor: theme.palette.action.hover,
                }}
              >
                <Stack direction="row" alignItems="center" spacing={1} mb={1}>
                  <RadioButtonUncheckedIcon color="primary" fontSize="small" />
                  <Typography variant="subtitle1" fontWeight="medium">
                    {steps[currentStepIndex].label}
                  </Typography>
                </Stack>
                <Typography
                  variant="body2"
                  sx={(theme) => ({
                    ml: 3.5,
                    color:
                      theme.palette.mode === 'dark'
                        ? theme.palette.text.secondary
                        : theme.palette.text.primary,
                    opacity: theme.palette.mode === 'dark' ? 0.9 : 0.7,
                  })}
                >
                  {steps[currentStepIndex].description}
                </Typography>
                <Typography
                  variant="body2"
                  color="primary"
                  sx={{ ml: 3.5, mt: 0.5, fontWeight: 500 }}
                >
                  → {steps[currentStepIndex].nextAction}
                </Typography>
              </Box>
            )}

            {/* Next step preview */}
            {nextStep && currentStepIndex >= 0 && (
              <Box
                sx={{
                  p: 2,
                  borderRadius: 1,
                  border: '1px dashed',
                  borderColor: 'divider',
                  opacity: 0.7,
                }}
              >
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography
                    variant="body2"
                    sx={(theme) => ({
                      color:
                        theme.palette.mode === 'dark'
                          ? theme.palette.text.secondary
                          : theme.palette.text.primary,
                      opacity: theme.palette.mode === 'dark' ? 0.8 : 0.6,
                    })}
                  >
                    Up next:
                  </Typography>
                  <Typography variant="body2" fontWeight="medium">
                    {nextStep.label}
                  </Typography>
                  <ArrowForwardIcon fontSize="small" color="action" />
                </Stack>
              </Box>
            )}

            {/* Quick tips based on current section */}
            {currentSection === 'prompts' && prompts.length === 0 && (
              <Box sx={{ mt: 1 }}>
                <Typography
                  variant="caption"
                  display="block"
                  sx={(theme) => ({
                    color:
                      theme.palette.mode === 'dark'
                        ? theme.palette.text.secondary
                        : theme.palette.text.primary,
                    opacity: theme.palette.mode === 'dark' ? 0.8 : 0.6,
                  })}
                >
                  💡 Tip: Use {'{{variables}}'} in your prompts to create dynamic content
                </Typography>
              </Box>
            )}
            {currentSection === 'providers' && providers.length === 0 && (
              <Box sx={{ mt: 1 }}>
                <Typography
                  variant="caption"
                  display="block"
                  sx={(theme) => ({
                    color:
                      theme.palette.mode === 'dark'
                        ? theme.palette.text.secondary
                        : theme.palette.text.primary,
                    opacity: theme.palette.mode === 'dark' ? 0.8 : 0.6,
                  })}
                >
                  💡 Tip: Start with popular models like GPT-4.1 or Claude 4 for best results
                </Typography>
              </Box>
            )}
            {currentSection === 'tests' && tests.length === 0 && (
              <Box sx={{ mt: 1 }}>
                <Typography
                  variant="caption"
                  display="block"
                  sx={(theme) => ({
                    color:
                      theme.palette.mode === 'dark'
                        ? theme.palette.text.secondary
                        : theme.palette.text.primary,
                    opacity: theme.palette.mode === 'dark' ? 0.8 : 0.6,
                  })}
                >
                  💡 Tip: Use "Generate Multiple" to quickly create test cases with AI
                </Typography>
              </Box>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Fade>
  );
};

const NextStepsGuideWithErrorBoundary: React.FC<NextStepsGuideProps> = (props) => {
  return (
    <ComponentErrorBoundary componentName="NextStepsGuide">
      <NextStepsGuide {...props} />
    </ComponentErrorBoundary>
  );
};

export default React.memo(NextStepsGuideWithErrorBoundary);
