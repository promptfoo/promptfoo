/**
 * Ink-based CLI UI module.
 *
 * This module provides React-based terminal UI components for the promptfoo CLI.
 *
 * Entry Points:
 * - Interactive mode: Use `renderInteractive()` with React components
 * - Non-interactive mode: Use utilities from `./noninteractive`
 *
 * @example
 * ```typescript
 * import { shouldUseInteractiveUI, renderInteractive, EvalApp } from './ui';
 * import { NonInteractiveProgress } from './ui/noninteractive';
 *
 * if (shouldUseInteractiveUI()) {
 *   const { waitUntilExit } = await renderInteractive(<EvalApp ... />);
 *   await waitUntilExit();
 * } else {
 *   const progress = new NonInteractiveProgress('Evaluating');
 *   progress.start(totalTests);
 *   // ...
 * }
 * ```
 */

// Eval components
export {
  ErrorSummary,
  EvalHeader,
  type EvalHeaderProps,
  EvalScreen,
  type EvalScreenProps,
  ProviderStatusList,
} from './components/eval';
// Shared components
export {
  Badge,
  type BadgeVariant,
  CountBadge,
  ErrorDisplay,
  InlineProgress,
  PassFail,
  ProgressBar,
  type ProgressBarProps,
  Score,
  Spinner,
  type SpinnerProps,
  StatusMessage,
  StatusSpinner,
  type StatusSpinnerProps,
  StatusText,
  WarningList,
} from './components/shared';
// Contexts
export {
  type EvalAction,
  type EvalError,
  EvalProvider,
  type EvalState,
  type ProviderStatus,
  UIProvider,
  type UIState,
  useCompactMode,
  useEval,
  useEvalProgress,
  useEvalState,
  useTerminalSize,
  useUI,
} from './contexts';
// Main app component
export { EvalApp, type EvalAppProps } from './EvalApp';
// Bridge utilities
export {
  createEvalUIController,
  createProgressCallback,
  type EvalUIController,
  extractProviderIds,
  wrapEvaluateOptions,
} from './evalBridge';
// Eval runner
export {
  type EvalRunnerOptions,
  type InkEvalResult,
  initInkEval,
  shouldUseInkUI,
} from './evalRunner';
// Hooks
export {
  type KeyInfo,
  SPINNER_FRAMES,
  type SpinnerType,
  useConfirmKey,
  useKeypress,
  useNavigationKeys,
  useSpinner,
  useSpinnerFrame,
} from './hooks';
// Core rendering utilities
export {
  getTerminalSize,
  isInteractiveUIForced,
  type RenderOptions,
  type RenderResult,
  renderInteractive,
  runInteractive,
  shouldUseInteractiveUI,
  supportsColor,
} from './render';

// Re-export non-interactive utilities (but keep them lazy-loadable)
export type {
  NonInteractiveProgress,
  NonInteractiveSpinner,
  ProgressUpdate,
  TextOutput,
} from './noninteractive';
