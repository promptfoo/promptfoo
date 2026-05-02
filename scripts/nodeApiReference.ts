/**
 * Curated Node.js API reference surface.
 *
 * This file is used only by TypeDoc. Every export here is also available from
 * the root `promptfoo` package entrypoint, but the runtime package exports more
 * compatibility types and helpers than we want to present as first-class docs.
 *
 * @packageDocumentation
 */

export {
  assertions,
  cache,
  evaluate,
  generateTable,
  guardrails,
  isTransformFunction,
  loadApiProvider,
  loadApiProviders,
  redteam,
} from '../src/index';

export type {
  AdaptiveRequest,
  AdaptiveResult,
  ApiProvider,
  Assertion,
  AssertionValueFunction,
  AssertionValueFunctionContext,
  CallApiContextParams,
  EnvOverrides,
  EvaluateOptions,
  EvaluateTestSuite,
  GradingResult,
  GuardResult,
  LoadApiProviderContext,
  PromptFunction,
  PromptFunctionResult,
  ProviderFunction,
  ProviderOptions,
  ProviderResponse,
  TransformContext,
  TransformFunction,
  TransformPrompt,
} from '../src/index';
