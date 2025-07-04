import nunjucks from 'nunjucks';
import cliState from '../../src/cliState';
import {
  extractVariablesFromTemplate,
  extractVariablesFromTemplates,
  getNunjucksEngine,
} from '../../src/util/templates';

describe('extractVariablesFromTemplate', () => {
  it('should extract simple variables', () => {
    const template = 'Hello {{ name }}, welcome to {{ place }}!';
    expect(extractVariablesFromTemplate(template)).toEqual(['name', 'place']);
  });

  it('should extract variables without spaces', () => {
    const template = 'Hello {{name}}, welcome to {{place}}!';
    expect(extractVariablesFromTemplate(template)).toEqual(['name', 'place']);
  });

  it('should extract variables with dot notation', () => {
    const template = 'Hello {{ user.name }}, your score is {{ game.score }}!';
    expect(extractVariablesFromTemplate(template)).toEqual(['user.name', 'game.score']);
  });

  it('should extract variables with underscores', () => {
    const template = 'Your order {{ order_id }} will arrive on {{ delivery_date }}.';
    expect(extractVariablesFromTemplate(template)).toEqual(['order_id', 'delivery_date']);
  });

  it('should extract variables with numbers', () => {
    const template = 'Player1: {{ player1 }}, Player2: {{ player2 }}';
    expect(extractVariablesFromTemplate(template)).toEqual(['player1', 'player2']);
  });

  it('should extract variables used in filters', () => {
    const template = '{{ name | capitalize }} - {{ date | date("yyyy-MM-dd") }}';
    expect(extractVariablesFromTemplate(template)).toEqual(['name', 'date']);
  });

  it('should extract variables used in complex expressions', () => {
    const template = '{% if user.age > 18 %}Welcome, {{ user.name }}!{% endif %}';
    expect(extractVariablesFromTemplate(template)).toEqual(['user.age', 'user.name']);
  });

  it('should extract variables from for loops', () => {
    const template = '{% for item in items %}{{ item.name }}{% endfor %}';
    expect(extractVariablesFromTemplate(template)).toEqual(['item.name', 'items']);
  });

  it('should extract variables with multiple occurrences', () => {
    const template = '{{ name }} {{ age }} {{ name }}';
    expect(extractVariablesFromTemplate(template)).toEqual(['name', 'age']);
  });

  it('should not extract variables from comments', () => {
    const template = '{# This is a comment with {{ variable }} #}{{ actual_variable }}';
    expect(extractVariablesFromTemplate(template)).toEqual(['actual_variable']);
  });

  it('should handle empty templates', () => {
    const template = '';
    expect(extractVariablesFromTemplate(template)).toEqual([]);
  });

  it('should handle templates without variables', () => {
    const template = 'This is a static template without variables.';
    expect(extractVariablesFromTemplate(template)).toEqual([]);
  });
});

describe('extractVariablesFromTemplates', () => {
  it('should extract variables from multiple templates', () => {
    const templates = [
      'Hello {{ name }}, welcome to {{ place }}!',
      '{{ user.age }} years old',
      '{% for item in items %}{{ item.name }}{% endfor %}',
    ];

    const result = extractVariablesFromTemplates(templates);

    expect(result).toEqual(['name', 'place', 'user.age', 'item.name', 'items']);
  });

  it('should handle empty array of templates', () => {
    const templates: string[] = [];

    const result = extractVariablesFromTemplates(templates);

    expect(result).toEqual([]);
  });

  it('should deduplicate variables across templates', () => {
    const templates = ['Hello {{ name }}!', 'Welcome, {{ name }}!', '{{ age }} years old'];

    const result = extractVariablesFromTemplates(templates);

    expect(result).toEqual(['name', 'age']);
  });
});

describe('getNunjucksEngine', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return a nunjucks environment by default', () => {
    const engine = getNunjucksEngine();
    expect(engine).toBeInstanceOf(nunjucks.Environment);
    expect(engine.renderString('Hello {{ name }}', { name: 'World' })).toBe('Hello World');
  });

  it('should return a simple render function when PROMPTFOO_DISABLE_TEMPLATING is set', () => {
    process.env.PROMPTFOO_DISABLE_TEMPLATING = 'true';
    const engine = getNunjucksEngine();
    expect(engine.renderString('Hello {{ name }}', { name: 'World' })).toBe('Hello {{ name }}');
  });

  it('should return a nunjucks environment when isGrader is true, regardless of PROMPTFOO_DISABLE_TEMPLATING', () => {
    process.env.PROMPTFOO_DISABLE_TEMPLATING = 'true';
    const engine = getNunjucksEngine({}, false, true);
    expect(engine).toBeInstanceOf(nunjucks.Environment);
    expect(engine.renderString('Hello {{ name }}', { name: 'Grader' })).toBe('Hello Grader');
  });

  it('should use nunjucks when isGrader is true, even if PROMPTFOO_DISABLE_TEMPLATING is set', () => {
    process.env.PROMPTFOO_DISABLE_TEMPLATING = 'true';
    const engine = getNunjucksEngine({}, false, true);
    expect(engine).toBeInstanceOf(nunjucks.Environment);
    expect(engine.renderString('Hello {{ name }}', { name: 'Grader' })).toBe('Hello Grader');
  });

  it('should add custom filters when provided', () => {
    const customFilters = {
      uppercase: (str: string) => str.toUpperCase(),
      add: (a: number, b: number) => (a + b).toString(),
    };
    const engine = getNunjucksEngine(customFilters);
    expect(engine.renderString('{{ "hello" | uppercase }}', {})).toBe('HELLO');
    expect(engine.renderString('{{ 5 | add(3) }}', {})).toBe('8');
  });

  it('should add built-in load filter for JSON parsing', () => {
    const engine = getNunjucksEngine();
    const jsonString = '{"name": "test", "value": 42}';
    const template = `{{ '${jsonString}' | load }}`;
    const result = engine.renderString(template, {});
    expect(result).toBe('[object Object]');

    // Test that the filter actually parses JSON correctly
    const jsonData = '{"key": "value"}';
    const loadFilter = engine.getFilter('load');
    expect(loadFilter).toBeDefined();
    expect(loadFilter(jsonData)).toEqual({ key: 'value' });
  });

  it('should handle load filter with invalid JSON', () => {
    const engine = getNunjucksEngine();
    const loadFilter = engine.getFilter('load');
    expect(loadFilter).toBeDefined();
    expect(() => loadFilter('invalid json')).toThrow('Unexpected token');
  });

  it('should add environment variables as globals under "env"', () => {
    process.env.TEST_VAR = 'test_value';
    const engine = getNunjucksEngine();
    expect(engine.renderString('{{ env.TEST_VAR }}', {})).toBe('test_value');
  });

  it('should throw an error when throwOnUndefined is true and a variable is undefined', () => {
    const engine = getNunjucksEngine({}, true);
    expect(() => {
      engine.renderString('{{ undefined_var }}', {});
    }).toThrow(/attempted to output null or undefined value/);
  });

  it('should not throw an error when throwOnUndefined is false and a variable is undefined', () => {
    const engine = getNunjucksEngine({}, false);
    expect(() => {
      engine.renderString('{{ undefined_var }}', {});
    }).not.toThrow();
  });

  it('should respect all parameters when provided', () => {
    process.env.PROMPTFOO_DISABLE_TEMPLATING = 'true';
    const customFilters = {
      double: (n: number) => (n * 2).toString(),
    };
    const engine = getNunjucksEngine(customFilters, true, true);
    expect(engine).toBeInstanceOf(nunjucks.Environment);
    expect(engine.renderString('{{ 5 | double }}', {})).toBe('10');
    expect(() => {
      engine.renderString('{{ undefined_var }}', {});
    }).toThrow(/attempted to output null or undefined value/);
  });

  describe('environment variables as globals', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
      jest.isolateModules(() => {
        jest.doMock('../../src/cliState', () => ({
          default: {
            config: {},
          },
        }));
      });
    });

    afterEach(() => {
      process.env = originalEnv;
      jest.resetModules();
    });

    it('should add environment variables as globals by default', () => {
      process.env.TEST_VAR = 'test_value';
      const engine = getNunjucksEngine();
      expect(engine.renderString('{{ env.TEST_VAR }}', {})).toBe('test_value');
    });

    it('should merge cliState.config.env with process.env', () => {
      const initialConfig = { ...cliState.config };

      cliState.config = {
        env: {
          PROCESS_VAR: 'overridden_value',
          CONFIG_VAR: 'config_value',
        },
      };
      const engine = getNunjucksEngine();
      const rendered = engine.renderString('{{ env.PROCESS_VAR }}', {});
      expect(rendered).toBe('overridden_value');
      expect(engine.renderString('{{ env.CONFIG_VAR }}', {})).toBe('config_value');
      cliState.config = initialConfig;
    });

    it('should handle undefined cliState.config', () => {
      process.env.TEST_VAR = 'test_value';
      jest.isolateModules(() => {
        jest.doMock('../../src/cliState', () => ({
          default: {
            config: undefined,
          },
        }));
      });
      const engine = getNunjucksEngine();
      expect(engine.renderString('{{ env.TEST_VAR }}', {})).toBe('test_value');
    });

    it('should handle undefined cliState.config.env', () => {
      process.env.TEST_VAR = 'test_value';
      jest.isolateModules(() => {
        jest.doMock('../../src/cliState', () => ({
          default: {
            config: {
              env: undefined,
            },
          },
        }));
      });
      const engine = getNunjucksEngine();
      expect(engine.renderString('{{ env.TEST_VAR }}', {})).toBe('test_value');
    });

    it('should disable process.env but allow config env variables when PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS is true', () => {
      process.env.TEST_VAR = 'test_value';
      process.env.PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS = 'true';
      const initialConfig = { ...cliState.config };
      cliState.config = {
        env: {
          CONFIG_VAR: 'config_value',
        },
      };
      const engine = getNunjucksEngine();
      expect(engine.renderString('{{ env.TEST_VAR }}', {})).toBe('');
      expect(engine.renderString('{{ env.CONFIG_VAR }}', {})).toBe('config_value');
      cliState.config = initialConfig;
    });

    it('should disable process.env but allow config env variables when PROMPTFOO_SELF_HOSTED is true', () => {
      process.env.TEST_VAR = 'test_value';
      process.env.PROMPTFOO_SELF_HOSTED = 'true';
      const initialConfig = { ...cliState.config };
      cliState.config = {
        env: {
          CONFIG_VAR: 'config_value',
        },
      };
      const engine = getNunjucksEngine();
      expect(engine.renderString('{{ env.TEST_VAR }}', {})).toBe('');
      expect(engine.renderString('{{ env.CONFIG_VAR }}', {})).toBe('config_value');
      cliState.config = initialConfig;
    });

    it('should handle empty config env object', () => {
      process.env.TEST_VAR = 'test_value';
      const initialConfig = { ...cliState.config };
      cliState.config = {
        env: {},
      };
      const engine = getNunjucksEngine();
      expect(engine.renderString('{{ env.TEST_VAR }}', {})).toBe('test_value');
      cliState.config = initialConfig;
    });

    it('should prioritize config env variables over process.env when both exist', () => {
      process.env.SHARED_VAR = 'process_value';
      const initialConfig = { ...cliState.config };
      cliState.config = {
        env: {
          SHARED_VAR: 'config_value',
        },
      };
      const engine = getNunjucksEngine();
      expect(engine.renderString('{{ env.SHARED_VAR }}', {})).toBe('config_value');
      cliState.config = initialConfig;
    });
  });
});
