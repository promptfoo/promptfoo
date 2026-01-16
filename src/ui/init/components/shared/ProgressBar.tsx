/**
 * ProgressBar - Step progress indicator for multi-step wizards.
 *
 * Displays current step, total steps, and visual progress dots.
 */

import { Box, Text } from 'ink';

export interface ProgressBarProps {
  /** Current step (0-indexed) */
  currentStep: number;
  /** Total number of steps */
  totalSteps: number;
  /** Step titles for display */
  stepTitles?: string[];
  /** Show step numbers */
  showNumbers?: boolean;
}

export function ProgressBar({
  currentStep,
  totalSteps,
  stepTitles,
  showNumbers = true,
}: ProgressBarProps) {
  const currentTitle = stepTitles?.[currentStep] ?? `Step ${currentStep + 1}`;

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Step title */}
      <Box>
        {showNumbers && (
          <Text dimColor>
            Step {currentStep + 1} of {totalSteps}:{' '}
          </Text>
        )}
        <Text bold color="cyan">
          {currentTitle}
        </Text>
      </Box>

      {/* Progress dots */}
      <Box marginTop={1}>
        {Array.from({ length: totalSteps }).map((_, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const isPending = index > currentStep;

          let color: string | undefined;
          let symbol: string;

          if (isCompleted) {
            color = 'green';
            symbol = '●';
          } else if (isCurrent) {
            color = 'cyan';
            symbol = '●';
          } else {
            color = 'gray';
            symbol = '○';
          }

          return (
            <Box key={index} marginRight={1}>
              <Text color={color}>{symbol}</Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

/**
 * Compact progress indicator showing just dots.
 */
export function ProgressDots({
  currentStep,
  totalSteps,
}: {
  currentStep: number;
  totalSteps: number;
}) {
  return (
    <Box>
      <Text color="gray">[</Text>
      {Array.from({ length: totalSteps }).map((_, index) => {
        const isCompleted = index < currentStep;
        const isCurrent = index === currentStep;

        let color: string;
        if (isCompleted) {
          color = 'green';
        } else if (isCurrent) {
          color = 'cyan';
        } else {
          color = 'gray';
        }

        return (
          <Text key={index} color={color}>
            {isCompleted ? '●' : isCurrent ? '●' : '○'}
          </Text>
        );
      })}
      <Text color="gray">]</Text>
    </Box>
  );
}
