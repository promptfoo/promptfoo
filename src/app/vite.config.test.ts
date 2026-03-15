import { transformAsync } from '@babel/core';
import { reactCompilerPreset } from '@vitejs/plugin-react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BabelFileResult, TransformOptions } from '@babel/core';
import type { Plugin } from 'vitest/config';

vi.mock('@babel/core', () => ({
  transformAsync: vi.fn(),
}));

vi.mock('@vitejs/plugin-react', () => ({
  default: vi.fn(() => ({ name: 'react' })),
  reactCompilerPreset: vi.fn(() => ({
    preset: () => ({ plugins: [['babel-plugin-react-compiler', {}]] }),
  })),
}));

// Recreate the plugin logic from vite.config.ts for testing
function createReactCompilerPlugin(): Plugin {
  const reactCompilerConfig = reactCompilerPreset() as {
    preset: () => { plugins: TransformOptions['plugins'] };
    rolldown?: { filter?: { code?: RegExp } };
  };
  const reactCompilerPlugins = reactCompilerConfig.preset().plugins;
  const reactCompilerCodeFilter = reactCompilerConfig.rolldown?.filter?.code;
  const reactCompilerFileFilter = /\.[jt]sx?$/;

  return {
    name: 'react-compiler',
    enforce: 'pre',
    async transform(code, id) {
      const cleanId = id.split('?')[0];

      if (
        !cleanId ||
        cleanId.includes('/node_modules/') ||
        !reactCompilerFileFilter.test(cleanId) ||
        (reactCompilerCodeFilter && !reactCompilerCodeFilter.test(code))
      ) {
        return null;
      }

      const result = await transformAsync(code, {
        filename: cleanId,
        babelrc: false,
        configFile: false,
        sourceMaps: true,
        parserOpts: {
          plugins: ['jsx', 'typescript'],
        },
        plugins: reactCompilerPlugins,
      });

      return result?.code ? { code: result.code, map: result.map } : null;
    },
  };
}

function createMockBabelResult(code: string, map: BabelFileResult['map'] | null): BabelFileResult {
  return {
    code,
    map,
    ast: null,
    metadata: {},
  };
}

describe('reactCompilerPlugin', () => {
  let plugin: Plugin;

  beforeEach(() => {
    vi.clearAllMocks();
    plugin = createReactCompilerPlugin();
  });

  describe('plugin properties', () => {
    it('has correct name', () => {
      expect(plugin.name).toBe('react-compiler');
    });

    it('has enforce: pre', () => {
      expect(plugin.enforce).toBe('pre');
    });

    it('has a transform function', () => {
      expect(plugin.transform).toBeDefined();
      expect(typeof plugin.transform).toBe('function');
    });
  });

  describe('transform function', () => {
    describe('file filtering', () => {
      it('processes .jsx files', async () => {
        const code = 'const Component = () => <div>Hello</div>;';
        const id = '/src/components/Component.jsx';
        const transformedCode =
          'const Component = () => React.createElement("div", null, "Hello");';

        vi.mocked(transformAsync).mockResolvedValue(
          createMockBabelResult(transformedCode, {
            version: 3,
            sources: [],
            names: [],
            mappings: '',
          }),
        );

        const result = await plugin.transform(code, id);

        expect(transformAsync).toHaveBeenCalledWith(code, {
          filename: id,
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
          map: { version: 3, sources: [], names: [], mappings: '' },
        });
      });

      it('processes .tsx files', async () => {
        const code = 'const Component: React.FC = () => <div>Hello</div>;';
        const id = '/src/components/Component.tsx';
        const transformedCode =
          'const Component = () => React.createElement("div", null, "Hello");';

        vi.mocked(transformAsync).mockResolvedValue(
          createMockBabelResult(transformedCode, {
            version: 3,
            sources: [],
            names: [],
            mappings: '',
          }),
        );

        const result = await plugin.transform(code, id);

        expect(transformAsync).toHaveBeenCalledWith(code, {
          filename: id,
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
          map: { version: 3, sources: [], names: [], mappings: '' },
        });
      });

      it('processes .js files', async () => {
        const code = 'const Component = () => <div>Hello</div>;';
        const id = '/src/components/Component.js';
        const transformedCode =
          'const Component = () => React.createElement("div", null, "Hello");';

        vi.mocked(transformAsync).mockResolvedValue(createMockBabelResult(transformedCode, null));

        const result = await plugin.transform(code, id);

        expect(transformAsync).toHaveBeenCalled();
        expect(result).toBeDefined();
      });

      it('processes .ts files', async () => {
        const code = 'const Component = () => <div>Hello</div>;';
        const id = '/src/components/Component.ts';
        const transformedCode =
          'const Component = () => React.createElement("div", null, "Hello");';

        vi.mocked(transformAsync).mockResolvedValue(createMockBabelResult(transformedCode, null));

        const result = await plugin.transform(code, id);

        expect(transformAsync).toHaveBeenCalled();
        expect(result).toBeDefined();
      });

      it('returns null for non-JavaScript/TypeScript files', async () => {
        const code = 'const value = 42;';
        const testCases = [
          '/path/to/file.css',
          '/path/to/file.json',
          '/path/to/file.html',
          '/path/to/file.svg',
        ];

        for (const id of testCases) {
          const result = await plugin.transform(code, id);
          expect(result).toBeNull();
        }

        expect(transformAsync).not.toHaveBeenCalled();
      });

      it('returns null for node_modules files', async () => {
        const code = 'const Component = () => <div>Hello</div>;';
        const id = '/path/to/node_modules/package/component.jsx';

        const result = await plugin.transform(code, id);

        expect(result).toBeNull();
        expect(transformAsync).not.toHaveBeenCalled();
      });

      it('strips query parameters before file extension check', async () => {
        const code = 'const Component = () => <div>Hello</div>;';
        const id = '/src/Component.jsx?hmr=123&t=456';
        const cleanId = '/src/Component.jsx';
        const transformedCode =
          'const Component = () => React.createElement("div", null, "Hello");';

        vi.mocked(transformAsync).mockResolvedValue(createMockBabelResult(transformedCode, null));

        const result = await plugin.transform(code, id);

        expect(transformAsync).toHaveBeenCalledWith(code, {
          filename: cleanId,
          babelrc: false,
          configFile: false,
          sourceMaps: true,
          parserOpts: {
            plugins: ['jsx', 'typescript'],
          },
          plugins: [['babel-plugin-react-compiler', {}]],
        });
        expect(result).toBeDefined();
      });

      it('processes files with query parameters if underlying file matches extension', async () => {
        const code = 'const Component = () => <div>Hello</div>;';
        const id = '/path/to/file.js?query=param';
        const transformedCode =
          'const Component = () => React.createElement("div", null, "Hello");';

        vi.mocked(transformAsync).mockResolvedValue(createMockBabelResult(transformedCode, null));

        const result = await plugin.transform(code, id);

        expect(transformAsync).toHaveBeenCalled();
        expect(result).toBeDefined();
      });

      it('returns null for files with query parameters if underlying file does not match extension', async () => {
        const code = 'const Component = () => <div>Hello</div>;';
        const id = '/path/to/file.css?query=param';

        const result = await plugin.transform(code, id);

        expect(result).toBeNull();
        expect(transformAsync).not.toHaveBeenCalled();
      });

      it('returns null when cleanId is empty string', async () => {
        const code = 'const Component = () => <div>Hello</div>;';
        const id = '?only-query';

        const result = await plugin.transform(code, id);

        expect(result).toBeNull();
        expect(transformAsync).not.toHaveBeenCalled();
      });
    });

    describe('babel transformation', () => {
      it('returns null when transformAsync returns null', async () => {
        const code = 'const Component = () => <div>Hello</div>;';
        const id = '/src/Component.jsx';

        vi.mocked(transformAsync).mockResolvedValue(null);

        const result = await plugin.transform(code, id);

        expect(result).toBeNull();
      });

      it('returns null when transformAsync returns result without code', async () => {
        const code = 'const Component = () => <div>Hello</div>;';
        const id = '/src/Component.jsx';

        vi.mocked(transformAsync).mockResolvedValue(
          createMockBabelResult('', {
            version: 3,
            sources: [],
            names: [],
            mappings: '',
          }),
        );

        const result = await plugin.transform(code, id);

        expect(result).toBeNull();
      });

      it('passes correct babel configuration', async () => {
        const code = 'export default function App() { return <div>Test</div>; }';
        const id = '/src/App.tsx';
        const transformedCode =
          'export default function App() { return React.createElement("div", null, "Test"); }';

        vi.mocked(transformAsync).mockResolvedValue(createMockBabelResult(transformedCode, null));

        await plugin.transform(code, id);

        expect(transformAsync).toHaveBeenCalledWith(code, {
          filename: id,
          babelrc: false,
          configFile: false,
          sourceMaps: true,
          parserOpts: {
            plugins: ['jsx', 'typescript'],
          },
          plugins: [['babel-plugin-react-compiler', {}]],
        });
      });

      it('returns both code and map when transform succeeds with sourcemap', async () => {
        const code = 'const Component = () => <div>Hello</div>;';
        const id = '/src/Component.jsx';
        const transformedCode =
          'const Component = () => React.createElement("div", null, "Hello");';
        const sourceMap = {
          version: 3,
          sources: ['Component.jsx'],
          names: ['Component'],
          mappings: 'AAAA,MAAM,SAAS',
        };

        vi.mocked(transformAsync).mockResolvedValue(
          createMockBabelResult(transformedCode, sourceMap),
        );

        const result = await plugin.transform(code, id);

        expect(result).toEqual({
          code: transformedCode,
          map: sourceMap,
        });
      });
    });

    describe('edge cases', () => {
      it('processes files with .ts extension even in directories with .jsx in name', async () => {
        const code = 'const value = 42;';
        const id = '/src/some.jsx.component/file.ts';
        const transformedCode = 'const value = 42;';

        vi.mocked(transformAsync).mockResolvedValue(createMockBabelResult(transformedCode, null));

        const result = await plugin.transform(code, id);

        // Should process because file.ts matches the file filter
        expect(transformAsync).toHaveBeenCalled();
        expect(result).toBeDefined();
      });

      it('processes files with multiple dots in filename', async () => {
        const code = 'const Component = () => <div>Hello</div>;';
        const id = '/src/my.component.test.jsx';
        const transformedCode =
          'const Component = () => React.createElement("div", null, "Hello");';

        vi.mocked(transformAsync).mockResolvedValue(createMockBabelResult(transformedCode, null));

        const result = await plugin.transform(code, id);

        expect(transformAsync).toHaveBeenCalled();
        expect(result).toBeDefined();
      });

      it('handles node_modules check case-sensitively', async () => {
        const code = 'const Component = () => <div>Hello</div>;';
        const id = '/src/NODE_MODULES/Component.jsx';
        const transformedCode =
          'const Component = () => React.createElement("div", null, "Hello");';

        vi.mocked(transformAsync).mockResolvedValue(createMockBabelResult(transformedCode, null));

        const result = await plugin.transform(code, id);

        // Should process because NODE_MODULES (uppercase) doesn't match node_modules
        expect(transformAsync).toHaveBeenCalled();
        expect(result).toBeDefined();
      });

      it('rejects files in nested node_modules', async () => {
        const code = 'const Component = () => <div>Hello</div>;';
        const id = '/project/node_modules/@scope/package/node_modules/dep/index.jsx';

        const result = await plugin.transform(code, id);

        expect(result).toBeNull();
        expect(transformAsync).not.toHaveBeenCalled();
      });

      it('handles Windows-style paths with backslashes', async () => {
        const code = 'const Component = () => <div>Hello</div>;';
        const id = 'C:\\projects\\src\\Component.jsx';
        const transformedCode =
          'const Component = () => React.createElement("div", null, "Hello");';

        vi.mocked(transformAsync).mockResolvedValue(createMockBabelResult(transformedCode, null));

        const result = await plugin.transform(code, id);

        expect(transformAsync).toHaveBeenCalled();
        expect(result).toBeDefined();
      });
    });
  });
});
