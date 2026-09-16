import { describe, expect, it } from 'vitest';
import {
  getPluginDocumentationUrl,
  hasSpecificPluginDocumentation,
} from './pluginDocumentationMap';

describe('pluginDocumentationMap', () => {
  it.each([
    ['mental-health', 'mental-health/'],
    ['mental-health:crisis-response', 'mental-health/#crisis-response'],
    ['mental-health:eating-disorder', 'mental-health/#eating-disorder'],
    ['mental-health:harmful-coping', 'mental-health/#harmful-coping'],
    ['mental-health:mania-amplification', 'mental-health/#mania-amplification'],
    ['mental-health:psychosis-safety', 'mental-health/#psychosis-safety'],
    ['mental-health:stigmatizing-language', 'mental-health/#stigmatizing-language'],
    ['mental-health:sycophancy', 'mental-health/#sycophancy'],
    ['mental-health:therapeutic-boundaries', 'mental-health/#therapeutic-boundaries'],
    ['mental-health:trauma-informed', 'mental-health/#trauma-informed'],
  ])('links %s to its documentation page', (pluginId, path) => {
    expect(hasSpecificPluginDocumentation(pluginId)).toBe(true);
    expect(getPluginDocumentationUrl(pluginId)).toBe(
      `https://www.promptfoo.dev/docs/red-team/plugins/${path}`,
    );
  });
});
