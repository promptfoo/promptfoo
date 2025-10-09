declare module 'ink' {
  import type { FunctionComponent, ReactElement } from 'react';

  export interface InkKey {
    upArrow?: boolean;
    downArrow?: boolean;
    leftArrow?: boolean;
    rightArrow?: boolean;
    escape?: boolean;
    return?: boolean;
    ctrl?: boolean;
    shift?: boolean;
    tab?: boolean;
  }

  export interface InkInstance {
    waitUntilExit(): Promise<void>;
    unmount(): void;
  }

  export interface RenderOptions {
    exitOnCtrlC?: boolean;
    patchConsole?: boolean;
  }

  export function render(node: ReactElement, options?: RenderOptions): InkInstance;

  export const Box: FunctionComponent<Record<string, unknown>>;
  export const Text: FunctionComponent<Record<string, unknown>>;

  export function useApp(): { exit(): void };
  export function useInput(handler: (input: string, key: InkKey) => void): void;
}
