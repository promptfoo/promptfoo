import { describe, expect, it } from 'vitest';
import {
  ADDITIONAL_PLUGINS,
  AGENTIC_PLUGINS,
  ALL_PLUGINS,
  CONFIG_REQUIRED_PLUGINS,
  categoryDescriptions,
  DEFAULT_PLUGINS,
  riskCategories,
} from '../../src/redteam/constants';

describe('constants', () => {
  it('ALL_PLUGINS should contain all plugins sorted', () => {
    expect(ALL_PLUGINS).toEqual(
      [
        ...new Set([
          ...DEFAULT_PLUGINS,
          ...ADDITIONAL_PLUGINS,
          ...CONFIG_REQUIRED_PLUGINS,
          ...AGENTIC_PLUGINS,
        ]),
      ].sort(),
    );
  });

  it('should have descriptions for all risk categories', () => {
    const categories = Object.keys(riskCategories) as (keyof typeof categoryDescriptions)[];
    categories.forEach((category) => {
      expect(categoryDescriptions[category]).toBeDefined();
      expect(typeof categoryDescriptions[category]).toBe('string');
    });
  });
});
