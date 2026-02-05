/**
 * Dynamic assertion value script (#6253)
 *
 * This script returns a value to be used in an assertion.
 * Tests that file:// references in assertion values use script output.
 */

module.exports = function () {
  // Return a dynamic value that the assertion will use
  return 'DynamicValue';
};
