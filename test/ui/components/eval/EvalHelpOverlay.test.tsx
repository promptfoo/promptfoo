import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';
import { EvalHelpOverlay } from '../../../../src/ui/components/eval/EvalHelpOverlay';

describe('EvalHelpOverlay', () => {
  it('should render keyboard shortcuts header', () => {
    const onClose = vi.fn();
    const { lastFrame } = render(<EvalHelpOverlay onClose={onClose} />);

    expect(lastFrame()).toContain('Keyboard Shortcuts');
  });

  it('should display basic shortcuts', () => {
    const onClose = vi.fn();
    const { lastFrame } = render(<EvalHelpOverlay onClose={onClose} />);
    const frame = lastFrame();

    expect(frame).toContain('q');
    expect(frame).toContain('Esc');
    expect(frame).toContain('v');
    expect(frame).toContain('verbose');
    expect(frame).toContain('?');
    expect(frame).toContain('help');
  });

  it('should show error toggle when hasErrors is true', () => {
    const onClose = vi.fn();
    const { lastFrame } = render(<EvalHelpOverlay onClose={onClose} hasErrors={true} />);
    const frame = lastFrame();

    expect(frame).toContain('e');
    expect(frame).toContain('error');
  });

  it('should not show error toggle when hasErrors is false', () => {
    const onClose = vi.fn();
    const { lastFrame } = render(<EvalHelpOverlay onClose={onClose} hasErrors={false} />);
    const frame = lastFrame();

    // 'e' for error toggle should not be present
    expect(frame).not.toContain('Toggle error');
  });

  it('should display footer with close instruction', () => {
    const onClose = vi.fn();
    const { lastFrame } = render(<EvalHelpOverlay onClose={onClose} />);

    expect(lastFrame()).toContain('Press any key to close');
  });

  it('should display category headers', () => {
    const onClose = vi.fn();
    const { lastFrame } = render(<EvalHelpOverlay onClose={onClose} hasErrors={true} />);
    const frame = lastFrame();

    expect(frame).toContain('DISPLAY');
    expect(frame).toContain('GENERAL');
  });

  it('should call onClose when any key is pressed', () => {
    const onClose = vi.fn();
    const { stdin } = render(<EvalHelpOverlay onClose={onClose} />);

    // Simulate key press
    stdin.write('x');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should display additional info about evaluation', () => {
    const onClose = vi.fn();
    const { lastFrame } = render(<EvalHelpOverlay onClose={onClose} />);
    const frame = lastFrame();

    expect(frame).toContain('results are shown in real-time');
    expect(frame).toContain('results table');
  });
});
