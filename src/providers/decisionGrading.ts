/** Promptfoo's assertion config. Each adapter encodes the question in its native API format. */
export interface DecisionGradingConfig<Level = string, Content = string> {
  threshold?: number;
  levels?: Level[];
  instructions?: Content;
  labels?: string[] | Record<string, Content | null>;
}

/** Validate the threshold before sending a grading request. */
export function resolveDecisionThreshold(value: unknown): number | undefined {
  const threshold = value ?? 0.5;
  return typeof threshold === 'number' && threshold >= 0 && threshold <= 1 ? threshold : undefined;
}

export function gradeDecisionScore(
  raw: number,
  top: number,
  threshold: number,
  decimalPlaces?: number,
) {
  const normalized = raw / top;
  // Jev has historically graded at six decimal places. Other APIs retain the reported precision.
  const score =
    decimalPlaces === undefined ? normalized : Number(normalized.toFixed(decimalPlaces));
  return { pass: score >= threshold, score };
}

/** A label without a description is null until the adapter encodes it for the API. */
export function decisionLabelEntries<T>(
  labels: string[] | Record<string, T | null>,
): [string, T | null][] {
  return Array.isArray(labels) ? labels.map((label) => [label, null]) : Object.entries(labels);
}

/** Jev and Gemini both encode binary rubrics as "noul" and ordered rubrics as "score". */
export function makeNoulOrScoreQuestion<T>(instructions: T, levels: T[] | undefined) {
  return levels === undefined
    ? { type: 'noul' as const, instructions }
    : { type: 'score' as const, instructions, criteria: levels };
}

// The matcher puts attachments in the rendered chat prompt. vars.output can be a placeholder.
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

export function readTextDecisionRubric(
  prompt: string,
  vars: { rubric?: unknown; output?: unknown },
  providerName: string,
): { instructions: string; input: string } | { error: string } {
  if (hasRubricAttachment(prompt)) {
    return {
      error: `${providerName} \`llm-rubric\` supports text output only. Use direct questions for media.`,
    };
  }
  const { rubric, output } = vars;
  if (rubric === undefined || output === undefined) {
    return { error: `${providerName} \`llm-rubric\` requires rubric and output variables.` };
  }
  return {
    instructions: typeof rubric === 'string' ? rubric : JSON.stringify(rubric),
    input: typeof output === 'string' ? output : JSON.stringify(output),
  };
}
