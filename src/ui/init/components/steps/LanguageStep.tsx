/**
 * LanguageStep - Select programming language for RAG/Agent use cases.
 */

import { Box, Text } from 'ink';

import type { Language, SelectItem } from '../../types';
import { SelectInput } from '../shared/SelectInput';

export interface LanguageStepProps {
  /** Current selection */
  value: Language | null;
  /** Called when selection changes */
  onChange: (value: Language) => void;
  /** Called when user confirms selection */
  onSubmit: (value: Language) => void;
  /** Whether the component is focused */
  isFocused?: boolean;
}

const LANGUAGE_ITEMS: SelectItem<Language>[] = [
  {
    value: 'not_sure',
    label: 'Not sure yet',
    description: 'Default to Python',
  },
  {
    value: 'python',
    label: 'Python',
    description: 'Generate Python context loader',
  },
  {
    value: 'javascript',
    label: 'JavaScript',
    description: 'Generate JavaScript context loader',
  },
];

export function LanguageStep({ value, onChange, onSubmit, isFocused = true }: LanguageStepProps) {
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text>What programming language are you developing the app in?</Text>
      </Box>

      <SelectInput<Language>
        items={LANGUAGE_ITEMS}
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        isFocused={isFocused}
        maxVisible={4}
      />
    </Box>
  );
}
