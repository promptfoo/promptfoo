export class EvalRunError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number = 1) {
    super(message);
    this.name = 'EvalRunError';
    // POSIX exit codes are 1-255 (0 means success). Coerce silly values to the
    // default rather than letting `exitCode = 0` silently mask a real failure.
    this.exitCode = Number.isInteger(exitCode) && exitCode >= 1 && exitCode <= 255 ? exitCode : 1;
  }
}

export class PromptSuggestionsRejectedError extends Error {
  constructor(message = 'No prompts selected. Aborting.') {
    super(message);
    this.name = 'PromptSuggestionsRejectedError';
  }
}

// Retry cleanup deletes every previous error after evaluating the static seed
// list. That list cannot reconstruct failed, dynamically proposed children.
export function ticketRevisionRetryError(
  ...configs: Array<
    { plugins?: readonly (string | { id: string; config?: Record<string, unknown> })[] } | undefined
  >
): string | undefined {
  if (
    configs.some((config) =>
      config?.plugins?.some(
        (plugin) =>
          typeof plugin === 'object' &&
          plugin?.id === 'agentic:private-to-public-disclosure' &&
          plugin.config?.metaTicketRevision,
      ),
    )
  ) {
    return 'Cannot retry errors for evaluations with Meta ticket revisions. Start a fresh evaluation.';
  }
}
