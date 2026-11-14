import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockReactCompilerPreset = vi.hoisted(() => vi.fn());

vi.mock('@vitejs/plugin-react', () => ({
  reactCompilerPreset: mockReactCompilerPreset,
}));

describe('reactCompilerPlugin', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const { reactCompilerPreset } =
      await vi.importActual<typeof import('@vitejs/plugin-react')>('@vitejs/plugin-react');
    mockReactCompilerPreset.mockReset().mockImplementation(reactCompilerPreset);
  });

  it('skips files from node_modules', async () => {
    const { reactCompilerPlugin } = await import('./vite.shared');

    const result = await reactCompilerPlugin().transform?.(
      'const Component = () => <div>Hello</div>;',
      '/project/node_modules/pkg/component.jsx',
    );

    expect(result).toBeNull();
  });

  it('skips files from node_modules with Windows path separators', async () => {
    const { reactCompilerPlugin } = await import('./vite.shared');

    const result = await reactCompilerPlugin().transform?.(
      'const Component = () => <div>Hello</div>;',
      'C:\\project\\node_modules\\pkg\\component.jsx',
    );

    expect(result).toBeNull();
  });

  it('skips files with centralized React Compiler opt-outs', async () => {
    const { reactCompilerPlugin } = await import('./vite.shared');

    const result = await reactCompilerPlugin().transform?.(
      'function ResultsTable() { return <div>Hello</div>; }',
      '/project/src/app/src/pages/eval/components/ResultsTable.tsx?query=1',
    );

    expect(result).toBeNull();
  });

  it.each([
    ['ordinary props', '{ value }: { value: string }'],
    ['defaulted props', '{ value = "default" }: { value?: string }'],
  ])('memoizes TSX with %s and returns its original source map', async (_name, props) => {
    const { reactCompilerPlugin } = await import('./vite.shared');
    const code = `export function Component(${props}) { return <span>{value}</span>; }`;
    const result = await reactCompilerPlugin().transform?.(
      code,
      '/project/src/Component.tsx?query=1',
    );

    expect(result.code).toContain('react/compiler-runtime');
    expect(JSON.parse(result.map)).toMatchObject({
      sources: ['Component.tsx'],
      sourcesContent: [code],
      mappings: expect.any(String),
    });
  });

  it('preserves dynamic imports alongside optimized components', async () => {
    const { reactCompilerPlugin } = await import('./vite.shared');
    const code = `const load = () => import("./dialog");
      export function Component() { return <button onClick={load}>Open</button>; }`;
    const result = await reactCompilerPlugin().transform?.(code, '/project/src/Component.tsx');

    expect(result.code).toContain('react/compiler-runtime');
    expect(result.code).toMatch(/import\(["']\.\/dialog["']\)/);
  });

  it('disables the compiler when preset creation fails', async () => {
    mockReactCompilerPreset.mockImplementation(() => {
      throw new Error('plugin-react preset changed');
    });

    const { reactCompilerPlugin } = await import('./vite.shared');
    const plugin = reactCompilerPlugin();
    const warn = vi.fn();

    if (typeof plugin.buildStart === 'function') {
      plugin.buildStart.call({ warn } as never, {} as never);
    }
    const result = await plugin.transform?.(
      'const Component = () => <div>Hello</div>;',
      '/project/src/Component.tsx',
    );

    expect(result).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('React Compiler will be disabled'));
  });

  it('disables the compiler when preset extraction fails', async () => {
    mockReactCompilerPreset.mockReturnValue({
      preset: () => {
        throw new Error('preset extraction changed');
      },
    });

    const { reactCompilerPlugin } = await import('./vite.shared');

    const result = await reactCompilerPlugin().transform?.(
      'const Component = () => <div>Hello</div>;',
      '/project/src/Component.tsx',
    );

    expect(result).toBeNull();
  });
});
