import * as vitest from 'vitest';

const { afterEach, beforeEach, describe, expect, it } = vitest;

const namespaceQualifiedMock = vitest.vi.hoisted(() =>
  vitest.vi.fn().mockReturnValue('namespace-hoisted'),
);

beforeEach(() => {
  namespaceQualifiedMock.mockReset().mockReturnValue('namespace-hoisted');
});

afterEach(() => {
  namespaceQualifiedMock.mockReset();
});

describe('namespace-qualified vi.hoisted', () => {
  it('executes the hoisted callback through the Vitest namespace', () => {
    expect(namespaceQualifiedMock()).toBe('namespace-hoisted');
  });
});
