import { createAjv } from '../../src/assertions/json';

describe('createAjv', () => {
  beforeAll(() => {
    delete process.env.PROMPTFOO_DISABLE_AJV_STRICT_MODE;
    jest.resetModules();
  });

  afterAll(() => {
    delete process.env.PROMPTFOO_DISABLE_AJV_STRICT_MODE;
  });

  it('should create an Ajv instance with default options', () => {
    const ajv = createAjv();
    expect(ajv).toBeDefined();
    expect(ajv.opts.strictSchema).toBe(true);
  });

  it('should disable strict mode when PROMPTFOO_DISABLE_AJV_STRICT_MODE is set', () => {
    process.env.PROMPTFOO_DISABLE_AJV_STRICT_MODE = 'true';
    const ajv = createAjv();
    expect(ajv.opts.strictSchema).toBe(false);
  });

  it('should add formats to the Ajv instance', () => {
    const ajv = createAjv();
    expect(ajv.formats).toBeDefined();
    expect(Object.keys(ajv.formats)).not.toHaveLength(0);
  });
});
