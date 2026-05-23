import { describe, expect, it } from 'vitest';
import { getPluginDocumentationUrl, hasSpecificPluginDocumentation } from './pluginDocumentationMap';

describe('pluginDocumentationMap', () => {
  it('links the resource exhaustion plugin to its specific guide', () => {
    expect(hasSpecificPluginDocumentation('resource-exhaustion')).toBe(true);
    expect(getPluginDocumentationUrl('resource-exhaustion')).toContain('/resource-exhaustion/');
  });
});
