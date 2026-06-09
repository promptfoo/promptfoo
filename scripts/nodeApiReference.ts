/**
 * Curated Node.js API reference surface.
 *
 * Every export documented here is available from the root `promptfoo` package
 * entrypoint. The reference is intentionally curated: it focuses on the public
 * symbols consumers should reach for first, not every compatibility helper that
 * ships in the runtime build.
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
  AssertionOrSet,
  AssertionSet,
  AssertionTestContext,
  AssertionTokenUsage,
  AssertionValueFunction,
  AssertionValueFunctionContext,
  AtomicTestCase,
  AudioOutput,
  BlobRef,
  CallApiContextParams,
  CallApiFunction,
  CallApiOptionsParams,
  ChatMessage,
  CompletedPrompt,
  CompletionTokenDetails,
  ConversationRelevanceMessage,
  EnvOverrides,
  EvaluateOptions,
  EvaluateProgressCallback,
  EvaluateTable,
  EvaluateTableHead,
  EvaluateTableOutput,
  EvaluateTableRow,
  EvaluateTestSuite,
  GradingResult,
  GuardrailResponse,
  ImageOutput,
  LoadApiProviderContext,
  LoadApiProvidersOptions,
  ModerationMatchOptions,
  PluginConfig,
  PluginGraderExample,
  Prompt,
  PromptConfig,
  PromptContent,
  PromptFunction,
  PromptFunctionResult,
  PromptMetrics,
  ProviderClassificationResponse,
  ProviderConfig,
  ProviderEmbeddingResponse,
  ProviderFunction,
  ProviderOptions,
  ProviderResponse,
  ProviderSimilarityResponse,
  ProvidersConfig,
  RunAssertionOptions,
  RunAssertionsOptions,
  ScoringFunction,
  StrategyConfig,
  TestCase,
  TestCaseMetadata,
  TestCaseOptions,
  TokenUsage,
  TransformContext,
  TransformFunction,
  TransformPrompt,
  VideoOutput,
} from '../src/index';
