/**
 * React hooks for Ink CLI components.
 */

export { isRawModeSupported, type KeyInfo, type KeypressOptions, useKeypress } from './useKeypress';
export {
  SPINNER_FRAMES,
  type SpinnerType,
  type UseSpinnerFrameOptions,
  useSpinnerFrame,
} from './useSpinnerFrame';
export {
  getStaticTerminalSize,
  type TerminalSize,
  useTerminalSize,
} from './useTerminalSize';
export { useTerminalTitle } from './useTerminalTitle';
