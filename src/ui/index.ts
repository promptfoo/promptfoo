/**
 * Ink-based CLI UI module.
 *
 * This module provides React-based terminal UI components for the promptfoo CLI.
 *
 * Entry Point: Use `renderInteractive()` with React components when `shouldUseInkUI()` returns true.
 *
 * @example
 * ```typescript
 * import { shouldUseInkUI, renderInteractive } from './ui';
 *
 * if (shouldUseInkUI()) {
 *   const { waitUntilExit } = await renderInteractive(<MyApp ... />);
 *   await waitUntilExit();
 * }
 * ```
 */

// Interactive UI detection (from interactiveCheck)
export { canUseInteractiveUI, isInteractiveUIEnabled, shouldUseInkUI } from './interactiveCheck';
// Core rendering utilities
export {
  getTerminalSize,
  type RenderOptions,
  type RenderResult,
  renderInteractive,
  runInteractive,
  supportsColor,
} from './render';
