import type { KeyboardEvent } from 'react';

import { describe, expect, it } from 'vitest';
import { isInputComposing } from './keyboard';

function createKeyboardEvent(
  isComposing: boolean,
  keyCode: number,
): KeyboardEvent<HTMLInputElement> {
  return {
    nativeEvent: { isComposing, keyCode },
  } as unknown as KeyboardEvent<HTMLInputElement>;
}

describe('isInputComposing', () => {
  // Basic cases
  it('returns true when isComposing is true', () => {
    expect(isInputComposing(createKeyboardEvent(true, 13))).toBe(true);
  });

  it('returns true when keyCode is 229', () => {
    expect(isInputComposing(createKeyboardEvent(false, 229))).toBe(true);
  });

  it('returns false when not composing and keyCode is not 229', () => {
    expect(isInputComposing(createKeyboardEvent(false, 13))).toBe(false);
  });

  // Browser-specific: Safari sets isComposing=false but keyCode=229 on confirm
  it('handles Safari IME confirm (isComposing=false, keyCode=229)', () => {
    expect(isInputComposing(createKeyboardEvent(false, 229))).toBe(true);
  });
});
