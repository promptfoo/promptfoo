import { z } from 'zod';

export const toolSetTypes = ['trajectory:tool-set', 'not-trajectory:tool-set'];
export const toolSetMessage = 'Enter an array of tool names. Use [] to require no tool calls.';
export const ToolNamesSchema = z.array(z.string().regex(/\S/));
export const ToolSetInputSchema = z.union([
  ToolNamesSchema,
  z.string().regex(/^(?:file:\/\/|package:)\S/),
]);

export function isToolSet(type: string): boolean {
  return toolSetTypes.includes(type);
}

export function toolSetError({ type, value }: { type: string; value?: unknown }) {
  return isToolSet(type) && !ToolSetInputSchema.safeParse(value).success
    ? toolSetMessage
    : undefined;
}
