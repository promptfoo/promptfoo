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
  isTransformFunction,
  loadApiProvider,
  loadApiProviders,
} from '../src/index';

export type {
  ApiProvider,
  Assertion,
  AssertionInput,
  AssertionTestContext,
  AssertionValueFunction,
  AssertionValueFunctionContext,
  AtomicTestCase,
  AudioOutput,
  CallApiContextParams,
  CallApiFunction,
  CallApiOptionsParams,
  EnvOverrides,
  EvaluateOptions,
  EvaluateTable,
  EvaluateTableHead,
  EvaluateTableOutput,
  EvaluateTableRow,
  EvaluateTestSuite,
  GradingResult,
  ImageOutput,
  LoadApiProviderContext,
  PromptContent,
  PromptFunction,
  PromptFunctionResult,
  ProviderFunction,
  ProviderOptions,
  ProviderResponse,
  ProvidersConfig,
  RunAssertionOptions,
  RunAssertionsOptions,
  TransformContext,
  TransformFunction,
  TransformPrompt,
  VideoOutput,
} from '../src/index';
