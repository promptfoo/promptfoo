import { vi } from 'vitest';

const exactTransformHandlers = new Map<string, (input: any) => any>([
  ['output + " postprocessed"', (input) => input + ' postprocessed'],
  ['JSON.parse(output).value', parseJsonValueTransform],
  ['`Transformed: ${output}`', (input) => `Transformed: ${input}`],
  ['`ProviderTransformed: ${output}`', (input) => `ProviderTransformed: ${input}`],
  ['`Provider: ${output}`', (input) => `Provider: ${input}`],
  ['`Test: ${output}`', (input) => `Test: ${input}`],
  ['"testTransformed " + output', (input) => 'testTransformed ' + input],
  ['"defaultTestTransformed " + output', (input) => 'defaultTestTransformed ' + input],
  ['"Test: " + output', (input) => 'Test: ' + input],
  ['"Provider: " + output', (input) => 'Provider: ' + input],
  ['"Transform: " + output', (input) => 'Transform: ' + input],
  ['output + "-provider-test"', (input) => input + '-provider-test'],
  ['output + "-provider"', (input) => input + '-provider'],
  ['output + "-test"', (input) => input + '-test'],
  ['`Transform: ${output}`', (input) => `Transform: ${input}`],
  ['`Postprocess: ${output}`', (input) => `Postprocess: ${input}`],
]);

function parseJsonValueTransform(input: any) {
  try {
    return JSON.parse(input).value;
  } catch {
    return input;
  }
}

function mockTransformVars(code: string, input: any, context?: any) {
  if (code.includes('vars.transformed = true')) {
    return { ...input, transformed: true };
  }
  if (code.includes('vars.defaultTransform = true')) {
    return { ...input, defaultTransform: true };
  }
  if (code.includes('{ ...vars') && code.includes('toUpperCase()')) {
    return { ...input, name: input.name?.toUpperCase() };
  }
  if (code.includes('{ ...vars') && code.includes('vars.age + 5')) {
    return { ...input, age: (input.age ?? 0) + 5 };
  }
  if (code.includes('return {') && code.includes('context.uuid')) {
    return {
      ...input,
      id: context?.uuid || 'mock-uuid',
      hasPrompt: Boolean(context?.prompt),
    };
  }
  if (code.includes('test2UpperCase: vars.test2.toUpperCase()')) {
    return { ...input, test2UpperCase: input.test2?.toUpperCase() };
  }
}

function mockMetadataTransform(code: string, input: any, context?: any) {
  if (!code.includes('context?.metadata')) {
    return undefined;
  }
  if (code.includes('Output:') && context?.metadata) {
    return `Output: ${input}, Metadata: ${JSON.stringify(context.metadata)}`;
  }
  if (code.includes('Has metadata') && context?.metadata) {
    return `Has metadata: ${input}`;
  }
  if (code.includes('No metadata') && !context?.metadata) {
    return `No metadata: ${input}`;
  }
  if (
    code.includes('Empty metadata') &&
    context?.metadata &&
    Object.keys(context.metadata).length === 0
  ) {
    return `Empty metadata: ${input}`;
  }
  if (code.includes('All context') && context?.vars && context?.prompt && context?.metadata) {
    return `All context: ${input}`;
  }
  if (
    code.includes('Missing context') &&
    !(context?.vars && context?.prompt && context?.metadata)
  ) {
    return `Missing context: ${input}`;
  }
}

async function mockTransform(code: unknown, input: any, context?: any) {
  if (typeof code !== 'string') {
    return input;
  }

  const exactHandler = exactTransformHandlers.get(code);
  if (exactHandler) {
    return exactHandler(input);
  }

  return (
    mockTransformVars(code, input, context) ?? mockMetadataTransform(code, input, context) ?? input
  );
}

vi.mock('../../src/util/transform', () => ({
  TransformInputType: {
    OUTPUT: 'output',
    VARS: 'vars',
  },
  // Provide a process shim for ESM compatibility in inline JavaScript code
  getProcessShim: vi.fn().mockReturnValue(process),
  transform: vi.fn().mockImplementation(mockTransform),
}));

vi.mock('../../src/util/fileReference', async () => {
  const actual = await vi.importActual<typeof import('../../src/util/fileReference')>(
    '../../src/util/fileReference',
  );
  return {
    ...actual,
    processConfigFileReferences: vi.fn().mockImplementation(async (config) => {
      if (
        typeof config === 'object' &&
        config !== null &&
        config.tests &&
        Array.isArray(config.tests)
      ) {
        const result = {
          ...config,
          tests: config.tests.map((test: any) => {
            return {
              ...test,
              vars:
                test.vars.var1 === 'file://test/fixtures/test_file.txt'
                  ? {
                      var1: '<h1>Sample Report</h1><p>This is a test report with some data for the year 2023.</p>',
                    }
                  : test.vars,
            };
          }),
        };
        return result;
      }
      return config;
    }),
  };
});

vi.mock('proxy-agent', () => ({
  ProxyAgent: vi.fn().mockImplementation(() => ({})),
}));
vi.mock('glob', () => {
  const globSync = vi.fn().mockImplementation((pattern) => {
    if (pattern.includes('test/fixtures/test_file.txt')) {
      return [pattern];
    }
    return [];
  });
  const hasMagic = vi.fn((pattern: string | string[]) => {
    const p = Array.isArray(pattern) ? pattern.join('') : pattern;
    return p.includes('*') || p.includes('?') || p.includes('[') || p.includes('{');
  });
  const glob = Object.assign(vi.fn(), { globSync, hasMagic, sync: globSync });
  return {
    default: { globSync, hasMagic },
    glob,
    globSync,
    hasMagic,
  };
});

vi.mock('../../src/esm', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    importModule: vi.fn(),
  };
});

vi.mock('../../src/evaluatorHelpers', async () => {
  const actual = await vi.importActual<typeof import('../../src/evaluatorHelpers')>(
    '../../src/evaluatorHelpers',
  );
  return {
    ...actual,
    runExtensionHook: vi.fn().mockImplementation((_extensions, _hookName, context) => context),
  };
});

vi.mock('../../src/cliState', () => ({
  __esModule: true,
  default: {
    resume: false,
    basePath: '',
    webUI: false,
  },
}));

vi.mock('../../src/models/prompt', () => ({
  generateIdFromPrompt: vi.fn((prompt) => `prompt-${prompt.label || 'default'}`),
}));

vi.mock('../../src/util/time', async () => {
  const actual = await vi.importActual<typeof import('../../src/util/time')>('../../src/util/time');
  return {
    ...actual,
    sleep: vi.fn(),
  };
});

vi.mock('../../src/util/fileExtensions', async () => {
  const actual = await vi.importActual<typeof import('../../src/util/fileExtensions')>(
    '../../src/util/fileExtensions',
  );
  return {
    ...actual,
    isImageFile: vi
      .fn()
      .mockImplementation((filePath) => filePath.endsWith('.jpg') || filePath.endsWith('.png')),
    isVideoFile: vi.fn().mockImplementation((filePath) => filePath.endsWith('.mp4')),
    isAudioFile: vi.fn().mockImplementation((filePath) => filePath.endsWith('.mp3')),
    isJavascriptFile: vi.fn().mockReturnValue(false),
  };
});

vi.mock('../../src/util/functions/loadFunction', async () => {
  const actual = await vi.importActual<typeof import('../../src/util/functions/loadFunction')>(
    '../../src/util/functions/loadFunction',
  );
  return {
    ...actual,
    loadFunction: vi.fn().mockImplementation((options) => {
      if (options.filePath.includes('scoring')) {
        return Promise.resolve((_metrics: Record<string, number>) => ({
          pass: true,
          score: 0.75,
          reason: 'Custom scoring reason',
        }));
      }
      return Promise.resolve(() => {});
    }),
  };
});
