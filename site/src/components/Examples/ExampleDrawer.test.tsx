import React from 'react';

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ExampleDrawer from './ExampleDrawer';
import styles from './ExampleDrawer.module.css';
import { TAG_COLORS } from './tagColors';

import type { ExampleData } from '../../data/examples';

const FALLBACK_TAG_COLOR = 'rgb(107, 114, 128)'; // #6b7280

function toRgb(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`;
}

const example: ExampleData = {
  slug: 'redteam-mcp',
  humanName: 'MCP Server Scan',
  description: 'Attack an MCP server through its exposed tools.',
  tags: ['Red Teaming', 'MCP'],
  initCommand: 'promptfoo init --example redteam-mcp',
  githubUrl: 'https://github.com/promptfoo/promptfoo/tree/main/examples/redteam-mcp',
};

/** The check mark swapped in after a successful copy. */
const copiedIcon = () => document.querySelector('path[d="M20 6L9 17l-5-5"]');

function stubClipboard() {
  const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
  const original = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard');

  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });

  return {
    writeText,
    restore() {
      if (original) {
        Object.defineProperty(globalThis.navigator, 'clipboard', original);
      } else {
        delete (globalThis.navigator as { clipboard?: unknown }).clipboard;
      }
    },
  };
}

describe('ExampleDrawer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when no example is selected', () => {
    const { container } = render(<ExampleDrawer example={null} open onClose={() => {}} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('presentation')).toBeNull();
  });

  it('renders nothing while closed, even with an example selected', () => {
    render(<ExampleDrawer example={example} open={false} onClose={() => {}} />);

    expect(screen.queryByText('MCP Server Scan')).toBeNull();
    expect(screen.queryByText('promptfoo init --example redteam-mcp')).toBeNull();
  });

  it('shows the selected example, its tags and the init command', () => {
    render(<ExampleDrawer example={example} open onClose={() => {}} />);

    expect(screen.getByRole('heading', { level: 2, name: 'MCP Server Scan' })).toBeInTheDocument();
    expect(screen.getByText('Attack an MCP server through its exposed tools.')).toBeInTheDocument();
    expect(screen.getByText('promptfoo init --example redteam-mcp')).toBeInTheDocument();
    expect(screen.getByText('Red Teaming')).toHaveStyle({
      backgroundColor: toRgb(TAG_COLORS['Red Teaming']),
    });
  });

  it('builds the init command from the slug rather than trusting the generated field', () => {
    // initCommand is generated data; the drawer derives the command itself, so a stale
    // or wrong initCommand must not leak into the UI.
    render(
      <ExampleDrawer
        example={{ ...example, initCommand: 'promptfoo init --example stale-slug' }}
        open
        onClose={() => {}}
      />,
    );

    expect(screen.getByText('promptfoo init --example redteam-mcp')).toBeInTheDocument();
    expect(screen.queryByText('promptfoo init --example stale-slug')).toBeNull();
  });

  it('falls back to a neutral badge color for an unmapped tag', () => {
    render(<ExampleDrawer example={{ ...example, tags: ['Other'] }} open onClose={() => {}} />);

    expect(screen.getByText('Other')).toHaveStyle({ backgroundColor: FALLBACK_TAG_COLOR });
  });

  it('omits the description paragraph when there is no description', () => {
    render(<ExampleDrawer example={{ ...example, description: '' }} open onClose={() => {}} />);

    expect(screen.queryByText('Attack an MCP server through its exposed tools.')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'MCP Server Scan' })).toBeInTheDocument();
  });

  it('links out to the example on GitHub safely', () => {
    render(<ExampleDrawer example={example} open onClose={() => {}} />);

    const link = screen.getByRole('link', { name: /View on GitHub/ });
    expect(link).toHaveAttribute('href', example.githubUrl);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('closes from the close button', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ExampleDrawer example={example} open onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ExampleDrawer example={example} open onClose={onClose} />);

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });

  it('copies the init command and shows a transient confirmation', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    // userEvent.setup() installs its own navigator.clipboard stub, so ours has to go in
    // afterwards to be the one the component sees.
    const clipboard = stubClipboard();

    try {
      render(<ExampleDrawer example={example} open onClose={() => {}} />);
      expect(copiedIcon()).toBeNull();

      // The copy button has no accessible name, so it has to be located structurally.
      const copyButton = document.querySelector<HTMLButtonElement>(`.${styles.copyButton}`);
      expect(copyButton).not.toBeNull();
      await user.click(copyButton as HTMLButtonElement);

      expect(clipboard.writeText).toHaveBeenCalledWith('promptfoo init --example redteam-mcp');
      await waitFor(() => expect(copiedIcon()).not.toBeNull());

      // The confirmation reverts on its own after two seconds.
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(copiedIcon()).toBeNull();
    } finally {
      vi.useRealTimers();
      clipboard.restore();
    }
  });
});
