import { z } from 'zod';
import {
  maybeLoadFromExternalFileWithVars,
  maybeLoadResponseFormatFromExternalFile,
  maybeLoadToolsFromExternalFile,
} from '../../util/file';
import { renderVarsInObject } from '../../util/render';
import { waitForPromiseWithAbort } from '../shared';

import type { VarValue } from '../../types/shared';

// Loaded API fragments stay open for compatible endpoints. Validate the structure
// consumed locally without stripping vendor fields or imposing the SDK's model list.
const FunctionDefinition = z.looseObject({
  name: z.string().refine((name) => name.trim().length > 0, 'Expected a nonempty function name'),
  description: z.string().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  strict: z.boolean().nullable().optional(),
});
const ResponseFormat = z.looseObject({
  type: z.string(),
  name: z.string().optional(),
  schema: z.record(z.string(), z.unknown()).optional(),
  json_schema: z
    .looseObject({
      name: z.string().optional(),
      schema: z.record(z.string(), z.unknown()).optional(),
      strict: z.boolean().optional(),
    })
    .optional(),
});
const Tools = z.array(z.looseObject({ type: z.string() }));

export type PreparedOpenAiResponseFormat = z.output<typeof ResponseFormat>;

export function prepareOpenAiResponseFormat(value: unknown, vars?: Record<string, VarValue>) {
  const loaded: unknown = maybeLoadResponseFormatFromExternalFile(value, vars);
  return loaded == null ? undefined : ResponseFormat.parse(renderVarsInObject(loaded, vars));
}

export function prepareOpenAiFunctions(value: unknown, vars?: Record<string, VarValue>) {
  const loaded: unknown = maybeLoadFromExternalFileWithVars(value, vars);
  if (loaded !== undefined && !Array.isArray(loaded)) {
    throw new Error('Expected the loaded functions to be an array');
  }
  return loaded === undefined
    ? undefined
    : z.array(FunctionDefinition).parse(renderVarsInObject(loaded, vars));
}

export async function prepareOpenAiTools(
  value: unknown,
  vars?: Record<string, VarValue>,
  abortSignal?: AbortSignal,
) {
  if (value == null) {
    return undefined;
  }
  const loaded: unknown = await waitForPromiseWithAbort(
    maybeLoadToolsFromExternalFile(value, vars, abortSignal),
    abortSignal,
  );
  return loaded == null ? undefined : Tools.parse(renderVarsInObject(loaded, vars));
}

export function prepareOpenAiReasoning(value: unknown, vars?: Record<string, VarValue>) {
  const rendered: unknown = renderVarsInObject(value, vars);
  return rendered == null ? undefined : z.record(z.string(), z.unknown()).parse(rendered);
}

/** Inspect the effective wire format, including a passthrough override. */
export function isOpenAiJsonSchemaFormat(value: unknown): boolean {
  return (
    value !== null && typeof value === 'object' && 'type' in value && value.type === 'json_schema'
  );
}
