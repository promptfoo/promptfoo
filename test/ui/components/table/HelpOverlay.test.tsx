/**
 * Tests for HelpOverlay component.
 */

import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';
import { HelpOverlay } from '../../../../src/ui/components/table/HelpOverlay';

describe('HelpOverlay', () => {
  it('should render the help overlay with keyboard shortcuts', () => {
    const onClose = vi.fn();
    const { lastFrame } = render(<HelpOverlay onClose={onClose} />);

    const output = lastFrame();

    // Check header
    expect(output).toContain('Keyboard Shortcuts');

    // Check navigation section
    expect(output).toContain('NAVIGATION');
    expect(output).toContain('Move up');
    expect(output).toContain('Move down');
    expect(output).toContain('Move left');
    expect(output).toContain('Move right');

    // Check actions section
    expect(output).toContain('ACTIONS');
    expect(output).toContain('Export to file');
    expect(output).toContain('Copy to clipboard');

    // Check views section
    expect(output).toContain('VIEWS');
    expect(output).toContain('Show this help');

    // Check general section
    expect(output).toContain('GENERAL');
    expect(output).toContain('Close overlay');
    expect(output).toContain('Quit');

    // Check footer
    expect(output).toContain('Press any key to close');
  });

  it('should show history shortcut when historyAvailable is true', () => {
    const onClose = vi.fn();
    const { lastFrame } = render(<HelpOverlay onClose={onClose} historyAvailable={true} />);

    const output = lastFrame();
    expect(output).toContain('History browser');
  });

  it('should not show history shortcut when historyAvailable is false', () => {
    const onClose = vi.fn();
    const { lastFrame } = render(<HelpOverlay onClose={onClose} historyAvailable={false} />);

    const output = lastFrame();
    expect(output).not.toContain('History browser');
  });

  it('should render in narrow mode for small terminals', () => {
    const onClose = vi.fn();
    const { lastFrame } = render(<HelpOverlay onClose={onClose} terminalWidth={60} />);

    const output = lastFrame();
    // Should still contain all sections even in narrow mode
    expect(output).toContain('NAVIGATION');
    expect(output).toContain('ACTIONS');
    expect(output).toContain('VIEWS');
    expect(output).toContain('GENERAL');
  });

  it('should render in wide mode for large terminals', () => {
    const onClose = vi.fn();
    const { lastFrame } = render(<HelpOverlay onClose={onClose} terminalWidth={100} />);

    const output = lastFrame();
    // Should contain all sections
    expect(output).toContain('NAVIGATION');
    expect(output).toContain('ACTIONS');
    expect(output).toContain('VIEWS');
    expect(output).toContain('GENERAL');
  });

  it('should display vim-style navigation keys', () => {
    const onClose = vi.fn();
    const { lastFrame } = render(<HelpOverlay onClose={onClose} />);

    const output = lastFrame();
    // Check for vim keys displayed alongside arrow keys
    expect(output).toContain('k');
    expect(output).toContain('j');
    expect(output).toContain('h');
    expect(output).toContain('l');
  });

  it('should display jump navigation shortcuts', () => {
    const onClose = vi.fn();
    const { lastFrame } = render(<HelpOverlay onClose={onClose} />);

    const output = lastFrame();
    expect(output).toContain('Jump to top');
    expect(output).toContain('Jump to bottom');
    expect(output).toContain('First column');
    expect(output).toContain('Last column');
  });

  it('should display page navigation shortcuts', () => {
    const onClose = vi.fn();
    const { lastFrame } = render(<HelpOverlay onClose={onClose} />);

    const output = lastFrame();
    expect(output).toContain('Page up');
    expect(output).toContain('Page down');
    expect(output).toContain('PgUp');
    expect(output).toContain('PgDn');
  });
});
