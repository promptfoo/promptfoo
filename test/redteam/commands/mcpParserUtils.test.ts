import { describe, expect, it } from 'vitest';
import {
  decodeXmlEntities,
  parseTypedValue,
  parseXmlToolCall,
} from '../../../src/redteam/commands/mcpParserUtils';

describe('decodeXmlEntities', () => {
  it('should decode &lt; and &gt;', () => {
    expect(decodeXmlEntities('&lt;script&gt;')).toBe('<script>');
  });

  it('should decode &amp;', () => {
    expect(decodeXmlEntities('foo &amp; bar')).toBe('foo & bar');
  });

  it('should decode &quot; and &apos;', () => {
    expect(decodeXmlEntities('&quot;hello&quot; &apos;world&apos;')).toBe(`"hello" 'world'`);
  });

  it('should decode multiple entities in one string', () => {
    expect(decodeXmlEntities('&lt;a href=&quot;test&quot;&gt;link&lt;/a&gt;')).toBe(
      '<a href="test">link</a>',
    );
  });

  it('should handle strings without entities', () => {
    expect(decodeXmlEntities('plain text')).toBe('plain text');
  });

  it('should handle empty string', () => {
    expect(decodeXmlEntities('')).toBe('');
  });

  it('should not double-decode entities (decode &amp; last)', () => {
    // &amp;quot; should become &quot;, not "
    expect(decodeXmlEntities('&amp;quot;')).toBe('&quot;');
    expect(decodeXmlEntities('&amp;lt;')).toBe('&lt;');
    expect(decodeXmlEntities('&amp;amp;')).toBe('&amp;');
  });
});

describe('parseTypedValue', () => {
  it('should return string by default when no type specified', () => {
    expect(parseTypedValue('hello')).toBe('hello');
    expect(parseTypedValue('  spaced  ')).toBe('  spaced  ');
  });

  it('should parse number type', () => {
    expect(parseTypedValue('42', 'number')).toBe(42);
    expect(parseTypedValue('3.14', 'number')).toBe(3.14);
    expect(parseTypedValue('-10', 'number')).toBe(-10);
    expect(parseTypedValue('  100  ', 'number')).toBe(100);
  });

  it('should parse boolean type', () => {
    expect(parseTypedValue('true', 'boolean')).toBe(true);
    expect(parseTypedValue('false', 'boolean')).toBe(false);
    expect(parseTypedValue('  true  ', 'boolean')).toBe(true);
    expect(parseTypedValue('anything else', 'boolean')).toBe(false);
  });

  it('should parse null type', () => {
    expect(parseTypedValue('', 'null')).toBe(null);
    expect(parseTypedValue('anything', 'null')).toBe(null);
  });

  it('should return string for unknown type', () => {
    expect(parseTypedValue('value', 'unknown')).toBe('value');
  });
});

describe('parseXmlToolCall', () => {
  it('should return null for non-XML input', () => {
    expect(parseXmlToolCall('not xml')).toBe(null);
    expect(parseXmlToolCall('{"tool": "test"}')).toBe(null);
    expect(parseXmlToolCall('<tool>test</tool>')).toBe(null); // missing tool-call wrapper
  });

  it('should parse basic tool call without args', () => {
    const xml = '<tool-call><tool>my_function</tool></tool-call>';
    const result = parseXmlToolCall(xml);
    expect(result).toEqual({
      tool: 'my_function',
      args: {},
    });
  });

  it('should parse tool call with string args', () => {
    const xml = `<tool-call>
      <tool>search</tool>
      <args>
        <query>hello world</query>
        <limit>10</limit>
      </args>
    </tool-call>`;
    const result = parseXmlToolCall(xml);
    expect(result).toEqual({
      tool: 'search',
      args: {
        query: 'hello world',
        limit: '10',
      },
    });
  });

  it('should parse tool call with typed args', () => {
    const xml = `<tool-call>
      <tool>create_user</tool>
      <args>
        <name>John</name>
        <age type="number">25</age>
        <active type="boolean">true</active>
        <deleted type="null"></deleted>
      </args>
    </tool-call>`;
    const result = parseXmlToolCall(xml);
    expect(result).toEqual({
      tool: 'create_user',
      args: {
        name: 'John',
        age: 25,
        active: true,
        deleted: null,
      },
    });
  });

  it('should handle SQL injection payloads in args', () => {
    const xml = `<tool-call>
      <tool>search_records</tool>
      <args>
        <query>' OR 1=1 --</query>
        <limit type="number">10</limit>
      </args>
    </tool-call>`;
    const result = parseXmlToolCall(xml);
    expect(result).toEqual({
      tool: 'search_records',
      args: {
        query: "' OR 1=1 --",
        limit: 10,
      },
    });
  });

  it('should handle XSS payloads with XML entities', () => {
    const xml = `<tool-call>
      <tool>update_profile</tool>
      <args>
        <bio>&lt;script&gt;alert('xss')&lt;/script&gt;</bio>
      </args>
    </tool-call>`;
    const result = parseXmlToolCall(xml);
    expect(result).toEqual({
      tool: 'update_profile',
      args: {
        bio: "<script>alert('xss')</script>",
      },
    });
  });

  it('should decode XML entities in args', () => {
    const xml = `<tool-call>
      <tool>send_message</tool>
      <args>
        <text>Hello &quot;world&quot; &amp; &apos;friends&apos;!</text>
      </args>
    </tool-call>`;
    const result = parseXmlToolCall(xml);
    expect(result).toEqual({
      tool: 'send_message',
      args: {
        text: `Hello "world" & 'friends'!`,
      },
    });
  });

  it('should handle multiline content in args', () => {
    const xml = `<tool-call>
      <tool>create_document</tool>
      <args>
        <content>Line 1
Line 2
Line 3</content>
      </args>
    </tool-call>`;
    const result = parseXmlToolCall(xml);
    expect(result).toEqual({
      tool: 'create_document',
      args: {
        content: `Line 1
Line 2
Line 3`,
      },
    });
  });

  it('should return null if tool tag is missing', () => {
    const xml = '<tool-call><args><param>value</param></args></tool-call>';
    expect(parseXmlToolCall(xml)).toBe(null);
  });

  it('should handle underscores and numbers in param names', () => {
    const xml = `<tool-call>
      <tool>test_func</tool>
      <args>
        <param_1>value1</param_1>
        <param2_name>value2</param2_name>
      </args>
    </tool-call>`;
    const result = parseXmlToolCall(xml);
    expect(result).toEqual({
      tool: 'test_func',
      args: {
        param_1: 'value1',
        param2_name: 'value2',
      },
    });
  });
});
