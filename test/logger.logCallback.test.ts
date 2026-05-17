import { afterEach, describe, expect, it } from 'vitest';
import { clearLogCallbackIfOwned, globalLogCallback, setLogCallback } from '../src/logger';

describe('log callback ownership', () => {
  afterEach(() => {
    setLogCallback(null);
  });

  it('should only clear the active callback when it is owned by the caller', () => {
    const firstCallback = () => {};
    const secondCallback = () => {};

    setLogCallback(firstCallback);
    setLogCallback(secondCallback);

    clearLogCallbackIfOwned(firstCallback);
    expect(globalLogCallback).toBe(secondCallback);

    clearLogCallbackIfOwned(secondCallback);
    expect(globalLogCallback).toBeNull();
  });
});
