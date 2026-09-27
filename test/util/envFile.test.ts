import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadEnvFiles } from '../../src/util/envFile';
import { mockProcessEnv } from './utils';

describe('loadEnvFiles', () => {
  let directory: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-env-file-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function writeEnv(name: string, content: string): string {
    const file = path.join(directory, name);
    fs.writeFileSync(file, content);
    return file;
  }

  it.each([
    {
      name: 'assignments, exports, comments, and whitespace',
      content: [
        '# ignored=value',
        '  export EXPORTED = value # trailing comment',
        'PLAIN =  two words  ',
        'EMPTY=',
        'COMMENT_ONLY= # comment',
        "SINGLE='  quoted # value  '",
        'DOUBLE="  quoted # value  "',
        'BACKTICK=`  quoted # value  `',
      ].join('\n'),
      expected: {
        EXPORTED: 'value',
        PLAIN: 'two words',
        EMPTY: '',
        COMMENT_ONLY: '',
        SINGLE: '  quoted # value  ',
        DOUBLE: '  quoted # value  ',
        BACKTICK: '  quoted # value  ',
      },
    },
    {
      name: 'escaped newlines and carriage returns only in double quotes',
      content:
        'DOUBLE="one\\ntwo\\rthree\\tfour"\nSINGLE=\'one\\ntwo\\rthree\'\nBACKTICK=`one\\ntwo\\rthree`\nPLAIN=one\\ntwo\\rthree',
      expected: {
        DOUBLE: 'one\ntwo\rthree\\tfour',
        SINGLE: 'one\\ntwo\\rthree',
        BACKTICK: 'one\\ntwo\\rthree',
        PLAIN: 'one\\ntwo\\rthree',
      },
    },
    {
      name: 'escaped quotes without truncating values or dropping backslashes',
      content: 'DOUBLE="one\\"two"\nSINGLE=\'one\\\'two\'\nBACKTICK=`one\\`two`',
      expected: {
        DOUBLE: 'one\\"two',
        SINGLE: "one\\'two",
        BACKTICK: 'one\\`two',
      },
    },
    {
      name: 'multiline values in every quote style',
      content: 'DOUBLE="one\n# two"\nSINGLE=\'three\nfour\'\nBACKTICK=`five\nsix`',
      expected: { DOUBLE: 'one\n# two', SINGLE: 'three\nfour', BACKTICK: 'five\nsix' },
    },
    {
      name: 'BOMs and both Windows and carriage-return-only line endings',
      content: '\uFEFFFIRST=one\r\nSECOND=two\rTHIRD="three\rfour"\rLAST=five',
      expected: { FIRST: 'one', SECOND: 'two', THIRD: 'three\nfour', LAST: 'five' },
    },
    {
      name: 'colon assignments and keys containing dots or hyphens',
      content: 'COLON: value\nwith.dot=yes\nwith-hyphen=yes\nNO_SPACE:value\nINVALID KEY=no',
      expected: { COLON: 'value', 'with.dot': 'yes', 'with-hyphen': 'yes' },
    },
    {
      name: 'duplicate keys, literal variable references, and invalid lines',
      content:
        'DUPLICATE=first\nnot an assignment\nDUPLICATE=last\nREFERENCE=${DUPLICATE}\nURL=https://example.com/?a=b\nUNFINISHED="literal\nNEXT=present',
      expected: {
        DUPLICATE: 'last',
        REFERENCE: '${DUPLICATE}',
        URL: 'https://example.com/?a=b',
        UNFINISHED: '"literal',
        NEXT: 'present',
      },
    },
  ])('parses $name', ({ content, expected }) => {
    const env: NodeJS.ProcessEnv = {};

    loadEnvFiles([writeEnv('values.env', content)], { processEnv: env });

    expect(env).toEqual(expected);
  });

  it('ignores string assignments to __proto__ and copies other prototype-named keys safely', () => {
    const env: NodeJS.ProcessEnv = {};
    const originalPrototype = Object.getPrototypeOf(env);
    const file = writeEnv(
      'prototype.env',
      '__proto__=ignored\nconstructor=constructor value\ntoString=string value\nhasOwnProperty=own value\nSAFE=value',
    );

    loadEnvFiles([file], { processEnv: env });

    expect(Object.getPrototypeOf(env)).toBe(originalPrototype);
    expect(Object.hasOwn(env, '__proto__')).toBe(false);
    expect(Object.keys(env)).toEqual(['constructor', 'toString', 'hasOwnProperty', 'SAFE']);
    expect(env.constructor).toBe('constructor value');
    expect(env.toString).toBe('string value');
    expect(env.hasOwnProperty).toBe('own value');
    expect(env.SAFE).toBe('value');
  });

  it('preserves existing own values, including empty strings and undefined', () => {
    const env: NodeJS.ProcessEnv = { HOST: 'host', EMPTY: '', UNDEFINED: undefined };
    const first = writeEnv('first.env', 'HOST=file\nEMPTY=file\nUNDEFINED=file\nSHARED=first');
    const second = writeEnv('second.env', 'SHARED=second\nADDED=second');

    loadEnvFiles([first, second], { processEnv: env });

    expect(env).toEqual({
      HOST: 'host',
      EMPTY: '',
      UNDEFINED: undefined,
      SHARED: 'first',
      ADDED: 'second',
    });
    expect(Object.hasOwn(env, 'UNDEFINED')).toBe(true);
  });

  it('lets later files override existing values, including with an empty string', () => {
    const env: NodeJS.ProcessEnv = { HOST: 'host', SHARED: 'host' };
    const first = writeEnv('first.env', 'HOST=first\nSHARED=first\nFIRST=present');
    const second = writeEnv('second.env', 'SHARED=\nSECOND=present');

    loadEnvFiles([first, second], { override: true, processEnv: env });

    expect(env).toEqual({ HOST: 'first', SHARED: '', FIRST: 'present', SECOND: 'present' });
  });

  it('continues loading after missing or unreadable files', () => {
    const env: NodeJS.ProcessEnv = {};
    const first = writeEnv('first.env', 'FIRST=present\nSHARED=first');
    const last = writeEnv('last.env', 'LAST=present\nSHARED=last');

    expect(() =>
      loadEnvFiles([first, path.join(directory, 'missing.env'), directory, last], {
        override: true,
        processEnv: env,
      }),
    ).not.toThrow();

    expect(env).toEqual({ FIRST: 'present', LAST: 'present', SHARED: 'last' });
  });

  it('loads the current directory default file without replacing the host environment', () => {
    const restoreEnv = mockProcessEnv({
      PROMPTFOO_ENV_FILE_HOST: 'host',
      PROMPTFOO_ENV_FILE_ADDED: undefined,
    });
    writeEnv('.env', 'PROMPTFOO_ENV_FILE_HOST=file\nPROMPTFOO_ENV_FILE_ADDED=added');
    vi.spyOn(process, 'cwd').mockReturnValue(directory);

    try {
      loadEnvFiles();

      expect(process.env.PROMPTFOO_ENV_FILE_HOST).toBe('host');
      expect(process.env.PROMPTFOO_ENV_FILE_ADDED).toBe('added');
    } finally {
      restoreEnv();
    }
  });

  it('tolerates a missing default file', () => {
    const env: NodeJS.ProcessEnv = { EXISTING: 'unchanged' };
    vi.spyOn(process, 'cwd').mockReturnValue(directory);

    expect(() => loadEnvFiles(undefined, { processEnv: env })).not.toThrow();
    expect(env).toEqual({ EXISTING: 'unchanged' });
  });

  it('expands a leading tilde using the home directory', () => {
    const env: NodeJS.ProcessEnv = {};
    writeEnv('home.env', 'FROM_HOME=present');
    vi.spyOn(os, 'homedir').mockReturnValue(directory);

    loadEnvFiles(['~/home.env'], { processEnv: env });

    expect(env).toEqual({ FROM_HOME: 'present' });
  });

  it('does not load a default file when given an empty list of paths', () => {
    const env: NodeJS.ProcessEnv = {};
    writeEnv('.env', 'UNEXPECTED=value');
    vi.spyOn(process, 'cwd').mockReturnValue(directory);

    loadEnvFiles([], { processEnv: env });

    expect(env).toEqual({});
  });
});
