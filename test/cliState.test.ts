import cliState from '../src/cliState';

describe('cliState', () => {
  beforeEach(() => {
    Object.keys(cliState).forEach((key) => {
      delete (cliState as any)[key];
    });
    // Restore default values
    cliState.isRedteam = false;
  });

  afterEach(() => {
    Object.keys(cliState).forEach((key) => {
      delete (cliState as any)[key];
    });
    // Restore default values
    cliState.isRedteam = false;
  });

  it('should have isRedteam property default to false', () => {
    expect(cliState.isRedteam).toBe(false);
  });

  it('should allow setting and retrieving isRedteam property', () => {
    expect(cliState.isRedteam).toBe(false);

    cliState.isRedteam = true;
    expect(cliState.isRedteam).toBe(true);

    cliState.isRedteam = false;
    expect(cliState.isRedteam).toBe(false);
  });
});
