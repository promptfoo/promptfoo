import * as vitest from 'vitest';

const { afterEach, beforeEach, describe, expect, it } = vitest;

const namespaceQualifiedMock = await vitest.vi.hoisted(async () =>
  vitest.vi.fn().mockReturnValue('namespace-hoisted'),
);

const cleanup = {
  reset() {
    namespaceQualifiedMock.mockReset();
  },
};

beforeEach(() => {
  cleanup.reset();
  namespaceQualifiedMock.mockReturnValue('namespace-hoisted');
});

afterEach(() => {
  namespaceQualifiedMock.mockReset();
});

describe('namespace-qualified vi.hoisted', () => {
  it('executes the hoisted callback through the Vitest namespace', () => {
    expect(namespaceQualifiedMock()).toBe('namespace-hoisted');
  });
});
