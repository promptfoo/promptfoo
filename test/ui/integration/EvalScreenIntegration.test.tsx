/**
 * Integration tests for Ink UI components.
 *
 * These tests verify that components work together correctly
 * when rendered with the Ink testing library.
 */

import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

// Mock terminal size hook used by many components
vi.mock('../../../src/ui/hooks/useTerminalSize', () => ({
  useTerminalSize: () => ({ width: 120, height: 40 }),
}));

// Test the ProgressBar component
import { ProgressBar } from '../../../src/ui/components/shared/ProgressBar';

describe('ProgressBar Integration', () => {
  it('should render progress bar with percentage', () => {
    const { lastFrame } = render(
      <ProgressBar value={50} max={100} width={50} showPercentage={true} />,
    );

    const output = lastFrame();
    expect(output).toContain('50%');
  });

  it('should render empty progress bar at 0%', () => {
    const { lastFrame } = render(
      <ProgressBar value={0} max={100} width={30} showPercentage={true} />,
    );

    const output = lastFrame();
    expect(output).toContain('0%');
  });

  it('should render full progress bar at 100%', () => {
    const { lastFrame } = render(
      <ProgressBar value={100} max={100} width={30} showPercentage={true} />,
    );

    const output = lastFrame();
    expect(output).toContain('100%');
  });

  it('should handle edge case of zero max', () => {
    const { lastFrame } = render(
      <ProgressBar value={0} max={0} width={30} showPercentage={true} />,
    );

    // Should not throw and should render something
    const output = lastFrame();
    expect(output).toBeDefined();
  });

  it('should render colored progress bar', () => {
    const { lastFrame } = render(
      <ProgressBar value={75} max={100} width={40} showPercentage={true} color="green" />,
    );

    const output = lastFrame();
    expect(output).toContain('75%');
  });

  it('should hide percentage when showPercentage is false', () => {
    const { lastFrame } = render(
      <ProgressBar value={50} max={100} width={30} showPercentage={false} />,
    );

    const output = lastFrame();
    // Should not contain a percentage
    expect(output).not.toContain('%');
  });

  it('should render with label', () => {
    const { lastFrame } = render(
      <ProgressBar value={50} max={100} width={30} label="Progress" showPercentage={true} />,
    );

    const output = lastFrame();
    expect(output).toContain('Progress');
    expect(output).toContain('50%');
  });

  it('should show count when showCount is true', () => {
    const { lastFrame } = render(
      <ProgressBar value={50} max={100} width={30} showCount={true} showPercentage={false} />,
    );

    const output = lastFrame();
    expect(output).toContain('50/100');
  });
});

// Test the Badge component
import { Badge } from '../../../src/ui/components/shared/Badge';

describe('Badge Integration', () => {
  it('should render success badge', () => {
    const { lastFrame } = render(<Badge variant="success">PASS</Badge>);

    const output = lastFrame();
    expect(output).toContain('PASS');
  });

  it('should render error badge', () => {
    const { lastFrame } = render(<Badge variant="error">FAIL</Badge>);

    const output = lastFrame();
    expect(output).toContain('FAIL');
  });

  it('should render warning badge', () => {
    const { lastFrame } = render(<Badge variant="warning">WARNING</Badge>);

    const output = lastFrame();
    expect(output).toContain('WARNING');
  });

  it('should render info badge', () => {
    const { lastFrame } = render(<Badge variant="info">INFO</Badge>);

    const output = lastFrame();
    expect(output).toContain('INFO');
  });
});

// Test the StatusMessage component
import { StatusMessage } from '../../../src/ui/components/shared/StatusMessage';

describe('StatusMessage Integration', () => {
  it('should render success message', () => {
    const { lastFrame } = render(<StatusMessage type="success">Operation complete</StatusMessage>);

    const output = lastFrame();
    expect(output).toContain('Operation complete');
  });

  it('should render error message', () => {
    const { lastFrame } = render(<StatusMessage type="error">Something went wrong</StatusMessage>);

    const output = lastFrame();
    expect(output).toContain('Something went wrong');
  });

  it('should render info message', () => {
    const { lastFrame } = render(<StatusMessage type="info">Loading...</StatusMessage>);

    const output = lastFrame();
    expect(output).toContain('Loading');
  });

  it('should render warning message', () => {
    const { lastFrame } = render(<StatusMessage type="warning">Be careful</StatusMessage>);

    const output = lastFrame();
    expect(output).toContain('Be careful');
  });
});

// Test HelpOverlay integration
import { HelpOverlay } from '../../../src/ui/components/table/HelpOverlay';

describe('HelpOverlay Integration', () => {
  const onClose = vi.fn();

  it('should render keyboard shortcuts', () => {
    const { lastFrame } = render(<HelpOverlay onClose={onClose} />);

    const output = lastFrame();
    // HelpOverlay uses uppercase NAVIGATION
    expect(output).toContain('NAVIGATION');
  });

  it('should show navigation shortcuts', () => {
    const { lastFrame } = render(<HelpOverlay onClose={onClose} />);

    const output = lastFrame();
    expect(output).toContain('NAVIGATION');
    // Should contain arrow key shortcuts
    expect(output).toMatch(/↑|↓|←|→|j|k/);
  });

  it('should show action shortcuts', () => {
    const { lastFrame } = render(<HelpOverlay onClose={onClose} />);

    const output = lastFrame();
    expect(output).toContain('ACTIONS');
  });

  it('should show view shortcuts', () => {
    const { lastFrame } = render(<HelpOverlay onClose={onClose} />);

    const output = lastFrame();
    expect(output).toContain('VIEWS');
  });

  it('should show general shortcuts', () => {
    const { lastFrame } = render(<HelpOverlay onClose={onClose} />);

    const output = lastFrame();
    expect(output).toContain('GENERAL');
    expect(output).toContain('Quit');
  });

  it('should show history shortcut when available', () => {
    const { lastFrame } = render(<HelpOverlay onClose={onClose} historyAvailable={true} />);

    const output = lastFrame();
    expect(output).toContain('History');
  });
});

// Test Spinner component
import { Spinner } from '../../../src/ui/components/shared/Spinner';

describe('Spinner Integration', () => {
  it('should render spinner', () => {
    const { lastFrame } = render(<Spinner />);

    const output = lastFrame();
    // Spinner should render something (the exact character varies by animation frame)
    expect(output).toBeDefined();
    expect(output?.length).toBeGreaterThan(0);
  });

  it('should render spinner with text', () => {
    const { lastFrame } = render(<Spinner text="Loading..." />);

    const output = lastFrame();
    expect(output).toContain('Loading...');
  });

  it('should render different spinner types', () => {
    const { lastFrame: dots } = render(<Spinner type="dots" />);
    const { lastFrame: line } = render(<Spinner type="line" />);

    expect(dots()).toBeDefined();
    expect(line()).toBeDefined();
  });

  it('should not render when inactive', () => {
    const { lastFrame } = render(<Spinner active={false} />);

    const output = lastFrame();
    expect(output).toBe('');
  });
});

// Test StatusBadge component
import { StatusBadge, StatusIndicator } from '../../../src/ui/components/table/StatusBadge';

describe('StatusBadge Integration', () => {
  it('should render pass status', () => {
    const { lastFrame } = render(<StatusBadge status="pass" />);

    const output = lastFrame();
    expect(output).toContain('[PASS]');
  });

  it('should render fail status', () => {
    const { lastFrame } = render(<StatusBadge status="fail" />);

    const output = lastFrame();
    expect(output).toContain('[FAIL]');
  });

  it('should render error status', () => {
    const { lastFrame } = render(<StatusBadge status="error" />);

    const output = lastFrame();
    expect(output).toContain('[ERROR]');
  });

  it('should render nothing for null status', () => {
    const { lastFrame } = render(<StatusBadge status={null} />);

    const output = lastFrame();
    expect(output).toBe('');
  });
});

describe('StatusIndicator Integration', () => {
  it('should render pass checkmark', () => {
    const { lastFrame } = render(<StatusIndicator status="pass" />);

    const output = lastFrame();
    expect(output).toContain('✓');
  });

  it('should render fail X', () => {
    const { lastFrame } = render(<StatusIndicator status="fail" />);

    const output = lastFrame();
    expect(output).toContain('✗');
  });

  it('should render error exclamation', () => {
    const { lastFrame } = render(<StatusIndicator status="error" />);

    const output = lastFrame();
    expect(output).toContain('!');
  });

  it('should render dash for null status', () => {
    const { lastFrame } = render(<StatusIndicator status={null} />);

    const output = lastFrame();
    expect(output).toContain('-');
  });
});

// Test InlineProgress component
import { InlineProgress } from '../../../src/ui/components/shared/ProgressBar';

describe('InlineProgress Integration', () => {
  it('should render fraction format', () => {
    const { lastFrame } = render(<InlineProgress value={50} max={100} format="fraction" />);

    const output = lastFrame();
    expect(output).toContain('50/100');
  });

  it('should render percentage format', () => {
    const { lastFrame } = render(<InlineProgress value={50} max={100} format="percentage" />);

    const output = lastFrame();
    expect(output).toContain('50%');
  });

  it('should render both format', () => {
    const { lastFrame } = render(<InlineProgress value={50} max={100} format="both" />);

    const output = lastFrame();
    expect(output).toContain('50/100');
    expect(output).toContain('50%');
  });
});
