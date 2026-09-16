/**
 * JS extension hook for smoke testing logger support.
 * Tests context.logger availability in all hook types.
 */

module.exports = {
  beforeAll: async (context) => {
    if (!context.logger) {
      throw new Error('context.logger is undefined - logger injection failed');
    }
    context.logger.info('js-beforeAll-context-logger', { source: 'context' });
    context.logger.debug('js-beforeAll-debug-msg');
    return context;
  },

  afterAll: async (context) => {
    if (!context.logger) {
      throw new Error('context.logger is undefined - logger injection failed');
    }
    context.logger.info('js-afterAll-complete', {
      resultCount: (context.results || []).length,
    });
    return context;
  },

  beforeEach: async (context) => {
    if (!context.logger) {
      throw new Error('context.logger is undefined - logger injection failed');
    }
    context.logger.info('js-beforeEach-test', {
      vars: Object.keys(context.test?.vars || {}),
    });
    return context;
  },

  afterEach: async (context) => {
    if (!context.logger) {
      throw new Error('context.logger is undefined - logger injection failed');
    }
    context.logger.info('js-afterEach-result', {
      success: context.result?.success ?? false,
    });
    return context;
  },
};
