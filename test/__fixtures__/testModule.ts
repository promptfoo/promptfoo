// TypeScript test module (ESM format)
export const testFunction = (): string => 'ts test result';
export const namedExport: string = 'ts named export';

interface TestModule {
  testFunction: () => string;
  defaultProp: string;
}

const defaultExport: TestModule = {
  testFunction: () => 'ts default test result',
  defaultProp: 'ts default property',
};

export default defaultExport;
