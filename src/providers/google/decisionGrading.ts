import type {
  CallApiContextParams,
  ProviderClassificationResponse,
  ProviderResponse,
} from '../../types/index';
import type { DecisionAnswers } from './decisionSchema';

export interface DecisionGradingConfig {
  threshold?: number;
  levels?: string[];
  instructions?: string;
  labels?: string[] | Record<string, string>;
}

type AskDecision = (input: string, questions: unknown) => Promise<ProviderResponse>;

// The rubric matcher puts attachments in the chat prompt and can substitute a text
// placeholder in vars.output. Only grade the latter when it represents the whole output.
function hasRubricAttachment(prompt: string): boolean {
  let messages: unknown;
  try {
    messages = JSON.parse(prompt);
  } catch {
    return false;
  }
  return (
    Array.isArray(messages) &&
    messages.some(
      (message) =>
        Array.isArray(message?.content) &&
        message.content.some(
          (part: { type?: string; text?: string } | null) =>
            typeof part?.text !== 'string' ||
            !['text', 'input_text', 'output_text'].includes(part.type ?? ''),
        ),
    )
  );
}

export async function gradeDecision(
  prompt: string,
  context: CallApiContextParams,
  config: DecisionGradingConfig,
  ask: AskDecision,
): Promise<ProviderResponse> {
  if (context.prompt.label !== 'llm-rubric') {
    return {
      error: `Gemini Decisions cannot grade \`${context.prompt.label}\` assertions. Use llm-rubric or classifier.`,
    };
  }
  if (hasRubricAttachment(prompt)) {
    return {
      error: 'Gemini Decisions llm-rubric supports text only. Use direct questions for media.',
    };
  }
  const { rubric, output } = context.vars;
  if (rubric === undefined || output === undefined) {
    return { error: 'Gemini Decisions llm-rubric requires rubric and output variables.' };
  }
  const { threshold = 0.5, levels } = config;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    return { error: 'Gemini Decisions threshold must be a number from 0 to 1.' };
  }

  const instructions = typeof rubric === 'string' ? rubric : JSON.stringify(rubric);
  const question =
    levels === undefined
      ? { type: 'noul', instructions }
      : { type: 'score', instructions, criteria: levels };
  const result = await ask(typeof output === 'string' ? output : JSON.stringify(output), {
    grade: question,
  });
  if (result.error) {
    return result;
  }
  // ask validates answer IDs, types, and score ranges against the supplied questions.
  const { grade } = result.output as DecisionAnswers;
  const score =
    grade.type === 'score' && levels
      ? grade.score / (levels.length - 1)
      : grade.type === 'noul'
        ? grade.noul
        : undefined;
  if (score === undefined) {
    return { ...result, output: undefined, error: 'Missing Gemini Decisions rubric score.' };
  }
  const pass = score >= threshold;
  return {
    ...result,
    output: {
      pass,
      score,
      ...(!pass && { reason: `Gemini Decisions score ${score} < threshold ${threshold}` }),
    },
  };
}

export async function classifyDecision(
  prompt: string,
  config: DecisionGradingConfig,
  ask: AskDecision,
): Promise<ProviderClassificationResponse> {
  const { instructions, labels } = config;
  if (
    !instructions ||
    !labels ||
    (Array.isArray(labels) &&
      (!labels.every((label) => typeof label === 'string') ||
        new Set(labels).size !== labels.length))
  ) {
    return { error: 'Gemini Decisions classifier requires instructions and distinct labels.' };
  }
  const criteria = Array.isArray(labels)
    ? Object.fromEntries(labels.map((label) => [label, '']))
    : labels;
  const { output, ...response } = await ask(prompt, {
    classification: { type: 'choice', instructions, criteria },
  });
  if (response.error) {
    return response;
  }
  const { classification } = output as DecisionAnswers;
  if (classification.type !== 'choice') {
    return { ...response, error: 'Missing Gemini Decisions classifier probabilities.' };
  }
  return { ...response, classification: classification.probabilities };
}
