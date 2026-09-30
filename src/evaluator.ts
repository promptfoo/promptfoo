// Compatibility surface for existing source consumers. Runtime composition lives in node/.
export {
  __resetPromptConversationCacheForTests,
  generateVarCombinations,
  getTraceId,
  getTraceLinkage,
  isAllowedPrompt,
  runEval,
} from './evaluator/engine';
export { PromptSuggestionsRejectedError } from './evaluator/errors';
export { evaluate } from './node/evaluateTestSuite';
export { formatVarsForDisplay, ProgressBarManager } from './progress/evaluationProgress';
