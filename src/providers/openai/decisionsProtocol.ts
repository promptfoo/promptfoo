import { z } from 'zod';
import { normalizeResponsesInput } from '../responses/input';

const decisionChoiceValueSchema = z.union([z.string(), z.boolean()]);
export const decisionProbabilitySchema = z.number().min(0).max(1);
// Promptfoo allows one percentage point of rounding error, plus floating-point slack.
const DISTRIBUTION_TOLERANCE = 0.01 + 1e-12;
const decisionTextPartSchema = z.object({ type: z.literal('input_text'), text: z.string() });
const decisionImagePartSchema = z.object({
  type: z.literal('input_image'),
  image_url: z.union([
    z.string().regex(/^data:image\/[^;,]+;base64,/i),
    z.url({ protocol: /^https?$/ }),
  ]),
  detail: z.enum(['auto', 'low', 'high', 'original']).nullish(),
});
const decisionJsonObjectSchema = z.record(z.string(), z.json());
const decisionJsonPartSchema = z.object({
  type: z.literal('input_json'),
  data: z.union([decisionJsonObjectSchema, z.array(decisionJsonObjectSchema)]),
});
const decisionQuestionFields = {
  name: z.string().optional(),
  instructions: z.union([
    z.string(),
    z.array(
      z.discriminatedUnion('type', [
        decisionTextPartSchema.strict(),
        decisionImagePartSchema.strict(),
        decisionJsonPartSchema.strict(),
      ]),
    ),
  ]),
};

export const decisionLevelSchema = z
  .object({ label: z.string(), description: z.string().optional() })
  .strict();

export const decisionGradingLevelsSchema = z
  .array(z.union([z.string().transform((label) => ({ label })), decisionLevelSchema]))
  .min(2)
  .max(10);

export const decisionQuestionSchema = z.discriminatedUnion('type', [
  z.object({ ...decisionQuestionFields, type: z.literal('predicate') }).strict(),
  z
    .object({
      ...decisionQuestionFields,
      type: z.literal('choice'),
      choices: z
        .array(
          z
            .object({ value: decisionChoiceValueSchema, description: z.string().optional() })
            .strict(),
        )
        .min(2)
        .max(255)
        .refine(
          (choices) => new Set(choices.map((choice) => choice.value)).size === choices.length,
          { message: 'Choice values must be unique within the question' },
        ),
    })
    .strict(),
  z
    .object({
      ...decisionQuestionFields,
      type: z.literal('score'),
      levels: z.array(decisionLevelSchema).min(2).max(10),
    })
    .strict(),
]);

export const decisionQuestionsSchema = z
  .array(decisionQuestionSchema)
  .min(1)
  .max(400)
  .refine(
    (questions) => {
      const names = questions.map(({ name }) => name).filter((name) => name !== undefined);
      return new Set(names).size === names.length;
    },
    { message: 'Question names must be unique within the request' },
  );

const decisionCacheBreakpoint = {
  prompt_cache_breakpoint: z.object({ mode: z.literal('explicit') }).nullish(),
};
const decisionInputTextSchema = decisionTextPartSchema.extend(decisionCacheBreakpoint);
const decisionInputImageSchema = decisionImagePartSchema.extend(decisionCacheBreakpoint);
const decisionMessageFields = { type: z.literal('message').optional() };
const decisionToolFields = {
  call_id: z.string().min(1).max(64),
  id: z.string().nullish(),
  status: z.enum(['in_progress', 'completed', 'incomplete']).nullish(),
};
const decisionToolCallFields = {
  ...decisionToolFields,
  namespace: z.string().min(1).max(64).nullish(),
};
const decisionInputItemSchema = z.union([
  z.discriminatedUnion('role', [
    z.object({
      ...decisionMessageFields,
      role: z.literal('user'),
      content: z.union([
        z.string(),
        z.array(
          z.discriminatedUnion('type', [
            decisionInputTextSchema,
            decisionInputImageSchema,
            decisionJsonPartSchema,
          ]),
        ),
      ]),
    }),
    z.object({
      ...decisionMessageFields,
      role: z.enum(['developer', 'system']),
      content: z.union([z.string(), z.array(decisionInputTextSchema)]),
    }),
    z.object({
      ...decisionMessageFields,
      role: z.literal('assistant'),
      phase: z.enum(['commentary', 'final_answer']).nullish(),
      content: z.union([
        z.string(),
        z.array(
          z.discriminatedUnion('type', [
            z.object({ type: z.literal('output_text'), text: z.string() }),
            z.object({ type: z.literal('refusal'), refusal: z.string() }),
          ]),
        ),
      ]),
    }),
  ]),
  z.discriminatedUnion('type', [
    z.object({
      ...decisionToolCallFields,
      type: z.literal('function_call'),
      name: z.string().min(1).max(128),
      arguments: z.string(),
    }),
    z.object({
      ...decisionToolCallFields,
      type: z.literal('custom_tool_call'),
      name: z.string().min(1).max(64),
      input: z.string(),
    }),
    z.object({
      ...decisionToolFields,
      type: z.enum(['function_call_output', 'custom_tool_call_output']),
      output: z.union([
        z.string(),
        z.array(z.discriminatedUnion('type', [decisionInputTextSchema, decisionInputImageSchema])),
      ]),
    }),
  ]),
]);

export const decisionInputSchema = z.union([z.string(), z.array(decisionInputItemSchema)]).refine(
  (input) => {
    if (typeof input === 'string') {
      return true;
    }
    const calls = new Map<string, 'function_call' | 'custom_tool_call'>();
    return input.every((item) => {
      if (item.type === 'function_call' || item.type === 'custom_tool_call') {
        calls.set(item.call_id, item.type);
      } else if (item.type === 'function_call_output' || item.type === 'custom_tool_call_output') {
        return item.type === `${calls.get(item.call_id)}_output`;
      }
      return true;
    });
  },
  { message: 'Each tool output must reference an earlier matching call_id' },
);

export const decisionRequestSchema = z
  .object({
    model: z.string().trim().min(1),
    input: decisionInputSchema,
    questions: decisionQuestionsSchema,
    prompt_cache_key: z.string().max(64).nullish(),
    prompt_cache_options: z
      .object({
        mode: z.enum(['implicit', 'explicit']).nullish(),
        ttl: z.literal('30m').optional(),
      })
      .nullish(),
    safety_identifier: z.string().max(128).nullable().optional(),
  })
  .refine(
    ({ input, questions }) => {
      const sharedParts =
        typeof input === 'string'
          ? []
          : input.map((item) =>
              'content' in item ? item.content : 'output' in item ? item.output : undefined,
            );
      return (
        [...sharedParts, ...questions.map((question) => question.instructions)].reduce<number>(
          (total, parts) =>
            total +
            (Array.isArray(parts) ? parts.filter((part) => part.type === 'input_image').length : 0),
          0,
        ) <= 128
      );
    },
    { message: 'Decisions accepts at most 128 images per request' },
  );

const decisionAnswerName = { name: z.string().nullable() };

export const decisionAnswerSchema = z.discriminatedUnion('type', [
  z.object({ ...decisionAnswerName, type: z.literal('refusal') }),
  z.object({
    ...decisionAnswerName,
    type: z.literal('predicate'),
    probability: decisionProbabilitySchema,
  }),
  z.object({
    ...decisionAnswerName,
    type: z.literal('choice'),
    choice: decisionChoiceValueSchema,
    confidence: decisionProbabilitySchema,
    probabilities: z.array(
      z.object({ value: decisionChoiceValueSchema, probability: decisionProbabilitySchema }),
    ),
  }),
  z.object({
    ...decisionAnswerName,
    type: z.literal('score'),
    score: z.number().nonnegative(),
    confidence: decisionProbabilitySchema,
    probabilities: z.array(
      z.object({
        value: z.number().int(),
        label: z.string(),
        probability: decisionProbabilitySchema,
      }),
    ),
  }),
]);

const tokenCountSchema = z.number().int().nonnegative();

export const decisionResponseSchema = z.object({
  model: z.string().min(1),
  answers: z.array(decisionAnswerSchema),
  usage: z
    .object({
      input_tokens: tokenCountSchema,
      output_tokens: tokenCountSchema,
      total_tokens: tokenCountSchema,
      input_tokens_details: z
        .object({
          cached_tokens: tokenCountSchema.optional(),
          cache_write_tokens: tokenCountSchema.optional(),
        })
        .passthrough()
        .optional(),
      output_tokens_details: z
        .object({ reasoning_tokens: tokenCountSchema.optional() })
        .passthrough()
        .optional(),
    })
    .refine(
      ({ input_tokens, output_tokens, total_tokens }) =>
        total_tokens === input_tokens + output_tokens,
    ),
});

export type DecisionQuestion = z.infer<typeof decisionQuestionSchema>;
export type DecisionRequest = z.infer<typeof decisionRequestSchema>;
export type DecisionGradingLevel = string | z.infer<typeof decisionLevelSchema>;

export function parseDecisionsInput(prompt: string): unknown {
  if (prompt.trimStart().startsWith('[')) {
    try {
      return normalizeResponsesInput(JSON.parse(prompt));
    } catch {
      // Brackets also begin ordinary text, such as log prefixes and Markdown checklists.
    }
  }
  return prompt;
}

/** Check correspondence before an eval can mistake a malformed result for a successful answer. */
export function answersMatchDecisionQuestions(
  answers: z.infer<typeof decisionAnswerSchema>[],
  questions: z.infer<typeof decisionQuestionsSchema>,
): boolean {
  return (
    answers.length === questions.length &&
    answers.every((answer, index) => {
      const question = questions[index];
      if (answer.name !== (question.name ?? null)) {
        return false;
      }
      if (answer.type === 'refusal') {
        return true;
      }
      if (
        (answer.type === 'choice' || answer.type === 'score') &&
        Math.abs(answer.probabilities.reduce((sum, item) => sum + item.probability, 0) - 1) >
          DISTRIBUTION_TOLERANCE
      ) {
        return false;
      }
      if (answer.type === 'choice' && question.type === 'choice') {
        return (
          question.choices.some(({ value }) => value === answer.choice) &&
          answer.probabilities.length === question.choices.length &&
          new Set(answer.probabilities.map(({ value }) => value)).size ===
            question.choices.length &&
          answer.probabilities.every(({ value }) =>
            question.choices.some((choice) => choice.value === value),
          )
        );
      }
      if (answer.type === 'score' && question.type === 'score') {
        const maxScore = question.levels.length - 1;
        const expectedScore = answer.probabilities.reduce(
          (sum, item) => sum + item.value * item.probability,
          0,
        );
        return (
          answer.score <= maxScore &&
          Math.abs(answer.score - expectedScore) / maxScore <= DISTRIBUTION_TOLERANCE &&
          answer.probabilities.length === question.levels.length &&
          new Set(answer.probabilities.map(({ value }) => value)).size === question.levels.length &&
          answer.probabilities.every(
            ({ value, label }) => value >= 0 && label === question.levels[value]?.label,
          )
        );
      }
      return answer.type === question.type;
    })
  );
}
