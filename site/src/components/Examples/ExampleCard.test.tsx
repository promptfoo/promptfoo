import React from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ExampleCard from './ExampleCard';
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

describe('ExampleCard', () => {
  it('renders the name, description and slug', () => {
    render(<ExampleCard example={example} onClick={() => {}} />);

    expect(screen.getByRole('heading', { level: 3, name: 'MCP Server Scan' })).toBeInTheDocument();
    expect(screen.getByText('Attack an MCP server through its exposed tools.')).toBeInTheDocument();
    expect(screen.getByText('redteam-mcp')).toBeInTheDocument();
  });

  it('colors each tag badge from the shared palette', () => {
    render(<ExampleCard example={example} onClick={() => {}} />);

    expect(screen.getByText('Red Teaming')).toHaveStyle({
      backgroundColor: toRgb(TAG_COLORS['Red Teaming']),
    });
    expect(screen.getByText('MCP')).toHaveStyle({ backgroundColor: toRgb(TAG_COLORS.MCP) });
  });

  it('falls back to a neutral badge color for an unmapped tag', () => {
    render(<ExampleCard example={{ ...example, tags: ['Other'] }} onClick={() => {}} />);

    expect(screen.getByText('Other')).toHaveStyle({ backgroundColor: FALLBACK_TAG_COLOR });
  });

  it('omits the description paragraph when there is no description', () => {
    const { container } = render(
      <ExampleCard example={{ ...example, description: '' }} onClick={() => {}} />,
    );

    expect(container.querySelector('p')).toBeNull();
    expect(screen.getByRole('heading', { level: 3, name: 'MCP Server Scan' })).toBeInTheDocument();
  });

  it('is an activatable button that reports clicks', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<ExampleCard example={example} onClick={onClick} />);

    const card = screen.getByRole('button');
    expect(card).toHaveAttribute('type', 'button');
    expect(card).toHaveTextContent('View details');

    await user.click(card);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('activates via the keyboard, like any other button', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<ExampleCard example={example} onClick={onClick} />);

    screen.getByRole('button').focus();
    await user.keyboard('{Enter}');

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
