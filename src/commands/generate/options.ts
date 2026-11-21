import { z } from 'zod';

export const MAX_GENERATION_COUNT = 1000;

const GenerationCountSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().positive().max(MAX_GENERATION_COUNT));

export function parseGenerationCount(value: string, optionName: string): number {
  const result = GenerationCountSchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `Option ${optionName} must be a positive integer no greater than ${MAX_GENERATION_COUNT}.`,
    );
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
