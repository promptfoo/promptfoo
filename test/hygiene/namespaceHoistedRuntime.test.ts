import * as vitest from 'vitest';

const namespaceQualifiedMock = vitest.vi.hoisted(() =>
  vitest.vi.fn().mockReturnValue('namespace-hoisted'),
);

vitest.beforeEach(() => {
  namespaceQualifiedMock.mockReset().mockReturnValue('namespace-hoisted');
});

vitest.afterEach(() => {
  namespaceQualifiedMock.mockReset();
});

vitest.describe('namespace-qualified vi.hoisted', () => {
  vitest.it('executes the hoisted callback through the Vitest namespace', () => {
    vitest.expect(namespaceQualifiedMock()).toBe('namespace-hoisted');
  });
});
