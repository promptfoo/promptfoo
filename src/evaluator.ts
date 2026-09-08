// Compatibility surface for existing source consumers. Runtime composition lives in node/.
export {
  __resetPromptConversationCacheForTests,
  formatVarsForDisplay,
  generateVarCombinations,
  getTraceId,
  getTraceLinkage,
  isAllowedPrompt,
  ProgressBarManager,
  runEval,
} from './evaluator/engine';
export { PromptSuggestionsRejectedError } from './evaluator/errors';
export { evaluate } from './node/evaluateTestSuite';
