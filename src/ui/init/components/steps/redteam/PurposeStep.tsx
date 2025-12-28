/**
 * PurposeStep - Enter the purpose/description of the application.
 *
 * This helps generate more relevant test cases.
 */

import { useState } from 'react';

import { Box, Text, useInput } from 'ink';
import { NavigationBar } from '../../shared/NavigationBar';
import { TextInput } from '../../shared/TextInput';

export interface PurposeStepProps {
  /** Current purpose value */
  value: string;
  /** Callback when value changes */
  onChange: (value: string) => void;
  /** Callback when submitted */
  onSubmit: (purpose: string) => void;
  /** Callback when going back */
  onBack: () => void;
  /** Callback when cancelled */
  onCancel: () => void;
  /** Whether the component is focused */
  isFocused?: boolean;
}

/**
 * Validate purpose.
 */
function validatePurpose(value: string): string | null {
  if (!value.trim()) {
    return 'Purpose is required';
  }
  if (value.length < 10) {
    return 'Please provide a more detailed description (at least 10 characters)';
  }
  if (value.length > 500) {
    return 'Purpose must be 500 characters or less';
  }
  return null;
}

/**
 * PurposeStep component for entering application purpose.
 */
export function PurposeStep({
  value,
  onChange,
  onSubmit,
  onBack,
  onCancel: _onCancel,
  isFocused = true,
}: PurposeStepProps) {
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
    if (!validatePurpose(submittedValue)) {
      onSubmit(submittedValue.trim());
    }
  };

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Describe what your application does</Text>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>This helps us generate more relevant and targeted test cases.</Text>
      </Box>

      <Box marginBottom={1}>
        <TextInput
          value={localValue}
          onChange={handleChange}
          onSubmit={handleSubmit}
          placeholder="e.g., A customer support chatbot that helps users with billing questions"
          validate={validatePurpose}
          isFocused={isFocused}
        />
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          Tips: Include the domain, audience, and key capabilities of your application.
        </Text>
      </Box>

      <NavigationBar
        canGoBack={true}
        showNext={true}
        nextLabel="Continue"
        nextDisabled={!!validatePurpose(localValue)}
        showHelp={false}
      />
    </Box>
  );
}
