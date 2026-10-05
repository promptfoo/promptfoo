import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import logger from '../../../src/logger';
import {
  applyQueryParams,
  discoverTokenEndpoint,
  getAuthHeaders,
  getAuthQueryParams,
  getMcpErrorMessage,
  getOAuthTokenWithExpiry,
  isMcpErrorResult,
  isMcpToolNameFilter,
  normalizeMcpToolContent,
  renderAuthVars,
  sanitizeMcpToolData,
} from '../../../src/providers/mcp/util';
import { sanitizeObject, sanitizeUrl } from '../../../src/util/sanitizer';

import type {
  MCPOAuthClientCredentialsAuth,
  MCPServerConfig,
} from '../../../src/providers/mcp/types';

// Mock fetchWithProxy for discovery tests
const mockFetch = vi.fn();

it('resolves MCP auth from file defaults unless explicit vars replace them', () => {
  const server: MCPServerConfig = { auth: { type: 'bearer', token: '{{MCP_TOKEN}}' } };
  cliState.withEnvFileOverrides({ MCP_TOKEN: 'file-token' }, () => {
    expect(renderAuthVars(server).auth).toEqual({ type: 'bearer', token: 'file-token' });
    expect(renderAuthVars(server, { MCP_TOKEN: 'explicit-token' }).auth).toEqual({
      type: 'bearer',
      token: 'explicit-token',
    });
  });
});
vi.mock('../../../src/util/fetch/index', () => ({
  fetchWithProxy: (...args: unknown[]) => mockFetch(...args),
}));

describe('sanitizeMcpToolData', () => {
  it('inspects repeatedly quoted URI components without requiring a template', () => {
    for (const prefix of [
      'mailto:alice@example.test?data=',
      'callback?data=',
      'https://example.test/#data=',
    ]) {
      for (const quoteDepth of [1, 2, 3]) {
        const fields = {
          password: 'non-template-quoted-fixture',
          label: 'a&b;public#tag',
          page: 2,
        };
        let value = prefix + encodeURIComponent(JSON.stringify(fields));
        let expected =
          prefix + encodeURIComponent(JSON.stringify({ ...fields, password: '[REDACTED]' }));
        let publicValue =
          prefix + encodeURIComponent(JSON.stringify({ label: 'public%22&a;b#c', page: 2 }));
        for (let i = 0; i < quoteDepth; i++) {
          value = JSON.stringify(value);
          expected = JSON.stringify(expected);
          publicValue = JSON.stringify(publicValue);
        }
        for (const role of ['apiHost', 'url', 'callbackUrl']) {
          const args = { [role]: JSON.stringify({ target: value, page: 2 }) };
          const original = structuredClone(args);
          expect(sanitizeMcpToolData(args)).toEqual({
            [role]: JSON.stringify({ target: expected, page: 2 }),
          });
          expect(args).toEqual(original);
          const publicArgs = { [role]: JSON.stringify({ target: publicValue, page: 2 }) };
          expect(sanitizeMcpToolData(publicArgs)).toEqual(publicArgs);
        }
      }
    }
  });

  it('sanitizes quoted URL/form payloads within decoded objects and arrays', () => {
    for (const role of ['url', 'apiBaseUrl', 'apiHost', 'callbackUrl']) {
      for (const prefix of ['https://example.test/?data=', 'callback?data=', 'callback#data=']) {
        for (const quoteDepth of [1, 2]) {
          const fields = { password: 'quoted-fixture', page: 2 };
          let payload = `${prefix}${encodeURIComponent(JSON.stringify(fields))}&label={{ x }}`;
          let expected = `${prefix}${encodeURIComponent(JSON.stringify({ ...fields, password: '[REDACTED]' }))}&label={{ x }}`;
          for (let i = 0; i < quoteDepth; i++) {
            payload = JSON.stringify(payload);
            expected = JSON.stringify(expected);
          }
          for (const wrap of [
            (value: string) => ({ data: value, page: 2 }),
            (value: string) => [value],
          ]) {
            const input = { [role]: JSON.stringify(wrap(payload)) };
            const original = structuredClone(input);
            expect(sanitizeMcpToolData(input)).toEqual({ [role]: JSON.stringify(wrap(expected)) });
            expect(input).toEqual(original);
          }
        }
      }
    }
  });

  it('retains raw provenance across an additional form layer', () => {
    for (const role of ['url', 'apiBaseUrl', 'callbackUrl']) {
      for (const password of [
        'extra-fixture%22',
        'extra-fixture%5c',
        'extra-fixture%ZZ',
        'extra-fixture&a;b#c',
      ]) {
        const fields = { password, label: 'public&a;b#c', page: 2 };
        const payload = `data=redirect=callback?data=${encodeURIComponent(JSON.stringify(fields))}&label={{ x }}`;
        const safeChild = `callback?data=${encodeURIComponent(JSON.stringify({ ...fields, password: '[REDACTED]' }))}`;
        const expected = `data=${encodeURIComponent(`redirect=${encodeURIComponent(safeChild)}`)}&label={{ x }}`;
        const input = { [role]: payload };
        const original = structuredClone(input);
        expect(sanitizeMcpToolData(input)).toEqual({ [role]: expected });
        expect(input).toEqual(original);
      }
    }
  });

  it('preserves public quoted and nested-form components byte for byte', () => {
    const fields = { '%70age': 2, note: 'public%20safe&a;b#c' };
    const value = `data=redirect=callback?data=${encodeURIComponent(JSON.stringify(fields))}&label={{ x }}`;
    for (const role of ['url', 'apiBaseUrl', 'callbackUrl']) {
      for (const payload of [value, JSON.stringify({ data: JSON.stringify(value) })]) {
        const input = { [role]: payload };
        expect(sanitizeMcpToolData(input)).toEqual(input);
      }
    }
  });

  it('keeps pending decode controls aligned across multiple form owners', () => {
    for (const wrappers of [1, 2, 3]) {
      for (const value of [
        'includeCredentials=%2574rue',
        'withPassword=%2566alse',
        'password=%7B%7B%20password%20%7D%7D',
      ]) {
        const input = {
          url: `https://outer.test/?data=${'data='.repeat(wrappers)}redirect=callback?${value}&page=2`,
        };
        expect(sanitizeMcpToolData(input)).toEqual(input);
      }
      const data = JSON.stringify({ '%70assword': 'pending-key-fixture', label: 'a;b' });
      const input = {
        url: `${'data='.repeat(wrappers)}redirect=https://example.test/?data=${encodeURIComponent(data)}&label={{ x }}`,
      };
      expect(JSON.stringify(sanitizeMcpToolData(input))).not.toContain('pending-key-fixture');
    }
  });

  it('distinguishes public mailbox form paths from actual host credentials', () => {
    for (const value of [
      'data=data%3Dmailto%3Aalice%40example.test',
      'data=mailto:alice@example.test',
      'data=data=mailto:{{ user }}@example.test',
      'data=jdbc%3Adb%3Bdata%3Dmailto%3Aalice%40example.test',
      'https://host/?data=data%3Dmailto%3Aalice%40example.test',
      'https://host/#data=data%3Dmailto%3Aalice%40example.test',
    ]) {
      const args = {
        apiHost: value,
        env: { SERVICE_HOST: value },
        url: JSON.stringify({ apiHost: value, page: 2 }),
      };
      const original = structuredClone(args);
      expect(sanitizeMcpToolData(args)).toEqual(args);
      expect(args).toEqual(original);
    }
    for (const value of [
      'data=mailto:alice@example.test?password=mailbox-fixture',
      'data=mailto:alice@example.test?token=mailbox-fixture',
      'data=alice:mailbox-fixture@example.test',
      'data=data=alice:mailbox-fixture@example.test%ZZ',
      'data=data=alice:mailbox-fixture@example.test%FF',
      'data=alice:mailbox-fixture=mailto:other@example.test',
    ]) {
      const args = {
        apiHost: value,
        env: { SERVICE_HOST: value },
        url: JSON.stringify({ apiHost: value, page: 2 }),
      };
      const original = structuredClone(args);
      expect(JSON.stringify(sanitizeMcpToolData(args))).not.toContain('mailbox-fixture');
      expect(args).toEqual(original);
    }
    // The existing generic helper does not opt into the mailbox interpretation.
    expect(
      sanitizeObject(
        { apiHost: 'data=data%3Dmailto%3Aalice%40example.test' },
        { sanitizeUrls: true },
      ),
    ).toEqual({ apiHost: 'data=data%3Dmailto%3Aalice%40example.test' });
  });

  it('bounds nested mailbox and pending form ownership without changing public bytes', () => {
    for (const levels of [1, 4, 12, 24]) {
      let value = 'mailto:alice@example.test';
      for (let i = 0; i < levels; i++) {
        value = `data=${encodeURIComponent(value)}`;
      }
      const input = { apiHost: value };
      const parse = vi.spyOn(JSON, 'parse');
      let result: unknown;
      let calls = 0;
      try {
        result = sanitizeMcpToolData(input);
        calls = parse.mock.calls.length;
      } finally {
        parse.mockRestore();
      }
      expect(result).toEqual(input);
      expect(calls).toBeLessThan(levels * 3 + 10);
    }
    let privateValue = 'alice:bounded-mailbox-fixture@example.test';
    for (let i = 0; i < 65; i++) {
      privateValue = `data=${encodeURIComponent(privateValue)}`;
    }
    expect(JSON.stringify(sanitizeMcpToolData({ apiHost: privateValue }))).not.toContain(
      'bounded-mailbox-fixture',
    );
  });

  it('retains valid JSON provenance through nested form URL decoding', () => {
    for (const prefix of [
      'callback?data=',
      '/callback?data=',
      '//host/path?data=',
      'https://host/path?data=',
      'callback#data=',
      'https://host/path#data=',
    ]) {
      for (const suffix of ['%22', '%5c', '%0A', '%ZZ']) {
        const data = JSON.stringify({
          password: `percent-fixture${suffix}`,
          label: 'a&b;public#tag',
          page: 2,
        });
        for (const encodeOuter of [(value: string) => value, encodeURIComponent]) {
          const value = `redirect=${encodeOuter(`${prefix}${encodeURIComponent(data)}`)}&label={{ label }}`;
          const args = { url: value, callbackUrl: value, env: { SERVICE_URL: value } };
          const original = structuredClone(args);
          expect(JSON.stringify(sanitizeMcpToolData(args))).not.toContain('percent-fixture');
          expect(args).toEqual(original);
          const publicData = JSON.stringify({ label: `a&b;public#tag${suffix}`, page: 2 });
          const publicValue = `redirect=${encodeOuter(`${prefix}${encodeURIComponent(publicData)}`)}&label={{ label }}`;
          const publicArgs = { url: publicValue, callbackUrl: publicValue };
          expect(sanitizeMcpToolData(publicArgs)).toEqual(publicArgs);
        }
      }
    }
  });

  it('preserves boolean credential controls through a pending component decode', () => {
    for (const name of ['includeCredentials', 'requireApiKey', 'withPassword']) {
      for (const value of ['%2574rue', '%2566alse']) {
        const args = { url: `https://outer.test/?redirect=callback?${name}=${value}` };
        expect(sanitizeMcpToolData(args)).toEqual(args);
      }
    }
  });

  it('preserves the existing template and logging roles during a pending decode', () => {
    const value = 'https://outer.test/?redirect=callback?password=%7B%7B%20password%20%7D%7D';
    expect(sanitizeMcpToolData({ url: value })).toEqual({ url: value });
    expect(sanitizeMcpToolData({ apiBaseUrl: value })).toEqual({
      apiBaseUrl: 'https://outer.test/?redirect=%5BREDACTED%5D',
    });
    const partial = `https://outer.test/?redirect=callback?password=${encodeURIComponent('pending-private-fixture{{ password }}')}`;
    expect(JSON.stringify(sanitizeMcpToolData({ url: partial }))).not.toContain(
      'pending-private-fixture',
    );
  });

  it('prefers a valid decoded JSON container over its raw spelling', () => {
    const publicData = JSON.stringify({ '%70age': 2, note: 'public%20safe' });
    const publicArgs = {
      url: `redirect=callback?data=${encodeURIComponent(publicData)}&label={{ label }}`,
    };
    expect(sanitizeMcpToolData(publicArgs)).toEqual(publicArgs);
    for (const value of [
      'data={"%70assword":"decoded-key-fixture","page":2}',
      'redirect=callback?data={"%70assword":"decoded-key-fixture","page":2}&label={{ label }}',
      'redirect=https://host/path?data={"%70assword":"decoded-key-fixture","page":2}&label={{ label }}',
    ]) {
      expect(JSON.stringify(sanitizeMcpToolData({ url: value }))).not.toContain(
        'decoded-key-fixture',
      );
    }
    for (const key of ['%70assword', 'api%4Bey']) {
      const data = JSON.stringify({ [key]: 'decoded-key-fixture%ZZ', label: 'a;b' });
      const value = `redirect=https://host/path?data=${encodeURIComponent(data)}&label={{ label }}`;
      expect(JSON.stringify(sanitizeMcpToolData({ url: value }))).not.toContain(
        'decoded-key-fixture',
      );
    }
    const queryKey =
      'redirect=https://host/path?%2570assword=decoded-key-fixture&label={{ label }}';
    expect(JSON.stringify(sanitizeMcpToolData({ url: queryKey }))).not.toContain(
      'decoded-key-fixture',
    );
    const value = `redirect=callback?data=${encodeURIComponent(JSON.stringify({ password: 'percent-fixture%22' }))}&label={{ label }}`;
    const safeValue = `redirect=callback?data=${encodeURIComponent(JSON.stringify({ password: '[REDACTED]' }))}&label={{ label }}`;
    expect(sanitizeObject({ url: value }, { sanitizeUrls: true })).toEqual({ url: safeValue });
  });

  it('aligns raw query JSON with duplicate and empty parsed entries', () => {
    const data = JSON.stringify({ password: 'aligned-fixture%22', page: 2 });
    for (const separator of ['&', '&&', '&\t&', '&\r\n&']) {
      for (const query of [
        `public=1${separator}data=${data}${separator}data={"page":2}`,
        `data={"page":2}${separator}data=${data}${separator}empty=`,
      ]) {
        const args = { url: `https://host/path?${query}` };
        expect(JSON.stringify(sanitizeMcpToolData(args))).not.toContain('aligned-fixture');
      }
      const publicArgs = {
        url: `https://host/path?data={"label":"public%22"}${separator}data={"page":2}`,
      };
      expect(sanitizeMcpToolData(publicArgs)).toEqual(publicArgs);
    }
  });

  it('keeps provenance fallback traversal bounded across nested containers', () => {
    let value = 'public%22';
    for (let depth = 0; depth < 9; depth++) {
      value = `redirect=callback?data=${encodeURIComponent(JSON.stringify({ url: value }))}&label={{ label }}`;
    }
    const args = { url: value };
    const parse = vi.spyOn(JSON, 'parse');
    let result: unknown;
    let calls = 0;
    try {
      result = sanitizeMcpToolData(args);
      calls = parse.mock.calls.length;
    } finally {
      parse.mockRestore();
    }
    expect(result).toEqual(args);
    expect(calls).toBeLessThan(200);
    for (const maxDepth of [0, 1, 2, 4, 8, 64]) {
      const input = { url: value };
      // A private leaf has a declared field role at every supported depth.
      const secret = {
        url: `redirect=callback?data=${encodeURIComponent(JSON.stringify({ password: 'depth-fixture%22', child: input }))}`,
      };
      expect(
        JSON.stringify(
          sanitizeObject(secret, { sanitizeUrls: true, redactCompoundKeys: true, maxDepth }),
        ),
      ).not.toContain('depth-fixture');
    }
  });

  it('preserves public sibling text while redacting a nested encoded credential', () => {
    for (const password of ['fixture', 'fixture%22', 'fixture%5c']) {
      for (const label of ['a&b', 'a;b', 'a#b']) {
        const child = `https://example.test/callback?data=${encodeURIComponent(JSON.stringify({ password, label }))}`;
        const result = sanitizeMcpToolData({ url: `redirect=${child}&label={{ label }}` }) as {
          url: string;
        };
        const redirect = new URLSearchParams(result.url).get('redirect')!;
        expect(JSON.parse(new URL(redirect).searchParams.get('data')!)).toEqual({
          password: '[REDACTED]',
          label,
        });
      }
    }
  });

  it('retains unresolved query URL userinfo while checking the pending component decode', () => {
    for (const role of ['url', 'apiBaseUrl', 'callbackUrl']) {
      const prefix = encodeURIComponent('https://{{ user }}:{{ password }}@example.test/callback');
      const publicChild = `${prefix}?data=${encodeURIComponent(JSON.stringify({ label: 'a&b' }))}`;
      const publicArgs = { [role]: `https://outer.example/?redirect=${publicChild}` };
      expect(sanitizeMcpToolData(publicArgs)).toEqual(publicArgs);
      const privateChild = `${prefix}?data=${encodeURIComponent(JSON.stringify({ password: 'template-percent-fixture%22', label: 'a&b' }))}`;
      expect(
        JSON.stringify(
          sanitizeMcpToolData({ [role]: `https://outer.example/?redirect=${privateChild}` }),
        ),
      ).not.toContain('template-percent-fixture');
    }
  });
  const omitted = '[MCP tool data omitted: it could not be sanitized]';

  it('checks relative query JSON within form-valued URLs without losing templates', () => {
    for (const prefix of ['callback?data=', '//host/path?data=', 'callback#data=']) {
      for (const encode of [(value: string) => value, encodeURIComponent]) {
        const data = JSON.stringify({ password: 'query-fixture', page: 2 });
        const value = `redirect=${prefix}${encode(data)}&label={{ label }}`;
        const safeValue = `redirect=${encodeURIComponent(`${prefix}${encodeURIComponent(JSON.stringify({ password: '[REDACTED]', page: 2 }))}`)}&label={{ label }}`;
        const args = { url: value, callbackUrl: value, env: { SERVICE_URL: value } };
        const original = structuredClone(args);
        expect(sanitizeMcpToolData(args)).toEqual({
          url: safeValue,
          callbackUrl: safeValue,
          env: { SERVICE_URL: safeValue },
        });
        expect(args).toEqual(original);
      }
    }
  });

  it('preserves public form queries and protects JSON with internal templates', () => {
    const publicValue = 'redirect=callback?data=%7B%22page%22%3A2%7D&label={{ label }}';
    const args = { url: publicValue, apiHost: publicValue, callbackUrl: publicValue };
    expect(sanitizeMcpToolData(args)).toEqual(args);
    const data = JSON.stringify({ password: 'query-fixture', label: '{{ label }}' });
    const safeData = JSON.stringify({ password: '[REDACTED]', label: '{{ label }}' });
    expect(sanitizeMcpToolData({ url: `data=${encodeURIComponent(data)}` })).toEqual({
      url: `data=${encodeURIComponent(safeData)}`,
    });
    expect(sanitizeUrl(publicValue)).toBe(publicValue);
  });

  it('visits nested form/query JSON once at each level', () => {
    let value = 'public';
    for (let depth = 0; depth < 9; depth++) {
      value = `redirect=callback?x=public&data=${encodeURIComponent(JSON.stringify({ url: value }))}&label={{ label }}`;
    }
    const args = { url: value };
    const original = structuredClone(args);
    const parse = vi.spyOn(JSON, 'parse');
    let result: unknown;
    let calls = 0;
    try {
      result = sanitizeMcpToolData(args);
      calls = parse.mock.calls.length;
    } finally {
      parse.mockRestore();
    }
    expect(result).toEqual(args);
    expect(args).toEqual(original);
    expect(calls).toBeLessThan(200);
  });

  it('preserves special-token metadata while checking descendants and inherited credentials', () => {
    for (const name of [
      'specialTokens',
      'special_tokens',
      'additionalSpecialTokens',
      'additional_special_tokens',
    ]) {
      const data = { [name]: ['<s>', 12, { databasePassword: 'token-fixture', label: 'public' }] };
      const safeData = { [name]: ['<s>', 12, { databasePassword: '[REDACTED]', label: 'public' }] };
      for (const encode of [
        (value: unknown) => value,
        (value: unknown) => JSON.stringify(value),
        (value: unknown) => `data=${encodeURIComponent(JSON.stringify(value))}`,
      ]) {
        const args = { payload: encode(data) };
        const original = structuredClone(args);
        expect(sanitizeMcpToolData(args)).toEqual({ payload: encode(safeData) });
        expect(args).toEqual(original);
      }
      expect(sanitizeMcpToolData({ apiKeysByTenant: { [name]: ['fixture', 12] } })).toEqual({
        apiKeysByTenant: { [name]: ['[REDACTED]', '[REDACTED]'] },
      });
      const publicData = { [name]: ['<s>', '</s>', 12] };
      expect(sanitizeObject(publicData, { sanitizeUrls: true })).toEqual(publicData);
    }
    expect(sanitizeMcpToolData({ accessTokens: ['fixture'], authTokens: ['fixture'] })).toEqual({
      accessTokens: ['[REDACTED]'],
      authTokens: ['[REDACTED]'],
    });
  });

  it('retains inherited host credential checks when authority parsing fails', () => {
    for (const authority of [
      'alice:host-fixture@db:badport',
      'alice:host-fixture@bad host',
      'alice:host-fixture@[bad]',
      'alice:host-fixture@',
      'alice:host-fixture@{{ host }}',
    ]) {
      for (const field of ['target', 'url', 'callbackUrl', 'apiBaseUrl']) {
        const payload = JSON.stringify({ [field]: authority, page: 2 });
        const args = { apiHost: payload, env: { SERVICE_HOST: payload } };
        const original = structuredClone(args);
        const expected = JSON.stringify({ [field]: '[REDACTED]', page: 2 });
        expect(sanitizeMcpToolData(args)).toEqual({
          apiHost: expected,
          env: { SERVICE_HOST: expected },
        });
        expect(args).toEqual(original);
      }
    }
    const payload = JSON.stringify({
      'alice:host-fixture@db:badport': 'GET',
      '[REDACTED]': 'authored',
      page: 2,
    });
    expect(sanitizeMcpToolData({ apiHost: payload })).toEqual({
      apiHost: JSON.stringify({ '[REDACTED]#1': 'GET', '[REDACTED]': 'authored', page: 2 }),
    });
  });

  it('keeps inherited host checks on URL fields with unrelated template markers', () => {
    for (const value of [
      'alice:host-fixture@db/path?q={{ q }}',
      'alice:host-fixture@db/{{ path }}',
      'alice:host-fixture@db/path#{{ fragment }}',
    ]) {
      const payload = JSON.stringify({
        url: value,
        callbackUrl: value,
        apiBaseUrl: value,
        page: 2,
      });
      const expected = JSON.stringify({
        url: '[REDACTED]',
        callbackUrl: '[REDACTED]',
        apiBaseUrl: '[REDACTED]',
        page: 2,
      });
      const args = { apiHost: payload, env: { SERVICE_HOST: payload } };
      const original = structuredClone(args);
      expect(sanitizeMcpToolData(args)).toEqual({
        apiHost: expected,
        env: { SERVICE_HOST: expected },
      });
      expect(args).toEqual(original);
      expect(sanitizeObject({ url: value }, { sanitizeUrls: true })).toEqual({ url: value });
    }
  });

  it('checks repeatedly quoted form scalars with the bounded logging path policy', () => {
    for (const quotes of [1, 2, 3]) {
      let secret = 'https://host/token/loggingfixture123456';
      let publicValue = 'https://host/public/page';
      for (let count = 0; count < quotes; count++) {
        secret = JSON.stringify(secret);
        publicValue = JSON.stringify(publicValue);
      }
      const args = {
        apiHost: `data=${secret}`,
        apiBaseUrl: `data=${secret}`,
        env: { SERVICE_HOST: `data=${secret}` },
      };
      const original = structuredClone(args);
      expect(sanitizeMcpToolData(args)).toEqual({
        apiHost: 'data=%5BREDACTED%5D',
        apiBaseUrl: 'data=%5BREDACTED%5D',
        env: { SERVICE_HOST: 'data=%5BREDACTED%5D' },
      });
      expect(args).toEqual(original);
      const publicArgs = {
        apiHost: `data=${publicValue}`,
        apiBaseUrl: `data=${publicValue}`,
        env: { SERVICE_HOST: `data=${publicValue}` },
      };
      expect(sanitizeMcpToolData(publicArgs)).toEqual(publicArgs);
    }
  });

  it('preserves public host data and opaque container names with the inherited guard', () => {
    const payload = JSON.stringify({
      target: 'alice@bad host',
      url: 'alice@example.test/public?q={{ q }}',
      callbackUrl: 'mailto:alice@example.test',
      apiBaseUrl: 'urn:example:public',
      '{"target":"alice:opaque-name@db:badport"}': 'public',
      page: 2,
    });
    const args = { apiHost: payload, env: { SERVICE_HOST: payload } };
    expect(sanitizeMcpToolData(args)).toEqual(args);
  });

  it('preserves ordinary token count and piece families while checking descendants', () => {
    for (const field of [
      'logitTokens',
      'reservedTokens',
      'numTokens',
      'num_tokens',
      'numInputTokens',
      'totalTokens',
      'cachedTokens',
      'reasoningTokens',
      'cachedInputTokens',
      'audioInputTokens',
      'num_output_tokens',
      'cacheReadInputTokens',
      'cache_creation_input_tokens',
      'cachedVideoPromptTokens',
      'total_reasoning_tokens',
      'num_input_image_tokens',
      'max_output_tokens',
      'prompt_cache_hit_tokens',
      'accepted_prediction_tokens',
    ]) {
      const data = {
        [field]: { count: 3, items: ['public', 12], databasePassword: 'nested-fixture' },
      };
      const safe = { [field]: { count: 3, items: ['public', 12], databasePassword: '[REDACTED]' } };
      for (const encode of [
        (value: unknown) => value,
        (value: unknown) => JSON.stringify(value),
        (value: unknown) => `data=${encodeURIComponent(JSON.stringify(value))}`,
      ]) {
        const args = { one: { two: { three: { four: { five: encode(data) } } } } };
        const original = structuredClone(args);
        expect(sanitizeMcpToolData(args)).toEqual({
          one: { two: { three: { four: { five: encode(safe) } } } },
        });
        expect(args).toEqual(original);
      }
      expect(
        sanitizeMcpToolData({ apiKeysByTenant: { [field]: ['private-fixture', 123] } }),
      ).toEqual({
        apiKeysByTenant: { [field]: ['[REDACTED]', '[REDACTED]'] },
      });
      expect(sanitizeObject({ [field]: { count: 3, items: ['public', 12] } })).toEqual({
        [field]: { count: 3, items: ['public', 12] },
      });
    }
    for (const field of ['accessTokens', 'authTokens', 'sessionTokens', 'clientTokens']) {
      expect(sanitizeMcpToolData({ [field]: ['private-fixture', 123] })).toEqual({
        [field]: ['[REDACTED]', '[REDACTED]'],
      });
    }
  });

  it('inspects encoded form payloads in structural URL keys with the remaining depth', () => {
    for (const payload of [
      'jdbc:db;password=encoded-key-fixture',
      'data=' + encodeURIComponent('password=encoded-key-fixture'),
      JSON.stringify({ databasePassword: 'encoded-key-fixture', page: 2 }),
    ]) {
      const key = `callback?data=${encodeURIComponent(payload)}`;
      for (const fields of [
        { [key]: 'GET', '[REDACTED]': 'authored' },
        { headers: { [key]: 'GET', '[REDACTED]': 'authored' } },
        { authHeaders: { [key]: 'GET', '[REDACTED]': 'authored' } },
      ]) {
        const args = { apiHost: JSON.stringify({ ...fields, page: 2 }) };
        const original = structuredClone(args);
        const result = sanitizeMcpToolData(args) as typeof args;
        expect(result.apiHost).not.toContain('encoded-key-fixture');
        expect(JSON.parse(result.apiHost).page).toBe(2);
        expect(result.apiHost).toContain('[REDACTED]#1');
        expect(args).toEqual(original);
      }
    }
    for (const key of [
      'callback?data=' + encodeURIComponent('jdbc:db;page=2'),
      'callback?data=' + encodeURIComponent(JSON.stringify({ page: 2, label: 'public' })),
      'callback?data=',
      JSON.stringify({ target: 'callback?data=jdbc%3Adb%3Bpassword%3Dopaque-name' }),
    ]) {
      const args = { apiHost: JSON.stringify({ [key]: 'GET', page: 2 }) };
      expect(sanitizeMcpToolData(args)).toEqual(args);
    }
    let payload = 'password=encoded-key-fixture';
    for (let index = 0; index < 6; index++) {
      payload = `data=${encodeURIComponent(payload)}`;
    }
    const args = { apiHost: JSON.stringify({ [`callback?${payload}`]: 'GET', page: 2 }) };
    expect(
      JSON.stringify(
        sanitizeObject(args, {
          redactCompoundKeys: true,
          sanitizeUrls: true,
          maxDepth: 3,
        }),
      ),
    ).not.toContain('encoded-key-fixture');
  });

  it('checks unquoted host form segments before hostname normalization', () => {
    for (const delimiter of [';', '&']) {
      for (const host of ['apiHost', 'SERVICE_HOST']) {
        const value = `db${delimiter}api_key=host-form-fixture`;
        const fields = host === 'apiHost' ? { apiHost: value } : { env: { SERVICE_HOST: value } };
        const args = { url: JSON.stringify({ ...fields, page: 2 }) };
        const original = structuredClone(args);
        expect(JSON.stringify(sanitizeMcpToolData(args))).not.toContain('host-form-fixture');
        expect(args).toEqual(original);
        const publicFields = JSON.parse(
          JSON.stringify(fields).replace(value, `db${delimiter}page=2`),
        );
        const publicArgs = { url: JSON.stringify({ ...publicFields, page: 2 }) };
        expect(sanitizeMcpToolData(publicArgs)).toEqual(publicArgs);
      }
    }
  });

  it('inspects scalar query payloads once with their inherited URL policy', () => {
    for (const value of [
      'https://alice:query-fixture@example.test/',
      'https:alice:query-fixture@example.test/',
      JSON.stringify('https:alice:query-fixture@example.test/'),
      'data=https:alice:query-fixture@example.test/',
      JSON.stringify({ target: 'https:alice:query-fixture@example.test/', page: 2 }),
    ]) {
      const target = `mailto:ops@example.test?body=${encodeURIComponent(value)}`;
      const args = { url: JSON.stringify({ target, page: 2 }) };
      const original = structuredClone(args);
      expect(JSON.stringify(sanitizeMcpToolData(args))).not.toContain('query-fixture');
      expect(args).toEqual(original);
    }
    const args = {
      url: JSON.stringify({
        target: 'mailto:ops@example.test?body=https://alice:query-fixture@example.test',
        page: 2,
      }),
    };
    expect(JSON.stringify(sanitizeMcpToolData(args))).not.toContain('query-fixture');
    for (const value of ['https://example.test/public', 'A public message', '{"page":2}']) {
      const target = `mailto:ops@example.test?body=${encodeURIComponent(value)}`;
      const publicArgs = { url: JSON.stringify({ target, page: 2 }) };
      expect(sanitizeMcpToolData(publicArgs)).toEqual(publicArgs);
    }
    for (const role of ['url', 'apiBaseUrl', 'apiHost']) {
      const template = 'https://{{ user }}:{{ password }}@example.test/public';
      for (const value of [template, JSON.stringify(template)]) {
        const target = `mailto:ops@example.test?body=${encodeURIComponent(value)}`;
        const publicArgs = { [role]: JSON.stringify({ target, page: 2 }) };
        expect(sanitizeMcpToolData(publicArgs)).toEqual(publicArgs);
      }
      for (const value of [
        `${template}?api_key=literal-fixture`,
        `${template}#api_key=literal-fixture`,
        'https://{{ user }}:literal-fixture@example.test/',
        'https://alice:{{ password }}@example.test/?api_key=literal-fixture',
      ]) {
        const target = `mailto:ops@example.test?body=${encodeURIComponent(value)}`;
        expect(
          JSON.stringify(sanitizeMcpToolData({ [role]: JSON.stringify({ target, page: 2 }) })),
        ).not.toContain('literal-fixture');
      }
    }
    let nested = 'https://alice:query-budget-fixture@example.test/';
    for (let index = 0; index < 6; index++) {
      nested = `mailto:ops@example.test?body=${encodeURIComponent(nested)}`;
    }
    const bounded = sanitizeObject(
      { url: JSON.stringify({ target: nested, page: 2 }) },
      { sanitizeUrls: true, redactCompoundKeys: true, maxDepth: 3 },
    );
    expect(JSON.stringify(bounded)).not.toContain('query-budget-fixture');
  });

  it('retains schemeless authority checks only for decoded host payloads', () => {
    const target = 'alice:host-authority-fixture@example.test/path';
    for (const fields of [
      { apiHost: JSON.stringify({ target, page: 2 }) },
      { env: { SERVICE_HOST: JSON.stringify({ target, page: 2 }) } },
    ]) {
      expect(JSON.stringify(sanitizeMcpToolData(fields))).not.toContain('host-authority-fixture');
    }
    for (const username of ['[alice]', '{alice}']) {
      const target = `${username}:bracketed-authority-fixture@example.test`;
      for (const fields of [{ target }, { [target]: 'public' }]) {
        const args = { apiHost: JSON.stringify({ ...fields, page: 2 }) };
        expect(JSON.stringify(sanitizeMcpToolData(args))).not.toContain(
          'bracketed-authority-fixture',
        );
      }
    }
    const ordinary = { url: JSON.stringify({ target, page: 2 }) };
    expect(sanitizeMcpToolData(ordinary)).toEqual(ordinary);
    const publicArgs = { apiHost: JSON.stringify({ target: 'example.test/public', page: 2 }) };
    expect(sanitizeMcpToolData(publicArgs)).toEqual(publicArgs);
    for (const target of ['mailto:alice@example.test', 'tel:+15551234567', 'urn:example:public']) {
      const publicArgs = { apiHost: JSON.stringify({ target, page: 2 }) };
      expect(sanitizeMcpToolData(publicArgs)).toEqual(publicArgs);
    }
    for (const value of [
      'alice@example.test',
      JSON.stringify({ target: 'alice:opaque-name-fixture@host/path' }),
      JSON.stringify(['https:alice:opaque-name-fixture@host/']),
    ]) {
      const publicArgs = {
        apiHost: JSON.stringify({ [value]: 'public', address: 'alice@example.test', page: 2 }),
      };
      expect(sanitizeMcpToolData(publicArgs)).toEqual(publicArgs);
    }
  });

  it('checks embedded userinfo in malformed decoded form segments and structural keys', () => {
    for (const prefix of ['relative&redirect=', 'db;redirect=', 'jdbc:db;redirect=']) {
      const value = `${prefix}https:\\alice:embedded-fixture@example.test/`;
      for (const fields of [
        { target: value },
        { items: [value] },
        { [value]: 'public', '[REDACTED]': 'authored' },
        { headers: { Accept: value } },
      ]) {
        const args = { apiHost: JSON.stringify({ ...fields, page: 2 }) };
        const original = structuredClone(args);
        const sanitized = sanitizeMcpToolData(args) as typeof args;
        expect(JSON.stringify(sanitized)).not.toContain('embedded-fixture');
        expect(JSON.parse(sanitized.apiHost).page).toBe(2);
        expect(args).toEqual(original);
      }
      const publicArgs = {
        apiHost: JSON.stringify({ target: `${prefix}https://example.test/public`, page: 2 }),
      };
      expect(sanitizeMcpToolData(publicArgs)).toEqual(publicArgs);
    }
  });

  it('keeps deeply nested arguments while redacting secrets at any depth', () => {
    const args = {
      query: {
        filter: {
          and: [
            { field: 'status', in: ['open', { any: [{ of: ['urgent', { level: { min: 3 } }] }] }] },
          ],
        },
      },
      connection: { options: { pool: { retry: { apiKey: 'tool-secret-value', attempts: 2 } } } },
    };

    expect(sanitizeMcpToolData(args)).toEqual({
      query: args.query,
      connection: { options: { pool: { retry: { apiKey: '[REDACTED]', attempts: 2 } } } },
    });
  });

  it.each([
    'databasePassword',
    'dbPassword',
    'database_password',
    'DB_PASSWORD',
    'dbPwd',
    'userPwd',
    'userSig',
    'tokenValue',
    'databasePasswordValue',
    'tokenHash',
    'databasePasswordEncrypted',
    'dbPwdV2Encrypted',
  ])('redacts compound credential %s in nested objects and JSON arguments', (key) => {
    const fields = {
      [key]: 'mcp-compound-fixture',
      pageToken: 'page-2',
      maxTokens: 100,
      databasePasswordEnabled: true,
      includeCredentials: false,
      usePwd: false,
      monkey: 'ordinary',
      key: 'record-name',
      'record.key': 'field-name',
      tokenCount: 12,
      credentialsRequired: false,
      tokenBudget: 4096,
      tokenIds: [101, 102],
      tokenUsage: { input: 4, output: 9 },
      signatureAlgorithm: 'SHA256',
      passwordPolicy: { minLength: 12 },
      accessTokenUrl: 'https://example.test/oauth/token',
    };
    const expected = { ...fields, [key]: '[REDACTED]' };
    const args = { one: { two: { three: { four: { items: [fields] } } } } };
    const original = structuredClone(args);

    expect(sanitizeMcpToolData(args)).toEqual({
      one: { two: { three: { four: { items: [expected] } } } },
    });
    expect(sanitizeMcpToolData({ encoded: JSON.stringify(args) })).toEqual({
      encoded: JSON.stringify({ one: { two: { three: { four: { items: [expected] } } } } }),
    });
    expect(args).toEqual(original);
  });

  it.each([
    (value: string) => `data=${encodeURIComponent(value)}`,
    (value: string) => `https://example.test/?data=${encodeURIComponent(value)}`,
    (value: string) => `https://example.test/#data=${encodeURIComponent(value)}`,
    (value: string) => `https://{{ hostname }}/?data=${encodeURIComponent(value)}`,
  ])('retains the compound-key policy in encoded JSON (%#)', (wrap) => {
    const fields = {
      databasePassword: 'encoded-fixture',
      dbPassword: 'db-fixture',
      tokenCount: 12,
      credentialsRequired: false,
      key: 'row-id',
    };
    const value = wrap(JSON.stringify(fields));
    const expected = wrap(
      JSON.stringify({ ...fields, databasePassword: '[REDACTED]', dbPassword: '[REDACTED]' }),
    );
    const args = { one: { two: { three: { four: { five: { value, url: value } } } } } };
    expect(sanitizeMcpToolData(args)).toEqual({
      one: { two: { three: { four: { five: { value: expected, url: expected } } } } },
    });
    expect(args.one.two.three.four.five.value).toBe(value);
    expect(sanitizeMcpToolData({ url: 'ordinary-relative-resource' })).toEqual({
      url: 'ordinary-relative-resource',
    });
  });

  it('keeps the depth ceiling when form JSON resumes object traversal', () => {
    const encoded = `data=${encodeURIComponent(JSON.stringify(nestedArgs(80)))}`;
    const result = sanitizeMcpToolData({ one: { two: { encoded } } });
    expect(JSON.stringify(result)).not.toContain('compound-secret-value');
    expect(JSON.stringify(result)).not.toContain('tool-secret-value');
    expect(JSON.stringify(result)).toContain('%5B...%5D');
  });

  it.each([
    (value: string) => value,
    (value: string) => `data=${encodeURIComponent(value)}`,
    (value: string) => `https://example.test/?data=${encodeURIComponent(value)}`,
    (value: string) => `https://example.test/#data=${encodeURIComponent(value)}`,
  ])('retains credential collection roles through encoded JSON (%#)', (wrap) => {
    const fields = {
      clientSecrets: [
        'first',
        {
          value: 'second',
          count: 2,
          enabled: false,
          empty: null,
          tokenUsage: 'inherited-secret',
          callbackUrl: 'inherited-secret',
        },
      ],
      apiKeysByTenant: { tenant: 'third' },
      apiKeyForTenant: 'fourth',
      basicAuth: 'alice:alias-fixture',
      sessionCookie: 'alias-fixture',
      subscriptionKey: 'alias-fixture',
      authHeaders: { 'X-Service-Key': 'header-fixture', Accept: 'application/json' },
      databasePasswords: [123456],
      revokedApiKeys: { [`sk-${'a'.repeat(24)}`]: true, tenant: false },
      tokenUsage: { kind: 'public', databasePassword: 'fifth' },
      tokenBudget: 'public',
      tokenIds: ['public-id'],
      signatureAlgorithm: 'SHA256',
      passwordPolicy: { description: 'public', minLength: 12 },
      accessTokenUrl: 'https://example.test/?api_key=fixture',
    };
    const expected = {
      ...fields,
      clientSecrets: [
        '[REDACTED]',
        {
          value: '[REDACTED]',
          count: '[REDACTED]',
          enabled: false,
          empty: null,
          tokenUsage: '[REDACTED]',
          callbackUrl: '[REDACTED]',
        },
      ],
      apiKeysByTenant: { tenant: '[REDACTED]' },
      apiKeyForTenant: '[REDACTED]',
      basicAuth: '[REDACTED]',
      sessionCookie: '[REDACTED]',
      subscriptionKey: '[REDACTED]',
      authHeaders: { 'X-Service-Key': '[REDACTED]', Accept: 'application/json' },
      databasePasswords: ['[REDACTED]'],
      revokedApiKeys: { '[REDACTED]': true, tenant: false },
      tokenUsage: { kind: 'public', databasePassword: '[REDACTED]' },
      accessTokenUrl: 'https://example.test/?api_key=%5BREDACTED%5D',
    };
    const value = wrap(JSON.stringify(fields));
    expect(sanitizeMcpToolData({ nested: { value } })).toEqual({
      nested: { value: wrap(JSON.stringify(expected)) },
    });
    expect(value).toBe(wrap(JSON.stringify(fields)));
  });

  it.each([
    'redirect=https://alice:fixture-password@example.test/path',
    'redirect=/callback?api_key=short-secret',
    'redirect=/callback#access_token=short-secret',
  ])('retains URL credential checks for form-valued URL fields (%s)', (value) => {
    const args = { url: value, callbackUrl: value };
    expect(sanitizeMcpToolData(args)).toEqual({ url: '[REDACTED]', callbackUrl: '[REDACTED]' });
    expect(args).toEqual({ url: value, callbackUrl: value });
    expect(sanitizeMcpToolData({ url: 'redirect=/callback?page=2' })).toEqual({
      url: 'redirect=/callback?page=2',
    });
  });

  it('preserves URL-keyed payloads while sanitizing the key and nested credentials', () => {
    const args = {
      'https://example.test/?api_key=short': { method: 'GET', databasePassword: 'fixture' },
      'https://example.test/?api_key=%5BREDACTED%5D': { method: 'POST' },
      '/callback?api_key=short': { status: 200 },
    };
    const original = structuredClone(args);
    expect(sanitizeMcpToolData(args)).toEqual({
      'https://example.test/?api_key=%5BREDACTED%5D#1': {
        method: 'GET',
        databasePassword: '[REDACTED]',
      },
      'https://example.test/?api_key=%5BREDACTED%5D': { method: 'POST' },
      '/callback?api_key=%5BREDACTED%5D': { status: 200 },
    });
    expect(args).toEqual(original);
  });

  it('handles long segmented argument names and their credential suffixes', () => {
    const prefix = 'word_'.repeat(50_000);
    const args = { [prefix]: 'ordinary', [`${prefix}databasePassword`]: 'secret-fixture' };
    expect(sanitizeMcpToolData(args)).toEqual({
      [prefix]: 'ordinary',
      [`${prefix}databasePassword`]: '[REDACTED]',
    });
  });

  it('handles long numeric argument-name segments without suffix backtracking', () => {
    const prefix = `${'9'.repeat(100_000)}x`;
    const args = { [prefix]: 'ordinary', [`${prefix}dbPwdV2`]: 'secret-fixture' };
    expect(sanitizeMcpToolData(args)).toEqual({
      [prefix]: 'ordinary',
      [`${prefix}dbPwdV2`]: '[REDACTED]',
    });
  });

  it('sanitizes credentials inside ordinary metadata structures', () => {
    expect(
      sanitizeMcpToolData({ tokenUsage: { input: 4, output: 9, databasePassword: 'fixture' } }),
    ).toEqual({ tokenUsage: { input: 4, output: 9, databasePassword: '[REDACTED]' } });
  });

  it.each(['basicAuth', 'basic_auth', 'sessionCookie', 'subscriptionKey'])(
    'protects the MCP credential alias %s without changing boolean settings',
    (name) => {
      const fields = { [name]: 'alias-fixture', [`${name}Enabled`]: true, oauthScope: 'read' };
      expect(sanitizeMcpToolData({ nested: fields })).toEqual({
        nested: { ...fields, [name]: '[REDACTED]' },
      });
      for (const value of [false, true, null]) {
        expect(sanitizeMcpToolData({ [name]: value })).toEqual({ [name]: value });
      }
    },
  );

  it.each(['cookies', 'cookieJar', 'cookie_jar', 'Cookie-Jar'])(
    'protects explicit MCP cookie container %s without changing generic callers',
    (name) => {
      const fields = {
        [name]: {
          sid: 'cookie-fixture',
          numeric: 123456,
          nested: ['other-fixture'],
          enabled: false,
        },
        cookieSettings: { sameSite: 'lax', path: '/' },
        sameSiteCookie: 'lax',
        cookieJarEnabled: true,
      };
      const expected = {
        ...fields,
        [name]: {
          sid: '[REDACTED]',
          numeric: '[REDACTED]',
          nested: ['[REDACTED]'],
          enabled: false,
        },
      };
      for (const depth of [0, 5]) {
        const wrap = (value: unknown) => {
          for (let level = 0; level < depth; level++) {
            value = { nested: value };
          }
          return value;
        };
        const args = wrap(fields);
        const original = structuredClone(args);
        expect(sanitizeMcpToolData(args)).toEqual(wrap(expected));
        expect(sanitizeObject(args, { maxDepth: 64, sanitizeUrls: true })).toEqual(args);
        expect(args).toEqual(original);
      }
      for (const value of [false, true, null, 12]) {
        expect(sanitizeMcpToolData({ [name]: value })).toEqual({ [name]: value });
      }
      expect(sanitizeMcpToolData({ [name]: 'sid=cookie-fixture' })).toEqual({
        [name]: '[REDACTED]',
      });
    },
  );

  it.each([
    (json: string) => json,
    (json: string) => `data=${encodeURIComponent(json)}`,
    (json: string) => `https://example.test/?data=${encodeURIComponent(json)}`,
  ])('retains cookie-container roles through encoded metadata', (wrap) => {
    const fields = { cookies: { sid: 'cookie-fixture' }, cookieJar: [{ sid: 123456 }], page: 2 };
    const expected = {
      cookies: { sid: '[REDACTED]' },
      cookieJar: [{ sid: '[REDACTED]' }],
      page: 2,
    };
    const value = wrap(JSON.stringify(fields));
    expect(sanitizeMcpToolData({ nested: { value } })).toEqual({
      nested: { value: wrap(JSON.stringify(expected)) },
    });
    expect(sanitizeObject({ nested: { value } }, { maxDepth: 64, sanitizeUrls: true })).toEqual({
      nested: { value },
    });
  });

  it('preserves env and header protection inside credential collections', () => {
    const args = {
      authHeaders: { 'X-Service-Key': 'header-fixture', Accept: 'application/json' },
      clientSecrets: {
        env: { SERVICE_KEY: 123456, OTHER_KEY: false, PUBLIC: 'public' },
        headers: { 'X-Service-Key': 123456, 'X-Boolean-Key': false, Accept: 'public' },
      },
      databasePasswords: [123456],
      apiKeysByTenant: { acme: 424242 },
      inputTokens: 120,
      tokenCount: 2,
      tokenUsage: { input: 4 },
      tokenIds: [101, 102],
    };
    expect(sanitizeMcpToolData(args)).toEqual({
      ...args,
      authHeaders: { 'X-Service-Key': '[REDACTED]', Accept: 'application/json' },
      clientSecrets: {
        env: { SERVICE_KEY: '[REDACTED]', OTHER_KEY: '[REDACTED]', PUBLIC: '[REDACTED]' },
        headers: {
          'X-Service-Key': '[REDACTED]',
          'X-Boolean-Key': '[REDACTED]',
          Accept: '[REDACTED]',
        },
      },
      databasePasswords: ['[REDACTED]'],
      apiKeysByTenant: { acme: '[REDACTED]' },
    });
  });

  it('redacts credential-pattern collection keys while reserving authored keys', () => {
    const first = `sk-${'a'.repeat(24)}`;
    const second = `sk-${'b'.repeat(24)}`;
    const tenantId = 'a'.repeat(80);
    const args = {
      revokedApiKeys: {
        [first]: true,
        '[REDACTED]': false,
        '[REDACTED]#1': null,
        [second]: false,
        tenant: true,
        [tenantId]: false,
      },
    };
    expect(sanitizeMcpToolData(args)).toEqual({
      revokedApiKeys: {
        '[REDACTED]#2': true,
        '[REDACTED]': false,
        '[REDACTED]#1': null,
        '[REDACTED]#3': false,
        tenant: true,
        [tenantId]: false,
      },
    });
    expect(Object.keys(args.revokedApiKeys)).toContain(first);
    expect(sanitizeMcpToolData({ ordinary: { [first]: true } })).toEqual({
      ordinary: { [first]: true },
    });
    expect(
      sanitizeMcpToolData({ clientSecrets: { headers: { [first]: true, '[REDACTED]': false } } }),
    ).toEqual({
      clientSecrets: { headers: { '[REDACTED]#1': '[REDACTED]', '[REDACTED]': '[REDACTED]' } },
    });
  });

  it.each(['hasCredentials', 'isSecret', 'requiresCredentials', 'needsPassword', 'supportsApiKey'])(
    'preserves typed boolean %s while protecting same-name credentials',
    (name) => {
      for (const value of [true, false, 'credential-fixture']) {
        const fields = { [name]: value, password: false, apiKey: true };
        const expected = {
          [name]: typeof value === 'boolean' ? value : '[REDACTED]',
          password: '[REDACTED]',
          apiKey: '[REDACTED]',
        };
        expect(sanitizeMcpToolData({ nested: fields })).toEqual({ nested: expected });
        expect(sanitizeMcpToolData({ json: JSON.stringify(fields) })).toEqual({
          json: JSON.stringify(expected),
        });
        expect(
          sanitizeMcpToolData({
            callbackUrl: `data=${encodeURIComponent(JSON.stringify(fields))}`,
          }),
        ).toEqual({ callbackUrl: `data=${encodeURIComponent(JSON.stringify(expected))}` });
        expect(fields).toEqual({ [name]: value, password: false, apiKey: true });
      }
    },
  );

  it.each(['hasCredentials', 'isSecret', 'needsPassword', 'supportsApiKey'])(
    'does not extend typed boolean %s handling to string values',
    (name) => {
      expect(sanitizeMcpToolData({ [name]: 'true' })).toEqual({ [name]: '[REDACTED]' });
    },
  );

  it('walks nested form-valued URL fields once while preserving their public data', () => {
    let args = { password: 'fixture', value: 1 } as Record<string, unknown>;
    let expected = { password: '[REDACTED]', value: 1 } as Record<string, unknown>;
    for (let level = 0; level < 24; level++) {
      args = { callbackUrl: `data=${encodeURIComponent(JSON.stringify(args))}` };
      expected = { callbackUrl: `data=${encodeURIComponent(JSON.stringify(expected))}` };
    }
    expect(sanitizeMcpToolData(args)).toEqual(expected);
  });

  it.each([
    'url',
    'callbackUrl',
    'callbackUri',
    'callbackHost',
    'callbackEndpoint',
    'callbackProxy',
  ])('walks nested JSON-valued %s fields once', (name) => {
    let args: Record<string, unknown> = { databasePassword: 'fixture', value: 1 };
    let expected: Record<string, unknown> = { databasePassword: '[REDACTED]', value: 1 };
    for (let level = 0; level < 12; level++) {
      args = { [name]: JSON.stringify(args) };
      expected = { [name]: JSON.stringify(expected) };
    }
    const parse = vi.spyOn(JSON, 'parse');
    let result: unknown;
    let calls: number;
    try {
      result = sanitizeMcpToolData(args);
      calls = parse.mock.calls.length;
    } finally {
      parse.mockRestore();
    }
    expect(result).toEqual(expected);
    expect(calls).toBeLessThan(100);
    expect(JSON.stringify(args)).toContain('fixture');
  });

  it.each([
    [' \n{ "page": 2 }\t', '{"page":2}'],
    [
      '{ "page": "{{ page }}", "databasePassword": "fixture" }',
      '{"page":"{{ page }}","databasePassword":"[REDACTED]"}',
    ],
    ['{"page":', '{"page":'],
    ['ordinary relative path', 'ordinary relative path'],
    ['/callback?api_key=fixture', '/callback?api_key=%5BREDACTED%5D'],
    ['https://example.test/?page=2', 'https://example.test/?page=2'],
    ['https://{{ host }}/?api_key=fixture', 'https://{{ host }}/?api_key=%5BREDACTED%5D'],
    [
      'az://account/container/data?sp=r&sig=fixture',
      'az://account/container/data?sp=r&sig=%5BREDACTED%5D',
    ],
  ])('preserves URL-field parsing semantics for %s', (value, expected) => {
    expect(sanitizeMcpToolData({ callbackUrl: value })).toEqual({ callbackUrl: expected });
  });

  it.each([
    ['callback?token=fixture', '[REDACTED]'],
    ['callback#api_key=fixture', '[REDACTED]'],
    ['https://user:fixture@host/', '[REDACTED]'],
  ])('preserves public JSON fields while sanitizing the URL leaf %s', (target, expectedTarget) => {
    const args = { callbackUrl: JSON.stringify({ target, page: 2 }) };
    expect(sanitizeMcpToolData(args)).toEqual({
      callbackUrl: JSON.stringify({ target: expectedTarget, page: 2 }),
    });
    expect(args.callbackUrl).toContain('fixture');
  });

  it('preserves public relative references in JSON-valued URL fields', () => {
    const args = { callbackUrl: JSON.stringify({ target: 'callback?page=2', page: 2 }) };
    expect(sanitizeMcpToolData(args)).toEqual(args);
  });

  it.each(['callbackUrl', 'url'])(
    'retains outer redaction when deeply nested %s JSON cannot be serialized for comparison',
    (key) => {
      const deep = '{"child":'.repeat(5000) + '{}' + '}'.repeat(5000);
      const payload = JSON.stringify({ password: 'outer-fixture', [key]: deep, page: 2 });
      const result = sanitizeMcpToolData({ payload });
      expect(result).not.toBe(omitted);
      expect(typeof result).toBe('object');
      const parsed = JSON.parse((result as { payload: string }).payload);
      expect(parsed.password).toBe('[REDACTED]');
      expect(parsed.page).toBe(2);
      expect(typeof parsed[key]).toBe('string');
      expect(parsed[key].length).toBeLessThan(2000);
      expect(JSON.stringify(result)).not.toContain('outer-fixture');
    },
  );

  it('does not treat MCP JSON serialization failures as malformed JSON', () => {
    const payload = '{"password":"outer-fixture","failSerialization":true}';
    const originalStringify = JSON.stringify;
    const stringify = vi.spyOn(JSON, 'stringify').mockImplementation((value, ...args) => {
      if (value && typeof value === 'object' && value.failSerialization) {
        throw new Error('serialization-fixture');
      }
      return originalStringify(value, ...args);
    });
    let result: unknown;
    try {
      result = sanitizeMcpToolData({ payload });
    } finally {
      stringify.mockRestore();
    }
    expect(result).toBe(omitted);
  });

  it.each(['headers', 'authHeaders'])(
    'sanitizes MCP %s keys and allowed values at shallow and restored depths',
    (name) => {
      const canonical = 'https://example.test/?api_key=%5BREDACTED%5D';
      const fields = {
        [name]: {
          'https://example.test/?api_key=fixture': 'private',
          [canonical]: 'authored',
          Accept: 'https://{{ host }}/?api_key=fixture',
          'User-Agent': '{"password":"fixture","label":"{{ value }}"}',
          'Content-Type': 'application/json',
          'X-Tenant-Id': 'tenant-1',
          Authorization: '{{ env.API_TOKEN }}',
        },
      };
      const expected = {
        [name]: {
          [`${canonical}#1`]: '[REDACTED]',
          [canonical]: '[REDACTED]',
          Accept: 'https://{{ host }}/?api_key=%5BREDACTED%5D',
          'User-Agent': '{"password":"[REDACTED]","label":"{{ value }}"}',
          'Content-Type': 'application/json',
          'X-Tenant-Id': 'tenant-1',
          Authorization: '{{ env.API_TOKEN }}',
        },
      };
      for (const depth of [0, 5]) {
        const wrap = (value: unknown) => {
          for (let level = 0; level < depth; level++) {
            value = { nested: value };
          }
          return value;
        };
        const args = wrap(fields);
        const original = structuredClone(args);
        expect(sanitizeMcpToolData(args)).toEqual(wrap(expected));
        expect(args).toEqual(original);
        expect(sanitizeMcpToolData(wrap({ [name]: { Accept: 'application/json' } }))).toEqual(
          wrap({ [name]: { Accept: 'application/json' } }),
        );
      }
      expect(sanitizeObject({ headers: fields[name] }, { sanitizeUrls: true })).toEqual({
        headers: {
          ...fields[name],
          'https://example.test/?api_key=fixture': '[REDACTED]',
          [canonical]: '[REDACTED]',
        },
      });
    },
  );

  it.each(['url', 'callbackUrl', 'apiBaseUrl', 'server_url', 'env.SERVICE_URL'])(
    'sanitizes whole JSON before template handling for MCP %s',
    (name) => {
      const wrap = (value: string) =>
        name === 'env.SERVICE_URL' ? { env: { SERVICE_URL: value } } : { [name]: value };
      const value = '{"password":"fixture","label":"{{ value }}","page":2}';
      const sanitized = '{"password":"[REDACTED]","label":"{{ value }}","page":2}';
      expect(sanitizeMcpToolData(wrap(value))).toEqual(wrap(sanitized));
      expect(sanitizeMcpToolData({ a: { b: { c: { d: { e: wrap(value) } } } } })).toEqual({
        a: { b: { c: { d: { e: wrap(sanitized) } } } },
      });
      for (const publicValue of [
        '{"label":"{{ value }}","page":2}',
        'https://{{ host }}/path?page=2',
      ]) {
        expect(sanitizeMcpToolData(wrap(publicValue))).toEqual(wrap(publicValue));
      }
      expect(sanitizeUrl(value)).toBe(value);
      expect(sanitizeMcpToolData(wrap('https://{{ host }}/?api_key=fixture'))).toEqual(
        wrap(
          name === 'apiBaseUrl' || name === 'server_url'
            ? '[REDACTED]'
            : 'https://{{ host }}/?api_key=%5BREDACTED%5D',
        ),
      );
    },
  );

  it.each(['url', 'callbackUrl', 'callbackHost', 'apiHost', 'env.SERVICE_URL', 'env.SERVICE_HOST'])(
    'preserves sanitized JSON and pure template forms in %s',
    (name) => {
      const wrap = (value: string) =>
        name.startsWith('env.') ? { env: { [name.slice(4)]: value } } : { [name]: value };
      const input = JSON.stringify({ target: 'https://example.test/?api_key=fixture', page: 2 });
      const output = JSON.stringify({
        target: 'https://example.test/?api_key=%5BREDACTED%5D',
        page: 2,
      });
      expect(sanitizeMcpToolData(wrap(input))).toEqual(wrap(output));
      expect(sanitizeMcpToolData(wrap('password={{password}}&page=2'))).toEqual(
        wrap('password={{password}}&page=2'),
      );
      expect(sanitizeMcpToolData(wrap('password={{password}}&api_key=fixture&page=2'))).toEqual(
        wrap('[REDACTED]'),
      );
    },
  );

  it.each(['tokenCount', 'tokenCounts', 'tokenSettings'])(
    'preserves descriptive %s metadata while sanitizing descendants',
    (name) => {
      const input = { [name]: { input: 120, output: 30, databasePassword: 'fixture' } };
      const output = { [name]: { input: 120, output: 30, databasePassword: '[REDACTED]' } };
      expect(sanitizeMcpToolData(input)).toEqual(output);
      expect(sanitizeMcpToolData({ [name]: 'public setting' })).toEqual({
        [name]: 'public setting',
      });
      expect(sanitizeMcpToolData({ clientSecrets: input })).toEqual({
        clientSecrets: {
          [name]: { input: '[REDACTED]', output: '[REDACTED]', databasePassword: '[REDACTED]' },
        },
      });
    },
  );

  it.each(['basicAuths', 'sessionCookies', 'subscriptionKeys', 'cookieJars'])(
    'protects the explicit plural credential collection %s',
    (name) => {
      const input = { [name]: { sid: 'fixture', pin: 123456, enabled: false } };
      expect(sanitizeMcpToolData(input)).toEqual({
        [name]: { sid: '[REDACTED]', pin: '[REDACTED]', enabled: false },
      });
      expect(sanitizeObject(input, { sanitizeUrls: true, maxDepth: 64 })).toEqual(input);
    },
  );

  it.each(['url', 'callbackUrl', 'apiHost'])(
    'guards quoted JSON scalar URLs within %s without dropping public siblings',
    (name) => {
      for (const target of [
        'callback?token=fixture-quote-secret',
        'https://example.test/?token=fixture-quote-secret',
      ]) {
        const input = { [name]: JSON.stringify({ target: JSON.stringify(target), page: 2 }) };
        const original = structuredClone(input);
        expect(sanitizeMcpToolData(input)).toEqual({
          [name]: JSON.stringify({ target: '[REDACTED]', page: 2 }),
        });
        expect(input).toEqual(original);
      }
      const input = { [name]: JSON.stringify({ target: JSON.stringify('public value'), page: 2 }) };
      expect(sanitizeMcpToolData(input)).toEqual(input);
    },
  );

  it.each(['apiBaseUrl', 'server_url', 'env.OPENAI_BASE_URL'])(
    'retains the existing stricter logging template policy for %s',
    (name) => {
      const value = 'password={{password}}&page=2';
      const input = name.startsWith('env.')
        ? { env: { [name.slice(4)]: value } }
        : { [name]: value };
      const expected = name.startsWith('env.')
        ? { env: { [name.slice(4)]: '[REDACTED]' } }
        : { [name]: '[REDACTED]' };
      expect(sanitizeMcpToolData(input)).toEqual(expected);
      expect(sanitizeObject(input, { sanitizeUrls: true })).toEqual(expected);
    },
  );

  it.each([
    'basicAuth',
    'basicAuths',
    'sessionCookie',
    'sessionCookies',
    'subscriptionKey',
    'subscriptionKeys',
    'authHeaders',
    'cookies',
    'cookieJar',
    'cookieJars',
    'sessionCookies[0]',
    'auth.subscriptionKey',
  ])('protects the explicit MCP alias %s across form and URL channels', (name) => {
    const pair = `${name}=short-fixture`;
    const safePair = `${name}=%5BREDACTED%5D`;
    for (const [value, expected] of [
      [pair, safePair],
      [
        `https://example.test/?${pair}`,
        new URL(`https://example.test/?${safePair}`).href.replace(
          'sessionCookies[0]',
          'sessionCookies%5B0%5D',
        ),
      ],
      [`https://example.test/#${pair}`, `https://example.test/#${safePair}`],
      [`https://{{ host }}/?${pair}`, `https://{{ host }}/?${safePair}`],
    ]) {
      const input = { one: { two: { three: { four: { five: { value } } } } } };
      const original = structuredClone(input);
      expect(sanitizeMcpToolData(input)).toEqual({
        one: { two: { three: { four: { five: { value: expected } } } } },
      });
      // The legacy generic `auth` segment is already credential-bearing.
      expect(sanitizeObject(input, { sanitizeUrls: true, maxDepth: 64 })).toEqual(
        name === 'auth.subscriptionKey'
          ? { one: { two: { three: { four: { five: { value: expected } } } } } }
          : input,
      );
      expect(input).toEqual(original);
    }
    const template = { payload: `${name}={{ credential }}` };
    expect(sanitizeMcpToolData(template)).toEqual(template);
  });

  it.each([
    'cookieSettings',
    'cookieJarSettings',
    'basicAuthSettings',
    'sessionCookieSettings',
    'subscriptionKeySettings',
    'authHeaderSettings',
    'authHeader',
    'tokenSettings',
    'tokenCount',
    'tokenCounts',
  ])('preserves descriptive %s fields while recursively checking credential children', (name) => {
    const input = { [name]: { label: 'public', count: 3, databasePassword: 'fixture' } };
    const expected = { [name]: { label: 'public', count: 3, databasePassword: '[REDACTED]' } };
    for (const encode of [
      (value: unknown) => value,
      (value: unknown) => ({ payload: JSON.stringify(value) }),
      (value: unknown) => ({ payload: `data=${encodeURIComponent(JSON.stringify(value))}` }),
    ]) {
      expect(sanitizeMcpToolData(encode(input))).toEqual(encode(expected));
    }
    expect(sanitizeMcpToolData({ [name]: 'public setting' })).toEqual({ [name]: 'public setting' });
  });

  it.each(['apiKeysByTenant', 'apiKeyForTenant', 'api_keys_by_tenant', 'api-key-for-tenant'])(
    'retains word-delimited qualified credential collections for %s',
    (name) => {
      expect(sanitizeMcpToolData({ [name]: { a: 'fixture', count: 3 } })).toEqual({
        [name]: { a: '[REDACTED]', count: '[REDACTED]' },
      });
    },
  );

  it.each(['url', 'callbackUrl', 'apiHost'])(
    'guards URL-payload object and header names through collision-safe key handling for %s',
    (role) => {
      const longPublicName = 'tenant'.repeat(20);
      const keys = {
        'callback?token=first-fixture': 'first',
        '[REDACTED]': 'authored',
        'data=https://example.test/?token=second-fixture': 'second',
        'callback?page=2': 'public',
        [longPublicName]: 'public',
      };
      const sanitizedKeys = {
        '[REDACTED]#1': 'first',
        '[REDACTED]': 'authored',
        '[REDACTED]#2': 'second',
        'callback?page=2': 'public',
        [longPublicName]: 'public',
      };
      for (const headerRole of [undefined, 'headers', 'authHeaders']) {
        const data = headerRole
          ? { [headerRole]: { ...keys, Accept: 'text/plain' }, page: 2 }
          : { ...keys, page: 2 };
        const expected = headerRole
          ? {
              [headerRole]: {
                ...Object.fromEntries(
                  Object.keys(sanitizedKeys).map((name) => [name, '[REDACTED]']),
                ),
                Accept: 'text/plain',
              },
              page: 2,
            }
          : { ...sanitizedKeys, page: 2 };
        const input = { [role]: JSON.stringify(data) };
        const original = structuredClone(input);
        expect(sanitizeMcpToolData(input)).toEqual({ [role]: JSON.stringify(expected) });
        expect(input).toEqual(original);
      }
    },
  );

  it.each([
    'AKIAABCDEFGHIJKLMNOP:fixture',
    'sk-123456789012345678901234:fixture',
    'key-123456789012345678901234:fixture',
    `AIza${'a'.repeat(35)}:fixture`,
  ])('retains existing secret-format detection before opaque URL parsing for %s', (value) => {
    for (const role of ['url', 'callbackUrl', 'apiHost']) {
      const input = { [role]: JSON.stringify({ item: value, array: [value], page: 2 }) };
      expect(sanitizeMcpToolData(input)).toEqual({
        [role]: JSON.stringify({ item: '[REDACTED]', array: ['[REDACTED]'], page: 2 }),
      });
      const publicInput = {
        [role]: JSON.stringify({ item: 'ordinary:public', array: ['ordinary:public'], page: 2 }),
      };
      expect(sanitizeMcpToolData(publicInput)).toEqual(publicInput);
    }
  });

  it.each([
    'databasePassword',
    'databasePasswd',
    'dbPwd',
    'userCredential',
    'userCredentials',
    'clientSecret',
    'accessToken',
    'databaseDsn',
    'userApiKey',
    'awsAccessKey',
    'certificatePrivateKey',
    'userCredentialValue',
    'dbDsnV2Encrypted',
  ])('uses the existing terminal credential vocabulary for MCP %s', (name) => {
    const fields = { [name]: 'short-fixture' };
    for (const encode of [
      (value: unknown) => value,
      (value: unknown) => ({ payload: JSON.stringify(value) }),
      (value: unknown) => ({ payload: `data=${encodeURIComponent(JSON.stringify(value))}` }),
    ]) {
      expect(sanitizeMcpToolData({ a: { b: { c: { d: { e: encode(fields) } } } } })).toEqual({
        a: { b: { c: { d: { e: encode({ [name]: '[REDACTED]' }) } } } },
      });
    }
    if (name !== 'clientSecret' && name !== 'accessToken') {
      expect(sanitizeMcpToolData({ [name]: false })).toEqual({ [name]: false });
    }
  });

  it('retains terminal precedence and qualified/plural roles without descriptive inheritance', () => {
    expect(sanitizeMcpToolData({ userCredentials: { child: 'fixture' } })).toEqual({
      userCredentials: '[REDACTED]',
    });
    expect(
      sanitizeMcpToolData({ dbDsns: ['fixture'], userCredentialForTenant: { tenant: 'fixture' } }),
    ).toEqual({ dbDsns: ['[REDACTED]'], userCredentialForTenant: { tenant: '[REDACTED]' } });
    const publicInput = {
      credentialSettings: { mode: 'public', count: 2 },
      dsnSettings: { mode: 'public' },
      accessKeySettings: { mode: 'public' },
      pageToken: 'next',
      maxTokens: 30,
    };
    expect(sanitizeMcpToolData(publicInput)).toEqual(publicInput);
    expect(
      sanitizeObject(
        { userCredential: 'fixture', dbDsn: 'fixture', awsAccessKey: 'fixture' },
        { sanitizeUrls: true, maxDepth: 64 },
      ),
    ).toEqual({ userCredential: 'fixture', dbDsn: 'fixture', awsAccessKey: 'fixture' });
  });

  it.each(['tokenUsages', 'tokenBudgets', 'signatureAlgorithms', 'passwordPolicies'])(
    'preserves ordinary plural %s metadata and protects nested credentials',
    (name) => {
      const fields = { [name]: [{ count: 4, label: 'public', databasePassword: 'fixture' }] };
      const expected = { [name]: [{ count: 4, label: 'public', databasePassword: '[REDACTED]' }] };
      for (const encode of [
        (value: unknown) => value,
        (value: unknown) => ({ payload: JSON.stringify(value) }),
        (value: unknown) => ({ payload: `data=${encodeURIComponent(JSON.stringify(value))}` }),
      ]) {
        const args = { one: { two: { three: { four: { five: encode(fields) } } } } };
        const original = structuredClone(args);
        expect(sanitizeMcpToolData(encode(fields))).toEqual(encode(expected));
        expect(sanitizeMcpToolData(args)).toEqual({
          one: { two: { three: { four: { five: encode(expected) } } } },
        });
        expect(args).toEqual(original);
      }
      expect(sanitizeObject(fields, { sanitizeUrls: true, maxDepth: 64 })).toEqual(fields);
      expect(sanitizeMcpToolData({ clientSecrets: fields })).toEqual({
        clientSecrets: {
          [name]: [{ count: '[REDACTED]', label: '[REDACTED]', databasePassword: '[REDACTED]' }],
        },
      });
    },
  );

  it.each(['apiHost', 'env.SERVICE_HOST', 'env.service_host'])(
    'sanitizes raw MCP payloads before normalizing %s',
    (name) => {
      const wrap = (value: string) =>
        name.startsWith('env.') ? { env: { [name.slice(4)]: value } } : { [name]: value };
      const json = '{"databasePassword":"host-fixture","label":"{{ value }}","page":2}';
      const safeJson = '{"databasePassword":"[REDACTED]","label":"{{ value }}","page":2}';
      for (const [value, expected] of [
        [json, safeJson],
        [`data=${encodeURIComponent(json)}`, `data=${encodeURIComponent(safeJson)}`],
        ['databasePassword=host-fixture', '[REDACTED]'],
        ['{"target":"callback?token=host-fixture"}', '{"target":"[REDACTED]"}'],
      ]) {
        const fields = wrap(value);
        const args = { one: { two: { three: { four: { five: fields } } } } };
        const original = structuredClone(args);
        expect(sanitizeMcpToolData(fields)).toEqual(wrap(expected));
        expect(sanitizeMcpToolData(args)).toEqual({
          one: { two: { three: { four: { five: wrap(expected) } } } },
        });
        expect(args).toEqual(original);
      }
      for (const value of [
        'gateway.example',
        'localhost:8080',
        'gateway.example/proxy/v1',
        'https://gateway.example/proxy/v1',
        '{{ host }}',
        'https://{{ host }}/?page=2',
        ' { "label":"{{ value }}", "page":2 } ',
        'data=%7B%22page%22%3A2%7D',
      ]) {
        expect(sanitizeMcpToolData(wrap(value))).toEqual(wrap(value));
      }
      expect(sanitizeObject(wrap(json), { sanitizeUrls: true, maxDepth: 64 })).toEqual(wrap(json));
    },
  );

  it.each(['apiHost', 'env.SERVICE_HOST', 'env.service_host'])(
    'retains logging path guards for raw %s form payloads',
    (name) => {
      const wrap = (value: string) =>
        name.startsWith('env.') ? { env: { [name.slice(4)]: value } } : { [name]: value };
      for (const path of ['token-secret12345', '01234567-89ab-cdef-0123-456789abcdef']) {
        for (const prefix of ['data=gateway.example/', 'data=https://gateway.example/']) {
          const value = `${prefix}${path}`;
          const fields = wrap(value);
          const args = { one: { two: { three: { four: { five: fields } } } } };
          const original = structuredClone(args);
          expect(JSON.stringify(sanitizeMcpToolData(fields))).not.toContain(path);
          expect(JSON.stringify(sanitizeMcpToolData(args))).not.toContain(path);
          expect(args).toEqual(original);
        }
      }
      for (const value of [
        'data=gateway.example/public-path',
        'data=https://gateway.example/public-path',
      ]) {
        expect(sanitizeMcpToolData(wrap(value))).toEqual(wrap(value));
      }
    },
  );

  it.each(['url', 'callbackUrl', 'apiBaseUrl', 'apiHost', 'env.SERVICE_HOST'])(
    'guards opaque URI credentials in decoded %s payloads before query changes',
    (role) => {
      const wrap = (value: string) =>
        role.startsWith('env.') ? { env: { [role.slice(4)]: value } } : { [role]: value };
      for (const uri of [
        'jdbc:sqlserver://db;password=opaque-fixture',
        'urn:database:db;password=opaque-fixture',
        'mailto:alice@example.test;password=opaque-fixture',
        'jdbc:sqlserver://alice:opaque-fixture@db',
      ]) {
        for (const suffix of ['', '?page=2', '?api_key=query-fixture', '#page=2']) {
          const input = wrap(JSON.stringify({ target: uri + suffix, page: 2 }));
          const original = structuredClone(input);
          expect(sanitizeMcpToolData(input)).toEqual(
            wrap(JSON.stringify({ target: '[REDACTED]', page: 2 })),
          );
          expect(input).toEqual(original);
        }
      }
      for (const uri of [
        'jdbc:sqlserver://db;database=public',
        'urn:example:public',
        'mailto:alice@example.test',
      ]) {
        const input = wrap(JSON.stringify({ target: uri, page: 2 }));
        expect(sanitizeMcpToolData(input)).toEqual(input);
      }
    },
  );

  it.each(['apiHost', 'env.SERVICE_HOST'])(
    'shares complete parsed logging path checks with raw %s forms',
    (role) => {
      const wrap = (value: string) =>
        role.startsWith('env.') ? { env: { [role.slice(4)]: value } } : { [role]: value };
      for (const path of ['sk-123456789012345678901234', 'token/abc1234567890']) {
        for (const prefix of ['data=gateway.example/', 'data=https://gateway.example/']) {
          expect(sanitizeMcpToolData(wrap(`${prefix}${path}/`))).toEqual(wrap('[REDACTED]'));
        }
      }
      for (const path of ['public-path', 'token/public']) {
        const input = wrap(`data=https://gateway.example/${path}/`);
        expect(sanitizeMcpToolData(input)).toEqual(input);
      }
    },
  );

  it.each(['url', 'callbackUrl', 'apiBaseUrl', 'apiHost', 'env.SERVICE_HOST'])(
    'preserves the existing pure-template policy within quoted %s JSON scalars',
    (role) => {
      const wrap = (value: string) =>
        role.startsWith('env.') ? { env: { [role.slice(4)]: value } } : { [role]: value };
      const target = JSON.stringify('jdbc:sqlserver://db;password={{ password }}');
      const input = wrap(JSON.stringify({ target, page: 2 }));
      const logging = role !== 'url' && role !== 'callbackUrl';
      expect(sanitizeMcpToolData(input)).toEqual(
        logging ? wrap(JSON.stringify({ target: '[REDACTED]', page: 2 })) : input,
      );
    },
  );

  it.each(['url', 'callbackUrl', 'apiBaseUrl', 'apiHost', 'env.SERVICE_HOST'])(
    'carries URL payload guards through composed %s scalar and member roles',
    (role) => {
      const wrap = (value: string) =>
        role.startsWith('env.') ? { env: { [role.slice(4)]: value } } : { [role]: value };
      const marker = 'privatefixture1234567890';
      const payloads = [
        { target: `https://alice:pw@example.test/token/${marker}` },
        { [`https://alice:pw@example.test/token/${marker}`]: 'public', '[REDACTED]': 'authored' },
        { target: `https://{{ host }}/db;password=${marker}` },
        { items: [`https://{{ host }}/db;password=${marker}`] },
        { apiHost: `jdbc:sqlserver://alice:${marker}@db` },
        { env: { SERVICE_HOST: `jdbc:sqlserver://alice:${marker}@db` } },
        { headers: { [`https://host/db;password=${marker}`]: 'x' } },
        { authHeaders: { [`https://host/db;password=${marker}`]: 'x' } },
      ];
      for (const payload of payloads) {
        const data = { ...payload, page: 2 };
        for (const inner of [
          data,
          { callbackUrl: JSON.stringify(data) },
          { callbackUrl: `data=${encodeURIComponent(JSON.stringify(data))}` },
          { apiBaseUrl: `https://example.test/?data=${encodeURIComponent(JSON.stringify(data))}` },
        ]) {
          const input = wrap(JSON.stringify(inner));
          const original = structuredClone(input);
          const result = sanitizeMcpToolData(input);
          expect(JSON.stringify(result)).not.toContain(marker);
          expect(input).toEqual(original);
        }
      }
      const publicInput = wrap(JSON.stringify({ items: ['public-path'], page: 2 }));
      expect(sanitizeMcpToolData(publicInput)).toEqual(publicInput);
    },
  );

  it.each(['target', 'url', 'callbackUrl'])(
    'keeps inherited logging path checks for decoded %s leaves',
    (member) => {
      const input = {
        apiBaseUrl: JSON.stringify({
          [member]: 'https://alice:pw@example.test/token/privatefixture1234567890',
          page: 2,
        }),
      };
      expect(JSON.stringify(sanitizeMcpToolData(input))).not.toContain('privatefixture1234567890');
      const publicInput = {
        apiBaseUrl: JSON.stringify({ [member]: 'https://example.test/public', page: 2 }),
      };
      expect(sanitizeMcpToolData(publicInput)).toEqual(publicInput);
    },
  );

  it.each(['headers', 'authHeaders'])(
    'preserves recognized safe %s authorization references before scalar heuristics',
    (headerRole) => {
      for (const scheme of ['', 'Bearer ', 'Basic ', 'Token ', 'api-key ']) {
        const fields = { [headerRole]: { Authorization: `${scheme}{{ env.MCP_API_KEY }}` } };
        const input = { one: { two: { three: { four: { five: fields } } } } };
        expect(sanitizeMcpToolData(fields)).toEqual(fields);
        expect(sanitizeMcpToolData(input)).toEqual(input);
        const encoded = { payload: JSON.stringify(fields) };
        expect(sanitizeMcpToolData(encoded)).toEqual(encoded);
        expect(sanitizeMcpToolData({ clientSecrets: fields })).toEqual({
          clientSecrets: { [headerRole]: { Authorization: '[REDACTED]' } },
        });
      }
      expect(
        sanitizeMcpToolData({ [headerRole]: { Authorization: 'Bearer actual-private-fixture' } }),
      ).toEqual({
        [headerRole]: { Authorization: '[REDACTED]' },
      });
    },
  );

  it.each(['url', 'callbackUrl', 'apiBaseUrl', 'server_url', 'apiHost'])(
    'keeps the direct %s policy distinct from decoded payload guards',
    (role) => {
      const values = [
        'https://alice:fixture-password@example.test/public',
        'https://example.test/public',
        'https://{{ host }}/?password={{ password }}',
        'jdbc:sqlserver://db;password={{ password }}',
      ];
      for (const value of values) {
        const input = { [role]: value };
        expect(sanitizeMcpToolData(input)).toEqual(sanitizeObject(input, { sanitizeUrls: true }));
      }
    },
  );

  it.each(['apiHost', 'env.SERVICE_HOST'])(
    'guards quoted scalar %s credentials before host normalization',
    (name) => {
      const host = (value: string) =>
        name.startsWith('env.') ? { env: { [name.slice(4)]: value } } : { [name]: value };
      for (const field of ['url', 'callbackUrl', 'apiBaseUrl']) {
        for (const literal of ['password=scalar-fixture', 'token=scalar-fixture']) {
          const args = { [field]: JSON.stringify({ ...host(JSON.stringify(literal)), page: 2 }) };
          const original = structuredClone(args);
          expect(JSON.stringify(sanitizeMcpToolData(args))).not.toContain('scalar-fixture');
          expect(args).toEqual(original);
        }
        for (const scalar of ['gateway.example', 'page=2', null, 42, false]) {
          const args = { [field]: JSON.stringify({ ...host(JSON.stringify(scalar)), page: 2 }) };
          expect(sanitizeMcpToolData(args)).toEqual(args);
        }
      }
    },
  );

  it.each(['url', 'callbackUrl', 'apiBaseUrl', 'apiHost'])(
    'uses parsed userinfo for guarded %s keys and scalar/host values',
    (role) => {
      for (const scheme of ['https:', 'http:', 'ftp:', 'ws:']) {
        for (const slash of ['', '/', '\\', '\\\\', '/\\']) {
          const value = `${scheme}${slash}alice:parser-fixture@example.test/public`;
          expect(new URL(value).password).toBe('parser-fixture');
          for (const payload of [
            { target: JSON.stringify(value) },
            { apiHost: value },
            { env: { SERVICE_HOST: value } },
            { [value]: 'public', '[REDACTED]': 'authored' },
            { headers: { [value]: 'public', '[REDACTED]': 'authored' } },
            { authHeaders: { [value]: 'public', '[REDACTED]': 'authored' } },
          ]) {
            const args = { [role]: JSON.stringify({ ...payload, page: 2 }) };
            const original = structuredClone(args);
            const result = sanitizeMcpToolData(args);
            expect(JSON.stringify(result)).not.toContain('parser-fixture');
            expect(args).toEqual(original);
            const decoded = JSON.parse((result as Record<string, string>)[role]);
            expect(decoded.page).toBe(2);
          }
          const publicValue = `${scheme}${slash}example.test/public`;
          const args = { [role]: JSON.stringify({ target: JSON.stringify(publicValue), page: 2 }) };
          expect(sanitizeMcpToolData(args)).toEqual(args);
        }
      }
    },
  );

  it.each(['url', 'callbackUrl', 'apiBaseUrl', 'apiHost'])(
    'guards repeated JSON scalar quoting across %s payload surfaces',
    (role) => {
      const makePayloads = (value: string) => [
        { target: value },
        { items: [value] },
        { url: value },
        { callbackUrl: value },
        { apiBaseUrl: value },
        { apiHost: value },
        { env: { SERVICE_HOST: value } },
        { [value]: 'public' },
        { headers: { [value]: 'x' } },
        { authHeaders: { [value]: 'x' } },
        { headers: { Accept: value } },
        { authHeaders: { Accept: value } },
      ];
      for (const prefix of ['https:', 'https:\\', 'http:/', 'ftp:\\\\']) {
        let secret = `${prefix}alice:quoted-fixture@example.test/public`;
        let publicValue = `${prefix}example.test/public`;
        for (let quotes = 0; quotes < 4; quotes++) {
          for (const payload of makePayloads(secret)) {
            const input = { [role]: JSON.stringify({ ...payload, page: 2 }) };
            const original = structuredClone(input);
            expect(JSON.stringify(sanitizeMcpToolData(input))).not.toContain('quoted-fixture');
            expect(input).toEqual(original);
          }
          // Public quoted scalars keep their original spelling and quote depth.
          const input = { [role]: JSON.stringify({ target: publicValue, page: 2 }) };
          expect(sanitizeMcpToolData(input)).toEqual(input);
          secret = JSON.stringify(secret);
          publicValue = JSON.stringify(publicValue);
        }
      }
    },
  );

  it('bounds quoted scalar interpretation while preserving default callers', () => {
    let scalar = 'public';
    for (let index = 0; index < 8; index++) {
      scalar = JSON.stringify(scalar);
    }
    const input = { url: JSON.stringify({ target: scalar, page: 2 }) };
    expect(sanitizeObject(input, { sanitizeUrls: true, maxDepth: 2 })).toEqual(input);
    expect(
      sanitizeObject(input, { sanitizeUrls: true, maxDepth: 2, redactCompoundKeys: true }),
    ).toEqual({ url: JSON.stringify({ target: '[REDACTED]', page: 2 }) });
  });

  it.each(['apiHost', 'env.SERVICE_HOST'])(
    'retains every host credential stage for %s form-shaped and partially redacted values',
    (role) => {
      const host = (value: string) =>
        role.startsWith('env.') ? { env: { [role.slice(4)]: value } } : { [role]: value };
      const secrets = [
        'alice=ops:stage-fixture@example.test',
        'YWxpY2U=stage-fixture@example.test',
        'alice:stage-fixture@example.test/?api_key=second-fixture',
        'alice:stage-fixture@example.test/#api_key=second-fixture',
        'az://account/container/token/stagefixture1234567890?sig=second-fixture',
        'data=gateway.example/?data=' +
          encodeURIComponent(JSON.stringify({ password: 'stage-fixture', page: 2 })),
        'data=gateway.example/#data=' +
          encodeURIComponent(JSON.stringify({ password: 'stage-fixture', page: 2 })),
        'data=data=https:alice:stage-fixture@example.test/',
        'data=https:\\alice:stage-fixture@example.test\\',
        'data=data=' + encodeURIComponent('https:\\alice:stage-fixture@example.test\\'),
      ];
      for (const value of secrets) {
        for (const input of [
          host(value),
          { url: JSON.stringify({ ...host(value), page: 2 }) },
          { apiBaseUrl: JSON.stringify({ ...host(value), page: 2 }) },
        ]) {
          const original = structuredClone(input);
          const output = JSON.stringify(sanitizeMcpToolData(input));
          expect(output).not.toMatch(/stage-fixture|stagefixture1234567890|second-fixture/);
          expect(input).toEqual(original);
        }
      }
      for (const value of [
        'gateway.example',
        'data=public&page=2',
        'data={{ value }}',
        'data=https://example.test/public',
        'data=gateway.example/?data=' +
          encodeURIComponent(JSON.stringify({ page: 2, label: 'public' })),
      ]) {
        const input = host(value);
        expect(sanitizeMcpToolData(input)).toEqual(input);
      }
    },
  );

  it.each(['url', 'apiBaseUrl', 'callbackUrl', 'apiHost'])(
    'guards decoded non-JSON form scalar values in %s with a finite depth budget',
    (role) => {
      for (const value of [
        'https:alice:form-fixture@example.test/',
        'https:\\alice:form-fixture@example.test/',
        JSON.stringify('https:alice:form-fixture@example.test/'),
        'az://alice:form-fixture@account/container?sig=second-fixture',
        'az://account/container/public?sig=form-fixture&password=second-fixture',
      ]) {
        for (const form of [
          'data=' + value,
          'data=' + encodeURIComponent(value),
          'data=data=' + value,
        ]) {
          const input = { [role]: JSON.stringify({ target: form, page: 2 }) };
          expect(JSON.stringify(sanitizeMcpToolData(input))).not.toMatch(
            /form-fixture|second-fixture/,
          );
        }
      }
      for (const value of [
        'data=public',
        'data=null',
        'data=42',
        'data=false',
        'data={{ value }}',
        'data=' + encodeURIComponent(JSON.stringify('example.test/public')),
      ]) {
        const input = { [role]: JSON.stringify({ target: value, page: 2 }) };
        expect(sanitizeMcpToolData(input)).toEqual(input);
      }
      const nested = 'data='.repeat(70) + 'public';
      const input = { [role]: JSON.stringify({ target: nested, page: 2 }) };
      expect(JSON.stringify(sanitizeMcpToolData(input))).toContain('REDACTED');
      expect(sanitizeObject(input, { sanitizeUrls: true })).toEqual(
        role === 'apiHost' ? input : { [role]: JSON.stringify({ target: '[REDACTED]', page: 2 }) },
      );
    },
  );

  it('retains the existing outer logging guard for SAS paths', () => {
    const input = {
      apiBaseUrl: JSON.stringify({
        target: 'az://account/container/token/stagefixture1234567890?sig=second-fixture',
        page: 2,
      }),
    };
    const result = sanitizeMcpToolData(input);
    expect(JSON.stringify(result)).not.toMatch(/stagefixture1234567890|second-fixture/);
    expect(result).toEqual({ apiBaseUrl: '[REDACTED]' });
  });

  it('preserves tokenization metadata and authHeaders collection shapes', () => {
    for (const name of [
      'inputTokens',
      'outputTokens',
      'completionTokens',
      'promptTokens',
      'input_tokens',
      'OUTPUT_TOKENS',
    ]) {
      const input = {
        [name]: [
          'hello',
          123,
          { databasePassword: 'nested-fixture', label: 'public' },
          'AKIAABCDEFGHIJKLMNOP',
        ],
      };
      const expected = {
        [name]: ['hello', 123, { databasePassword: '[REDACTED]', label: 'public' }, '[REDACTED]'],
      };
      for (const encode of [
        (v: unknown) => v,
        (v: unknown) => JSON.stringify(v),
        (v: unknown) => 'data=' + encodeURIComponent(JSON.stringify(v)),
      ]) {
        const args = { payload: encode(input) };
        const original = structuredClone(args);
        expect(sanitizeMcpToolData(args)).toEqual({ payload: encode(expected) });
        expect(args).toEqual(original);
      }
    }
    for (const name of ['authHeaders', 'AUTH_HEADERS', 'auth-headers']) {
      const args = {
        [name]: [['Authorization', 'short-fixture'], { nested: [123, false, null] }],
        headers: ['public'],
        accessTokens: ['private'],
        inputToken: 'private',
        apiKeysByTenant: { inputTokens: ['private', 123] },
      };
      const original = structuredClone(args);
      expect(sanitizeMcpToolData(args)).toEqual({
        [name]: [['[REDACTED]', '[REDACTED]'], { nested: ['[REDACTED]', false, null] }],
        headers: { 0: '[REDACTED]' },
        accessTokens: ['[REDACTED]'],
        inputToken: '[REDACTED]',
        apiKeysByTenant: { inputTokens: ['[REDACTED]', '[REDACTED]'] },
      });
      expect(args).toEqual(original);
      expect(sanitizeObject(args, { sanitizeUrls: true })).toEqual({
        ...args,
        headers: { 0: '[REDACTED]' },
      });
      expect(sanitizeMcpToolData({ [name]: [] })).toEqual({ [name]: [] });
    }
  });

  it.each(['apiHost', 'env.SERVICE_HOST'])('walks nested raw %s JSON payloads once', (name) => {
    const wrap = (value: string) =>
      name.startsWith('env.') ? { env: { [name.slice(4)]: value } } : { [name]: value };
    let args: Record<string, unknown> = { databasePassword: 'host-fixture', page: 2 };
    let expected: Record<string, unknown> = { databasePassword: '[REDACTED]', page: 2 };
    for (let level = 0; level < 12; level++) {
      args = wrap(JSON.stringify(args));
      expected = wrap(JSON.stringify(expected));
    }
    const parse = vi.spyOn(JSON, 'parse');
    let result: unknown;
    let calls: number;
    try {
      result = sanitizeMcpToolData(args);
      calls = parse.mock.calls.length;
    } finally {
      parse.mockRestore();
    }
    expect(result).toEqual(expected);
    expect(calls).toBeLessThan(100);
  });

  it('preserves unchanged exact-URL JSON bytes without repeating nested traversal', () => {
    let args: Record<string, unknown> = { label: '{{ value }}', page: 2 };
    for (let level = 0; level < 12; level++) {
      args = { url: ` \n${JSON.stringify(args)}\t` };
    }
    const original = structuredClone(args);
    const parse = vi.spyOn(JSON, 'parse');
    let result: unknown;
    let calls: number;
    try {
      result = sanitizeMcpToolData(args);
      calls = parse.mock.calls.length;
    } finally {
      parse.mockRestore();
    }
    expect(result).toEqual(original);
    expect(args).toEqual(original);
    expect(calls).toBeLessThan(100);
  });

  it('sanitizes authHeaders URL keys while reserving authored names', () => {
    const canonical = 'https://example.test/?api_key=%5BREDACTED%5D';
    const authHeaders = {
      'https://example.test/?api_key=first': 'first',
      [canonical]: 'authored',
      'https://example.test/?api_key=second': 'second',
      Accept: 'application/json',
    };
    expect(sanitizeMcpToolData({ authHeaders })).toEqual({
      authHeaders: {
        [`${canonical}#1`]: '[REDACTED]',
        [canonical]: '[REDACTED]',
        [`${canonical}#2`]: '[REDACTED]',
        Accept: 'application/json',
      },
    });
    expect(
      Object.keys(sanitizeObject({ headers: authHeaders }, { sanitizeUrls: true }).headers),
    ).toEqual(Object.keys(authHeaders));
  });

  it('sanitizes embedded credentials in allowed authHeaders values without changing generic headers', () => {
    const authHeaders = {
      'User-Agent': '{"databasePassword":"fixture","page":2}',
      Accept: 'https://example.test/?api_key=fixture',
      'Content-Type': 'data=%7B%22dbPassword%22%3A%22fixture%22%7D',
      'X-Tenant-Id': 'tenant-1',
      Authorization: '{{ env.API_TOKEN }}',
    };
    const args = { one: { two: { three: { four: { five: { authHeaders } } } } } };
    const original = structuredClone(args);
    expect(sanitizeMcpToolData(args)).toEqual({
      one: {
        two: {
          three: {
            four: {
              five: {
                authHeaders: {
                  ...authHeaders,
                  'User-Agent': '{"databasePassword":"[REDACTED]","page":2}',
                  Accept: 'https://example.test/?api_key=%5BREDACTED%5D',
                  'Content-Type': 'data=%7B%22dbPassword%22%3A%22%5BREDACTED%5D%22%7D',
                },
              },
            },
          },
        },
      },
    });
    expect(args).toEqual(original);
    expect(sanitizeObject({ headers: authHeaders }, { sanitizeUrls: true })).toEqual({
      headers: authHeaders,
    });
  });

  /** Arguments with `levels` nested objects and a secret in the innermost one. */
  function nestedArgs(levels: number) {
    const args: Record<string, unknown> = {};
    let node = args;
    for (let level = 0; level < levels; level++) {
      const child: Record<string, unknown> = {};
      node.child = child;
      node = child;
    }
    node.apiKey = 'tool-secret-value';
    node.databasePassword = 'compound-secret-value';
    node.attempts = 2;
    return args;
  }

  /** The innermost object of a sanitized result, without recursion. */
  function innermost(value: unknown) {
    let node = value as Record<string, unknown>;
    let levels = 0;
    while (node.child !== null && typeof node.child === 'object') {
      node = node.child as Record<string, unknown>;
      levels++;
    }
    return { node, levels };
  }

  it('reports arguments down to 64 levels and cuts off anything deeper', () => {
    expect(innermost(sanitizeMcpToolData(nestedArgs(64)))).toEqual({
      node: { apiKey: '[REDACTED]', databasePassword: '[REDACTED]', attempts: 2 },
      levels: 64,
    });
    expect(innermost(sanitizeMcpToolData(nestedArgs(65)))).toEqual({
      node: { child: '[...]' },
      levels: 64,
    });
  });

  it.each([4_000, 20_000, 200_000])(
    'does not expose a secret in arguments nested %i levels deep',
    (levels) => {
      // Nesting this deep exhausts the stack somewhere in the sanitizer. The sanitizer's
      // fallback of returning its input would report the secret as it came in.
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        const result: unknown = sanitizeMcpToolData(nestedArgs(levels));

        // Where the stack runs out depends on the platform: the arguments come back cut off
        // at the depth limit, or as a placeholder from this helper or from the serializer.
        // What matters is that the secret is in none of them.
        if (typeof result === 'string') {
          expect(result).not.toContain('tool-secret-value');
          expect(result).not.toContain('compound-secret-value');
        } else {
          const { node, levels: reported } = innermost(result);
          expect(reported).toBeLessThanOrEqual(64);
          expect(JSON.stringify(node)).not.toContain('tool-secret-value');
          expect(JSON.stringify(node)).not.toContain('compound-secret-value');
        }
        expect(errors).not.toHaveBeenCalled();
      } finally {
        errors.mockRestore();
      }
    },
  );

  it('reports a placeholder instead of arguments it cannot sanitize', () => {
    const args = { apiKey: 'tool-secret-value' };
    Object.defineProperty(args, 'unreadable', {
      enumerable: true,
      get() {
        // An error can carry the data it was thrown for, in its message or in its name.
        const error = new Error(`cannot read ${args.apiKey}`);
        error.name = args.apiKey;
        throw error;
      },
    });
    const debug = vi.spyOn(logger, 'debug').mockImplementation(() => logger);

    try {
      expect(sanitizeMcpToolData(args)).toBe(omitted);
      expect(debug).toHaveBeenCalledWith('[MCP] Tool data could not be sanitized and is omitted');
      expect(JSON.stringify(debug.mock.calls)).not.toContain('tool-secret-value');

      // Even looking at what was thrown can run code that the data controls.
      const hostile = { apiKey: 'tool-secret-value' };
      Object.defineProperty(hostile, 'unreadable', {
        enumerable: true,
        get() {
          throw new Proxy(
            {},
            {
              getPrototypeOf() {
                throw new Error(hostile.apiKey);
              },
            },
          );
        },
      });
      expect(sanitizeMcpToolData(hostile)).toBe(omitted);
    } finally {
      debug.mockRestore();
    }
  });

  it('redacts values under keys that end in a credential word, at any depth', () => {
    // A tool names its arguments as it likes, so exact key names are not enough.
    const connection = {
      databasePassword: 'hunter2',
      db_password: 'hunter2',
      userApiKey: 'tool-secret-value',
      'x-upstream-token': 'tool-secret-value',
      oauthClientSecret: { value: 'tool-secret-value' },
      // These end in words that are not credentials.
      sortKey: 'name',
      key: 'user:1',
      maxTokens: 5,
      author: 'ada',
    };
    const args = { ...connection, level1: { level2: { level3: { level4: { connection } } } } };

    const expected = {
      databasePassword: '[REDACTED]',
      db_password: '[REDACTED]',
      userApiKey: '[REDACTED]',
      'x-upstream-token': '[REDACTED]',
      oauthClientSecret: '[REDACTED]',
      sortKey: 'name',
      key: 'user:1',
      maxTokens: 5,
      author: 'ada',
    };
    expect(sanitizeMcpToolData(args)).toEqual({
      ...expected,
      level1: { level2: { level3: { level4: { connection: expected } } } },
    });
    // The caller's arguments are left as they were.
    expect(connection.databasePassword).toBe('hunter2');
  });

  it('redacts such keys in JSON that an argument carries as a string', () => {
    const payload = JSON.stringify({ query: 'select 1', dbPassword: 'hunter2' });

    expect(sanitizeMcpToolData({ payload, note: '{not json' })).toEqual({
      payload: JSON.stringify({ query: 'select 1', dbPassword: '[REDACTED]' }),
      note: '{not json',
    });
    expect(sanitizeMcpToolData(payload)).toBe(
      JSON.stringify({ query: 'select 1', dbPassword: '[REDACTED]' }),
    );
  });

  it('redacts the strings under plural and qualified credential names', () => {
    expect(
      sanitizeMcpToolData({
        clientSecrets: ['first-secret', 'second-secret'],
        databasePasswords: { primary: 'hunter2', replicas: [{ value: 'hunter3', port: 5432 }] },
        userApiKeys: 'first-key,second-key',
        accessTokens: ['first-token'],
        apiKeysByTenant: { acme: 'tenant-key' },
        // A credential word with a qualifier after it.
        apiKeyForTenant: 'tenant-key',
        tenantClientSecret2Value: 'tenant-secret',
        tokenValue: 'short',
      }),
    ).toEqual({
      clientSecrets: ['[REDACTED]', '[REDACTED]'],
      databasePasswords: {
        primary: '[REDACTED]',
        replicas: [{ value: '[REDACTED]', port: '[REDACTED]' }],
      },
      userApiKeys: '[REDACTED]',
      accessTokens: ['[REDACTED]'],
      apiKeysByTenant: { acme: '[REDACTED]' },
      apiKeyForTenant: '[REDACTED]',
      tenantClientSecret2Value: '[REDACTED]',
      tokenValue: '[REDACTED]',
    });
  });

  it('keeps cursors, counts and settings whose names hold a credential word', () => {
    const args = {
      // Cursors and special tokens.
      pageToken: 'cursor-1',
      nextPageToken: 'cursor-2',
      next_page_token: 'cursor-3',
      continuationToken: 'cursor-4',
      resumeToken: 'cursor-5',
      nextToken: 'cursor-6',
      stopTokens: ['</s>'],
      maxTokens: 256,
      // Counts.
      inputTokens: 120,
      tokenCount: 7,
      tokenUsage: { input: 120, output: 30 },
      // Settings.
      useApiKey: true,
      includeCredentials: false,
      tokenType: 'bearer',
      secretVersion: 'v3',
      databasePassword: null,
      // Ordinary argument names.
      key: 'user:1',
      keys: ['user:1', 'user:2'],
      publicKey: 'ssh-ed25519 AAAA',
      tokenizer: 'cl100k',
    };

    expect(sanitizeMcpToolData(args)).toEqual(args);
  });

  it('redacts a number under a name that ends in a credential word', () => {
    // A password of digits can arrive as a number. A count cannot be told from it by its
    // value, so only a name that is the credential itself decides.
    expect(sanitizeMcpToolData({ databasePassword: 123456, accessTokens: 2 })).toEqual({
      databasePassword: '[REDACTED]',
      accessTokens: 2,
    });
  });

  it('copes with arguments that refer to themselves', () => {
    const args: Record<string, unknown> = { id: '123' };
    args.self = args;

    expect(() => sanitizeMcpToolData(args)).not.toThrow();
    expect(sanitizeMcpToolData(args)).toMatchObject({ id: '123' });
  });
});

describe('normalizeMcpToolContent', () => {
  it.each([
    { name: 'null', content: null, expected: '' },
    { name: 'undefined', content: undefined, expected: '' },
    { name: 'literal text', content: '{{secret}}', expected: '{{secret}}' },
    { name: 'number', content: 42, expected: '42' },
    { name: 'object', content: { text: 'whole object' }, expected: '{"text":"whole object"}' },
    { name: 'empty array', content: [], expected: '' },
    {
      name: 'mixed blocks and property precedence',
      content: [
        'literal',
        { text: 0, json: 'ignored', data: 'ignored' },
        { text: false },
        { text: '', data: 'ignored' },
        { text: null, json: { count: 2 }, data: 'ignored' },
        { data: ['value'] },
        { resource: { uri: 'file:///literal.txt' } },
        null,
        undefined,
      ],
      expected:
        'literal\n0\nfalse\n\n{"count":2}\n["value"]\n{"resource":{"uri":"file:///literal.txt"}}\nnull\nundefined',
    },
    {
      name: 'undefined property values and sparse entries',
      content: [{ json: undefined, data: 'ignored' }, , { data: undefined }],
      expected: '\n\n',
    },
  ])('renders $name without changing content semantics', ({ content, expected }) => {
    expect(normalizeMcpToolContent(content)).toBe(expected);
  });

  it('only reports unknown object blocks, before serializing each block', () => {
    const events: string[] = [];
    const unknown = {
      toJSON: () => {
        events.push('serialize');
        return 'serialized';
      },
    };
    const onUnknownContent = vi.fn(() => {
      events.push('diagnostic');
    });

    expect(
      normalizeMcpToolContent(
        [{ text: 'known' }, { json: 1 }, { data: 2 }, unknown, 'plain', 3],
        onUnknownContent,
      ),
    ).toBe('known\n1\n2\n"serialized"\nplain\n3');
    expect(onUnknownContent).toHaveBeenCalledExactlyOnceWith(unknown);
    expect(events).toEqual(['diagnostic', 'serialize']);
  });

  it('preserves serialization failures for the provider error handler', () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => normalizeMcpToolContent([{ json: cyclic }])).toThrow(TypeError);
    expect(() => normalizeMcpToolContent([{ data: 1n }])).toThrow(TypeError);
  });
});

describe('isMcpToolNameFilter', () => {
  it('identifies plain tool names as MCP filters', () => {
    expect(isMcpToolNameFilter('search_companies')).toBe(true);
    expect(isMcpToolNameFilter(['search_companies', 'list_industries'])).toBe(true);
  });

  it('does not classify file loaders or object tool definitions as MCP filters', () => {
    expect(isMcpToolNameFilter('file://tools.json')).toBe(false);
    expect(isMcpToolNameFilter(['file://tools.json'])).toBe(false);
    expect(isMcpToolNameFilter([{ type: 'function', function: { name: 'lookup' } }])).toBe(false);
  });
});

describe('isMcpErrorResult', () => {
  it('flags results with a thrown SDK error', () => {
    expect(isMcpErrorResult({ content: '', error: 'connection lost' })).toBe(true);
  });

  it('flags results with a protocol-level isError flag', () => {
    expect(isMcpErrorResult({ content: 'Path traversal not allowed', isError: true })).toBe(true);
  });

  it('does not flag successful results', () => {
    expect(isMcpErrorResult({ content: 'ok' })).toBe(false);
  });
});

describe('getMcpErrorMessage', () => {
  it('prefers the thrown-error message', () => {
    expect(getMcpErrorMessage({ content: 'ignored', error: 'connection lost' })).toBe(
      'connection lost',
    );
  });

  it('falls back to the tool error content', () => {
    expect(getMcpErrorMessage({ content: 'Path traversal not allowed', isError: true })).toBe(
      'Path traversal not allowed',
    );
  });

  it('falls back to a generic message when an error result has no content', () => {
    expect(getMcpErrorMessage({ content: '', isError: true })).toBe(
      'Tool returned an error result',
    );
  });
});

describe('getAuthHeaders', () => {
  it('should return bearer auth header', () => {
    const server: MCPServerConfig = {
      auth: { type: 'bearer', token: 'abc123' },
    };
    expect(getAuthHeaders(server)).toEqual({
      Authorization: 'Bearer abc123',
    });
  });

  it('should return api_key auth header with default key name', () => {
    const server: MCPServerConfig = {
      auth: { type: 'api_key', api_key: 'xyz789' },
    };
    expect(getAuthHeaders(server)).toEqual({
      'X-API-Key': 'xyz789',
    });
  });

  it('should return api_key auth header with value field', () => {
    const server: MCPServerConfig = {
      auth: { type: 'api_key', value: 'xyz789' },
    };
    expect(getAuthHeaders(server)).toEqual({
      'X-API-Key': 'xyz789',
    });
  });

  it('should return api_key auth header with custom key name', () => {
    const server: MCPServerConfig = {
      auth: { type: 'api_key', value: 'xyz789', keyName: 'X-Custom-Key' },
    };
    expect(getAuthHeaders(server)).toEqual({
      'X-Custom-Key': 'xyz789',
    });
  });

  it('should return empty object for api_key with query placement', () => {
    const server: MCPServerConfig = {
      auth: { type: 'api_key', value: 'xyz789', placement: 'query' },
    };
    expect(getAuthHeaders(server)).toEqual({});
  });

  it('should return basic auth header', () => {
    const server: MCPServerConfig = {
      auth: { type: 'basic', username: 'user', password: 'pass' },
    };
    expect(getAuthHeaders(server)).toEqual({
      Authorization: 'Basic dXNlcjpwYXNz', // base64 of 'user:pass'
    });
  });

  it('should return oauth bearer token when provided', () => {
    const server: MCPServerConfig = {
      auth: {
        type: 'oauth',
        grantType: 'client_credentials',
        clientId: 'id',
        clientSecret: 'secret',
        tokenUrl: 'https://auth.example.com/token',
      },
    };
    expect(getAuthHeaders(server, 'oauth-token-123')).toEqual({
      Authorization: 'Bearer oauth-token-123',
    });
  });

  it('should return empty object for oauth without token', () => {
    const server: MCPServerConfig = {
      auth: {
        type: 'oauth',
        grantType: 'client_credentials',
        clientId: 'id',
        clientSecret: 'secret',
        tokenUrl: 'https://auth.example.com/token',
      },
    };
    expect(getAuthHeaders(server)).toEqual({});
  });

  it('should return empty object if no auth', () => {
    const server: MCPServerConfig = {};
    expect(getAuthHeaders(server)).toEqual({});
  });

  it('should return empty object for incomplete auth', () => {
    // Test handling of invalid/incomplete auth config (type assertion bypasses TS for edge case testing)
    const server: MCPServerConfig = { auth: { type: 'bearer' } as MCPServerConfig['auth'] };
    expect(getAuthHeaders(server)).toEqual({});
  });
});

describe('getAuthQueryParams', () => {
  it('should return query params for api_key with query placement', () => {
    const server: MCPServerConfig = {
      auth: { type: 'api_key', value: 'xyz789', placement: 'query', keyName: 'api_key' },
    };
    expect(getAuthQueryParams(server)).toEqual({
      api_key: 'xyz789',
    });
  });

  it('should return empty object for api_key with header placement', () => {
    const server: MCPServerConfig = {
      auth: { type: 'api_key', value: 'xyz789', placement: 'header' },
    };
    expect(getAuthQueryParams(server)).toEqual({});
  });

  it('should return empty object for non-api_key auth', () => {
    const server: MCPServerConfig = {
      auth: { type: 'bearer', token: 'abc123' },
    };
    expect(getAuthQueryParams(server)).toEqual({});
  });

  it('should use default keyName for query placement', () => {
    const server: MCPServerConfig = {
      auth: { type: 'api_key', value: 'xyz789', placement: 'query' },
    };
    expect(getAuthQueryParams(server)).toEqual({
      'X-API-Key': 'xyz789',
    });
  });
});

describe('applyQueryParams', () => {
  it('should append query params to URL', () => {
    const url = 'https://api.example.com/v1';
    const params = { key: 'value', another: 'param' };
    expect(applyQueryParams(url, params)).toBe(
      'https://api.example.com/v1?key=value&another=param',
    );
  });

  it('should append to existing query params', () => {
    const url = 'https://api.example.com/v1?existing=param';
    const params = { key: 'value' };
    expect(applyQueryParams(url, params)).toBe(
      'https://api.example.com/v1?existing=param&key=value',
    );
  });

  it('should return original URL if no params', () => {
    const url = 'https://api.example.com/v1';
    expect(applyQueryParams(url, {})).toBe(url);
  });
});

describe('discoverTokenEndpoint', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should discover token endpoint from root well-known URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token_endpoint: 'https://auth.example.com/oauth/token',
        authorization_endpoint: 'https://auth.example.com/oauth/authorize',
      }),
    });

    const result = await discoverTokenEndpoint('https://mcp.example.com');
    expect(result).toBe('https://auth.example.com/oauth/token');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://mcp.example.com/.well-known/oauth-authorization-server',
    );
  });

  it('should try path-appended discovery first for URLs with paths', async () => {
    // First attempt (path-appended) fails
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    // Second attempt (RFC 8414 path-aware) fails
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    // Third attempt (root) succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token_endpoint: 'https://auth.example.com/token' }),
    });

    const result = await discoverTokenEndpoint('https://example.com/realms/test');
    expect(result).toBe('https://auth.example.com/token');

    // Should have tried path-appended first
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'https://example.com/realms/test/.well-known/oauth-authorization-server',
    );
    // Then RFC 8414 path-aware
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'https://example.com/.well-known/oauth-authorization-server/realms/test',
    );
    // Then root
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      'https://example.com/.well-known/oauth-authorization-server',
    );
  });

  it('should succeed with path-appended discovery (Keycloak style)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token_endpoint: 'https://keycloak.example.com/realms/test/protocol/openid-connect/token',
      }),
    });

    const result = await discoverTokenEndpoint('https://keycloak.example.com/realms/test');
    expect(result).toBe('https://keycloak.example.com/realms/test/protocol/openid-connect/token');
  });

  it('should throw error if no discovery succeeds', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });

    await expect(discoverTokenEndpoint('https://example.com')).rejects.toThrow(
      /Failed to discover OAuth token endpoint/,
    );
  });

  it('should throw error if metadata has no token_endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        // Missing token_endpoint - only has authorization_endpoint
        authorization_endpoint: 'https://auth.example.com/authorize',
      }),
    });

    await expect(discoverTokenEndpoint('https://example.com')).rejects.toThrow(
      /Failed to discover OAuth token endpoint/,
    );
  });

  it('should ignore empty token endpoints during discovery', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token_endpoint: '' }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token_endpoint: 'https://auth.example.com/token' }),
    });

    await expect(discoverTokenEndpoint('https://example.com/path')).resolves.toBe(
      'https://auth.example.com/token',
    );
  });

  it('should ignore malformed token endpoints during discovery', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token_endpoint: 'not a url' }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token_endpoint: 'https://auth.example.com/token' }),
    });

    await expect(discoverTokenEndpoint('https://example.com/path')).resolves.toBe(
      'https://auth.example.com/token',
    );
  });

  it('should ignore token endpoints with unsupported protocols during discovery', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token_endpoint: 'ftp://auth.example.com/token' }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token_endpoint: 'https://auth.example.com/token' }),
    });

    await expect(discoverTokenEndpoint('https://example.com/path')).resolves.toBe(
      'https://auth.example.com/token',
    );
  });

  it('should handle network errors gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    await expect(discoverTokenEndpoint('https://example.com')).rejects.toThrow(
      /Failed to discover OAuth token endpoint/,
    );
  });
});

describe('getOAuthTokenWithExpiry', () => {
  it('normalizes string scopes for the request and cache key', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'scope-token', expires_in: 3600 }),
    });
    const auth: MCPOAuthClientCredentialsAuth = {
      type: 'oauth',
      grantType: 'client_credentials',
      clientId: 'scope-client',
      clientSecret: 'secret',
      tokenUrl: 'https://scope-auth.example.com/token',
      scopes: ' read  write ',
    };

    const token = await getOAuthTokenWithExpiry(auth);
    const cached = await getOAuthTokenWithExpiry({ ...auth, scopes: ['read', 'write'] });

    expect(token.accessToken).toBe('scope-token');
    expect(cached).toEqual(token);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const request = mockFetch.mock.calls[0][1];
    expect(new URLSearchParams(request.body).get('scope')).toBe('read write');
  });

  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('scopes cached tokens by the discovered token endpoint', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      const parsedUrl = new URL(url);
      if (parsedUrl.pathname.endsWith('/.well-known/oauth-authorization-server')) {
        return {
          ok: true,
          json: async () => ({
            token_endpoint:
              parsedUrl.hostname === 'agent-a.example.com'
                ? 'https://auth-a.example.com/oauth/token'
                : 'https://auth-b.example.com/oauth/token',
          }),
        };
      }

      if (url === 'https://auth-a.example.com/oauth/token') {
        return {
          ok: true,
          json: async () => ({ access_token: 'token-a', expires_in: 3600 }),
        };
      }

      if (url === 'https://auth-b.example.com/oauth/token') {
        return {
          ok: true,
          json: async () => ({ access_token: 'token-b', expires_in: 3600 }),
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const auth: MCPOAuthClientCredentialsAuth = {
      type: 'oauth',
      grantType: 'client_credentials',
      clientId: 'shared-client',
      clientSecret: 'secret',
    };

    const firstToken = await getOAuthTokenWithExpiry(auth, 'https://agent-a.example.com/a2a');
    const secondToken = await getOAuthTokenWithExpiry(auth, 'https://agent-b.example.com/a2a');

    expect(firstToken.accessToken).toBe('token-a');
    expect(secondToken.accessToken).toBe('token-b');
    expect(
      mockFetch.mock.calls
        .map(([url]) => String(url))
        .filter((url) => url.includes('/oauth/token')),
    ).toEqual(['https://auth-a.example.com/oauth/token', 'https://auth-b.example.com/oauth/token']);
  });
});
