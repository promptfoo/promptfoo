import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BabelFileResult } from '@babel/core';

vi.mock('@babel/core', () => ({
  transformAsync: vi.fn(),
}));

vi.mock('@vitejs/plugin-react', () => ({
  reactCompilerPreset: vi.fn(() => ({
    preset: () => ({ plugins: [['babel-plugin-react-compiler', {}]] }),
  })),
}));

function createMockBabelResult(code: string, map: BabelFileResult['map'] | null): BabelFileResult {
  return {
    code,
    map,
    ast: null,
    metadata: {},
  };
}

describe('reactCompilerPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('skips files from node_modules', async () => {
    const { reactCompilerPlugin } = await import('./vite.shared');
    const { transformAsync } = await import('@babel/core');

    const result = await reactCompilerPlugin().transform?.(
      'const Component = () => <div>Hello</div>;',
      '/project/node_modules/pkg/component.jsx',
    );

    expect(result).toBeNull();
    expect(transformAsync).not.toHaveBeenCalled();
  });

  it('skips files from node_modules with Windows path separators', async () => {
    const { reactCompilerPlugin } = await import('./vite.shared');
    const { transformAsync } = await import('@babel/core');

    const result = await reactCompilerPlugin().transform?.(
      'const Component = () => <div>Hello</div>;',
      'C:\\project\\node_modules\\pkg\\component.jsx',
    );

    expect(result).toBeNull();
    expect(transformAsync).not.toHaveBeenCalled();
  });

  it('passes the expected Babel configuration for app source files', async () => {
    const { reactCompilerPlugin } = await import('./vite.shared');
    const { transformAsync } = await import('@babel/core');
    const transformedCode = 'const Component = () => React.createElement("div", null, "Hello");';

    vi.mocked(transformAsync).mockResolvedValue(createMockBabelResult(transformedCode, null));

    const result = await reactCompilerPlugin().transform?.(
      'const Component = () => <div>Hello</div>;',
      '/project/src/Component.tsx?query=1',
    );

    expect(transformAsync).toHaveBeenCalledWith('const Component = () => <div>Hello</div>;', {
      filename: '/project/src/Component.tsx',
      babelrc: false,
      configFile: false,
      sourceMaps: true,
      parserOpts: {
        plugins: ['jsx', 'typescript'],
      },
      plugins: [['babel-plugin-react-compiler', {}]],
    });
    expect(result).toEqual({
      code: transformedCode,
      map: null,
    });
  });
});
