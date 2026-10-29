import { z } from 'zod';

const GenerationCountSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));

export function parseGenerationCount(value: string, optionName: string): number {
  const result = GenerationCountSchema.safeParse(value);
  if (!result.success) {
    throw new Error(`Option ${optionName} must be a positive safe integer.`);
  }
  return result.data;
}

export function validateGenerationOutput(
  output: string | undefined,
  extensions: readonly string[],
): void {
  if (
    output !== undefined &&
    (typeof output !== 'string' || !extensions.some((extension) => output.endsWith(extension)))
  ) {
    throw new Error(`Unsupported output file type: ${output}. Use ${extensions.join(' or ')}.`);
  }
}
