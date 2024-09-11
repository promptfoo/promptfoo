import * as index from '../src/index';

describe('index.ts exports', () => {
  const expectedNamedExports = [
    'assertions',
    'cache',
    'evaluate',
    'generateTable',
    'isApiProvider',
    'isGradingResult',
    'isProviderOptions',
    'providers',
    'redteam',
  ];

  it('should export all expected named modules', () => {
    expectedNamedExports.forEach((exportName) => {
      expect(index).toHaveProperty(exportName);
    });
  });

  it('redteam should have expected properties', () => {
    expect(index.redteam).toEqual(
      expect.objectContaining({
        Extractors: expect.objectContaining({
          extractEntities: expect.anything(),
          extractSystemPurpose: expect.anything(),
        }),
        Plugins: expect.anything(),
        Strategies: expect.anything(),
      }),
    );
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
