/**
 * TargetTypeStep - Select the type of target being tested.
 */

import { SingleSelectStep } from '../../shared/SingleSelectStep';

import type { RedteamTargetType } from '../../../machines/initMachine.types';
import type { SelectOption } from '../../shared/SingleSelectStep';

export interface TargetTypeStepProps {
  onSelect: (targetType: RedteamTargetType) => void;
  onBack: () => void;
  onCancel: () => void;
  isFocused?: boolean;
}

const TARGET_TYPE_OPTIONS: ReadonlyArray<SelectOption<RedteamTargetType>> = [
  {
    value: 'not_sure',
    label: "I'm not sure",
    description: "We'll help you figure out the best configuration",
    icon: '?',
  },
  {
    value: 'http_endpoint',
    label: 'HTTP/REST API endpoint',
    description: 'Test an API endpoint that accepts prompts and returns responses',
    icon: '?',
  },
  {
    value: 'prompt_model_chatbot',
    label: 'Prompt + Model / Chatbot',
    description: 'Test a system prompt with a model or conversational chatbot',
    icon: '?',
  },
  {
    value: 'rag',
    label: 'RAG (Retrieval-Augmented Generation)',
    description: 'Test a system that retrieves context before generating responses',
    icon: '?',
  },
  {
    value: 'agent',
    label: 'Agent / Function-calling system',
    description: 'Test an agent that can execute tools and make decisions',
    icon: '?',
  },
];

export function TargetTypeStep({ onSelect, onBack, isFocused = true }: TargetTypeStepProps) {
  return (
    <SingleSelectStep
      title="What type of target are you testing?"
      options={TARGET_TYPE_OPTIONS}
      onSelect={onSelect}
      onBack={onBack}
      isFocused={isFocused}
      indicator=">"
    />
  );
}
