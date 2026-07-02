import { handleIsValidFunctionCall } from '../functionToolCall';
import { handleGuardrails } from '../guardrails';
import { handleIsValidOpenAiToolsCall } from '../openai';
import { handleIsRefusal } from '../refusal';

import type { AssertionCapabilityPack } from '../registryTypes';

export const providerAssertionPack = {
  name: 'provider',
  handlers: {
    guardrails: handleGuardrails,
    'is-refusal': handleIsRefusal,
    'is-valid-function-call': handleIsValidFunctionCall,
    'is-valid-openai-function-call': handleIsValidFunctionCall,
    'is-valid-openai-tools-call': handleIsValidOpenAiToolsCall,
  },
} satisfies AssertionCapabilityPack<
  Parameters<typeof handleGuardrails>[0],
  Awaited<ReturnType<typeof handleGuardrails>>
>;
