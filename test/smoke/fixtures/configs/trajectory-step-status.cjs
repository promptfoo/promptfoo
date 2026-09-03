module.exports = {
  description: 'Trajectory execution-status smoke test',
  prompts: ['Run the deterministic tool'],
  providers: ['file://../providers/trajectory-status.mjs'],
  tracing: {
    enabled: true,
    otlp: {
      http: {
        enabled: true,
        host: '127.0.0.1',
        port: Number(process.env.PROMPTFOO_SMOKE_OTLP_PORT),
        acceptFormats: ['json'],
      },
    },
  },
  tests: [
    {
      description: 'successful tool',
      vars: { code: 1 },
      assert: [
        { type: 'trajectory:step-status', value: { name: 'search_orders', status: 'success' } },
        { type: 'not-trajectory:step-status', value: { name: 'search_orders', status: 'error' } },
        { type: 'trajectory:step-status', value: { name: 'search_orders', status: 1 } },
      ],
    },
    {
      description: 'failed tool',
      vars: { code: 2, message: 'request timeout' },
      assert: [
        {
          type: 'trajectory:step-status',
          value: { pattern: 'search_*', type: 'tool', status: 'error', message: '*timeout' },
        },
        { type: 'not-trajectory:step-status', value: { name: 'search_orders', status: 'success' } },
      ],
    },
    {
      description: 'forbidden failed tool',
      vars: { code: 2 },
      assert: [
        { type: 'not-trajectory:step-status', value: { name: 'search_orders', status: 'error' } },
      ],
    },
    {
      description: 'unset status',
      vars: { code: 0 },
      assert: [
        { type: 'trajectory:step-status', value: { name: 'search_orders', status: 0 } },
        { type: 'not-trajectory:step-status', value: { name: 'search_orders', status: 'success' } },
        { type: 'not-trajectory:step-status', value: { name: 'search_orders', status: 'error' } },
      ],
    },
  ],
};
