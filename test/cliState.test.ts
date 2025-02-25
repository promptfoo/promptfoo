import cliState from '../src/cliState';

describe('cliState', () => {
  // Reset cliState before and after each test
  beforeEach(() => {
    // Reset cliState properties
    Object.keys(cliState).forEach((key) => {
      delete (cliState as any)[key];
    });
  });

  afterEach(() => {
    // Reset cliState properties
    Object.keys(cliState).forEach((key) => {
      delete (cliState as any)[key];
    });
  });

  it('should have isRedteam property undefined by default', () => {
    expect(cliState.isRedteam).toBeUndefined();
  });

  it('should allow setting and retrieving isRedteam property', () => {
    expect(cliState.isRedteam).toBeUndefined();

    cliState.isRedteam = true;
    expect(cliState.isRedteam).toBe(true);

    cliState.isRedteam = false;
    expect(cliState.isRedteam).toBe(false);
  });

  it('should work with Boolean() coercion', () => {
    expect(Boolean(cliState.isRedteam)).toBe(false);

    cliState.isRedteam = true;
    expect(Boolean(cliState.isRedteam)).toBe(true);
  });
});
