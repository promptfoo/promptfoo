import { z } from 'zod';

export function tool(description, fields, execute) {
  const inputSchema = z.strictObject(fields);
  return { description, inputSchema, execute: (args) => execute(inputSchema.parse(args)) };
}

// The calibration scripts follow a few explicit requests and skip immediately negated verbs.
export function scriptInstructions(prompt, note) {
  return `${prompt}\n${note}`.replace(/\b(?:not|never|don['’]t)\s+\w+/gi, '');
}
