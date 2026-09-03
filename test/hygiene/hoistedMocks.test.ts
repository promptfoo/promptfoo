import { describe, expect, it } from 'vitest';
import { createDiagnostic, createHygieneFile } from './engine';
import { findHoistedPersistentMockWithoutReset } from './hoistedMocks';

function scanFixturePolicies(source: string, file = 'fixture.test.ts') {
  const input = createHygieneFile({ file, source });
  const finding = findHoistedPersistentMockWithoutReset(input);
  return {
    hoistedPersistentMock: finding
      ? [
          createDiagnostic(input, {
            ruleId: 'hoisted-persistent-mock-reset',
            start: finding.start,
            message:
              'hoisted mocks with persistent implementations must reset implementations with mockReset() or vi.resetAllMocks()',
            snippet: source.slice(finding.start, finding.end),
          }),
        ]
      : [],
  };
}

function hasHoistedPersistentMockWithoutReset(source: string) {
  return scanFixturePolicies(source).hoistedPersistentMock.length > 0;
}

describe('hoisted mock provenance', () => {
  it.each([
    [
      'a declaration-only repeated var alias',
      `
      const mocks = vi.hoisted(() => ({ request: vi.fn().mockReturnValue('x') }));
      var request = mocks.request;
      var request;
      beforeEach(() => request.mockReset());
    `,
    ],
    [
      'a literal object spread',
      `
      const mocks = vi.hoisted(() => ({ ...{ request: vi.fn().mockReturnValue('x') } }));
      beforeEach(() => mocks.request.mockReset());
    `,
    ],
    [
      'a local object spread',
      `
      const mocks = vi.hoisted(() => {
        const source = { request: vi.fn().mockReturnValue('x') };
        return { client: { ...source } };
      });
      beforeEach(() => mocks.client.request.mockReset());
    `,
    ],
    [
      'a helper parameter returned directly',
      `
      function identity(value) { return value; }
      const mock = vi.hoisted(() => identity(vi.fn().mockReturnValue('x')));
      beforeEach(() => mock.mockReset());
    `,
    ],
    [
      'a helper parameter exposed as a property',
      `
      function expose(value) { return { request: value }; }
      const mocks = vi.hoisted(() => expose(vi.fn().mockReturnValue('x')));
      beforeEach(() => mocks.request.mockReset());
    `,
    ],
    [
      'a defaulted helper parameter',
      `
      function expose(value = vi.fn().mockReturnValue('x')) { return { request: value }; }
      const mocks = vi.hoisted(() => expose());
      beforeEach(() => mocks.request.mockReset());
    `,
    ],
    [
      'a destructured helper parameter',
      `
      function expose({ value }) { return { request: value }; }
      const mocks = vi.hoisted(() => expose({ value: vi.fn().mockReturnValue('x') }));
      beforeEach(() => mocks.request.mockReset());
    `,
    ],
    [
      'a destructured parameter default',
      `
      function expose({ value = vi.fn().mockReturnValue('x') } = {}) { return value; }
      const mock = vi.hoisted(() => expose());
      beforeEach(() => mock.mockReset());
    `,
    ],
    [
      'one mock exposed through multiple forwarding calls',
      `
      const mocks = vi.hoisted(() => {
        const shared = vi.fn().mockReturnValue('x');
        function get() { return shared; }
        return { first: get(), second: get() };
      });
      beforeEach(() => mocks.first.mockReset());
    `,
    ],
  ])('accepts a reset through %s', (_name, source) => {
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(false);
  });

  it('checks nested setters even when the outer receiver is reset', () => {
    const source = `
      const mocks = vi.hoisted(() => {
        const outer = vi.fn();
        const inner = vi.fn();
        outer.mockReturnValue(inner.mockReturnValue('unsafe'));
        return { outer, inner };
      });
      beforeEach(() => mocks.outer.mockReset());
    `;
    expect(scanFixturePolicies(source).hoistedPersistentMock).toMatchObject([
      { snippet: "inner.mockReturnValue('unsafe')" },
    ]);
  });

  it('allows a nested response mock discarded and rebuilt by the outer reset', () => {
    const source = `
      const fetch = vi.hoisted(() => vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue('original'),
      }));
      beforeEach(() => fetch.mockReset().mockResolvedValue({
        json: vi.fn().mockResolvedValue('fresh'),
      }));
    `;
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(false);
  });

  it('does not treat reinstalling the same nested mock as resetting it', () => {
    const source = `
      const json = vi.hoisted(() => vi.fn().mockResolvedValue('original'));
      const fetch = vi.hoisted(() => vi.fn().mockResolvedValue({ json }));
      beforeEach(() => fetch.mockReset().mockResolvedValue({ json }));
    `;
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(true);
  });

  it('requires resets for every possible return path', () => {
    const source = `
      function build(flag) {
        if (flag) return vi.fn().mockReturnValue('first');
        return vi.fn().mockReturnValue('second');
      }
      const mock = vi.hoisted(() => build(flag));
      beforeEach(() => mock.mockReset());
    `;
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(false);
  });

  it.each([
    "function consume(...args) {} consume(...[mock.mockReturnValue('x')]);",
    "({})[mock.mockReturnValue('x')];",
    "({ [mock.mockReturnValue('x')]: true });",
  ])('evaluates nested setters in %s', (expression) => {
    const source = `const mock = vi.hoisted(() => {
      const mock = vi.fn();
      ${expression}
      return mock;
    });`;
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(true);
  });

  it('keeps nested constructor calls distinct from forwarding aliases', () => {
    const source = `
      function build() { return vi.fn().mockReturnValue('x'); }
      function wrap() { return { left: build(), right: build() }; }
      const mocks = vi.hoisted(() => ({ first: wrap(), second: wrap() }));
      beforeEach(() => {
        mocks.first.left.mockReset();
        mocks.first.right.mockReset();
        mocks.second.left.mockReset();
      });
    `;
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(true);
    expect(
      hasHoistedPersistentMockWithoutReset(
        source.replace(
          'mocks.second.left.mockReset();',
          'mocks.second.left.mockReset(); mocks.second.right.mockReset();',
        ),
      ),
    ).toBe(false);
  });

  it('does not use a conditional alias to cover two coexisting mocks', () => {
    const source = `
      const mocks = vi.hoisted(() => ({
        left: vi.fn().mockReturnValue('left'),
        right: vi.fn().mockReturnValue('right'),
      }));
      const selected = flag ? mocks.left : mocks.right;
      beforeEach(() => selected.mockReset());
    `;
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(true);
  });

  it.each([
    'try {} catch (request) { request.mockReset(); }',
    'for (const request of unrelated) { request.mockReset(); }',
    'for (const request in unrelated) { request.mockReset(); }',
  ])('does not resolve a scoped shadow to a hoisted mock in %s', (body) => {
    const source = `
      const request = vi.hoisted(() => vi.fn().mockReturnValue('default'));
      beforeEach(() => { ${body} });
    `;
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(true);
  });

  it('projects a reset through mutually exclusive factory results', () => {
    const source = `
      const mocks = vi.hoisted(() => flag
        ? { request: vi.fn().mockReturnValue('left') }
        : { request: vi.fn().mockReturnValue('right') });
      beforeEach(() => mocks.request.mockReset());
    `;
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(false);
  });

  it.each(['true', 'flag'])(
    'bounds a persistent-setter helper DAG with argument %s',
    (argument) => {
      const helpers = ["function build0() { return vi.fn().mockReturnValue('x'); }"];
      for (let depth = 1; depth <= 24; depth += 1) {
        helpers.push(`function build${depth}(flag) {
        return flag ? build${depth - 1}(flag) : build${depth - 1}(flag);
      }`);
      }
      const source = [
        ...helpers,
        `const mock = vi.hoisted(() => build24(${argument}));`,
        'beforeEach(() => mock.mockReset());',
      ].join('\n');
      expect(hasHoistedPersistentMockWithoutReset(source)).toBe(false);
      expect(
        hasHoistedPersistentMockWithoutReset(
          source.replace('beforeEach(() => mock.mockReset());', ''),
        ),
      ).toBe(true);
    },
  );

  it.each([
    [
      'direct setter control',
      [
        'const mockRequest = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));',
        'beforeEach(() => {',
        '  vi.clearAllMocks();',
        '});',
      ].join('\n'),
    ],
    [
      'object setter control',
      [
        'const mockClient = vi.hoisted(() => ({',
        '  connect: vi.fn().mockImplementation(() => undefined),',
        '}));',
      ].join('\n'),
    ],
    [
      'callback identifier control',
      [
        'function factory() { return vi.fn().mockReturnValue("default"); }',
        'const mockClient = vi.hoisted(factory);',
      ].join('\n'),
    ],
    [
      'immediately invoked arrow expression',
      "const mock = vi.hoisted(() => (() => vi.fn().mockReturnValue('x'))());",
    ],
    [
      'module-scope function declaration',
      [
        "function build() { return vi.fn().mockReturnValue('x'); }",
        'const mock = vi.hoisted(() => build());',
      ].join('\n'),
    ],
    [
      'namespace-qualified vi.hoisted call',
      [
        "import * as vitest from 'vitest';",
        "const mock = vitest.vi.hoisted(() => vitest.vi.fn().mockReturnValue('x'));",
      ].join('\n'),
    ],
    [
      'callback-local function declaration',
      [
        'const mock = vi.hoisted(() => {',
        "  function build() { return vi.fn().mockReturnValue('x'); }",
        '  return build();',
        '});',
      ].join('\n'),
    ],
    [
      'callback-local function-valued variable',
      [
        'const mock = vi.hoisted(() => {',
        "  const build = () => vi.fn().mockReturnValue('x');",
        '  return build();',
        '});',
      ].join('\n'),
    ],
    [
      'object binding defaults',
      [
        "function build({ value = vi.fn().mockReturnValue('x') }) { return value; }",
        'const mock = vi.hoisted(() => build({}));',
      ].join('\n'),
    ],
    [
      'array binding defaults',
      [
        "function build([value = vi.fn().mockReturnValue('x')]) { return value; }",
        'const mock = vi.hoisted(() => build([]));',
      ].join('\n'),
    ],
    [
      'a default activated after an earlier supplied call',
      [
        "function build(value = vi.fn().mockReturnValue('x')) { return value; }",
        'const mock = vi.hoisted(() => {',
        "  build('safe');",
        '  return build();',
        '});',
      ].join('\n'),
    ],
    [
      'an object binding default behind an unknown computed property',
      [
        'const mock = vi.hoisted(() => {',
        "  const key = 'value';",
        "  function build({ value = vi.fn().mockReturnValue('x') }) { return value; }",
        '  return build({ [key]: undefined });',
        '});',
      ].join('\n'),
    ],
    [
      'declaration-only var redeclarations',
      [
        'const mock = vi.hoisted(() => {',
        "  var build = () => vi.fn().mockReturnValue('x');",
        '  var build;',
        '  return build();',
        '});',
      ].join('\n'),
    ],
    [
      'switch-scoped helpers',
      [
        'const mock = vi.hoisted(() => {',
        "  switch ('unsafe') {",
        "    case 'unsafe':",
        "      const build = () => vi.fn().mockReturnValue('x');",
        '      return build();',
        '  }',
        '});',
      ].join('\n'),
    ],
    [
      'class-static-block helpers',
      [
        'const mock = vi.hoisted(() => {',
        '  class Factory {',
        '    static {',
        "      var build = () => vi.fn().mockReturnValue('x');",
        '      build();',
        '    }',
        '  }',
        '  return vi.fn();',
        '});',
      ].join('\n'),
    ],
  ])('detects hoisted persistent mock implementations through %s', (_case, source) => {
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(true);
  });

  it.each([
    [
      [
        'const mockRequest = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));',
        'beforeEach(() => {',
        '  mockRequest.mockReset().mockResolvedValue({ ok: true });',
        '});',
      ].join('\n'),
    ],
    [
      [
        'const mockRequest = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));',
        'beforeEach(() => {',
        '  vi.resetAllMocks();',
        '});',
      ].join('\n'),
    ],
    [
      [
        'const mocks = vi.hoisted(() => ({',
        '  request: vi.fn().mockResolvedValue({ ok: true }),',
        '}));',
        'beforeEach(() => {',
        '  mocks.request.mockReset().mockResolvedValue({ ok: true });',
        '});',
      ].join('\n'),
    ],
    [
      [
        'const mocks = vi.hoisted(() => ({',
        "  first: vi.fn().mockReturnValue('first'),",
        "  second: vi.fn().mockReturnValue('second'),",
        '}));',
        'const { first, second } = mocks;',
        'beforeEach(() => {',
        "  first.mockReset().mockReturnValue('first');",
        "  second.mockReset().mockReturnValue('second');",
        '});',
      ].join('\n'),
    ],
    [
      [
        'const mocks = vi.hoisted(() => ({',
        '  request: vi.fn().mockResolvedValue({ ok: true }),',
        '}));',
        'beforeEach(() => {',
        "  mocks['request'].mockReset().mockResolvedValue({ ok: true });",
        '});',
      ].join('\n'),
    ],
    [
      [
        'const mocks = vi.hoisted(() => ({',
        '  request: vi.fn().mockResolvedValue({ ok: true }),',
        '}));',
        'const { request } = mocks;',
        'beforeEach(() => {',
        '  request.mockReset().mockResolvedValue({ ok: true });',
        '});',
      ].join('\n'),
    ],
    [
      [
        'const mocks = vi.hoisted(() => ({',
        '  request: vi.fn().mockResolvedValue({ ok: true }),',
        '}));',
        'const request = mocks.request;',
        'beforeEach(() => {',
        '  request.mockReset().mockResolvedValue({ ok: true });',
        '});',
      ].join('\n'),
    ],
    [
      [
        'const mockRequest = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));',
        'beforeEach(() => {',
        '  vi.mocked(mockRequest).mockReset().mockResolvedValue({ ok: true });',
        '});',
      ].join('\n'),
    ],
    [
      [
        "import * as vitest from 'vitest';",
        'const mockRequest = vitest.vi.hoisted(() =>',
        '  vitest.vi.fn().mockResolvedValue({ ok: true }),',
        ');',
        'beforeEach(() => {',
        '  vitest.vi.resetAllMocks();',
        '});',
      ].join('\n'),
    ],
    [
      [
        "function build() { return vi.fn().mockReturnValue('default'); }",
        'const mock = vi.hoisted(() => build());',
        'beforeEach(() => {',
        "  mock.mockReset().mockReturnValue('default');",
        '});',
      ].join('\n'),
    ],
    [
      [
        "function build() { return vi.fn().mockReturnValue('default'); }",
        'const mocks = vi.hoisted(() => ({ safe: build(), unsafe: build() }));',
        'beforeEach(() => {',
        "  mocks.safe.mockReset().mockReturnValue('default');",
        "  mocks.unsafe.mockReset().mockReturnValue('default');",
        '});',
      ].join('\n'),
    ],
    [
      [
        "function build() { return vi.fn().mockReturnValue('default'); }",
        'const mocks = vi.hoisted(() => {',
        '  const shared = build();',
        '  return { first: shared, second: shared };',
        '});',
        'beforeEach(() => {',
        "  mocks.first.mockReset().mockReturnValue('default');",
        '});',
      ].join('\n'),
    ],
    [
      [
        'const mocks = vi.hoisted(() => {',
        "  const request = vi.fn().mockReturnValue('default');",
        '  const client = { request };',
        '  return { client };',
        '});',
        'const client = mocks.client;',
        'beforeEach(() => {',
        "  client.request.mockReset().mockReturnValue('default');",
        '});',
      ].join('\n'),
    ],
    [
      [
        'const mocks = vi.hoisted(() => {',
        '  const request = vi.fn();',
        "  request.mockResolvedValue('default');",
        '  return { request };',
        '});',
        'beforeEach(() => {',
        "  mocks.request.mockReset().mockResolvedValue('default');",
        '});',
      ].join('\n'),
    ],
    [
      [
        'const mocks = vi.hoisted(() => {',
        '  const client = { request: vi.fn() };',
        "  client.request.mockResolvedValue('default');",
        '  return { client };',
        '});',
        'beforeEach(() => {',
        "  mocks.client.request.mockReset().mockResolvedValue('default');",
        '});',
      ].join('\n'),
    ],
    [
      [
        'const mocks = vi.hoisted(() => ({',
        "  request: vi.fn().mockReturnValue('default'),",
        '}));',
        'const { request } = mocks;',
        'beforeEach(() => {',
        "  request.mockReset().mockReturnValue('default');",
        '});',
        "it('uses another request', () => {",
        '  const request = otherClient.request;',
        '  expect(request).toBeDefined();',
        '});',
      ].join('\n'),
    ],
  ])('allows hoisted persistent mock implementations with reset', (source) => {
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(false);
  });

  it('does not let a reset on a scoped shadow cover a hoisted mock', () => {
    const source = [
      'const mocks = vi.hoisted(() => ({',
      "  request: vi.fn().mockReturnValue('default'),",
      '}));',
      'const { request } = mocks;',
      'beforeEach(() => {',
      '  const request = otherClient.request;',
      '  request.mockReset();',
      '});',
    ].join('\n');

    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(true);
  });

  it('does not let a reset on a parameter shadow cover a hoisted mock', () => {
    const source = [
      "const request = vi.hoisted(() => vi.fn().mockReturnValue('default'));",
      'function resetRequest(request: ReturnType<typeof vi.fn>) {',
      '  request.mockReset();',
      '}',
    ].join('\n');

    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(true);
  });

  it('does not let one per-mock reset hide another hoisted violation', () => {
    const source = [
      "const safe = vi.hoisted(() => vi.fn().mockReturnValue('safe'));",
      "const unsafe = vi.hoisted(() => vi.fn().mockReturnValue('unsafe'));",
      'beforeEach(() => {',
      "  safe.mockReset().mockReturnValue('safe');",
      '});',
    ].join('\n');

    expect(scanFixturePolicies(source, 'nested/fixture.test.ts').hoistedPersistentMock).toEqual([
      expect.objectContaining({
        file: 'nested/fixture.test.ts',
        line: 2,
        snippet: "vi.fn().mockReturnValue('unsafe')",
      }),
    ]);
  });

  it('does not let one property reset hide a sibling hoisted mock', () => {
    const source = [
      'const mocks = vi.hoisted(() => ({',
      "  safe: vi.fn().mockReturnValue('safe'),",
      "  unsafe: vi.fn().mockReturnValue('unsafe'),",
      '}));',
      'beforeEach(() => {',
      "  mocks.safe.mockReset().mockReturnValue('safe');",
      '});',
    ].join('\n');

    expect(scanFixturePolicies(source, 'nested/fixture.test.ts').hoistedPersistentMock).toEqual([
      expect.objectContaining({
        file: 'nested/fixture.test.ts',
        line: 3,
        snippet: "vi.fn().mockReturnValue('unsafe')",
      }),
    ]);
  });

  it('requires every mock produced by repeated helper calls to be reset', () => {
    const source = [
      "function build() { return vi.fn().mockReturnValue('default'); }",
      'const mocks = vi.hoisted(() => ({ safe: build(), unsafe: build() }));',
      'beforeEach(() => {',
      "  mocks.safe.mockReset().mockReturnValue('default');",
      '});',
    ].join('\n');

    expect(scanFixturePolicies(source, 'nested/fixture.test.ts').hoistedPersistentMock).toEqual([
      expect.objectContaining({
        file: 'nested/fixture.test.ts',
        line: 1,
        snippet: "vi.fn().mockReturnValue('default')",
      }),
    ]);
  });

  it('does not let a side-effect reset hide a sibling hoisted mock', () => {
    const source = [
      'const mocks = vi.hoisted(() => {',
      '  const safe = vi.fn();',
      "  safe.mockReturnValue('safe');",
      '  const unsafe = vi.fn();',
      "  unsafe.mockReturnValue('unsafe');",
      '  return { safe, unsafe };',
      '});',
      'beforeEach(() => {',
      "  mocks.safe.mockReset().mockReturnValue('safe');",
      '});',
    ].join('\n');

    expect(scanFixturePolicies(source, 'nested/fixture.test.ts').hoistedPersistentMock).toEqual([
      expect.objectContaining({
        file: 'nested/fixture.test.ts',
        line: 5,
        snippet: "unsafe.mockReturnValue('unsafe')",
      }),
    ]);
  });

  it('does not treat a dynamic property reset as specific mock coverage', () => {
    const source = [
      "const key = 'request';",
      'const mocks = vi.hoisted(() => ({',
      "  request: vi.fn().mockReturnValue('default'),",
      '}));',
      'beforeEach(() => {',
      '  mocks[key].mockReset();',
      '});',
    ].join('\n');

    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(true);
  });

  it('tracks nested returned mocks through local aliases', () => {
    const source = [
      'const mocks = vi.hoisted(() => {',
      '  const client = {',
      "    safe: vi.fn().mockReturnValue('safe'),",
      "    unsafe: vi.fn().mockReturnValue('unsafe'),",
      '  };',
      '  return { client };',
      '});',
      'const client = mocks.client;',
      'beforeEach(() => {',
      "  client.safe.mockReset().mockReturnValue('safe');",
      '});',
    ].join('\n');

    expect(scanFixturePolicies(source, 'nested/fixture.test.ts').hoistedPersistentMock).toEqual([
      expect.objectContaining({
        file: 'nested/fixture.test.ts',
        line: 4,
        snippet: "vi.fn().mockReturnValue('unsafe')",
      }),
    ]);
  });

  it.each([
    [
      'an uninvoked helper returned from the callback',
      [
        'const mock = vi.hoisted(() => {',
        "  const build = () => vi.fn().mockReturnValue('x');",
        '  return build;',
        '});',
      ].join('\n'),
    ],
    [
      'a helper passed through another synchronous helper',
      [
        'const mock = vi.hoisted(() => {',
        "  const build = () => vi.fn().mockReturnValue('x');",
        '  function pass(callback: () => unknown) { return callback; }',
        '  return pass(build);',
        '});',
      ].join('\n'),
    ],
    [
      'a scheduled callback',
      [
        'const mock = vi.hoisted(() => {',
        "  const build = () => vi.fn().mockReturnValue('x');",
        '  setTimeout(build, 0);',
        '  return vi.fn();',
        '});',
      ].join('\n'),
    ],
    [
      'an inline deferred callback',
      [
        'const mock = vi.hoisted(() => {',
        "  setTimeout(() => vi.fn().mockReturnValue('x'), 0);",
        '  return vi.fn();',
        '});',
      ].join('\n'),
    ],
    [
      'a safe local helper shadowing an unsafe module helper',
      [
        "function build() { return vi.fn().mockReturnValue('x'); }",
        'const mock = vi.hoisted(() => {',
        '  const build = () => vi.fn();',
        '  return build();',
        '});',
      ].join('\n'),
    ],
    [
      'recursive and cyclic helper references',
      [
        'const mock = vi.hoisted(() => {',
        "  const unused = () => vi.fn().mockReturnValue('x');",
        '  function first(depth: number): unknown {',
        '    return depth === 0 ? vi.fn() : second(depth - 1);',
        '  }',
        '  function second(depth: number): unknown {',
        '    return depth === 0 ? vi.fn() : first(depth - 1);',
        '  }',
        '  return first(1);',
        '});',
      ].join('\n'),
    ],
    [
      'an imported helper',
      [
        "import { build } from './helper';",
        "const unused = () => vi.fn().mockReturnValue('x');",
        'const mock = vi.hoisted(() => build());',
      ].join('\n'),
    ],
    [
      'a generator helper whose body has not started',
      [
        'function* build() {',
        "  return vi.fn().mockReturnValue('x');",
        '}',
        'const mock = vi.hoisted(() => build());',
      ].join('\n'),
    ],
    [
      'a module-scope function-valued variable unavailable during Vitest hoisting',
      [
        "const build = () => vi.fn().mockReturnValue('x');",
        'const mock = vi.hoisted(() => build());',
      ].join('\n'),
    ],
  ])('preserves deferred function boundaries for %s', (_case, source) => {
    expect(scanFixturePolicies(source).hoistedPersistentMock).toEqual([]);
  });

  it.each([
    [
      'a supplied object-binding value',
      [
        "function build({ value = vi.fn().mockReturnValue('x') }) { return value; }",
        "const mock = vi.hoisted(() => build({ value: 'safe' }));",
      ].join('\n'),
    ],
    [
      'a supplied array-binding value',
      [
        "function build([value = vi.fn().mockReturnValue('x')]) { return value; }",
        "const mock = vi.hoisted(() => build(['safe']));",
      ].join('\n'),
    ],
    [
      'a safe switch-scoped helper shadowing an unsafe outer helper',
      [
        "function build() { return vi.fn().mockReturnValue('x'); }",
        'const mock = vi.hoisted(() => {',
        "  switch ('safe') {",
        "    case 'safe':",
        '      const build = () => vi.fn();',
        '      return build();',
        '  }',
        '});',
      ].join('\n'),
    ],
    [
      'a class-static-block var shadowing a safe callback var',
      [
        'const mock = vi.hoisted(() => {',
        '  var build = () => vi.fn();',
        '  class Factory {',
        '    static {',
        "      var build = () => vi.fn().mockReturnValue('x');",
        '    }',
        '  }',
        '  return build();',
        '});',
      ].join('\n'),
    ],
  ])('does not report a persistent setter that cannot execute through %s', (_case, source) => {
    expect(scanFixturePolicies(source).hoistedPersistentMock).toEqual([]);
  });

  it('bounds repeated synchronous helper expansion', () => {
    const helperDepth = 24;
    const helpers = ['function build0() { return vi.fn(); }'];
    for (let depth = 1; depth <= helperDepth; depth += 1) {
      helpers.push(
        `function build${depth}(flag: boolean) { return flag ? build${depth - 1}(flag) : build${depth - 1}(flag); }`,
      );
    }
    const source = [...helpers, `const mock = vi.hoisted(() => build${helperDepth}(true));`].join(
      '\n',
    );

    expect(scanFixturePolicies(source).hoistedPersistentMock).toEqual([]);
  });

  it('anchors multi-hoist diagnostics to the persistent setter in the violating callback', () => {
    const source = [
      'const safe = vi.hoisted(() => vi.fn());',
      'const unsafe = vi.hoisted(() =>',
      '  vi.fn().mockResolvedValue({ ok: true }),',
      ');',
    ].join('\n');

    expect(scanFixturePolicies(source, 'nested/fixture.test.ts').hoistedPersistentMock).toEqual([
      {
        ruleId: 'hoisted-persistent-mock-reset',
        file: 'nested/fixture.test.ts',
        line: 3,
        column: 3,
        message:
          'hoisted mocks with persistent implementations must reset implementations with mockReset() or vi.resetAllMocks()',
        snippet: 'vi.fn().mockResolvedValue({ ok: true })',
      },
    ]);
  });

  it('anchors a multi-hoist helper diagnostic to the invoked helper setter', () => {
    const source = [
      'const safe = vi.hoisted(() => vi.fn());',
      'function buildUnsafe() {',
      "  return vi.fn().mockReturnValue('x');",
      '}',
      'const unsafe = vi.hoisted(() => buildUnsafe());',
    ].join('\n');

    expect(scanFixturePolicies(source, 'nested/fixture.test.ts').hoistedPersistentMock).toEqual([
      expect.objectContaining({
        file: 'nested/fixture.test.ts',
        line: 3,
        column: 10,
        snippet: "vi.fn().mockReturnValue('x')",
      }),
    ]);
  });
});
