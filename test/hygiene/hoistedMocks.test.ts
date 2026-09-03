import { describe, expect, it } from 'vitest';
import { createHygieneFile } from './engine';
import { findHoistedPersistentMockWithoutReset } from './hoistedMocks';

function scanFixturePolicies(source: string, file = 'fixture.test.ts') {
  const input = createHygieneFile({ file, source });
  const finding = findHoistedPersistentMockWithoutReset(input);
  return { hoistedPersistentMock: finding ? [finding] : [] };
}

function hasHoistedPersistentMockWithoutReset(source: string) {
  return scanFixturePolicies(source).hoistedPersistentMock.length > 0;
}

describe('hoisted mock provenance', () => {
  it.each([
    ['continue;', true],
    ['break;', false],
    ['return request;', false],
  ])('evaluates for updates after %s only when reached', (control, violation) => {
    const source = `const mock = vi.hoisted(() => {
      const request = vi.fn();
      for (let index = 0; index < 1; index++, request.mockReturnValue('x')) { ${control} }
      return request;
    });`;
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(violation);
    expect(
      hasHoistedPersistentMockWithoutReset(`${source} beforeEach(() => mock.mockReset());`),
    ).toBe(false);
  });

  it.each([
    'globalThis.saved = inner;',
    'opaque.saved = { inner };',
    'globalThis.saved = () => inner;',
  ])('keeps mocks exposed through %s independently resettable', (escape) => {
    const source = `const outer = vi.hoisted(() => {
        const inner = vi.fn().mockReturnValue('x'); ${escape}
        return vi.fn().mockImplementation(() => inner);
      }); beforeEach(() => outer.mockReset());`;
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(true);
  });

  it.each([
    '() => () => inner',
    '() => ({ read: () => inner })',
    '() => { function read() { return inner; } return read; }',
    '() => function* () { yield inner; }',
  ])('follows nested closure captures in %s without executing them', (implementation) => {
    const source = `const outer = vi.hoisted(() => {
      const inner = vi.fn().mockReturnValue('x');
      return vi.fn().mockImplementation(${implementation});
    }); beforeEach(() => outer.mockReset());`;
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(false);
  });

  it.each(['() => inner', '{ read: () => inner }'])(
    'keeps helper-scoped closure writes to globals exposed for %s',
    (value) => {
      const source = `const outer = vi.hoisted(() => {
        const inner = vi.fn().mockReturnValue('x');
        function save(inner) { globalThis.saved = ${value}; }
        save(inner);
        return vi.fn().mockImplementation(() => inner);
      }); beforeEach(() => outer.mockReset());`;
      expect(hasHoistedPersistentMockWithoutReset(source)).toBe(true);
    },
  );

  it('tracks closures stored in literal implementation values', () => {
    const source = `const outer = vi.hoisted(() => {
      const inner = vi.fn().mockReturnValue('x');
      const result = { read: () => inner };
      return vi.fn().mockReturnValue(result);
    }); beforeEach(() => outer.mockReset());`;
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(false);
  });

  it.each([
    'try { return; } catch {}',
    'try { opaque(); } catch { return; }',
    'try {} finally { if (flag) return; }',
  ])('keeps reset coverage conditional after %s', (control) => {
    const source = `const mock = vi.hoisted(() => vi.fn().mockReturnValue('x'));
      beforeEach(() => { ${control} mock.mockReset(); });`;
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(true);
  });

  it.each([
    'try { return; } catch {} finally { mock.mockReset(); }',
    'try { opaque(); } catch { return; } finally { mock.mockReset(); }',
  ])('accepts guaranteed finally cleanup in %s', (control) => {
    const source = `const mock = vi.hoisted(() => vi.fn().mockReturnValue('x'));
      beforeEach(() => { ${control} });`;
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(false);
  });

  it.each([
    `describe('generated', () => { cases.forEach(() => it('generated', () => mock())); });`,
    `cases.forEach(() => it('generated', () => mock()));`,
    `describe('generated', () => {
      cases.forEach(() => it('generated', () => mock()));
      describe('nested', () => { beforeEach(() => mock.mockReset()); it('nested', () => mock()); });
    });`,
  ])('includes dynamically registered test scopes in %s', (generated) => {
    const source = `const mock = vi.hoisted(() => vi.fn().mockReturnValue('x'));
      describe('direct', () => { beforeEach(() => mock.mockReset()); it('direct', () => mock()); });
      ${generated}`;
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(true);
    expect(
      hasHoistedPersistentMockWithoutReset(`${source} beforeEach(() => mock.mockReset());`),
    ).toBe(false);
  });

  it.each(['mock.mockReset()', 'vi.resetAllMocks()'])(
    'does not accept afterEach-only cleanup using %s',
    (reset) => {
      const source = `const mock = vi.hoisted(() => vi.fn().mockReturnValue('initial'));
        afterEach(() => { ${reset}; });`;
      expect(hasHoistedPersistentMockWithoutReset(source)).toBe(true);
      expect(hasHoistedPersistentMockWithoutReset(source.replace('afterEach', 'beforeEach'))).toBe(
        false,
      );
    },
  );

  it.each([
    [
      'a top-level test',
      `describe('nested', () => {
      beforeEach(() => mock.mockReset()); it('inside', () => mock());
    }); it('outside', () => mock());`,
      true,
    ],
    [
      'a sibling suite',
      `describe('first', () => {
      beforeEach(() => mock.mockReset()); it('first', () => mock());
    }); describe('second', () => { it('second', () => mock()); });`,
      true,
    ],
    [
      'parent hooks',
      `describe('parent', () => {
      beforeEach(() => mock.mockReset());
      describe('first', () => { it('first', () => mock()); });
      describe('second', () => { it('second', () => mock()); });
    });`,
      false,
    ],
    [
      'separate sibling hooks',
      `describe('first', () => {
      beforeEach(() => mock.mockReset()); it('first', () => mock());
    }); describe('second', () => {
      beforeEach(() => mock.mockReset()); it('second', () => mock());
    });`,
      false,
    ],
  ])('respects reset ownership with %s', (_name, suites, violation) => {
    const source = `const mock = vi.hoisted(() => vi.fn().mockReturnValue('initial')); ${suites}`;
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(violation);
  });

  it.each([
    "let request; switch (flag) { case 'a': request = vi.fn().mockReturnValue('a'); break; default: request = vi.fn().mockReturnValue('b'); } return request;",
    "let request; switch ('a') { case 'a': request = vi.fn().mockReturnValue('a'); break; default: request = vi.fn().mockReturnValue('b'); } return request;",
    "let request; switch (flag) { case 'a': case 'b': request = vi.fn().mockReturnValue('a'); break; default: request = vi.fn().mockReturnValue('b'); } return request;",
    "let request; switch (flag) { default: case 'a': request = vi.fn().mockReturnValue('a'); break; case 'b': request = vi.fn().mockReturnValue('b'); } return request;",
  ])('preserves switch selection and fallthrough in %s', (body) => {
    const source = `const mock = vi.hoisted(() => { ${body} });`;
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(true);
    expect(
      hasHoistedPersistentMockWithoutReset(`${source}\nbeforeEach(() => mock.mockReset());`),
    ).toBe(false);
  });

  it.each([
    `switch (flag) { case 'a': return; default: break; }`,
    `switch (flag) { case 'a': break; case 'b': return; default: break; }`,
    `for (const current of unknownValues) { return; }`,
    `for (const current of [1]) { if (flag) return; }`,
    `for (; flag;) { return; }`,
    `while (flag) { return; }`,
    `do { if (flag) return; } while (false);`,
  ])('does not grant unconditional reset coverage after %s', (control) => {
    const source = `const mock = vi.hoisted(() => vi.fn().mockReturnValue('x'));
      beforeEach(() => { ${control} mock.mockReset(); });`;
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(true);
  });

  it.each([
    ['[mocks.first, mocks.second]', '', false],
    ['[]', '', true],
    ['unknownValues', '', true],
    ['[mocks.first, mocks.second]', 'break;', true],
  ])('follows known for-of values from %s with %s', (iterable, control, violation) => {
    const source = `const mocks = vi.hoisted(() => ({
      first: vi.fn().mockReturnValue('a'), second: vi.fn().mockReturnValue('b'),
    })); beforeEach(() => {
      for (const current of ${iterable}) { current.mockReset(); ${control} }
    });`;
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(violation);
  });

  it.each([
    'targets.pop();',
    'targets.length = 0;',
    'targets.length--;',
    'delete targets[0];',
    'removeTargets(targets);',
    'remover.remove(targets);',
  ])('does not assume array contents survive %s', (mutation) => {
    const source = `const mocks = vi.hoisted(() => ({
        first: vi.fn().mockReturnValue('a'), second: vi.fn().mockReturnValue('b'),
      })); const targets = [mocks.first, mocks.second]; ${mutation}
      beforeEach(() => { for (const current of targets) current.mockReset(); });`;
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(true);
  });

  it.each(['() => inner', '() => ({ inner })', '() => inner()'])(
    'tracks callback ownership without executing %s',
    (implementation) => {
      const source = `const outer = vi.hoisted(() => {
        const inner = vi.fn().mockReturnValue('x');
        return vi.fn().mockImplementation(${implementation});
      }); beforeEach(() => outer.mockReset());`;
      expect(hasHoistedPersistentMockWithoutReset(source)).toBe(false);
    },
  );

  it('does not execute callback-only setters or register callback-only hooks', () => {
    const source = `const mocks = vi.hoisted(() => {
      const inner = vi.fn();
      const outer = vi.fn().mockImplementation(() => {
        beforeEach(() => inner.mockReset());
        return inner.mockReturnValue('runtime');
      });
      return { inner, outer };
    }); beforeEach(() => mocks.outer.mockReset());`;
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(false);
    expect(
      hasHoistedPersistentMockWithoutReset(
        source.replace(
          'const inner = vi.fn();',
          "const inner = vi.fn().mockReturnValue('initial');",
        ),
      ),
    ).toBe(true);
  });

  it.each([
    `const outer = vi.hoisted(() => {
      const inner = vi.fn().mockReturnValue('x');
      return { disposable: vi.fn().mockImplementation(() => inner), retained: vi.fn(() => inner) };
    }); beforeEach(() => { outer.disposable.mockReset(); outer.retained.mockReset(); });`,
    `const mocks = vi.hoisted(() => {
      const inner = vi.fn().mockReturnValue('x');
      return { inner, outer: vi.fn().mockImplementation(() => inner) };
    }); beforeEach(() => mocks.outer.mockReset().mockImplementation(() => mocks.inner));`,
  ])('requires resets for callback captures that remain reachable in %s', (source) => {
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(true);
  });

  it('does not mutate enclosing bindings while inspecting callback captures', () => {
    const source = `const mocks = vi.hoisted(() => {
      let inner = vi.fn().mockReturnValue('x');
      const outer = vi.fn().mockImplementation(() => { inner = unrelated; });
      return { inner, outer };
    }); beforeEach(() => { mocks.inner.mockReset(); mocks.outer.mockReset(); });`;
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(false);
  });

  it('bounds deeply nested source syntax before recursive analysis', () => {
    const source = `${'{'.repeat(5000)}const mock = vi.hoisted(() => vi.fn().mockReturnValue('x'));${'}'.repeat(5000)}`;
    expect(scanFixturePolicies(source).hoistedPersistentMock).toMatchObject([
      { ruleId: 'hoisted-mock-analysis-limit' },
    ]);
  });

  it('bounds combined helper and statement depth', () => {
    const helpers = ["function build0() { return vi.fn().mockReturnValue('x'); }"];
    for (let depth = 1; depth <= 20; depth += 1) {
      helpers.push(
        `function build${depth}() { ${'{'.repeat(80)}return build${depth - 1}();${'}'.repeat(80)} }`,
      );
    }
    const source = [...helpers, 'const mock = vi.hoisted(build20);'].join('\n');
    expect(scanFixturePolicies(source).hoistedPersistentMock).toMatchObject([
      { ruleId: 'hoisted-mock-analysis-limit' },
    ]);
  });

  it('charges accumulated guard snapshots to the analysis budget', () => {
    const guards = Array.from({ length: 2400 }, (_, index) => `if (flag${index}) return;`);
    const calls = Array.from({ length: 2400 }, () => 'noop();');
    const source = `function noop() {} beforeEach(() => { ${[...guards, ...calls].join('\n')} });`;
    expect(scanFixturePolicies(source).hoistedPersistentMock).toMatchObject([
      { ruleId: 'hoisted-mock-analysis-limit' },
    ]);
  });

  it.each([
    "import { vi as mockApi } from 'vitest'; const mock = mockApi.hoisted(() => mockApi.fn().mockReturnValue('x'));",
    "import { vi as mockApi } from 'vitest'; const mock = mockApi['hoisted'](() => mockApi.fn()['mockReturnValue']('x'));",
    "const mock = vi.hoisted(() => vi.fn().mockReturnValue /* persistent */ ('x'));",
  ])('uses resolved AST calls instead of a source-text prefilter for %s', (source) => {
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(true);
  });

  it.each([
    "let request; request = vi.fn().mockReturnValue('x'); return request;",
    "const client = {}; client.request = vi.fn().mockReturnValue('x'); return client.request;",
    "const client = {}; client['request'] = vi.fn().mockReturnValue('x'); return client.request;",
    "let request; do { request = vi.fn(); } while (!request.mockReturnValue('x')); return request;",
  ])('preserves mock provenance through assignments in %s', (body) => {
    const source = `const mock = vi.hoisted(() => { ${body} });`;
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(true);
    expect(
      hasHoistedPersistentMockWithoutReset(`${source}\nbeforeEach(() => mock.mockReset());`),
    ).toBe(false);
  });

  it.each([
    "let request; if (flag) request = vi.fn().mockReturnValue('a'); else request = vi.fn().mockReturnValue('b'); return request;",
    "const client = {}; if (flag) client.request = vi.fn().mockReturnValue('a'); else client.request = vi.fn().mockReturnValue('b'); return client.request;",
    "if (flag) { var request = vi.fn().mockReturnValue('a'); } else { var request = vi.fn().mockReturnValue('b'); } return request;",
    "let request; flag ? request = vi.fn().mockReturnValue('a') : request = vi.fn().mockReturnValue('b'); return request;",
    "let request; if (first) { if (second) request = vi.fn().mockReturnValue('a'); else request = vi.fn().mockReturnValue('b'); } else request = vi.fn().mockReturnValue('c'); return request;",
  ])('merges mutually exclusive assignment paths in %s', (body) => {
    const source = `const mock = vi.hoisted(() => { ${body} });`;
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(true);
    expect(
      hasHoistedPersistentMockWithoutReset(`${source}\nbeforeEach(() => mock.mockReset());`),
    ).toBe(false);
  });

  it.each([
    "try { return vi.fn().mockReturnValue('x'); } finally {}",
    "try { return vi.fn().mockReturnValue('a'); } catch { return vi.fn().mockReturnValue('b'); }",
    "try { throw new Error('expected'); } catch { return vi.fn().mockReturnValue('x'); }",
    "const mock = vi.fn().mockReturnValue('x'); try { return unrelated; } finally { return mock; }",
  ])('preserves factory return flow through %s', (body) => {
    const source = `const mock = vi.hoisted(() => { ${body} });`;
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(true);
    expect(
      hasHoistedPersistentMockWithoutReset(`${source}\nbeforeEach(() => mock.mockReset());`),
    ).toBe(false);
  });

  it.each([
    "class Factory { [String(request.mockReturnValue('x'))]() {} }",
    "class Factory { [String(request.mockReturnValue('x'))] = undefined; }",
    "@decorate(request.mockReturnValue('x')) class Factory {}",
    "class Factory { @decorate(request.mockReturnValue('x')) method() {} }",
    "class Factory extends extend(request.mockReturnValue('x')) {}",
    "String.raw`${request.mockReturnValue('x')}`;",
  ])('evaluates definition-time effects in %s', (definition) => {
    const source = `const mock = vi.hoisted(() => {
      const request = vi.fn();
      ${definition}
      return request;
    });`;
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(true);
    expect(
      hasHoistedPersistentMockWithoutReset(`${source}\nbeforeEach(() => mock.mockReset());`),
    ).toBe(false);
  });

  it('does not execute deferred class methods or instance initializers', () => {
    expect(
      hasHoistedPersistentMockWithoutReset(`const mock = vi.hoisted(() => {
        const request = vi.fn();
        class Factory {
          field = request.mockReturnValue('instance');
          method() { request.mockReturnValue('method'); }
        }
        return request;
      });`),
    ).toBe(false);
  });

  it('invalidates a member alias overwritten by an unknown computed assignment', () => {
    const source = `
      const mock = vi.hoisted(() => vi.fn().mockReturnValue('x'));
      const client = { request: mock };
      client[key] = unrelated;
      beforeEach(() => client.request.mockReset());
    `;
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(true);
  });

  it.each([
    'let alias = unrelated; if (flag) alias = mock; beforeEach(() => alias.mockReset());',
    'const client = { request: unrelated }; if (flag) client.request = mock; beforeEach(() => client.request.mockReset());',
    'beforeEach(() => { if (flag) mock.mockReset(); });',
    'beforeEach(() => { if (flag) vi.resetAllMocks(); });',
    'beforeEach(() => { while (flag) { mock.mockReset(); break; } });',
    'beforeEach(() => { for (const item of items) mock.mockReset(); });',
    'beforeEach(() => { for (let index = 0; flag; index++) mock.mockReset(); });',
    'beforeEach(() => { switch (flag) { case 1: mock.mockReset(); } });',
    'beforeEach(() => { try { work(); } catch { mock.mockReset(); } });',
    'beforeEach(() => { flag && mock.mockReset(); });',
    'beforeEach(() => { flag || vi.resetAllMocks(); });',
    'beforeEach(() => { flag ?? mock.mockReset(); });',
    'let flag; beforeEach(() => { flag = unknown; flag &&= mock.mockReset(); });',
    'let flag; beforeEach(() => { flag = unknown; flag ||= mock.mockReset(); });',
    'let flag; beforeEach(() => { flag = unknown; flag ??= mock.mockReset(); });',
    'function cleanup(value = mock.mockReset()) {} beforeEach(() => cleanup(unknown));',
    'vi.resetAllMocks();',
  ])('does not mistake a possible or collection-only reset for a guaranteed hook: %s', (body) => {
    const source = `const mock = vi.hoisted(() => vi.fn().mockReturnValue('x')); ${body}`;
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(true);
  });

  it.each(['mock.mockReset()', 'vi.resetAllMocks()'])(
    'accepts %s when every hook branch performs it',
    (reset) => {
      const source = `const mock = vi.hoisted(() => vi.fn().mockReturnValue('x'));
        beforeEach(() => { if (flag) ${reset}; else ${reset}; });`;
      expect(hasHoistedPersistentMockWithoutReset(source)).toBe(false);
    },
  );

  it.each(['true &&', 'false ||', 'null ??', 'undefined ??'])(
    'recognizes a guaranteed short-circuit reset with %s',
    (prefix) => {
      const source = `const mock = vi.hoisted(() => vi.fn().mockReturnValue('x'));
        beforeEach(() => { ${prefix} mock.mockReset(); });`;
      expect(hasHoistedPersistentMockWithoutReset(source)).toBe(false);
    },
  );

  it('keeps conditional resets in separate helper calls independent', () => {
    const source = `
      const mock = vi.hoisted(() => vi.fn().mockReturnValue('x'));
      function maybeReset(flag, whenTrue) {
        if (flag) { if (whenTrue) mock.mockReset(); }
        else { if (!whenTrue) mock.mockReset(); }
      }
      beforeEach(() => {
        maybeReset(first, true);
        maybeReset(second, false);
      });
    `;
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(true);
  });

  it.each(['null', 'false', '0', "'provided'", '{}', '[]'])(
    'does not evaluate a default initializer for a known defined value: %s',
    (argument) => {
      const source = `function build(value = vi.fn().mockReturnValue('default')) { return value; }
        const mock = vi.hoisted(() => build(${argument}));`;
      expect(hasHoistedPersistentMockWithoutReset(source)).toBe(false);
    },
  );

  it.each(['undefined', 'unknownArgument'])(
    'checks a default initializer when the argument could be undefined: %s',
    (argument) => {
      const source = `function build(value = vi.fn().mockReturnValue('default')) { return value; }
        const mock = vi.hoisted(() => build(${argument}));`;
      expect(hasHoistedPersistentMockWithoutReset(source)).toBe(true);
    },
  );

  it.each([
    "while (request.mockReturnValue('x')) { break; }",
    "do {} while (!request.mockReturnValue('x'));",
  ])('evaluates persistent setters in loop conditions: %s', (loop) => {
    const source = `const mock = vi.hoisted(() => {
      const request = vi.fn();
      ${loop}
      return request;
    });`;
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(true);
    expect(
      hasHoistedPersistentMockWithoutReset(`${source}\nbeforeEach(() => mock.mockReset());`),
    ).toBe(false);
  });

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

  it.each(['mockReturnValue', 'mockResolvedValue', 'mockRejectedValue'])(
    'allows a nested %s mock discarded and rebuilt by the outer reset',
    (method) => {
      const source = `
        const fetch = vi.hoisted(() => vi.fn().${method}({
          json: vi.fn().mockResolvedValue('original'),
        }));
        beforeEach(() => fetch.mockReset().${method}({
          json: vi.fn().mockResolvedValue('fresh'),
        }));
      `;
      expect(hasHoistedPersistentMockWithoutReset(source)).toBe(false);
    },
  );

  it.each([
    '...optional',
    '[propertyName]: inner',
    'opaque: unknownFunction(inner)',
    'getInner: () => inner',
  ])('does not discard a nested mock that could be exposed through %s', (exposure) => {
    const source = `
      const mocks = vi.hoisted(() => {
        const inner = vi.fn().mockReturnValue('x');
        const outer = vi.fn().mockReturnValue({ inner });
        const optional = flag ? { inner } : {};
        return { ${exposure}, outer };
      });
      beforeEach(() => mocks.outer.mockReset());
    `;
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(true);
    expect(
      hasHoistedPersistentMockWithoutReset(
        source.replace('mocks.outer.mockReset()', 'vi.resetAllMocks()'),
      ),
    ).toBe(false);
  });

  it('keeps uncertain exposure local to its hoisted factory', () => {
    const source = `
      const fetch = vi.hoisted(() => vi.fn().mockReturnValue({
        json: vi.fn().mockResolvedValue('original'),
      }));
      const unrelated = vi.hoisted(() => ({ ...unknownObject }));
      beforeEach(() => fetch.mockReset());
    `;
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(false);
  });

  it.each([false, true])(
    'discards overwritten nested return mocks unless separately exposed: %s',
    (exposed) => {
      const source = `
        const mocks = vi.hoisted(() => {
          const outer = vi.fn();
          const first = vi.fn().mockReturnValue('first');
          outer.mockReturnValue({ inner: first });
          const second = vi.fn().mockReturnValue('second');
          outer.mockReturnValue({ inner: second });
          return ${exposed ? '{ outer, first }' : '{ outer }'};
        });
        beforeEach(() => mocks.outer.mockReset());
      `;
      expect(hasHoistedPersistentMockWithoutReset(source)).toBe(exposed);
    },
  );

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
    ['fresh object arguments', (callee: string) => `flag ? ${callee}({}) : ${callee}({})`],
    ['fresh array arguments', (callee: string) => `flag ? ${callee}([]) : ${callee}([])`],
    [
      'object-wrapped results',
      (callee: string) => `({ value: flag ? ${callee}(flag) : ${callee}(flag) })`,
    ],
  ])('fails closed on helper expansion with %s', (_name, expression) => {
    const helpers = ["function build0() { return vi.fn().mockReturnValue('x'); }"];
    for (let depth = 1; depth <= 24; depth += 1) {
      helpers.push(`function build${depth}(flag) { return ${expression(`build${depth - 1}`)}; }`);
    }
    const source = [...helpers, 'const mock = vi.hoisted(() => build24(flag));'].join('\n');
    for (const reset of ['', 'beforeEach(() => vi.resetAllMocks());']) {
      expect(scanFixturePolicies(`${source}\n${reset}`).hoistedPersistentMock).toMatchObject([
        {
          ruleId: 'hoisted-mock-analysis-limit',
          message:
            'hoisted mock reset analysis exceeded its budget; simplify the factory or helper graph',
        },
      ]);
    }
    // Exhaustion is file-local; later files are still checked normally.
    expect(
      hasHoistedPersistentMockWithoutReset(`
        const mock = vi.hoisted(() => vi.fn().mockReturnValue('x'));
        beforeEach(() => mock.mockReset());
      `),
    ).toBe(false);
  });

  it('bounds helper call depth before exhausting the JavaScript stack', () => {
    const helpers = ["function build0() { return vi.fn().mockReturnValue('x'); }"];
    for (let depth = 1; depth <= 200; depth += 1) {
      helpers.push(`function build${depth}() { return build${depth - 1}(); }`);
    }
    expect(
      scanFixturePolicies([...helpers, 'const mock = vi.hoisted(build200);'].join('\n'))
        .hoistedPersistentMock,
    ).toMatchObject([{ ruleId: 'hoisted-mock-analysis-limit' }]);
  });

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
