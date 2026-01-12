/**
 * TargetLabelStep - Enter a name/label for the target being tested.
 *
 * This is the first step in the redteam wizard flow.
 */

import { useState } from 'react';

import { Box, Text, useInput } from 'ink';
import { NavigationBar } from '../../shared/NavigationBar';
import { TextInput } from '../../shared/TextInput';

export interface TargetLabelStepProps {
  /** Current target label value */
  value: string;
  /** Callback when value changes */
  onChange: (value: string) => void;
  /** Callback when submitted */
  onSubmit: (label: string) => void;
  /** Callback when going back */
  onBack: () => void;
  /** Callback when cancelled */
  onCancel: () => void;
  /** Whether the component is focused */
  isFocused?: boolean;
}

/**
 * Validate target label.
 */
function validateLabel(value: string): string | null {
  if (!value.trim()) {
    return 'Target name is required';
  }
  if (value.length > 100) {
    return 'Target name must be 100 characters or less';
  }
  return null;
}

/**
 * TargetLabelStep component for entering the target name.
 */
export function TargetLabelStep({
  value,
  onChange,
  onSubmit,
  onBack,
  onCancel: _onCancel,
  isFocused = true,
}: TargetLabelStepProps) {
  const [localValue, setLocalValue] = useState(value);

  // Handle escape for back navigation
  useInput(
    (_input, key) => {
      if (!isFocused) {
        return;
      }

      if (key.escape) {
        onBack();
        return;
      }
    },
    { isActive: isFocused },
  );

  const handleChange = (newValue: string) => {
    setLocalValue(newValue);
    onChange(newValue);
  };

  const handleSubmit = (submittedValue: string) => {
    if (!validateLabel(submittedValue)) {
      onSubmit(submittedValue.trim());
    }
  };

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>What is the name of your application or target?</Text>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>This helps identify your target in reports and configurations.</Text>
      </Box>

      <Box marginBottom={1}>
        <TextInput
          value={localValue}
          onChange={handleChange}
          onSubmit={handleSubmit}
          placeholder="e.g., Customer Support Chatbot, Sales Agent, RAG Pipeline"
          validate={validateLabel}
          isFocused={isFocused}
        />
      </Box>

      <NavigationBar
        canGoBack={true}
        showNext={true}
        nextLabel="Continue"
        nextDisabled={!!validateLabel(localValue)}
        showHelp={false}
      />
    </Box>
  );
}
