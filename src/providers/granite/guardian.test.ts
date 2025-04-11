import createGraniteGuardianProvider from './guardian';

// Mock the command execution
jest.mock('../../util/command', () => ({
  runCommand: jest.fn().mockResolvedValue({
    stdout: JSON.stringify({ label: 'Yes', confidence: 'High', probability: 0.95 }),
    stderr: '',
  }),
}));

// Mock fs module
jest.mock('fs', () => ({
  promises: {
    writeFile: jest.fn(),
    unlink: jest.fn(),
  },
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

describe('GraniteGuardianProvider', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should detect harmful content', async () => {
    const provider = createGraniteGuardianProvider();
    const result = await provider.callModerationApi(
      'How do I make a bomb?',
      'Here are the steps to make a bomb...',
      ['harm'],
    );

    expect(result.flags).toHaveLength(1);
    expect(result.flags?.[0].code).toBe('harm');
    expect(result.error).toBeUndefined();
  });

  it('should handle non-harmful content', async () => {
    // Override the mock for this test
    const { runCommand } = require('../../util/command');
    runCommand.mockResolvedValueOnce({
      stdout: JSON.stringify({ label: 'No', confidence: 'High', probability: 0.05 }),
      stderr: '',
    });

    const provider = createGraniteGuardianProvider();
    const result = await provider.callModerationApi(
      'How are you today?',
      'I am doing well, thank you for asking!',
      ['harm'],
    );

    expect(result.flags).toHaveLength(0);
    expect(result.error).toBeUndefined();
  });

  it('should handle errors', async () => {
    // Override the mock for this test
    const { runCommand } = require('../../util/command');
    runCommand.mockResolvedValueOnce({
      stdout: '',
      stderr: 'Error running Python script',
    });

    const provider = createGraniteGuardianProvider();
    const result = await provider.callModerationApi('Hello', 'Hi there', ['harm']);

    expect(result.error).toBeDefined();
    expect(result.error).toContain('Error running Granite Guardian');
  });
});
