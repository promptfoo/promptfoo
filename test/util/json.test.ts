import dedent from 'dedent';
import {
  extractJsonObjects,
  isValidJson,
  safeJsonStringify,
  orderKeys,
  convertSlashCommentsToHash,
  extractFirstJsonObject,
} from '../../src/util/json';

describe('json utilities', () => {
  describe('isValidJson', () => {
    it('returns true for valid JSON', () => {
      expect(isValidJson('{"key": "value"}')).toBe(true);
      expect(isValidJson('[1, 2, 3]')).toBe(true);
      expect(isValidJson('"string"')).toBe(true);
      expect(isValidJson('123')).toBe(true);
      expect(isValidJson('true')).toBe(true);
      expect(isValidJson('null')).toBe(true);
    });

    it('returns false for invalid JSON', () => {
      expect(isValidJson('{')).toBe(false);
      expect(isValidJson('["unclosed array"')).toBe(false);
      expect(isValidJson('{"key": value}')).toBe(false);
      expect(isValidJson('undefined')).toBe(false);
    });
  });

  describe('safeJsonStringify', () => {
    it('stringifies simple objects', () => {
      const obj: { key: string; number: number } = { key: 'value', number: 123 };
      expect(safeJsonStringify(obj)).toBe('{"key":"value","number":123}');
    });

    it('handles circular references', () => {
      const obj: { key: string; circular?: any } = { key: 'value' };
      obj.circular = obj;
      expect(safeJsonStringify(obj)).toBe('{"key":"value"}');
    });

    it('pretty prints when specified', () => {
      const obj: { key: string; nested: { inner: string } } = {
        key: 'value',
        nested: { inner: 'content' },
      };
      const expected = dedent`
      {
        "key": "value",
        "nested": {
          "inner": "content"
        }
      }`;
      expect(safeJsonStringify(obj, true)).toBe(expected);
    });

    it('handles null values', () => {
      expect(safeJsonStringify(null)).toBe('null');
    });

    it('handles undefined values', () => {
      expect(safeJsonStringify(undefined)).toBeUndefined();
    });

    it('returns undefined or strips non-serializable values', () => {
      expect(safeJsonStringify(() => {})).toBeUndefined(); // Function
      expect(safeJsonStringify(Symbol('sym'))).toBeUndefined(); // Symbol
      expect(safeJsonStringify({ key: 'value' })).toBe('{"key":"value"}');
    });

    it('returns undefined for circular references in arrays', () => {
      const arr: (number | any[])[] = [1, 2, 3];
      arr.push(arr);
      expect(safeJsonStringify(arr)).toBe('[1,2,3,null]');
    });

    it('handles complex nested structures', () => {
      const complex: {
        string: string;
        number: number;
        boolean: boolean;
        null: null;
        array: (number | string | { three: number })[];
        nested: { a: number; b: number[] };
      } = {
        string: 'value',
        number: 123,
        boolean: true,
        null: null,
        array: [1, 'two', { three: 3 }],
        nested: {
          a: 1,
          b: [2, 3],
        },
      };
      const result = safeJsonStringify(complex);
      expect(result).toBeDefined(); // Ensure it returns a string
      expect(JSON.parse(result as string)).toEqual(complex); // Ensure it matches the original structure
    });

    it('handles arrays with circular references', () => {
      const arr: any[] = [1, 2, 3];
      arr.push(arr);
      expect(safeJsonStringify(arr)).toBe('[1,2,3,null]');
    });

    it('handles nested circular references', () => {
      const obj: any = { a: { b: {} } };
      obj.a.b.c = obj.a;
      expect(safeJsonStringify(obj)).toBe('{"a":{"b":{}}}');
    });

    it('preserves non-circular nested structures', () => {
      const nested = { a: { b: { c: 1 } }, d: [1, 2, { e: 3 }] };
      expect(JSON.parse(safeJsonStringify(nested) as string)).toEqual(nested);
    });
  });

  describe('extractJsonObjects', () => {
    it('should extract a single JSON object from a string', () => {
      const input = '{"key": "value"}';
      const expectedOutput = [{ key: 'value' }];
      expect(extractJsonObjects(input)).toEqual(expectedOutput);
    });

    it('should extract multiple JSON objects from a string', () => {
      const input = 'yolo {"key1": "value1"} some text {"key2": "value2"} fomo';
      const expectedOutput = [{ key1: 'value1' }, { key2: 'value2' }];
      expect(extractJsonObjects(input)).toEqual(expectedOutput);
    });

    it('should return an empty array if no JSON objects are found', () => {
      const input = 'no json here';
      const expectedOutput: any[] = [];
      expect(extractJsonObjects(input)).toEqual(expectedOutput);
    });

    it('should handle nested JSON objects', () => {
      const input = 'wassup {"outer": {"inner": "value"}, "foo": [1,2,3,4]}';
      const expectedOutput = [{ outer: { inner: 'value' }, foo: [1, 2, 3, 4] }];
      expect(extractJsonObjects(input)).toEqual(expectedOutput);
    });

    it('should handle comments', () => {
      const input = `{
        "reason": "all good",
        "score": 1.0 // perfect score
      }`;
      const expectedOutput = [{ reason: 'all good', score: 1.0 }];
      expect(extractJsonObjects(input)).toEqual(expectedOutput);
    });

    it('should handle jsonl', () => {
      const input = `{"reason": "hello", "score": 1.0}
      {"reason": "world", "score": 0.0}`;
      const expectedOutput = [
        { reason: 'hello', score: 1.0 },
        { reason: 'world', score: 0.0 },
      ];
      expect(extractJsonObjects(input)).toEqual(expectedOutput);
    });

    it('should handle invalid JSON gracefully', () => {
      const input = '{"key": "value" some text {"key2": "value2"}';
      const expectedOutput = [{ key2: 'value2' }];
      expect(extractJsonObjects(input)).toEqual(expectedOutput);
    });

    it('should handle incomplete JSON', () => {
      const input = `{
  "incomplete": "object"`;
      expect(extractJsonObjects(input)).toEqual([]);
    });

    it('should handle string containing incomplete JSON', () => {
      const input = dedent`{
        "key1": "value1",
        "key2": {
          "nested": "value2"
        },
        "key3": "value3"
      }
      {
        "incomplete": "object"`;
      expect(extractJsonObjects(input)).toEqual([
        {
          key1: 'value1',
          key2: {
            nested: 'value2',
          },
          key3: 'value3',
        },
      ]);
    });

    it('should handle this case', () => {
      const obj = {
        vars: [
          {
            language: 'Klingon',
            body: 'Live long and prosper',
          },
          {
            language: 'Elvish',
            body: 'Good morning',
          },
          {
            language: 'Esperanto',
            body: 'I love learning languages',
          },
          {
            language: 'Morse Code',
            body: 'Help',
          },
          {
            language: 'Emoji',
            body: 'I am feeling happy 😊',
          },
          {
            language: 'Binary',
            body: 'Yes',
          },
          {
            language: 'Javascript',
            body: 'Hello, World!',
          },
          {
            language: 'Shakespearean',
            body: 'To be or not to be',
          },
          {
            language: 'Leet Speak',
            body: 'You are amazing',
          },
          {
            language: 'Old English',
            body: 'What is thy name?',
          },
          {
            language: 'Yoda Speak',
            body: 'Strong with the force, you are',
          },
        ],
      };
      const input = JSON.stringify(obj);
      expect(extractJsonObjects(input)).toEqual([obj]);
    });

    it('should handle YAML-style unquoted strings', () => {
      const input = '{key: value, another_key: another value}';
      const expectedOutput = [{ key: 'value', another_key: 'another value' }];
      expect(extractJsonObjects(input)).toEqual(expectedOutput);
    });

    describe('convertSlashCommentsToHash', () => {
      it('should convert basic // comments to # comments', () => {
        const input = 'some text // this is a comment';
        const expected = 'some text # this is a comment';
        expect(convertSlashCommentsToHash(input)).toBe(expected);
      });

      it('should not convert // inside double quoted strings', () => {
        const input = '"this // is not a comment" // but this is';
        const expected = '"this // is not a comment" # but this is';
        expect(convertSlashCommentsToHash(input)).toBe(expected);
      });

      it('should not convert // inside single quoted strings', () => {
        const input = "'don't convert // here' // convert here";
        const expected = "'don't convert // here' # convert here";
        expect(convertSlashCommentsToHash(input)).toBe(expected);
      });

      it('should handle escaped quotes in strings', () => {
        const input = '"escaped \\" quote // not a comment" // real comment';
        const expected = '"escaped \\" quote // not a comment" # real comment';
        expect(convertSlashCommentsToHash(input)).toBe(expected);
      });

      it('should handle multiple comments in one line', () => {
        const input = 'text // first comment // not a second comment';
        const expected = 'text # first comment // not a second comment';
        expect(convertSlashCommentsToHash(input)).toBe(expected);
      });

      it('should handle comments at the start of the line', () => {
        const input = '// comment at start\ntext // comment at end';
        const expected = '# comment at start\ntext # comment at end';
        expect(convertSlashCommentsToHash(input)).toBe(expected);
      });

      it('should handle strings with multiple lines', () => {
        const input = dedent`
          line1 // comment 1
          "string with // not a comment"
          line3 // comment 2`;
        const expected = dedent`
          line1 # comment 1
          "string with // not a comment"
          line3 # comment 2`;
        expect(convertSlashCommentsToHash(input)).toBe(expected);
      });

      it('should handle nested quotes', () => {
        const input = '"outer \\"inner // not comment\\" still outer" // real comment';
        const expected = '"outer \\"inner // not comment\\" still outer" # real comment';
        expect(convertSlashCommentsToHash(input)).toBe(expected);
      });

      it('should handle mixed single and double quotes', () => {
        const input = '"contains \'nested\' // not comment" // real comment';
        const expected = '"contains \'nested\' // not comment" # real comment';
        expect(convertSlashCommentsToHash(input)).toBe(expected);
      });

      it('should handle empty strings', () => {
        expect(convertSlashCommentsToHash('')).toBe('');
      });

      it('should handle strings without comments', () => {
        const input = 'no comments here';
        expect(convertSlashCommentsToHash(input)).toBe(input);
      });

      it('should handle strings with only a comment', () => {
        const input = '// just a comment';
        const expected = '# just a comment';
        expect(convertSlashCommentsToHash(input)).toBe(expected);
      });

      it('should handle multiple sequential comment markers', () => {
        const input = 'text //// double comment';
        const expected = 'text ## double comment';
        expect(convertSlashCommentsToHash(input)).toBe(expected);
      });

      it('should handle JSON-like structures', () => {
        const input =
          '{\n  "key": "value", // comment here\n  "key2": "value2" // another comment\n}';
        const expected =
          '{\n  "key": "value", # comment here\n  "key2": "value2" # another comment\n}';
        expect(convertSlashCommentsToHash(input)).toBe(expected);
      });

      it('should handle comments after different types of values', () => {
        const inputs = [
          'null // after null',
          'true // after boolean',
          '42 // after number',
          '"string" // after string',
          '[] // after array',
          '{} // after object',
        ];
        const expected = inputs.map((input) => input.replace('//', '#'));
        inputs.forEach((input, i) => {
          expect(convertSlashCommentsToHash(input)).toBe(expected[i]);
        });
      });
    });

    it('should skip non-object YAML values', () => {
      const input = 'plain string {key: value} 42 {another: obj} true';
      const expectedOutput = [{ key: 'value' }, { another: 'obj' }];
      expect(extractJsonObjects(input)).toEqual(expectedOutput);
    });

    it('should handle YAML with mixed quoted and unquoted strings', () => {
      const input = '{unquoted: value, "quoted": "value", another: "mixed"}';
      const expectedOutput = [{ unquoted: 'value', quoted: 'value', another: 'mixed' }];
      expect(extractJsonObjects(input)).toEqual(expectedOutput);
    });

    it('should ignore YAML arrays and scalars', () => {
      const input = '[1, 2, 3] {obj: value} plain: string {another: obj}';
      const expectedOutput = [{ obj: 'value' }, { another: 'obj' }];
      expect(extractJsonObjects(input)).toEqual(expectedOutput);
    });

    it('should handle YAML with special characters', () => {
      const input = '{key: value with spaces, special: value!@#$%, empty:}';
      const expectedOutput = [{ key: 'value with spaces', special: 'value!@#$%', empty: null }];
      expect(extractJsonObjects(input)).toEqual(expectedOutput);
    });

    describe('LLM output scenarios', () => {
      it('should handle JSON with inline comments', () => {
        const input = dedent`
          {
            "reason": "The test passed",
            "score": 1.0 # The score is perfect because all criteria were met
          }`;
        const expectedOutput = [
          {
            reason: 'The test passed',
            score: 1.0,
          },
        ];
        expect(extractJsonObjects(input)).toEqual(expectedOutput);
      });

      it('should handle JSON with multiline string containing markdown', () => {
        const input = dedent`
          {
            "reason": "The summary provided is mostly accurate but contains some omissions:

            - Point 1: Details here
            - Point 2: More details

            Some additional context...",
            "score": 0.75
          }`;
        const expectedOutput = [
          {
            reason:
              'The summary provided is mostly accurate but contains some omissions:\n- Point 1: Details here - Point 2: More details\nSome additional context...',
            score: 0.75,
          },
        ];
        expect(extractJsonObjects(input)).toEqual(expectedOutput);
      });

      it('should handle JSON with unescaped backticks', () => {
        const input = dedent`
          {
            "reason": "\`\`The summary accurately reflects...",
            "score": 1.0
          }`;
        const expectedOutput = [
          {
            reason: '``The summary accurately reflects...',
            score: 1.0,
          },
        ];
        expect(extractJsonObjects(input)).toEqual(expectedOutput);
      });

      it('should handle JSON with trailing commas', () => {
        const input = dedent`
          {
            "key1": "value1",
            "key2": "value2",
          }`;
        const expectedOutput = [
          {
            key1: 'value1',
            key2: 'value2',
          },
        ];
        expect(extractJsonObjects(input)).toEqual(expectedOutput);
      });

      it('should handle multiple JSON objects in LLM output with text in between', () => {
        const input = dedent`
          Here's my analysis:
          {
            "first_point": "valid observation",
            "score": 0.8
          }

          And another point:
          {
            "second_point": "another observation",
            "score": 0.9
          }`;
        const expectedOutput = [
          {
            first_point: 'valid observation',
            score: 0.8,
          },
          {
            second_point: 'another observation',
            score: 0.9,
          },
        ];
        expect(extractJsonObjects(input)).toEqual(expectedOutput);
      });
    });
  });

  describe('orderKeys', () => {
    it('orders keys according to specified order', () => {
      const obj = { c: 3, a: 1, b: 2 };
      const order: (keyof typeof obj)[] = ['a', 'b', 'c'];
      const result = orderKeys(obj, order);
      expect(Object.keys(result)).toEqual(['a', 'b', 'c']);
    });

    it('places unspecified keys at the end', () => {
      const obj = { d: 4, b: 2, a: 1, c: 3 };
      const order: (keyof typeof obj)[] = ['a', 'b'];
      const result = orderKeys(obj, order);
      expect(Object.keys(result)).toEqual(['a', 'b', 'd', 'c']);
    });

    it('ignores specified keys that do not exist in the object', () => {
      const obj = { a: 1, c: 3 };
      const order = ['a', 'b', 'c', 'd'] as (keyof typeof obj)[];
      const result = orderKeys(obj, order);
      expect(Object.keys(result)).toEqual(['a', 'c']);
    });

    it('returns an empty object when input is empty', () => {
      const obj = {};
      const order = ['a', 'b', 'c'] as (keyof typeof obj)[];
      const result = orderKeys(obj, order);
      expect(result).toEqual({});
    });

    it('returns the original object when order is empty', () => {
      const obj = { c: 3, a: 1, b: 2 };
      const order: (keyof typeof obj)[] = [];
      const result = orderKeys(obj, order);
      expect(result).toEqual(obj);
    });

    it('preserves nested object structures', () => {
      const obj = { c: { x: 1 }, a: [1, 2], b: 2 };
      const order: (keyof typeof obj)[] = ['a', 'b', 'c'];
      const result = orderKeys(obj, order);
      expect(result).toEqual({ a: [1, 2], b: 2, c: { x: 1 } });
    });

    it('handles objects with symbol keys', () => {
      const sym1 = Symbol('sym1');
      const sym2 = Symbol('sym2');
      const obj = { [sym1]: 1, b: 2, [sym2]: 3, a: 4 };
      const order: (keyof typeof obj)[] = ['a', 'b'];
      const result = orderKeys(obj, order);
      expect(Object.getOwnPropertySymbols(result)).toEqual([sym1, sym2]);
      expect(Object.keys(result)).toEqual(['a', 'b']);
    });

    it('maintains the correct types for keys and values', () => {
      const obj = { a: 'string', b: 42, c: true, d: null, e: undefined };
      const order: (keyof typeof obj)[] = ['b', 'a', 'c', 'd', 'e'];
      const result = orderKeys(obj, order);
      expect(result).toEqual({ b: 42, a: 'string', c: true, d: null, e: undefined });
    });
  });

  describe('extractFirstJsonObject', () => {
    it('should extract the first JSON object from a string', () => {
      const input = '{"key1": "value1"} {"key2": "value2"}';
      const expected = { key1: 'value1' };
      expect(extractFirstJsonObject(input)).toEqual(expected);
    });

    it('should throw an error when no JSON objects are found', () => {
      const input = 'no json here';
      expect(() => extractFirstJsonObject(input)).toThrow(
        'Expected a JSON object, but got "no json here"',
      );
    });
  });
});
