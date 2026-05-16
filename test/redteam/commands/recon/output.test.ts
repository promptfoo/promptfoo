import { beforeEach, describe, expect, it, vi } from 'vitest';
import logger from '../../../../src/logger';
import { displayResults } from '../../../../src/redteam/commands/recon/output';

vi.mock('../../../../src/logger', () => ({
  default: {
    info: vi.fn(),
  },
}));

describe('displayResults', () => {
  const mockedLogger = vi.mocked(logger);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the full recon summary in verbose mode', () => {
    displayResults(
      {
        purpose: 'Investigate the target application.',
        features: 'Chat, retrieval, and actions',
        industry: 'Finance',
        systemPrompt: 'S'.repeat(220),
        hasAccessTo: 'Payments API',
        discoveredTools: [
          {
            name: 'lookupCustomer',
            description: 'Fetch customer records',
            file: 'src/tools/customer.ts',
          },
        ],
        suggestedPlugins: ['pii:direct', 'sql-injection'],
        entities: ['Acme Bank', 'Support Agent'],
        securityNotes: ['Privileged tool access'],
        keyFiles: ['src/app.ts', 'src/tools/customer.ts'],
      },
      true,
    );

    const messages = mockedLogger.info.mock.calls.map(([message]) => String(message));
    expect(messages.some((message) => message.includes('Reconnaissance Results'))).toBe(true);
    expect(messages.some((message) => message.includes('Purpose:'))).toBe(true);
    expect(messages.some((message) => message.includes('Finance'))).toBe(true);
    expect(messages.some((message) => message.includes(`${'S'.repeat(200)}...`))).toBe(true);
    expect(messages.some((message) => message.includes('lookupCustomer'))).toBe(true);
    expect(messages.some((message) => message.includes('src/tools/customer.ts'))).toBe(true);
    expect(messages.some((message) => message.includes('pii:direct, sql-injection'))).toBe(true);
    expect(messages.some((message) => message.includes('Privileged tool access'))).toBe(true);
    expect(messages.some((message) => message.includes('src/app.ts'))).toBe(true);
  });

  it('skips optional sections and preserves a short system prompt', () => {
    displayResults(
      {
        systemPrompt: 'Keep responses concise.',
        discoveredTools: [],
        suggestedPlugins: [],
        entities: [],
        securityNotes: [],
        keyFiles: [],
      },
      false,
    );

    const messages = mockedLogger.info.mock.calls.map(([message]) => String(message));
    expect(messages.some((message) => message.includes('Keep responses concise.'))).toBe(true);
    expect(messages.some((message) => message.includes('Discovered Tools'))).toBe(false);
    expect(messages.some((message) => message.includes('Suggested Plugins'))).toBe(false);
    expect(messages.some((message) => message.includes('Key Files Analyzed'))).toBe(false);
  });
});
