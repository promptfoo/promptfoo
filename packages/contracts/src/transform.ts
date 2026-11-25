/**
 * Metadata supplied to every transform invocation. Known fields are typed;
 * the open index signature preserves extensibility for plugins that attach
 * their own keys at runtime.
 */
export interface TransformContext {
  vars?: Record<string, unknown>;
  prompt?: TransformPrompt | Record<string, unknown>;
  metadata?: Record<string, unknown>;
  uuid?: string;
  [key: string]: unknown;
}

/** Conventional shape for `TransformContext.prompt`. Callers may pass additional fields. */
export interface TransformPrompt {
  label?: string;
  id?: string;
  raw?: string;
  display?: string;
}

/**
 * A function that transforms output or vars at various stages of the evaluation pipeline.
 * Function-valued transforms are only reachable via the Node.js package API; YAML configs
 * must use string expressions or `file://` references.
 *
 * @typeParam TIn  - Input type (output for output-transforms, vars object for var-transforms).
 * @typeParam TOut - Return type; may be wrapped in a Promise.
 */
export type TransformFunction<TIn = unknown, TOut = unknown> = (
  output: TIn,
  context: TransformContext,
) => TOut | Promise<TOut>;

/** Runtime type guard for `TransformFunction` values. */
export function isTransformFunction(value: unknown): value is TransformFunction {
  return typeof value === 'function';
}
