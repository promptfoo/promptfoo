import { z } from 'zod';
import { InputsSchema, normalizeInputDefinition } from '../../../contracts/shared';
import {
  AGENT_OUTCOME_DEFAULT_TASKS,
  AgentOutcomeModeSchema,
  type AgentOutcomePluginId,
  DEFAULT_AGENT_OUTCOME_ARTIFACT_VAR,
} from '../../constants/agentOutcomes';
import { MULTI_INPUT_VAR } from '../../constants/plugins';
import {
  getLiteralMessageOverLimit,
  getMaxCharsPerMessageFromConfig,
} from '../../shared/promptLengthValidation';

const reservedNames = new Set([
  'agentOutcome',
  '__evalId',
  '__evalStepId',
  '__repeatIndex',
  '_conversation',
  MULTI_INPUT_VAR,
  '__proto__',
  'prototype',
  'constructor',
]);
// HTTP targets populate these template variables while constructing the request.
const reservedArtifactNames = new Set([
  ...reservedNames,
  'prompt',
  'evaluationId',
  'tools',
  'tool_choice',
  'token',
  'expiration',
  'signature',
  'signatureTimestamp',
  'sessionId',
]);
const artifactVar = z
  .string()
  .refine((value) => InputsSchema.keyType.safeParse(value).success, {
    message: 'Use a variable name like ticket_body, starting with a letter or underscore.',
  })
  .refine((value) => !reservedArtifactNames.has(value), {
    message: 'This variable name is reserved. Use a name like ticket_body.',
  });

const AgentOutcomeOptionsSchema = z
  .object({
    mode: z.enum([...AgentOutcomeModeSchema.options, 'both']).default('both'),
    legitimateTask: z.string().regex(/\S/, 'Provide a non-empty legitimate task').optional(),
    indirectInjectionVar: artifactVar.default(DEFAULT_AGENT_OUTCOME_ARTIFACT_VAR),
    inputs: InputsSchema.optional(),
    injectVar: z.string().regex(/\S/, 'Choose a user message variable').optional(),
    maxCharsPerMessage: z.int().positive().optional(),
    modifiers: z.unknown().optional(),
  })
  .superRefine(({ mode, indirectInjectionVar, inputs, injectVar }, ctx) => {
    const invalid = (path: string[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });
    if (
      injectVar === indirectInjectionVar ||
      (injectVar && injectVar !== MULTI_INPUT_VAR && reservedNames.has(injectVar))
    ) {
      invalid(
        ['injectVar'],
        'Use a user message variable distinct from indirectInjectionVar and reserved names',
      );
    }
    const fields = Object.entries(inputs ?? {});
    const ownerFields = fields.filter(([key]) => key !== indirectInjectionVar);
    if (fields.length && ownerFields.length !== 1) {
      invalid(
        ['inputs'],
        'Declare one user message field and optionally the field named by indirectInjectionVar',
      );
    }
    for (const [key, input] of fields) {
      const { type, config } = normalizeInputDefinition(input);
      if (reservedNames.has(key) || type !== 'text') {
        invalid(['inputs', key], 'Use a non-reserved text field');
      }
      const attackMode = key === indirectInjectionVar ? 'indirect' : 'direct';
      if (config?.benign && (mode === 'both' || mode === attackMode)) {
        invalid(
          ['inputs', key],
          `The ${attackMode} attack requires this input to allow adversarial content`,
        );
      }
    }
  });

export function getAgentOutcomeConfigSchema(
  pluginId: AgentOutcomePluginId,
  fallbackLimit?: number,
) {
  return AgentOutcomeOptionsSchema.transform((options) => ({
    ...options,
    legitimateTask: options.legitimateTask ?? AGENT_OUTCOME_DEFAULT_TASKS[pluginId],
    maxCharsPerMessage: getMaxCharsPerMessageFromConfig(options) ?? fallbackLimit,
  })).superRefine(({ mode, legitimateTask, maxCharsPerMessage }, ctx) => {
    const violation =
      mode !== 'direct' && getLiteralMessageOverLimit(legitimateTask, maxCharsPerMessage);
    if (violation) {
      ctx.addIssue({
        code: 'custom',
        path: ['legitimateTask'],
        message: `The user task for indirect tests is ${violation.length} characters long. Shorten legitimateTask to ${violation.limit} characters or increase maxCharsPerMessage.`,
      });
    }
  });
}
