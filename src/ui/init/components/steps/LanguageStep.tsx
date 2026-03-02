/**
 * LanguageStep - Select programming language for RAG/agent apps.
 */

import { SingleSelectStep } from '../shared/SingleSelectStep';

import type { Language } from '../../machines/initMachine.types';
import type { SelectOption } from '../shared/SingleSelectStep';

export interface LanguageStepProps {
  onSelect: (language: Language) => void;
  onBack: () => void;
  onCancel: () => void;
  isFocused?: boolean;
}

const LANGUAGE_OPTIONS: ReadonlyArray<SelectOption<Language>> = [
  {
    value: 'not_sure',
    label: 'Not sure yet',
    description: "We'll create Python examples that you can adapt",
    icon: '🤔',
  },
  {
    value: 'python',
    label: 'Python',
    description: 'Create Python scripts for context retrieval',
    icon: '🐍',
  },
  {
    value: 'javascript',
    label: 'JavaScript/TypeScript',
    description: 'Create JavaScript modules for context retrieval',
    icon: '📜',
  },
];

export function LanguageStep({ onSelect, onBack, isFocused = true }: LanguageStepProps) {
  return (
    <SingleSelectStep
      title="What programming language is your app written in?"
      options={LANGUAGE_OPTIONS}
      onSelect={onSelect}
      onBack={onBack}
      isFocused={isFocused}
    />
  );
}
