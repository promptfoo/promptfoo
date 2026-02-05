/**
 * Dynamic vars loader script (#6393)
 *
 * Tests that file:// references in vars are preserved for runtime loading.
 */

module.exports = function () {
  return {
    dynamicVar: 'LoadedFromScript',
    timestamp: new Date().toISOString().split('T')[0],
  };
};
