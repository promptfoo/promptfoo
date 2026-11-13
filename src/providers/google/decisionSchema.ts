import { z } from 'zod';

// Question and option IDs are user-defined. Parsing as a Map keeps valid JSON
// keys such as "__proto__", which z.record would silently discard.
function keyedObject<T>(key: z.ZodType<string>, value: z.ZodType<T>) {
  return z
    .preprocess(
      (input) =>
        input && typeof input === 'object' && !Array.isArray(input)
          ? new Map(Object.entries(input))
          : undefined,
      z.map(key, value),
    )
    .transform((entries) => Object.fromEntries(entries));
}

const questionKey = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const optionKey = z
  .string()
  .refine(
    (key) =>
      key.length > 0 &&
      Array.from(key).length <= 128 &&
      key === key.trim() &&
      !/\p{Cc}|[^\S ]/u.test(key),
    'Option keys must be 1–128 characters with no control characters, non-ASCII whitespace, or surrounding spaces',
  );
const textBlock = z.looseObject({ type: z.literal('text'), text: z.string() });
const instructions = z.union([z.string().min(1), textBlock, z.array(textBlock).min(1)]);
const question = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('noul'),
    instructions,
    criteria: z
      .strictObject({
        true_description: z.string().optional(),
        false_description: z.string().optional(),
      })
      .optional(),
  }),
  z.strictObject({
    type: z.literal('choice'),
    instructions,
    criteria: keyedObject(optionKey, z.string()).refine(
      (criteria) => Object.keys(criteria).length >= 2 && Object.keys(criteria).length <= 255,
      'Choice criteria must define 2–255 options',
    ),
  }),
  z.strictObject({
    type: z.literal('score'),
    instructions,
    criteria: z.array(z.string().min(1)).min(2).max(255),
  }),
]);
export const decisionsQuestionsSchema = keyedObject(questionKey, question).refine(
  (questions) => Object.keys(questions).length >= 1 && Object.keys(questions).length <= 1000,
  'Provide 1–1,000 named decisions questions',
);

const probability = z.number().min(0).max(1);
const probabilities = keyedObject(z.string(), probability);
const answer = z.discriminatedUnion('type', [
  z.looseObject({
    type: z.literal('noul'),
    confidence: probability,
    noul: z.number().min(0.01).max(0.99),
  }),
  z.looseObject({
    type: z.literal('choice'),
    confidence: probability,
    choice: z.string(),
    probabilities,
  }),
  z.looseObject({
    type: z.literal('score'),
    confidence: probability,
    score: z.number().nonnegative(),
    probabilities,
    legend: keyedObject(z.string(), z.string()),
  }),
]);
export type DecisionAnswers = Record<string, z.infer<typeof answer>>;

const tokenCount = z.number().int().nonnegative();
const responseSchema = z.looseObject({
  answers: keyedObject(questionKey, answer),
  usage: z
    .looseObject({
      total_input_tokens: tokenCount.optional(),
      total_output_tokens: tokenCount.optional(),
      total_tokens: tokenCount.optional(),
    })
    .optional(),
});

function sameKeys(left: object, right: object): boolean {
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(right, key))
  );
}

export function parseDecisionsResponse(
  data: unknown,
  questions: z.infer<typeof decisionsQuestionsSchema>,
) {
  const parsed = responseSchema.safeParse(data);
  if (!parsed.success || !sameKeys(questions, parsed.data.answers)) {
    return undefined;
  }
  for (const [id, question] of Object.entries(questions)) {
    const answer = parsed.data.answers[id];
    if (question.type !== answer.type) {
      return undefined;
    }
    if (answer.type === 'noul') {
      continue;
    }
    if (question.type === 'noul' || !sameKeys(question.criteria, answer.probabilities)) {
      return undefined;
    }
    if (
      answer.type === 'choice' &&
      !Object.prototype.hasOwnProperty.call(answer.probabilities, answer.choice)
    ) {
      return undefined;
    }
    if (answer.type === 'score' && question.type === 'score') {
      if (
        answer.score > question.criteria.length - 1 ||
        !sameKeys(question.criteria, answer.legend) ||
        !question.criteria.every((level, index) => level === answer.legend[index])
      ) {
        return undefined;
      }
    }
  }
  return parsed.data;
}
