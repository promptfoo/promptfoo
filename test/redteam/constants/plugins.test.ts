import { ALL_PLUGINS } from '../../../src/redteam/constants/plugins';

describe('plugins constants', () => {
  it('should have ALL_PLUGINS as sorted array', () => {
    const sorted = [...ALL_PLUGINS].sort();
    expect(ALL_PLUGINS).toEqual(sorted);
  });

  it('should have unique values in ALL_PLUGINS', () => {
    const uniquePlugins = new Set(ALL_PLUGINS);
    expect(uniquePlugins.size).toBe(ALL_PLUGINS.length);
  });
});
