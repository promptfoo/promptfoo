import * as index from '../src/index';

describe('index.ts exports', () => {
  const expectedNamedExports = [
    'assertions',
    'cache',
    'evaluate',
    'providers',
    'redteam',
    'generateTable',
    'isApiProvider',
    'isGradingResult',
    'isProviderOptions',
  ];

  const expectedSchemaExports = [
    'AssertionSchema',
    'AtomicTestCaseSchema',
    'BaseAssertionTypesSchema',
    'CommandLineOptionsSchema',
    'CompletedPromptSchema',
    'DerivedMetricSchema',
    'OutputConfigSchema',
    'OutputFileExtension',
    'ScenarioSchema',
    'TestCaseSchema',
    'TestCaseWithVarsFileSchema',
    'TestCasesWithMetadataPromptSchema',
    'TestCasesWithMetadataSchema',
    'TestSuiteConfigSchema',
    'TestSuiteSchema',
    'UnifiedConfigSchema',
    'VarsSchema',
  ];

  it('should export all expected named modules', () => {
    expectedNamedExports.forEach((exportName) => {
      expect(index).toHaveProperty(exportName);
    });
  });

  it('should export all expected schemas', () => {
    expectedSchemaExports.forEach((exportName) => {
      expect(index).toHaveProperty(exportName);
    });
  });

  it('should not have unexpected exports', () => {
    const actualExports = Object.keys(index).filter((key) => key !== 'default');
    const expectedExports = [...expectedNamedExports, ...expectedSchemaExports];
    expect(actualExports).toHaveLength(expectedExports.length);
    expect(actualExports).toEqual(expect.arrayContaining(expectedExports));
  });

  it('redteam should have expected properties', () => {
    expect(index.redteam).toHaveProperty('Extractors');
    expect(index.redteam).toHaveProperty('Plugins');
    expect(index.redteam).toHaveProperty('Strategies');

    expect(index.redteam.Extractors).toHaveProperty('extractEntities');
    expect(index.redteam.Extractors).toHaveProperty('extractSystemPurpose');
  });

  it('default export should match named exports', () => {
    expect(index.default).toEqual({
      assertions: index.assertions,
      cache: index.cache,
      evaluate: index.evaluate,
      providers: index.providers,
      redteam: index.redteam,
    });
  });
});
