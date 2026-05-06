/**
 * Metadata supplied to every transform invocation. Known fields are typed;
 * the open index signature preserves extensibility for plugins that attach
 * their own keys at runtime.
 *
 * @example
 * ```ts
 * const context: TransformContext = {
 *   vars: { user: 'Ada' },
 *   prompt: { label: 'summary' },
 *   metadata: { source: 'fixture' },
 * };
 * ```
 *
 * @public
 */
export interface TransformContext {
  /** Variables available at the transform call site. */
  vars?: Record<string, unknown>;
  /** Prompt metadata associated with the transform call site. */
  prompt?: TransformPrompt | Record<string, unknown>;
  /** Additional runtime metadata passed through the pipeline. */
  metadata?: Record<string, unknown>;
  /** Result identifier associated with the transform invocation, when available. */
  uuid?: string;
  [key: string]: unknown;
}

/**
 * Conventional shape for `TransformContext.prompt`.
 *
 * Callers may pass additional fields, but these are the prompt fields that
 * built-in transforms and docs rely on.
 *
 * @example
 * ```ts
 * const prompt: TransformPrompt = {
 *   id: 'summary',
 *   label: 'Summary prompt',
 *   raw: 'Summarize {{article}}',
 * };
 * ```
 *
 * @public
 */
export interface TransformPrompt {
  /** Human-readable prompt label. */
  label?: string;
  /** Stable prompt identifier. */
  id?: string;
  /** Raw prompt text before display transforms. */
  raw?: string;
  /** Display-friendly prompt text when it differs from `raw`. */
  display?: string;
}

/**
 * A function that transforms output or vars at various stages of the evaluation pipeline.
 * Function-valued transforms are only reachable via the Node.js package API; YAML configs
 * must use string expressions or `file://` references.
 *
 * @typeParam TIn  - Input type (output for output-transforms, vars object for var-transforms).
 * @typeParam TOut - Return type; may be wrapped in a Promise.
 *
 * @example
 * ```ts
 * const uppercase: TransformFunction<string, string> = (output) =>
 *   output.toUpperCase();
 * ```
 *
 * @param output - Value being transformed at the current pipeline stage.
 * @param context - Vars, prompt metadata, and runtime metadata for the transform.
 *
 * @public
 */
export type TransformFunction<TIn = unknown, TOut = unknown> = (
  output: TIn,
  context: TransformContext,
) => TOut | Promise<TOut>;

/**
 * Runtime type guard for `TransformFunction` values.
 *
 * @public
 */
export function isTransformFunction(value: unknown): value is TransformFunction {
  return typeof value === 'function';
}
