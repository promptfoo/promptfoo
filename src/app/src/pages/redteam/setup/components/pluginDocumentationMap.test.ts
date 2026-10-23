import { describe, expect, it } from 'vitest';
import {
  getPluginDocumentationUrl,
  hasSpecificPluginDocumentation,
  PLUGIN_DOCUMENTATION_MAP,
} from './pluginDocumentationMap';

const BASE_DOCS_URL = 'https://www.promptfoo.dev/docs/red-team/plugins';

describe('pluginDocumentationMap', () => {
  describe('getPluginDocumentationUrl', () => {
    it.each([
      ['mcp', '/docs/red-team/plugins/mcp/'],
      ['mcp:tool-response-poisoning', '/docs/red-team/plugins/mcp-tool-response-poisoning/'],
      ['tool-discovery', '/docs/red-team/plugins/tool-discovery/'],
    ])('maps %s to its own documentation page', (pluginType, expectedPath) => {
      expect(getPluginDocumentationUrl(pluginType)).toContain(expectedPath);
    });

    it('falls back to the plugin index for an unmapped plugin', () => {
      expect(getPluginDocumentationUrl('not-a-real-plugin')).toBe(BASE_DOCS_URL);
    });

    it('falls back to the plugin index when no plugin type is given', () => {
      expect(getPluginDocumentationUrl()).toBe(BASE_DOCS_URL);
    });
  });

  describe('hasSpecificPluginDocumentation', () => {
    // A missing entry is silent: the UI "learn more" link still renders, it
    // just points at the index instead of the plugin's page.
    it.each(['mcp', 'mcp:tool-response-poisoning', 'tool-discovery'])(
      'reports specific documentation for %s',
      (pluginType) => {
        expect(hasSpecificPluginDocumentation(pluginType)).toBe(true);
      },
    );

    it('reports no specific documentation for an unmapped plugin', () => {
      expect(hasSpecificPluginDocumentation('not-a-real-plugin')).toBe(false);
    });
  });

  it('points every mapped plugin at a red-team plugin docs URL', () => {
    for (const [pluginType, url] of Object.entries(PLUGIN_DOCUMENTATION_MAP)) {
      // Collections such as `default` and `foundation` map to the index
      // itself; individual plugins get their own page.
      expect(url, `${pluginType} should link under the plugin docs root`).toMatch(
        /^https:\/\/www\.promptfoo\.dev\/docs\/red-team\/plugins(\/.+\/)?$/,
      );
    }
  });
});
