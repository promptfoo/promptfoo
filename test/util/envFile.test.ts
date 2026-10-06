import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadEnvFiles } from '../../src/util/envFile';
import { mockProcessEnv } from './utils';

// These tests exercise default loading against temporary files.
vi.mock('../../src/util/envFile', async (importOriginal) => importOriginal());

describe('loadEnvFiles', () => {
  let directory: string;
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = mockProcessEnv({
      DOTENV_PATH: undefined,
      DOTENV_CONFIG_PATH: undefined,
      DOTENV_ENCODING: undefined,
      DOTENV_CONFIG_ENCODING: undefined,
      DOTENV_OVERRIDE: undefined,
      DOTENV_CONFIG_OVERRIDE: undefined,
    });
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-env-file-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function writeEnv(name: string, content: string, encoding: BufferEncoding = 'utf8'): string {
    const file = path.join(directory, name);
    fs.writeFileSync(file, content, encoding);
    return file;
  }

  describe('environment-configured defaults', () => {
    it.each(['DOTENV_PATH', 'DOTENV_CONFIG_PATH'])('loads the file selected by %s', (key) => {
      const file = writeEnv('selected.env', 'SELECTED=value');
      mockProcessEnv({ [key]: file, SELECTED: undefined });
      const env: NodeJS.ProcessEnv = {};

      loadEnvFiles(undefined, { processEnv: env });

      expect(env).toEqual({ SELECTED: 'value' });
      expect(process.env.SELECTED).toBeUndefined();
    });

    it.each(['selected.env', ''])(
      'gives a modern path priority over its legacy alias (%j)',
      (name) => {
        const selected = writeEnv(name || '.env', 'SELECTED=modern');
        const legacy = writeEnv('legacy.env', 'SELECTED=legacy');
        mockProcessEnv({ DOTENV_PATH: name ? selected : '', DOTENV_CONFIG_PATH: legacy });
        vi.spyOn(process, 'cwd').mockReturnValue(directory);
        const env: NodeJS.ProcessEnv = {};

        loadEnvFiles(undefined, { processEnv: env });

        expect(env).toEqual({ SELECTED: 'modern' });
      },
    );

    it('lets an explicit list of paths override environment-selected paths', () => {
      mockProcessEnv({ DOTENV_PATH: writeEnv('ignored.env', 'SELECTED=ignored') });
      const env: NodeJS.ProcessEnv = {};

      loadEnvFiles([writeEnv('explicit.env', 'SELECTED=explicit')], { processEnv: env });

      expect(env).toEqual({ SELECTED: 'explicit' });
      loadEnvFiles([], { processEnv: env, override: true });
      expect(env).toEqual({ SELECTED: 'explicit' });
    });

    it('does not fall back to .env when the configured path is missing', () => {
      writeEnv('.env', 'UNEXPECTED=value');
      vi.spyOn(process, 'cwd').mockReturnValue(directory);
      mockProcessEnv({ DOTENV_PATH: path.join(directory, 'missing.env') });
      const env: NodeJS.ProcessEnv = {};

      expect(() => loadEnvFiles(undefined, { processEnv: env })).not.toThrow();

      expect(env).toEqual({});
    });

    it('reads environment defaults again on each call', () => {
      const selected = writeEnv('selected.env', 'SELECTED=next');
      writeEnv('.env', `DOTENV_PATH=${selected}`);
      vi.spyOn(process, 'cwd').mockReturnValue(directory);
      mockProcessEnv({ SELECTED: undefined });

      loadEnvFiles();
      expect(process.env.SELECTED).toBeUndefined();
      loadEnvFiles();

      expect(process.env.SELECTED).toBe('next');
    });

    it.each(['DOTENV_ENCODING', 'DOTENV_CONFIG_ENCODING'])('decodes files using %s', (key) => {
      const file = writeEnv('encoded.env', 'ENCODED=value', 'utf16le');
      mockProcessEnv({ [key]: 'utf16le' });
      const env: NodeJS.ProcessEnv = {};

      loadEnvFiles([file], { processEnv: env });

      expect(env).toEqual({ ENCODED: 'value' });
    });

    it.each(['utf8', ''])(
      'gives modern encoding priority over its legacy alias (%j)',
      (encoding) => {
        mockProcessEnv({ DOTENV_ENCODING: encoding, DOTENV_CONFIG_ENCODING: 'utf16le' });
        const env: NodeJS.ProcessEnv = {};

        loadEnvFiles([writeEnv('encoded.env', 'ENCODED=value')], { processEnv: env });

        expect(env).toEqual({ ENCODED: 'value' });
      },
    );

    it.each(['DOTENV_OVERRIDE', 'DOTENV_CONFIG_OVERRIDE'])(
      'parses boolean defaults from %s',
      (key) => {
        const first = writeEnv('first.env', 'HOST=first\nSHARED=first');
        const last = writeEnv('last.env', 'HOST=last\nSHARED=last');
        for (const value of ['false', '0', 'No', 'OFF', '', 'true', '1', 'yes', ' false ']) {
          mockProcessEnv({ [key]: value });
          const env: NodeJS.ProcessEnv = { HOST: 'host' };

          loadEnvFiles([first, last], { processEnv: env });

          const override = !['false', '0', 'no', 'off', ''].includes(value.toLowerCase());
          expect(env).toEqual({
            HOST: override ? 'last' : 'host',
            SHARED: override ? 'last' : 'first',
          });
        }
      },
    );

    it.each(['false', ''])('does not fall back to a legacy override when modern is %j', (value) => {
      mockProcessEnv({ DOTENV_OVERRIDE: value, DOTENV_CONFIG_OVERRIDE: 'true' });
      const env: NodeJS.ProcessEnv = { HOST: 'host' };

      loadEnvFiles([writeEnv('host.env', 'HOST=file')], { processEnv: env });

      expect(env.HOST).toBe('host');
    });

    it.each([false, true])(
      'gives an explicit override=%j priority over environment defaults',
      (override) => {
        mockProcessEnv({ DOTENV_OVERRIDE: String(!override) });
        const env: NodeJS.ProcessEnv = { HOST: 'host' };

        loadEnvFiles([writeEnv('host.env', 'HOST=file')], { processEnv: env, override });

        expect(env.HOST).toBe(override ? 'file' : 'host');
      },
    );

    it('preserves an explicitly undefined override instead of using the environment default', () => {
      mockProcessEnv({ DOTENV_OVERRIDE: 'true' });
      const env: NodeJS.ProcessEnv = { HOST: 'host' };

      loadEnvFiles([writeEnv('host.env', 'HOST=file')], { processEnv: env, override: undefined });

      expect(env.HOST).toBe('host');
    });

    it('continues after read errors with environment-configured encoding and override', () => {
      mockProcessEnv({ DOTENV_ENCODING: 'utf16le', DOTENV_OVERRIDE: 'true' });
      const env: NodeJS.ProcessEnv = { HOST: 'host' };
      const first = writeEnv('first.env', 'HOST=first\nFIRST=value', 'utf16le');
      const last = writeEnv('last.env', 'HOST=last\nLAST=value', 'utf16le');

      loadEnvFiles([first, path.join(directory, 'missing.env'), directory, last], {
        processEnv: env,
      });

      expect(env).toEqual({ HOST: 'last', FIRST: 'value', LAST: 'value' });
    });

    it('treats an invalid encoding as a best-effort read failure', () => {
      mockProcessEnv({ DOTENV_ENCODING: 'not-an-encoding' });
      const env: NodeJS.ProcessEnv = { HOST: 'host' };

      expect(() =>
        loadEnvFiles([writeEnv('host.env', 'HOST=file\nEXTRA=value')], { processEnv: env }),
      ).not.toThrow();

      expect(env).toEqual({ HOST: 'host' });
    });

    it('reads defaults from the host environment, not the isolated destination', () => {
      const selected = writeEnv('selected.env', 'HOST=file\nSELECTED=value');
      const ignored = writeEnv('ignored.env', 'SELECTED=ignored');
      mockProcessEnv({ DOTENV_PATH: selected, DOTENV_OVERRIDE: 'false', SELECTED: undefined });
      const env: NodeJS.ProcessEnv = {
        DOTENV_PATH: ignored,
        DOTENV_OVERRIDE: 'true',
        HOST: 'local',
      };

      loadEnvFiles(undefined, { processEnv: env });

      expect(env).toEqual({
        DOTENV_PATH: ignored,
        DOTENV_OVERRIDE: 'true',
        HOST: 'local',
        SELECTED: 'value',
      });
      expect(process.env.SELECTED).toBeUndefined();
    });
  });

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
