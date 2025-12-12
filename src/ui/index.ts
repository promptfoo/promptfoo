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

// Core rendering utilities
export {
  renderInteractive,
  runInteractive,
  shouldUseInteractiveUI,
  isInteractiveUIForced,
  getTerminalSize,
  supportsColor,
  type RenderOptions,
  type RenderResult,
} from './render';

// Main app component
export { EvalApp, type EvalAppProps } from './EvalApp';

// Contexts
export {
  EvalProvider,
  useEval,
  useEvalState,
  useEvalProgress,
  UIProvider,
  useUI,
  useTerminalSize,
  useCompactMode,
  type EvalState,
  type EvalAction,
  type ProviderStatus,
  type EvalError,
  type UIState,
} from './contexts';

// Hooks
export {
  useSpinnerFrame,
  useSpinner,
  useKeypress,
  useNavigationKeys,
  useConfirmKey,
  SPINNER_FRAMES,
  type SpinnerType,
  type KeyInfo,
} from './hooks';

// Shared components
export {
  Spinner,
  StatusSpinner,
  ProgressBar,
  InlineProgress,
  Badge,
  PassFail,
  Score,
  CountBadge,
  StatusMessage,
  StatusText,
  ErrorDisplay,
  WarningList,
  type SpinnerProps,
  type StatusSpinnerProps,
  type ProgressBarProps,
  type BadgeVariant,
} from './components/shared';

// Eval components
export {
  EvalScreen,
  EvalHeader,
  ProviderStatusList,
  ErrorSummary,
  type EvalScreenProps,
  type EvalHeaderProps,
} from './components/eval';

// Bridge utilities
export {
  createProgressCallback,
  createEvalUIController,
  wrapEvaluateOptions,
  extractProviderIds,
  type EvalUIController,
} from './evalBridge';

// Eval runner
export {
  initInkEval,
  shouldUseInkUI,
  type EvalRunnerOptions,
  type InkEvalResult,
} from './evalRunner';

// Re-export non-interactive utilities (but keep them lazy-loadable)
export type {
  TextOutput,
  NonInteractiveProgress,
  NonInteractiveSpinner,
  ProgressUpdate,
} from './noninteractive';
