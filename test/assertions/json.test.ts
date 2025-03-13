import { getAjv, resetAjv } from '../../src/assertions/json';

describe('getAjv', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
  });

  beforeEach(() => {
    delete process.env.PROMPTFOO_DISABLE_AJV_STRICT_MODE;
    resetAjv();
  });

  afterEach(() => {
    delete process.env.PROMPTFOO_DISABLE_AJV_STRICT_MODE;
  });

  it('should create an Ajv instance with default options', () => {
    const ajv = getAjv();
    expect(ajv).toBeDefined();
    expect(ajv.opts.strictSchema).toBe(true);
  });

  it('should disable strict mode when PROMPTFOO_DISABLE_AJV_STRICT_MODE is set', () => {
    process.env.PROMPTFOO_DISABLE_AJV_STRICT_MODE = 'true';
    const ajv = getAjv();
    expect(ajv.opts.strictSchema).toBe(false);
  });

  it('should add formats to the Ajv instance', () => {
    const ajv = getAjv();
    expect(ajv.formats).toBeDefined();
    expect(Object.keys(ajv.formats)).not.toHaveLength(0);
  });

  it('should reuse the same instance on subsequent calls', () => {
    const firstInstance = getAjv();
    const secondInstance = getAjv();
    expect(firstInstance).toBe(secondInstance);
  });
});
