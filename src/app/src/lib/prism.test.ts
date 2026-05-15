import { describe, expect, it } from 'vitest';
import Prism from './prism';

describe('prism helper', () => {
  it('registers the app languages once', () => {
    expect(Prism.languages.clike).toBeDefined();
    expect(Prism.languages.javascript).toBeDefined();
    expect(Prism.languages.json).toBeDefined();
    expect(Prism.languages.yaml).toBeDefined();
    expect(Prism.languages.http).toBeDefined();
  });

  it('can highlight the formats used by the app', () => {
    const json = Prism.highlight('{"name":"promptfoo"}', Prism.languages.json, 'json');
    const yaml = Prism.highlight('name: promptfoo', Prism.languages.yaml, 'yaml');
    const js = Prism.highlight(
      'const name = "promptfoo";',
      Prism.languages.javascript,
      'javascript',
    );

    expect(json).toContain('token');
    expect(yaml).toContain('token');
    expect(js).toContain('token');
  });
});
