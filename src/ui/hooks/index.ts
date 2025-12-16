/**
 * React hooks for Ink CLI components.
 */

export {
  useSpinnerFrame,
  useSpinner,
  SPINNER_FRAMES,
  type SpinnerType,
  type UseSpinnerFrameOptions,
} from './useSpinnerFrame';

export {
  useKeypress,
  useKeyHeld,
  useNavigationKeys,
  useConfirmKey,
  isRawModeSupported,
  type KeyInfo,
  type KeypressOptions,
} from './useKeypress';

export {
  useTerminalSize,
  getStaticTerminalSize,
  type TerminalSize,
} from './useTerminalSize';
