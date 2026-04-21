import nunjucks from 'nunjucks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import {
  analyzeTemplateReference,
  extractVariablesFromTemplate,
  extractVariablesFromTemplates,
  getNunjucksEngine,
  templateReferencesVariable,
} from '../../src/util/templates';
import { mockProcessEnv } from './utils';

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

describe('templateReferencesVariable', () => {
  it.each<[string, string]>([
    ['basic symbol read', '{{ _conversation[0].output }}'],
    ['filter input', '{{ _conversation | length }}'],
    ['chained filters', '{{ _conversation | first | length }}'],
    ['if condition', '{% if _conversation %}yes{% endif %}'],
    ['elif condition', '{% if false %}no{% elif _conversation %}yes{% endif %}'],
    ['ternary true branch', '{{ "yes" if _conversation else "no" }}'],
    ['ternary condition', '{{ first if _conversation else second }}'],
    ['ternary else branch', '{{ a if x else _conversation }}'],
    ['logical expression', '{{ _conversation and foo }}'],
    ['not expression', '{{ not _conversation }}'],
    ['comparison', '{{ _conversation == [] }}'],
    ['less-than', '{{ x < _conversation }}'],
    ['for loop iterable', '{% for turn in _conversation %}{{ turn.output }}{% endfor %}'],
    ['function argument', '{{ summarize(_conversation) }}'],
    ['keyword argument value', '{{ fn(arg=_conversation) }}'],
    ['filter argument', '{{ input | default(_conversation) }}'],
    ['is test with call arg', '{{ foo is divisibleby(_conversation) }}'],
    ['is test function argument value', '{{ foo is _conversation(_conversation) }}'],
    ['bracket index lookup', '{{ obj[_conversation] }}'],
    ['array literal member', '{{ [_conversation, other] }}'],
    ['group expression', '{{ (_conversation) }}'],
    ['negated expression', '{{ -_conversation }}'],
    ['concat', '{{ "a" ~ _conversation ~ "b" }}'],
    ['dict literal value', '{{ {"history": _conversation}["history"][0].output }}'],
    ['set value binding', '{% set history = _conversation %}{{ history }}'],
    ['set block binding', '{% set history %}{{ _conversation }}{% endset %}{{ history }}'],
    ['macro body free variable', '{% macro render() %}{{ _conversation }}{% endmacro %}'],
    ['macro default value', '{% macro render(x=_conversation) %}{{ x }}{% endmacro %}'],
    [
      'macro default value with body ref',
      '{% macro render(x=_conversation) %}{{ _conversation }}{% endmacro %}',
    ],
    [
      'macro self-referential default value',
      '{% macro render(_conversation=_conversation) %}{{ _conversation[0].output }}{% endmacro %}{{ render() }}',
    ],
    ['include expression', '{% include _conversation %}'],
    ['extends expression', '{% extends _conversation %}{% block b %}{% endblock %}'],
    ['from-import template expression', '{% from template_name import foo %}{{ _conversation }}'],
    ['block body reference', '{% block body %}{{ _conversation }}{% endblock %}'],
    [
      'call block body reference',
      '{% macro m() %}{{ caller() }}{% endmacro %}{% call m() %}{{ _conversation }}{% endcall %}',
    ],
    [
      'call block body reference with unrelated caller arg',
      '{% macro m() %}{{ caller("local") }}{% endmacro %}{% call(x) m() %}{{ _conversation }}{% endcall %}',
    ],
    [
      'call block caller default value',
      '{% macro m() %}{{ caller() }}{% endmacro %}{% call(x=_conversation) m() %}{{ x[0].output }}{% endcall %}',
    ],
    [
      'call block caller self-referential default value',
      '{% macro m() %}{{ caller() }}{% endmacro %}{% call(_conversation=_conversation) m() %}{{ _conversation[0].output }}{% endcall %}',
    ],
    ['asyncEach iterable', '{% asyncEach turn in _conversation %}{{ turn.output }}{% endeach %}'],
    ['asyncAll iterable', '{% asyncAll turn in _conversation %}{{ turn.output }}{% endall %}'],
  ])('detects a real reference in %s', (_label, template) => {
    expect(templateReferencesVariable(template, '_conversation')).toBe(true);
  });

  it.each<[string, string]>([
    ['substring in plain text', 'Summarize the pre_conversation_context for {{ question }}'],
    ['substring in symbol name', '{{ pre_conversation_context }}'],
    ['string literal', '{{ "_conversation" }}'],
    ['comment mention', '{# _conversation #}{{ question }}'],
    ['property of another object', '{{ foo._conversation }}'],
    ['bracket lookup on another object', '{{ foo["_conversation"] }}'],
    ['dict literal key', '{{ {_conversation: input} }}'],
    ['filter name', '{{ input | _conversation }}'],
    ['is test name', '{{ input is _conversation }}'],
    ['is test function name', '{{ input is _conversation(foo) }}'],
    ['raw block', '{% raw %}{{ _conversation }}{% endraw %}'],
    ['for-loop target shadow', '{% for _conversation in items %}{{ _conversation }}{% endfor %}'],
    ['macro argument shadow', '{% macro render(_conversation) %}{{ _conversation }}{% endmacro %}'],
    ['set value shadow', '{% set _conversation = [] %}{{ _conversation }}'],
    ['set block shadow', '{% set _conversation %}local{% endset %}{{ _conversation }}'],
    [
      'set inside loop body',
      '{% for i in range(3) %}{% set _conversation = [] %}{{ _conversation }}{% endfor %}',
    ],
    ['import target shadow', '{% import "x.njk" as _conversation %}{{ _conversation }}'],
    ['from-import alias binding', '{% from "x.njk" import foo as _conversation %}{{ question }}'],
    ['block name label', '{% block _conversation %}hi{% endblock %}'],
    [
      'for-loop tuple target shadow',
      '{% for k, _conversation in items %}{{ _conversation }}{% endfor %}',
    ],
    [
      'nested for target shadow',
      '{% for _conversation in outer %}{% for x in _conversation %}{{ _conversation }}{% endfor %}{% endfor %}',
    ],
    ['set tuple target shadow', '{% set a, _conversation = pair %}{{ _conversation }}'],
    [
      'macro keyword-default param name shadow',
      '{% macro render(_conversation=something) %}{{ _conversation }}{% endmacro %}',
    ],
    [
      'macro keyword default left-to-right shadow',
      '{% macro render(_conversation=[], history=_conversation) %}{{ history | length }}{% endmacro %}{{ render() }}',
    ],
    [
      'macro positional param used by keyword default',
      '{% macro render(_conversation, history=_conversation) %}{{ history }}{% endmacro %}',
    ],
    [
      'call block caller argument shadow',
      '{% macro m() %}{{ caller("local") }}{% endmacro %}{% call(_conversation) m() %}{{ _conversation }}{% endcall %}',
    ],
    [
      'call block caller keyword default left-to-right shadow',
      '{% macro m() %}{{ caller() }}{% endmacro %}{% call(_conversation=[], history=_conversation) m() %}{{ history | length }}{% endcall %}',
    ],
    [
      'asyncEach target shadow',
      '{% asyncEach _conversation in items %}{{ _conversation }}{% endeach %}',
    ],
    [
      'asyncAll target shadow',
      '{% asyncAll _conversation in items %}{{ _conversation }}{% endall %}',
    ],
  ])('ignores %s', (_label, template) => {
    expect(templateReferencesVariable(template, '_conversation')).toBe(false);
  });

  it('handles from-import aliases without shadowing source names', () => {
    expect(templateReferencesVariable('{% from "x.njk" import foo %}{{ foo }}', 'foo')).toBe(false);
    expect(
      templateReferencesVariable('{% from "x.njk" import foo as helper %}{{ helper }}', 'helper'),
    ).toBe(false);
    expect(
      templateReferencesVariable('{% from "x.njk" import foo as helper %}{{ foo }}', 'foo'),
    ).toBe(true);
    expect(
      templateReferencesVariable(
        '{% from templateName import foo as helper %}{{ helper }}',
        'templateName',
      ),
    ).toBe(true);
  });

  it('returns false for empty variable names', () => {
    expect(templateReferencesVariable('{{ _conversation }}', '')).toBe(false);
  });

  it('returns false for templates that do not mention the variable at all', () => {
    expect(templateReferencesVariable('{{ question }}', '_conversation')).toBe(false);
    expect(templateReferencesVariable('', '_conversation')).toBe(false);
  });

  it('falls back to a conservative match when the template fails to parse', () => {
    // Old substring-based code would force serial execution here; the new
    // AST-based code must preserve that safety envelope when parsing fails
    // rather than silently returning false.
    expect(templateReferencesVariable('{{ _conversation', '_conversation')).toBe(true);
    expect(templateReferencesVariable('{{ _conversation[0].output {% if %}', '_conversation')).toBe(
      true,
    );
    expect(templateReferencesVariable('{{ _conversation }}{% endif %}', '_conversation')).toBe(
      true,
    );
  });

  it('does not throw on malformed templates', () => {
    expect(() => templateReferencesVariable('{{ _conversation', '_conversation')).not.toThrow();
    expect(() => templateReferencesVariable('{% for %}', '_conversation')).not.toThrow();
  });
});

describe('analyzeTemplateReference', () => {
  it('reports parsed=true when the template parses', () => {
    expect(analyzeTemplateReference('{{ _conversation }}', '_conversation')).toEqual({
      referenced: true,
      parsed: true,
    });
    expect(analyzeTemplateReference('{{ question }}', '_conversation')).toEqual({
      referenced: false,
      parsed: true,
    });
  });

  it('reports parsed=false and conservative referenced=true on parse failure', () => {
    expect(analyzeTemplateReference('{{ _conversation', '_conversation')).toEqual({
      referenced: true,
      parsed: false,
    });
  });

  it('reports parsed=true with referenced=false when the variable is not mentioned', () => {
    // The textual fast path returns parsed=true because nothing was actually parsed
    // — no parse failure to surface.
    expect(analyzeTemplateReference('{{ question }}', '_conversation')).toEqual({
      referenced: false,
      parsed: true,
    });
  });
});

describe('getNunjucksEngine', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    mockProcessEnv({ ...originalEnv }, { clear: true });
  });

  afterEach(() => {
    mockProcessEnv(originalEnv, { clear: true });
  });

  it('should return a nunjucks environment by default', () => {
    const engine = getNunjucksEngine();
    expect(engine).toBeInstanceOf(nunjucks.Environment);
    expect(engine.renderString('Hello {{ name }}', { name: 'World' })).toBe('Hello World');
  });

  it('should return a simple render function when PROMPTFOO_DISABLE_TEMPLATING is set', () => {
    mockProcessEnv({ PROMPTFOO_DISABLE_TEMPLATING: 'true' });
    const engine = getNunjucksEngine();
    expect(engine.renderString('Hello {{ name }}', { name: 'World' })).toBe('Hello {{ name }}');
  });

  it('should return a nunjucks environment when isGrader is true, regardless of PROMPTFOO_DISABLE_TEMPLATING', () => {
    mockProcessEnv({ PROMPTFOO_DISABLE_TEMPLATING: 'true' });
    const engine = getNunjucksEngine({}, false, true);
    expect(engine).toBeInstanceOf(nunjucks.Environment);
    expect(engine.renderString('Hello {{ name }}', { name: 'Grader' })).toBe('Hello Grader');
  });

  it('should use nunjucks when isGrader is true, even if PROMPTFOO_DISABLE_TEMPLATING is set', () => {
    mockProcessEnv({ PROMPTFOO_DISABLE_TEMPLATING: 'true' });
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
    mockProcessEnv({ TEST_VAR: 'test_value' });
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
    mockProcessEnv({ PROMPTFOO_DISABLE_TEMPLATING: 'true' });
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
    it('should add environment variables as globals by default', () => {
      mockProcessEnv({ TEST_VAR: 'test_value' });
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
      mockProcessEnv({ TEST_VAR: 'test_value' });
      const engine = getNunjucksEngine();
      expect(engine.renderString('{{ env.TEST_VAR }}', {})).toBe('test_value');
    });

    it('should handle undefined cliState.config.env', () => {
      mockProcessEnv({ TEST_VAR: 'test_value' });
      const engine = getNunjucksEngine();
      expect(engine.renderString('{{ env.TEST_VAR }}', {})).toBe('test_value');
    });

    it('should disable process.env but allow config env variables when PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS is true', () => {
      mockProcessEnv({ TEST_VAR: 'test_value' });
      mockProcessEnv({ PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS: 'true' });
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
      mockProcessEnv({ TEST_VAR: 'test_value' });
      mockProcessEnv({ PROMPTFOO_SELF_HOSTED: 'true' });
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
      mockProcessEnv({ TEST_VAR: 'test_value' });
      const initialConfig = { ...cliState.config };
      cliState.config = {
        env: {},
      };
      const engine = getNunjucksEngine();
      expect(engine.renderString('{{ env.TEST_VAR }}', {})).toBe('test_value');
      cliState.config = initialConfig;
    });

    it('should prioritize config env variables over process.env when both exist', () => {
      mockProcessEnv({ SHARED_VAR: 'process_value' });
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
