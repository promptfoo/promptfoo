import { z } from 'zod';

export function tool(description, fields, execute) {
  const inputSchema = z.strictObject(fields);
  return { description, inputSchema, execute: (args) => execute(inputSchema.parse(args)) };
}
