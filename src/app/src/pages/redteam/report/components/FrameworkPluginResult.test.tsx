import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThemeProvider } from '@mui/material/styles';
import FrameworkPluginResult from './FrameworkPluginResult';
import { createAppTheme } from '../../../../components/PageShell';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('./FrameworkComplianceUtils', async () => {
  const actual = await vi.importActual('./FrameworkComplianceUtils');
  return {
    ...actual,
    getPluginDisplayName: vi.fn((plugin) => plugin),
  };
});

describe('FrameworkPluginResult', () => {
  const theme = createAppTheme(false);
  const defaultProps = {
    evalId: 'test-eval-id-123',
    plugin: 'sql-injection',
    getPluginASR: vi.fn(() => ({ asr: 50, total: 10, failCount: 5 })),
    type: 'failed' as const,
  };

  const renderComponent = (props = {}) => {
    return render(
      <ThemeProvider theme={theme}>
        <FrameworkPluginResult {...defaultProps} {...props} />
      </ThemeProvider>,
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should navigate to /eval/{evalId}?filter=[...]&mode=failures with the correct filter JSON when a plugin of type 'failed' is clicked", async () => {
    const user = userEvent.setup();
    const evalId = 'test-eval-456';
    const pluginId = 'harmful:cybercrime';

    renderComponent({
      evalId,
      plugin: pluginId,
      type: 'failed',
    });

    const pluginElement = screen.getByText(pluginId);
    await user.click(pluginElement);

    const expectedFilterObject = [
      {
        type: 'plugin',
        operator: 'equals',
        value: pluginId,
      },
    ];
    const expectedFilterParam = encodeURIComponent(JSON.stringify(expectedFilterObject));
    const expectedUrl = `/eval/${evalId}?filter=${expectedFilterParam}&mode=failures`;

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(expectedUrl);
  });

  it("should navigate to /eval/{evalId}?filter=[...]&mode=failures with the correct filter JSON when a plugin of type 'passed' is clicked", async () => {
    const user = userEvent.setup();
    const evalId = 'test-eval-789';
    const pluginId = 'no-injection';

    renderComponent({
      evalId,
      plugin: pluginId,
      type: 'passed',
    });

    const pluginElement = screen.getByText(pluginId);
    await user.click(pluginElement);

    const expectedFilterObject = [
      {
        type: 'plugin',
        operator: 'equals',
        value: pluginId,
      },
    ];
    const expectedFilterParam = encodeURIComponent(JSON.stringify(expectedFilterObject));
    const expectedUrl = `/eval/${evalId}?filter=${expectedFilterParam}&mode=failures`;

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(expectedUrl);
  });

  it('should not trigger navigation when a plugin of type "untested" is clicked', async () => {
    const user = userEvent.setup();
    const pluginId = 'untested-plugin';

    renderComponent({
      plugin: pluginId,
      type: 'untested',
    });

    const pluginElement = screen.getByText(pluginId);
    await user.click(pluginElement);

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('should correctly encode pluginId with special characters in the URL', async () => {
    const user = userEvent.setup();
    const evalId = 'test-eval-789';
    const pluginId = 'plugin with spaces/and slashes';

    renderComponent({
      evalId,
      plugin: pluginId,
      type: 'failed',
    });

    const pluginElement = screen.getByText(pluginId);
    await user.click(pluginElement);

    const expectedFilterObject = [
      {
        type: 'plugin',
        operator: 'equals',
        value: pluginId,
      },
    ];
    const expectedFilterParam = encodeURIComponent(JSON.stringify(expectedFilterObject));
    const expectedUrl = `/eval/${evalId}?filter=${expectedFilterParam}&mode=failures`;

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(expectedUrl);
  });

  it('should correctly format and display extremely high ASR percentages', () => {
    const asrValue = 99.999;
    const totalValue = 100;
    const failCountValue = 99;

    const getPluginASRMock = vi.fn(() => ({
      asr: asrValue,
      total: totalValue,
      failCount: failCountValue,
    }));

    renderComponent({
      getPluginASR: getPluginASRMock,
    });

    const asrDisplay = screen.getByText('100.00%');
    expect(asrDisplay).toBeInTheDocument();
  });
});
