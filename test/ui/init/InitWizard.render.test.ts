import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';

// Mock telemetry
vi.mock('../../../src/telemetry', () => ({
  default: {
    record: vi.fn(),
  },
}));

// Mock logger
vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock envars
vi.mock('../../../src/envars', () => ({
  getEnvString: vi.fn(),
  getEnvBool: vi.fn(() => false),
}));

// Mock redteamInit since it's imported
vi.mock('../../../src/redteam/commands/init', () => ({
  redteamInit: vi.fn(),
}));

// Mock fs operations since InitWizard uses them
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

describe('InitWizard render test', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should render the wizard header', async () => {
    const { InitWizard } = await import('../../../src/ui/init/InitWizard');

    const { lastFrame, unmount } = render(
      React.createElement(InitWizard, {
        directory: '/tmp/test',
        onComplete: vi.fn(),
        onExit: vi.fn(),
      }),
    );

    const output = lastFrame();
    expect(output).toContain('promptfoo init');
    unmount();
  });

  it('should show the progress bar', async () => {
    const { InitWizard } = await import('../../../src/ui/init/InitWizard');

    const { lastFrame, unmount } = render(
      React.createElement(InitWizard, {
        directory: '/tmp/test',
        onComplete: vi.fn(),
        onExit: vi.fn(),
      }),
    );

    const output = lastFrame();
    // Progress bar should show step indicators
    expect(output).toMatch(/Step \d of \d/);
    unmount();
  });

  it('should show use case selection step', async () => {
    const { InitWizard } = await import('../../../src/ui/init/InitWizard');

    const { lastFrame, unmount } = render(
      React.createElement(InitWizard, {
        directory: '/tmp/test',
        onComplete: vi.fn(),
        onExit: vi.fn(),
      }),
    );

    const output = lastFrame();
    // Should show use case options
    expect(output).toMatch(/compare|rag|agent|redteam/i);
    unmount();
  });

  it('should show keyboard navigation hint', async () => {
    const { InitWizard } = await import('../../../src/ui/init/InitWizard');

    const { lastFrame, unmount } = render(
      React.createElement(InitWizard, {
        directory: '/tmp/test',
        onComplete: vi.fn(),
        onExit: vi.fn(),
      }),
    );

    const output = lastFrame();
    // Should show exit hint
    expect(output).toContain('exit');
    unmount();
  });
});
