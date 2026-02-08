import type { KeyboardEvent } from 'react';

/**
 * Check if a keyboard event should be ignored due to IME (Input Method Editor) composition.
 *
 * IME allows users to input characters for East Asian languages (Japanese, Chinese, Korean)
 * using phonetic input. Keys like Enter, Escape, and Arrow keys are used during composition.
 *
 * When to use:
 * - Custom `onKeyDown` handlers that trigger actions (submit, cancel, etc.) in free-form text inputs
 *
 * Not needed for:
 * - Browser default behavior like `<form onSubmit>`
 * - Non-text inputs (email, number, etc.)
 *
 * Browser compatibility:
 * - Chrome/Firefox: `isComposing` is `true` during composition
 * - Safari: `isComposing` may be `false` on composition confirm, but `keyCode` is `229`
 *
 * https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/isComposing
 */
export function isInputComposing(e: KeyboardEvent): boolean {
  // keyCode 229 is used as a fallback for Safari compatibility.
  // keyCode is deprecated but there's no alternative for this Safari behavior.
  return e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229;
}
