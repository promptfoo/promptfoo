import type { RunEvalOptions } from '../../types/index';

export function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  const shortened = value.slice(0, Math.max(0, maxLength - 3)).trimEnd();
  return `${shortened}...`;
}

export function buildProgressBar(completed: number, total: number, width = 30): string {
  if (!Number.isFinite(total) || total <= 0) {
    return `[${'-'.repeat(width)}]`;
  }
  const ratio = Math.max(0, Math.min(1, total === 0 ? 0 : completed / total));
  const filled = Math.round(ratio * width);
  const empty = Math.max(0, width - filled);
  return `[${'='.repeat(filled)}${'-'.repeat(empty)}]`;
}

export function formatTime(timestamp: Date): string {
  return timestamp.toTimeString().slice(0, 8);
}

export function summarizeEvalStep(evalStep: RunEvalOptions) {
  const provider = evalStep.provider.label || evalStep.provider.id();
  const promptLabel =
    evalStep.prompt.label ||
    truncateText(evalStep.prompt.raw.replace(/\s+/g, ' '), 40) ||
    `Prompt ${evalStep.promptIdx + 1}`;
  const metadataDescription =
    typeof evalStep.test.metadata === 'object' && evalStep.test.metadata
      ? (evalStep.test.metadata as Record<string, unknown>).description
      : undefined;
  const testLabel =
    evalStep.test.description ||
    (typeof metadataDescription === 'string' ? metadataDescription : undefined) ||
    `Test ${evalStep.testIdx + 1}`;

  return { provider, promptLabel, testLabel };
}
