/**
 * JS extension hook using LEGACY calling convention (no hook-specific function name).
 * Receives (hookName, context) instead of (context, {hookName}).
 * Tests backwards compatibility and logger availability in legacy mode.
 */

module.exports = async function (hookName, context) {
  if (!context.logger) {
    throw new Error('context.logger is undefined in legacy hook');
  }
  context.logger.info(`js-legacy-${hookName}`, { hookName });
  return context;
};
