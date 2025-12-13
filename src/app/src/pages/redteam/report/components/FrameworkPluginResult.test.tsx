import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import FrameworkPluginResult from './FrameworkPluginResult';
import { createAppTheme } from '@app/components/PageShell';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('./FrameworkComplianceUtils', async () => {
  const actual = await vi.importActual('./FrameworkComplianceUtils');
  return {
    ...actual,
    getPluginDisplayName: vi.fn((plugin) => plugin),
  };
});

describe('FrameworkPluginResult', () => {
  const theme = createAppTheme(false);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should navigate to the eval results page with mode 'passes' when ASR is exactly 0", async () => {
    const props = {
      evalId: 'test-eval-123',
      plugin: 'sql-injection',
      getPluginASR: vi.fn().mockReturnValue({ asr: 0, total: 10, failCount: 0 }),
      type: 'failed' as const,
    };

    render(
      <ThemeProvider theme={theme}>
        <MemoryRouter>
          <FrameworkPluginResult {...props} />
        </MemoryRouter>
      </ThemeProvider>,
    );

    const pluginElement = screen.getByText(props.plugin);
    await userEvent.click(pluginElement);

    const expectedFilter = JSON.stringify([
      {
        type: 'plugin',
        operator: 'equals',
        value: props.plugin,
      },
    ]);
    const expectedUrl = `/eval/${props.evalId}?filter=${encodeURIComponent(
      expectedFilter,
    )}&mode=passes`;

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(expectedUrl);
  });

  it("should navigate to the eval results page with mode 'failures' when ASR is very small but non-zero", async () => {
    const props = {
      evalId: 'test-eval-123',
      plugin: 'sql-injection',
      getPluginASR: vi.fn().mockReturnValue({ asr: 0.000001, total: 10, failCount: 1 }),
      type: 'failed' as const,
    };

    render(
      <ThemeProvider theme={theme}>
        <MemoryRouter>
          <FrameworkPluginResult {...props} />
        </MemoryRouter>
      </ThemeProvider>,
    );

    const pluginElement = screen.getByText(props.plugin);
    await userEvent.click(pluginElement);

    const expectedFilter = JSON.stringify([
      {
        type: 'plugin',
        operator: 'equals',
        value: props.plugin,
      },
    ]);
    const expectedUrl = `/eval/${props.evalId}?filter=${encodeURIComponent(
      expectedFilter,
    )}&mode=failures`;

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(expectedUrl);
  });

  it('should navigate to the eval results page with a JSON-encoded filter and mode "failures" when the pluginId contains special characters', async () => {
    const pluginIdWithSpecialChars = 'plugin with / and spaces';
    const evalId = 'test-eval-123';
    const asrValue = 50;
    const totalValue = 10;
    const failCountValue = 5;

    const props = {
      evalId: evalId,
      plugin: pluginIdWithSpecialChars,
      getPluginASR: vi
        .fn()
        .mockReturnValue({ asr: asrValue, total: totalValue, failCount: failCountValue }),
      type: 'failed' as const,
    };

    render(
      <ThemeProvider theme={theme}>
        <MemoryRouter>
          <FrameworkPluginResult {...props} />
        </MemoryRouter>
      </ThemeProvider>,
    );

    const pluginElement = screen.getByText(pluginIdWithSpecialChars);
    await userEvent.click(pluginElement);

    const expectedFilter = JSON.stringify([
      {
        type: 'plugin',
        operator: 'equals',
        value: pluginIdWithSpecialChars,
      },
    ]);
    const expectedUrl = `/eval/${evalId}?filter=${encodeURIComponent(
      expectedFilter,
    )}&mode=failures`;

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(expectedUrl);
  });

  it('should not trigger navigation when an untested plugin is clicked', async () => {
    const props = {
      evalId: 'test-eval-123',
      plugin: 'untested-plugin',
      getPluginASR: vi.fn().mockReturnValue({ asr: 0, total: 0, failCount: 0 }),
      type: 'untested' as const,
    };

    render(
      <ThemeProvider theme={theme}>
        <MemoryRouter>
          <FrameworkPluginResult {...props} />
        </MemoryRouter>
      </ThemeProvider>,
    );

    const pluginElement = screen.getByText(props.plugin);
    await userEvent.click(pluginElement);

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("should navigate to the eval results page with a JSON-encoded filter and mode 'passes' when a plugin with ASR of zero is clicked and type is 'passed'", async () => {
    const props = {
      evalId: 'test-eval-123',
      plugin: 'sql-injection',
      getPluginASR: vi.fn().mockReturnValue({ asr: 0, total: 10, failCount: 0 }),
      type: 'passed' as const,
    };

    render(
      <ThemeProvider theme={theme}>
        <MemoryRouter>
          <FrameworkPluginResult {...props} />
        </MemoryRouter>
      </ThemeProvider>,
    );

    const pluginElement = screen.getByText(props.plugin);
    await userEvent.click(pluginElement);

    const expectedFilter = JSON.stringify([
      {
        type: 'plugin',
        operator: 'equals',
        value: props.plugin,
      },
    ]);
    const expectedUrl = `/eval/${props.evalId}?filter=${encodeURIComponent(
      expectedFilter,
    )}&mode=passes`;

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(expectedUrl);
  });

  it("should navigate to the eval results page with a JSON-encoded filter and mode 'failures' when a plugin with non-zero ASR is clicked and type is 'failed'", async () => {
    const props = {
      evalId: 'test-eval-123',
      plugin: 'sql-injection',
      getPluginASR: vi.fn().mockReturnValue({ asr: 50, total: 10, failCount: 5 }),
      type: 'failed' as const,
    };

    render(
      <ThemeProvider theme={theme}>
        <MemoryRouter>
          <FrameworkPluginResult {...props} />
        </MemoryRouter>
      </ThemeProvider>,
    );

    const pluginElement = screen.getByText(props.plugin);
    await userEvent.click(pluginElement);

    const expectedFilter = JSON.stringify([
      {
        type: 'plugin',
        operator: 'equals',
        value: props.plugin,
      },
    ]);
    const expectedUrl = `/eval/${props.evalId}?filter=${encodeURIComponent(
      expectedFilter,
    )}&mode=failures`;

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(expectedUrl);
  });
});
