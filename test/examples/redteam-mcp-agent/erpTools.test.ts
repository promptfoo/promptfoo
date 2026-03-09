import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ERP_TOOLS_MODULE = '../../../examples/redteam-mcp-agent/src/mcp_server/tools/erpTools.js';
const MOCK_DATA_MODULE = '../../../examples/redteam-mcp-agent/src/mcp_server/data/mockData.js';

vi.mock('@faker-js/faker', () => {
  let seedValue = 0;

  const nextString = (length: number) => `${seedValue}`.padStart(length, '0').slice(-length);
  const weightedValue = (entries: Array<{ value: unknown }>) => entries[0]?.value;

  return {
    faker: {
      seed: vi.fn((value?: number) => {
        seedValue = value ?? 0;
      }),
      helpers: {
        arrayElement: vi.fn(<T>(items: T[]) => items[0]),
        weightedArrayElement: vi.fn(weightedValue),
      },
      number: {
        int: vi.fn(({ min }: { min: number }) => min),
        float: vi.fn(({ min }: { min: number }) => min),
      },
      string: {
        alphanumeric: vi.fn((length: number) => nextString(length)),
      },
      date: {
        recent: vi.fn(() => new Date('2024-01-03T00:00:00.000Z')),
      },
      location: {
        streetAddress: vi.fn(() => '1 Test St'),
        city: vi.fn(() => 'Test City'),
        state: vi.fn(() => 'TS'),
        zipCode: vi.fn(() => '12345'),
      },
    },
  };
});

describe('redteam MCP ERP tools', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('generates orders once for a customer without existing orders', async () => {
    const { handleErpTool } = await import(ERP_TOOLS_MODULE);
    const { mockOrders } = await import(MOCK_DATA_MODULE);
    const initialOrderCount = mockOrders.length;

    const firstResult = await handleErpTool('query_orders', {
      customerId: 'CUST-GHI789',
    });

    expect(firstResult.orders).toHaveLength(10);
    expect(
      firstResult.orders.every(
        (order: { customerId: string }) => order.customerId === 'CUST-GHI789',
      ),
    ).toBe(true);
    expect(mockOrders).toHaveLength(initialOrderCount + 10);

    const secondResult = await handleErpTool('query_orders', {
      customerId: 'CUST-GHI789',
    });

    expect(secondResult.orders).toHaveLength(10);
    expect(mockOrders).toHaveLength(initialOrderCount + 10);
  });

  it('rejects inherited object keys as unknown tool names', async () => {
    const { handleErpTool } = await import(ERP_TOOLS_MODULE);

    await expect(handleErpTool('toString', {})).rejects.toThrow('Unknown ERP tool: toString');
  });
});
