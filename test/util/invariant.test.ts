import invariant from '../../src/util/invariant';

describe('invariant', () => {
  it('should not throw when condition is true', () => {
    expect(() => invariant(true)).not.toThrow();
    expect(() => invariant(1)).not.toThrow();
    expect(() => invariant({})).not.toThrow();
  });

  it('should throw when condition is false', () => {
    expect(() => invariant(false)).toThrow('Invariant failed');
    expect(() => invariant(0)).toThrow('Invariant failed');
    expect(() => invariant(null)).toThrow('Invariant failed');
    expect(() => invariant(undefined)).toThrow('Invariant failed');
  });

  it('should include the provided message in the error', () => {
    const message = 'Custom error message';
    expect(() => invariant(false, message)).toThrow('Invariant failed: Custom error message');
  });

  it('should support message callback functions', () => {
    const getMessage = () => 'Dynamic message';
    expect(() => invariant(false, getMessage)).toThrow('Invariant failed: Dynamic message');
  });

  it('should work for type narrowing', () => {
    const value: string | null = 'test';

    // This should compile without type errors
    invariant(value !== null, 'Value should not be null');

    // After the invariant, TypeScript should know that value is a string
    const length: number = value.length;
    expect(length).toBe(4);
  });
});
