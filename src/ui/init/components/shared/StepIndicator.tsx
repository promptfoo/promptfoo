/**
 * StepIndicator - Visual progress indicator for wizard steps.
 *
 * Shows the current step in a sequence with visual markers for
 * completed, current, and upcoming steps.
 */

import { Box, Text } from 'ink';

import type { StepInfo } from '../../machines/initMachine.types';

export interface StepIndicatorProps {
  /** All steps in the wizard */
  steps: StepInfo[];
  /** Index of the current step (0-based) */
  currentIndex: number;
  /** Whether to show step labels */
  showLabels?: boolean;
  /** Whether to use compact mode (dots only) */
  compact?: boolean;
}

/**
 * StepIndicator component showing wizard progress.
 */
export function StepIndicator({
  steps,
  currentIndex,
  showLabels = true,
  compact = false,
}: StepIndicatorProps) {
  if (compact) {
    return (
      <Box>
        <Text dimColor>Step </Text>
        <Text color="cyan" bold>
          {currentIndex + 1}
        </Text>
        <Text dimColor> of {steps.length}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="row" gap={1}>
      {steps.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isUpcoming = index > currentIndex;

        // Determine the marker
        let marker: string;
        let markerColor: string | undefined;

        if (isCompleted) {
          marker = '●';
          markerColor = 'green';
        } else if (isCurrent) {
          marker = '◉';
          markerColor = 'cyan';
        } else {
          marker = '○';
          markerColor = undefined; // dim
        }

        // Determine label color
        let labelColor: string | undefined;
        if (isCurrent) {
          labelColor = 'cyan';
        } else if (isUpcoming) {
          labelColor = undefined; // dim
        }

        return (
          <Box key={step.id} flexDirection="row" gap={0}>
            <Text color={markerColor} dimColor={isUpcoming}>
              {marker}
            </Text>
            {showLabels && (
              <Text color={labelColor} dimColor={isUpcoming}>
                {' '}
                {step.shortLabel || step.label}
              </Text>
            )}
            {index < steps.length - 1 && <Text dimColor> {'─'} </Text>}
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * Simple step counter for minimal display.
 */
export function StepCounter({ current, total }: { current: number; total: number }) {
  return (
    <Box>
      <Text dimColor>[</Text>
      <Text color="cyan" bold>
        {current}
      </Text>
      <Text dimColor>/{total}]</Text>
    </Box>
  );
}
