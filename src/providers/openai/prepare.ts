import { z } from 'zod';
import { maybeLoadFromExternalFile, maybeLoadToolsFromExternalFile } from '../../util/file';
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
      strict: z.boolean().nullable().optional(),
    })
    .optional(),
});
const Tools = z.array(z.looseObject({ type: z.string() }));

export type PreparedOpenAiResponseFormat = z.output<typeof ResponseFormat>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function isFileReference(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('file://');
}

/** Render authored values once. Loaded files are new authored input, not rendered output. */
function loadAndRender(value: unknown, vars: Record<string, VarValue>) {
  if (isFileReference(value)) {
    const reference = renderVarsInObject(value, vars);
    const loaded: unknown = maybeLoadFromExternalFile(reference);
    return renderVarsInObject(loaded, vars);
  }
  return renderVarsInObject(value, vars);
}

export function prepareOpenAiResponseFormat(value: unknown, vars: Record<string, VarValue> = {}) {
  const loaded = loadAndRender(value, vars);
  if (loaded == null) {
    return undefined;
  }
  if (isRecord(loaded) && loaded.type === 'json_schema') {
    const nested = isRecord(loaded.json_schema) ? loaded.json_schema : undefined;
    const schema = loaded.schema ?? nested?.schema;
    // The format's single pass already rendered the path. Only render the newly
    // loaded document here; inline schema values must never be rendered twice.
    if (isFileReference(schema)) {
      const document: unknown = maybeLoadFromExternalFile(schema);
      const resolved = renderVarsInObject(document, vars);
      return ResponseFormat.parse(
        loaded.schema === undefined
          ? { ...loaded, json_schema: { ...nested, schema: resolved } }
          : { ...loaded, schema: resolved },
      );
    }
  }
  return ResponseFormat.parse(loaded);
}

export function prepareOpenAiFunctions(value: unknown, vars: Record<string, VarValue> = {}) {
  const loaded = loadAndRender(value, vars);
  if (loaded !== undefined && !Array.isArray(loaded)) {
    throw new Error('Expected the loaded functions to be an array');
  }
  return loaded === undefined ? undefined : z.array(FunctionDefinition).parse(loaded);
}

async function loadToolDefinitions(
  value: unknown,
  vars: Record<string, VarValue>,
  abortSignal?: AbortSignal,
): Promise<unknown> {
  if (isFileReference(value)) {
    const reference = renderVarsInObject(value, vars);
    // The reference was rendered above. The loader must not render its output;
    // this pass belongs only to the fresh definitions returned by the file.
    const loaded: unknown = await waitForPromiseWithAbort(
      maybeLoadToolsFromExternalFile(reference, undefined, abortSignal),
      abortSignal,
    );
    return renderVarsInObject(loaded, vars);
  }
  if (Array.isArray(value)) {
    const loaded = await Promise.all(
      value.map((entry) => loadToolDefinitions(entry, vars, abortSignal)),
    );
    return loaded.every(Array.isArray) ? loaded.flat() : loaded;
  }
  return renderVarsInObject(value, vars);
}

export async function prepareOpenAiTools(
  value: unknown,
  vars: Record<string, VarValue> = {},
  abortSignal?: AbortSignal,
) {
  if (value == null) {
    return undefined;
  }
  abortSignal?.throwIfAborted();
  const loaded = await loadToolDefinitions(value, vars, abortSignal);
  return loaded == null ? undefined : Tools.parse(loaded);
}

export function prepareOpenAiReasoning(value: unknown, vars: Record<string, VarValue> = {}) {
  const rendered: unknown = renderVarsInObject(value, vars);
  return rendered == null ? undefined : z.record(z.string(), z.unknown()).parse(rendered);
}

/** Inspect the effective wire format, including a passthrough override. */
export function isOpenAiJsonSchemaFormat(value: unknown): boolean {
  return (
    value !== null && typeof value === 'object' && 'type' in value && value.type === 'json_schema'
  );
}
