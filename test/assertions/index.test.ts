import { runAssertion, runAssertions } from '../../src/assertions';

describe('Assertions module', () => {
  beforeEach(() => {
    jest.resetModules();
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  it('should export the required functions', () => {
    expect(runAssertion).toBeDefined();
    expect(runAssertions).toBeDefined();
  });
  it('should have proper function signatures', () => {
    expect(typeof runAssertion).toBe('function');
    expect(typeof runAssertions).toBe('function');
    expect(runAssertion).toHaveLength(1);
    expect(runAssertions).toHaveLength(1);
  });
});
