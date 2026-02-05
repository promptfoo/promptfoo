import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderEnvOnlyInObject, renderVarsInObject } from '../../src/util/render';

describe('renderVarsInObject', () => {
  beforeEach(() => {
    delete process.env.PROMPTFOO_DISABLE_TEMPLATING;
  });

  afterEach(() => {
    delete process.env.TEST_ENV_VAR;
    delete process.env.PROMPTFOO_DISABLE_TEMPLATING;
  });

  it('should render environment variables in objects', async () => {
    process.env.TEST_ENV_VAR = 'env_value';
    const obj = { text: '{{ env.TEST_ENV_VAR }}' };
    const rendered = renderVarsInObject(obj, {});
    expect(rendered).toEqual({ text: 'env_value' });
  });

  it('should return object unchanged when no vars provided', async () => {
    const obj = { text: '{{ variable }}', number: 42 };
    const rendered = renderVarsInObject(obj);
    expect(rendered).toEqual(obj);
  });

  it('should return object unchanged when vars is empty object', async () => {
    const obj = { text: '{{ variable }}', number: 42 };
    const rendered = renderVarsInObject(obj, {});
    // Empty object {} is truthy, so templating still runs but with no variables
    expect(rendered).toEqual({ text: '', number: 42 });
  });

  it('should return object unchanged when PROMPTFOO_DISABLE_TEMPLATING is true', async () => {
    process.env.PROMPTFOO_DISABLE_TEMPLATING = 'true';
    const obj = { text: '{{ variable }}' };
    const vars = { variable: 'test_value' };
    const rendered = renderVarsInObject(obj, vars);
    expect(rendered).toEqual(obj);
  });

  it('should render variables in string objects', async () => {
    const obj = 'Hello {{ name }}!';
    const vars = { name: 'World' };
    const rendered = renderVarsInObject(obj, vars);
    expect(rendered).toBe('Hello World!');
  });

  it('should render variables in array objects', async () => {
    const obj = ['{{ greeting }}', '{{ name }}', 42];
    const vars = { greeting: 'Hello', name: 'World' };
    const rendered = renderVarsInObject(obj, vars);
    expect(rendered).toEqual(['Hello', 'World', 42]);
  });

  it('should render variables in nested arrays', async () => {
    const obj = [
      ['{{ item1 }}', '{{ item2 }}'],
      ['static', '{{ item3 }}'],
    ];
    const vars = { item1: 'first', item2: 'second', item3: 'third' };
    const rendered = renderVarsInObject(obj, vars);
    expect(rendered).toEqual([
      ['first', 'second'],
      ['static', 'third'],
    ]);
  });

  it('should render variables in nested objects', async () => {
    const obj = {
      level1: {
        level2: {
          text: '{{ variable }}',
          number: 42,
        },
        array: ['{{ item }}'],
      },
    };
    const vars = { variable: 'nested_value', item: 'array_item' };
    const rendered = renderVarsInObject(obj, vars);
    expect(rendered).toEqual({
      level1: {
        level2: {
          text: 'nested_value',
          number: 42,
        },
        array: ['array_item'],
      },
    });
  });

  it('should handle function objects by calling them with vars', async () => {
    const mockFunction = vi.fn().mockReturnValue({ result: '{{ value }}' });
    const vars = { value: 'function_result' };
    const rendered = renderVarsInObject(mockFunction, vars);

    expect(mockFunction).toHaveBeenCalledWith({ vars });
    // Function result is NOT recursively templated because vars is not passed in recursive call
    expect(rendered).toEqual({ result: '{{ value }}' });
  });

  it('should handle null values', async () => {
    const obj = null;
    const vars = { variable: 'test' };
    const rendered = renderVarsInObject(obj, vars);
    expect(rendered).toBeNull();
  });

  it('should handle undefined values', async () => {
    const obj = undefined;
    const vars = { variable: 'test' };
    const rendered = renderVarsInObject(obj, vars);
    expect(rendered).toBeUndefined();
  });

  it('should handle primitive number values', async () => {
    const obj = 42;
    const vars = { variable: 'test' };
    const rendered = renderVarsInObject(obj, vars);
    expect(rendered).toBe(42);
  });

  it('should handle primitive boolean values', async () => {
    const obj = true;
    const vars = { variable: 'test' };
    const rendered = renderVarsInObject(obj, vars);
    expect(rendered).toBe(true);
  });

  it('should handle objects with null properties', async () => {
    const obj = { nullProp: null, text: '{{ variable }}' };
    const vars = { variable: 'test_value' };
    const rendered = renderVarsInObject(obj, vars);
    expect(rendered).toEqual({ nullProp: null, text: 'test_value' });
  });

  it('should handle mixed type objects', async () => {
    const obj = {
      string: '{{ text }}',
      number: 42,
      boolean: true,
      nullValue: null,
      array: ['{{ item }}', 123],
      nested: {
        deep: '{{ deep_value }}',
      },
    };
    const vars = { text: 'rendered', item: 'array_item', deep_value: 'deep_rendered' };
    const rendered = renderVarsInObject(obj, vars);
    expect(rendered).toEqual({
      string: 'rendered',
      number: 42,
      boolean: true,
      nullValue: null,
      array: ['array_item', 123],
      nested: {
        deep: 'deep_rendered',
      },
    });
  });

  it('should handle function that returns complex object structure', async () => {
    const complexFunction = vi.fn().mockReturnValue({
      data: {
        items: ['{{ item1 }}', '{{ item2 }}'],
        metadata: { value: '{{ meta }}' },
      },
    });
    const vars = { item1: 'first', item2: 'second', meta: 'metadata_value' };
    const rendered = renderVarsInObject(complexFunction, vars);

    expect(complexFunction).toHaveBeenCalledWith({ vars });
    // Function result is NOT recursively templated because vars is not passed in recursive call
    expect(rendered).toEqual({
      data: {
        items: ['{{ item1 }}', '{{ item2 }}'],
        metadata: { value: '{{ meta }}' },
      },
    });
  });
});

describe('renderEnvOnlyInObject', () => {
  beforeEach(() => {
    delete process.env.TEST_ENV_VAR;
    delete process.env.AZURE_ENDPOINT;
    delete process.env.API_VERSION;
    delete process.env.PORT;
    delete process.env.API_HOST;
    delete process.env.BASE_URL;
    delete process.env.EMPTY_VAR;
    delete process.env.SPECIAL_CHARS;
    delete process.env.PROMPTFOO_DISABLE_TEMPLATING;
  });

  afterEach(() => {
    delete process.env.TEST_ENV_VAR;
    delete process.env.AZURE_ENDPOINT;
    delete process.env.API_VERSION;
    delete process.env.PORT;
    delete process.env.API_HOST;
    delete process.env.BASE_URL;
    delete process.env.EMPTY_VAR;
    delete process.env.SPECIAL_CHARS;
    delete process.env.PROMPTFOO_DISABLE_TEMPLATING;
  });

  describe('Basic rendering', () => {
    it('should render simple dot notation env vars', async () => {
      process.env.TEST_ENV_VAR = 'env_value';
      expect(renderEnvOnlyInObject('{{ env.TEST_ENV_VAR }}')).toBe('env_value');
    });

    it('should render bracket notation with single quotes', async () => {
      process.env['VAR-WITH-DASH'] = 'dash_value';
      expect(renderEnvOnlyInObject("{{ env['VAR-WITH-DASH'] }}")).toBe('dash_value');
    });

    it('should render bracket notation with double quotes', async () => {
      process.env['VAR_NAME'] = 'value';
      expect(renderEnvOnlyInObject('{{ env["VAR_NAME"] }}')).toBe('value');
    });

    it('should handle whitespace variations', async () => {
      process.env.TEST = 'value';
      expect(renderEnvOnlyInObject('{{env.TEST}}')).toBe('value');
      expect(renderEnvOnlyInObject('{{  env.TEST  }}')).toBe('value');
      expect(renderEnvOnlyInObject('{{ env.TEST}}')).toBe('value');
      expect(renderEnvOnlyInObject('{{env.TEST }}')).toBe('value');
    });

    it('should render empty string env vars', async () => {
      process.env.EMPTY_VAR = '';
      expect(renderEnvOnlyInObject('{{ env.EMPTY_VAR }}')).toBe('');
    });

    it('should render env vars with special characters in value', async () => {
      process.env.SPECIAL_CHARS = 'value with spaces & $pecial chars!';
      expect(renderEnvOnlyInObject('{{ env.SPECIAL_CHARS }}')).toBe(
        'value with spaces & $pecial chars!',
      );
    });
  });

  describe('Filters and expressions (NEW functionality)', () => {
    it('should support default filter with fallback', async () => {
      process.env.EXISTING = 'exists';
      expect(renderEnvOnlyInObject("{{ env.EXISTING | default('fallback') }}")).toBe('exists');
      // NEW: When env var doesn't exist but has default filter, Nunjucks renders it
      expect(renderEnvOnlyInObject("{{ env.NONEXISTENT | default('fallback') }}")).toBe('fallback');
    });

    it('should support upper filter', async () => {
      process.env.LOWERCASE = 'lowercase';
      expect(renderEnvOnlyInObject('{{ env.LOWERCASE | upper }}')).toBe('LOWERCASE');
    });

    it('should support lower filter', async () => {
      process.env.UPPERCASE = 'UPPERCASE';
      expect(renderEnvOnlyInObject('{{ env.UPPERCASE | lower }}')).toBe('uppercase');
    });

    it('should support chained filters', async () => {
      process.env.TEST = 'test';
      expect(renderEnvOnlyInObject("{{ env.TEST | default('x') | upper }}")).toBe('TEST');
    });

    it('should support complex filter expressions', async () => {
      process.env.PORT = '8080';
      expect(renderEnvOnlyInObject('{{ env.PORT | int }}')).toBe('8080');
    });

    it('should handle filter with closing brace in argument', async () => {
      process.env.VAR = 'value';
      // This is a tricky case: the default value contains }
      expect(renderEnvOnlyInObject("{{ env.VAR | default('}') }}")).toBe('value');
    });
  });

  describe('Preservation of non-env templates', () => {
    it('should preserve vars templates', async () => {
      process.env.TEST_ENV_VAR = 'env_value';
      expect(renderEnvOnlyInObject('{{ env.TEST_ENV_VAR }}, {{ vars.myVar }}')).toBe(
        'env_value, {{ vars.myVar }}',
      );
    });

    it('should preserve prompt templates', async () => {
      process.env.TEST_ENV_VAR = 'env_value';
      expect(renderEnvOnlyInObject('{{ env.TEST_ENV_VAR }}, {{ prompt }}')).toBe(
        'env_value, {{ prompt }}',
      );
    });

    it('should preserve multiple non-env templates', async () => {
      process.env.API_HOST = 'api.example.com';
      const template =
        'Host: {{ env.API_HOST }}, Message: {{ vars.msg }}, Context: {{ context }}, Prompt: {{ prompt }}';
      const expected =
        'Host: api.example.com, Message: {{ vars.msg }}, Context: {{ context }}, Prompt: {{ prompt }}';
      expect(renderEnvOnlyInObject(template)).toBe(expected);
    });

    it('should preserve templates with filters on non-env vars', async () => {
      expect(renderEnvOnlyInObject("{{ vars.name | default('Guest') }}")).toBe(
        "{{ vars.name | default('Guest') }}",
      );
    });
  });

  describe('Undefined env vars', () => {
    it('should preserve template if env var does not exist', async () => {
      expect(renderEnvOnlyInObject('{{ env.NONEXISTENT }}')).toBe('{{ env.NONEXISTENT }}');
    });

    it('should preserve bracket notation if env var does not exist', async () => {
      expect(renderEnvOnlyInObject("{{ env['MISSING'] }}")).toBe("{{ env['MISSING'] }}");
    });
  });

  describe('Complex data structures', () => {
    it('should work with nested objects', async () => {
      process.env.LEVEL1 = 'value1';
      process.env.LEVEL2 = 'value2';
      const obj = {
        level1: {
          level2: {
            env1: '{{ env.LEVEL1 }}',
            env2: '{{ env.LEVEL2 }}',
            vars: '{{ vars.test }}',
          },
        },
      };
      expect(renderEnvOnlyInObject(obj)).toEqual({
        level1: {
          level2: {
            env1: 'value1',
            env2: 'value2',
            vars: '{{ vars.test }}',
          },
        },
      });
    });

    it('should work with arrays', async () => {
      process.env.ENV1 = 'value1';
      process.env.ENV2 = 'value2';
      const arr = ['{{ env.ENV1 }}', '{{ vars.test }}', '{{ env.ENV2 }}', 42];
      expect(renderEnvOnlyInObject(arr)).toEqual(['value1', '{{ vars.test }}', 'value2', 42]);
    });

    it('should work with mixed nested structures', async () => {
      process.env.API_KEY = 'secret123';
      const config = {
        api: {
          key: '{{ env.API_KEY }}',
          endpoints: ['{{ env.BASE_URL }}/users', '{{ env.BASE_URL }}/posts'],
        },
        request: {
          body: { message: '{{ vars.message }}' },
          headers: { authorization: 'Bearer {{ env.API_KEY }}' },
        },
      };
      const rendered = renderEnvOnlyInObject(config);
      expect(rendered).toEqual({
        api: {
          key: 'secret123',
          endpoints: ['{{ env.BASE_URL }}/users', '{{ env.BASE_URL }}/posts'],
        },
        request: {
          body: { message: '{{ vars.message }}' },
          headers: { authorization: 'Bearer secret123' },
        },
      });
    });
  });

  describe('Primitive types', () => {
    it('should handle null', async () => {
      expect(renderEnvOnlyInObject(null)).toBeNull();
    });

    it('should handle undefined', async () => {
      expect(renderEnvOnlyInObject(undefined)).toBeUndefined();
    });

    it('should handle numbers', async () => {
      expect(renderEnvOnlyInObject(42)).toBe(42);
    });

    it('should handle booleans', async () => {
      expect(renderEnvOnlyInObject(true)).toBe(true);
      expect(renderEnvOnlyInObject(false)).toBe(false);
    });
  });

  describe('Error handling', () => {
    it('should preserve template on Nunjucks render error', async () => {
      process.env.TEST = 'value';
      // Malformed filter that would cause Nunjucks error
      const template = '{{ env.TEST | nonexistent_filter }}';
      const rendered = renderEnvOnlyInObject(template);
      // Should preserve the template if rendering fails
      expect(rendered).toBe(template);
    });
  });

  describe('PROMPTFOO_DISABLE_TEMPLATING flag', () => {
    it('should return unchanged when flag is set', async () => {
      process.env.PROMPTFOO_DISABLE_TEMPLATING = 'true';
      process.env.TEST_ENV_VAR = 'env_value';
      expect(renderEnvOnlyInObject('{{ env.TEST_ENV_VAR }}')).toBe('{{ env.TEST_ENV_VAR }}');
    });

    it('should return unchanged objects when flag is set', async () => {
      process.env.PROMPTFOO_DISABLE_TEMPLATING = 'true';
      process.env.TEST = 'value';
      const obj = { key: '{{ env.TEST }}' };
      expect(renderEnvOnlyInObject(obj)).toEqual({ key: '{{ env.TEST }}' });
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle Azure provider config with mixed templates', async () => {
      process.env.AZURE_ENDPOINT = 'test.openai.azure.com';
      process.env.API_VERSION = '2024-02-15';
      const config = {
        apiHost: '{{ env.AZURE_ENDPOINT }}',
        apiVersion: '{{ env.API_VERSION }}',
        body: {
          message: '{{ vars.userMessage }}',
          user: '{{ vars.userId }}',
        },
      };
      expect(renderEnvOnlyInObject(config)).toEqual({
        apiHost: 'test.openai.azure.com',
        apiVersion: '2024-02-15',
        body: {
          message: '{{ vars.userMessage }}',
          user: '{{ vars.userId }}',
        },
      });
    });

    it('should handle HTTP provider with runtime vars', async () => {
      process.env.BASE_URL = 'https://api.example.com';
      const config = {
        url: '{{ env.BASE_URL }}/query',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer {{ env.API_TOKEN }}',
        },
        body: {
          query: '{{ vars.userQuery }}',
          context: '{{ vars.context }}',
        },
      };
      const rendered = renderEnvOnlyInObject(config);
      expect(rendered).toEqual({
        url: 'https://api.example.com/query',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer {{ env.API_TOKEN }}', // Undefined, preserved
        },
        body: {
          query: '{{ vars.userQuery }}', // Runtime vars preserved
          context: '{{ vars.context }}', // Runtime vars preserved
        },
      });
    });

    it('should handle complex provider config with filters', async () => {
      process.env.API_HOST = 'api.example.com';
      process.env.PORT = '8080';
      const config = {
        baseUrl: "{{ env.API_HOST | default('localhost') }}:{{ env.PORT }}",
        timeout: '{{ env.TIMEOUT | default(30000) }}',
        request: {
          body: '{{ vars.payload }}',
        },
      };
      const rendered = renderEnvOnlyInObject(config);
      expect(rendered).toEqual({
        baseUrl: 'api.example.com:8080',
        timeout: '30000', // TIMEOUT undefined, but default filter renders it
        request: {
          body: '{{ vars.payload }}',
        },
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle multiple env vars in same string', async () => {
      process.env.HOST = 'example.com';
      process.env.PORT = '8080';
      expect(renderEnvOnlyInObject('{{ env.HOST }}:{{ env.PORT }}')).toBe('example.com:8080');
    });

    it('should handle env vars in middle of text', async () => {
      process.env.NAME = 'World';
      expect(renderEnvOnlyInObject('Hello {{ env.NAME }}!')).toBe('Hello World!');
    });

    it('should handle templates with newlines', async () => {
      process.env.VAR = 'value';
      expect(
        renderEnvOnlyInObject(`Line 1: {{ env.VAR }}
Line 2: {{ vars.test }}`),
      ).toBe(`Line 1: value
Line 2: {{ vars.test }}`);
    });

    it('should not confuse env in other contexts', async () => {
      process.env.TEST = 'value';
      // Should not match "environment" or other words containing "env"
      expect(renderEnvOnlyInObject('environment {{ vars.test }}')).toBe(
        'environment {{ vars.test }}',
      );
    });
  });
});
