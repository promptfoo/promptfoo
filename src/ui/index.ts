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
 * import { shouldUseInteractiveUI, renderInteractive } from './ui';
 * import { NonInteractiveProgress } from './ui/noninteractive';
 *
 * if (shouldUseInteractiveUI()) {
 *   const { waitUntilExit } = await renderInteractive(<MyApp ... />);
 *   await waitUntilExit();
 * } else {
 *   const progress = new NonInteractiveProgress('Processing');
 *   progress.start(totalItems);
 *   // ...
 * }
 * ```
 */

// Interactive UI detection (from interactiveCheck)
export { shouldUseInkUI } from './interactiveCheck';
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
