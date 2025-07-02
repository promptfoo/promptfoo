import dedent from 'dedent';
import { escapeJsonVariables, renderJsonTemplate } from '../../src/util/json';

describe('json utilities', () => {
  describe('escapeJsonVariables', () => {
    it('escapes special characters in string values', () => {
      const input = {
        newlines: 'line1\nline2',
        quotes: 'contains "quotes"',
        tabs: 'tab\there',
        backslash: 'back\\slash',
      };
      const output = escapeJsonVariables(input);
      expect(output).toEqual({
        newlines: 'line1\\nline2',
        quotes: 'contains \\"quotes\\"',
        tabs: 'tab\\there',
        backslash: 'back\\\\slash',
      });
    });

    it('preserves non-string values', () => {
      const input = {
        number: 42,
        boolean: true,
        null: null,
        array: [1, 2, 3],
        object: { key: 'value' },
      };
      const output = escapeJsonVariables(input);
      expect(output).toEqual(input);
    });

    it('handles empty strings', () => {
      const input = { empty: '' };
      const output = escapeJsonVariables(input);
      expect(output).toEqual({ empty: '' });
    });

    it('handles undefined and null values', () => {
      const input = {
        undef: undefined,
        null: null,
        str: 'normal',
      };
      const output = escapeJsonVariables(input);
      expect(output).toEqual(input);
    });
  });

  describe('renderJsonTemplate', () => {
    it('renders basic template with variables', () => {
      const template = '{"name": "{{name}}", "age": {{age}}}';
      const vars = { name: 'John', age: 30 };
      const result = renderJsonTemplate(template, vars);
      expect(result).toEqual({ name: 'John', age: 30 });
    });

    it('handles special characters in variables', () => {
      const template = '{"text": "{{text}}"}';
      const vars = { text: 'line1\nline2\t"quoted"' };
      const result = renderJsonTemplate(template, vars);
      expect(result).toEqual({ text: 'line1\nline2\t"quoted"' });
    });

    it('renders nested objects and arrays', () => {
      const template = `{
        "user": {
          "name": "{{name}}",
          "hobbies": ["{{hobbies[0]}}", "{{hobbies[1]}}"]
        }
      }`;
      const vars = {
        name: 'John',
        hobbies: ['reading', 'coding'],
      };
      const result = renderJsonTemplate(template, vars);
      expect(result).toEqual({
        user: {
          name: 'John',
          hobbies: ['reading', 'coding'],
        },
      });
    });

    it('throws error for invalid JSON template', () => {
      const template = '{"bad": {{value}}';
      const vars = { value: 'test' };
      expect(() => renderJsonTemplate(template, vars)).toThrow('Unexpected token');
    });

    it('handles empty objects and arrays', () => {
      const template = '{"arr": [], "obj": {}}';
      const vars = {};
      const result = renderJsonTemplate(template, vars);
      expect(result).toEqual({ arr: [], obj: {} });
    });

    it('escapes variables when needed', () => {
      const template = '{"text": "{{text}}"}';
      const vars = { text: 'contains\nnewline' };
      const result = renderJsonTemplate(template, vars);
      expect(result).toEqual({ text: 'contains\nnewline' });
    });

    it('preserves whitespace in template', () => {
      const template = dedent`
        {
          "key1": "{{value1}}",
          "key2": "{{value2}}"
        }`;
      const vars = { value1: 'test1', value2: 'test2' };
      const result = renderJsonTemplate(template, vars);
      expect(result).toEqual({ key1: 'test1', key2: 'test2' });
    });
  });
});
