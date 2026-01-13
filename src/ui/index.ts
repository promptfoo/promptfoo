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

// Shared components
export * from './components/shared';
// Hooks
export * from './hooks';
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
// Utilities
export * from './utils';
