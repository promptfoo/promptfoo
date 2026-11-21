import React from 'react';

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExamplesGallery from './ExamplesGallery';

// The gallery reads its data through `src/data/examples`, which imports the build-time
// generated JSON. Mock the JSON rather than the data module so the real search/filter
// logic stays under test here.
const generated = vi.hoisted(() => ({
  generatedAt: '2026-01-01T00:00:00.000Z',
  totalCount: 4,
  tags: [
    { id: 'getting-started', label: 'Getting Started', count: 1 },
    { id: 'red-teaming', label: 'Red Teaming', count: 2 },
    { id: 'providers', label: 'Providers', count: 1 },
  ],
  examples: [
    {
      slug: 'getting-started',
      humanName: 'Quickstart Eval',
      description: 'Run your first evaluation in under a minute.',
      tags: ['Getting Started', 'Evaluation'],
      initCommand: 'promptfoo init --example getting-started',
      githubUrl: 'https://github.com/promptfoo/promptfoo/tree/main/examples/getting-started',
    },
    {
      slug: 'redteam-chatbot',
      humanName: 'Chatbot Red Team',
      description: 'Probe a customer support bot for jailbreaks.',
      tags: ['Red Teaming'],
      initCommand: 'promptfoo init --example redteam-chatbot',
      githubUrl: 'https://github.com/promptfoo/promptfoo/tree/main/examples/redteam-chatbot',
    },
    {
      slug: 'redteam-mcp',
      humanName: 'MCP Server Scan',
      description: 'Attack an MCP server through its exposed tools.',
      tags: ['Red Teaming', 'MCP'],
      initCommand: 'promptfoo init --example redteam-mcp',
      githubUrl: 'https://github.com/promptfoo/promptfoo/tree/main/examples/redteam-mcp',
    },
    {
      slug: 'provider-python',
      humanName: 'Python Provider',
      description: 'Call a local Python script as a provider.',
      tags: ['Providers', 'Python'],
      initCommand: 'promptfoo init --example provider-python',
      githubUrl: 'https://github.com/promptfoo/promptfoo/tree/main/examples/provider-python',
    },
  ],
}));

vi.mock('../../.generated-examples.json', () => ({ default: generated }));

const router = vi.hoisted(() => ({
  search: '',
  replace: vi.fn(),
}));

vi.mock('@docusaurus/router', () => ({
  useHistory: () => ({ replace: router.replace }),
  useLocation: () => ({ pathname: '/docs/examples', search: router.search }),
}));

/** Every rendered example card, identified by the slug it prints. */
function visibleSlugs(): string[] {
  return screen
    .getAllByRole('heading', { level: 3 })
    .map((heading) => heading.closest('button')?.querySelector('code')?.textContent ?? '');
}

function searchBox(): HTMLElement {
  return screen.getByRole('textbox', { name: 'Search examples' });
}

function tagChip(label: string): HTMLElement {
  return within(screen.getByRole('group', { name: 'Filter by tag' })).getByRole('button', {
    name: new RegExp(`^${label}`),
  });
}

function typeSearch(value: string) {
  fireEvent.change(searchBox(), { target: { value } });
}

/**
 * MUI's Drawer unmounts on a slide-out transition and, while it is open, marks the rest
 * of the page aria-hidden. Wait for it to finish leaving before asserting on the grid.
 */
async function waitForDrawerToClose() {
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Close' })).toBeNull());
}

describe('ExamplesGallery', () => {
  beforeEach(() => {
    router.search = '';
  });

  it('renders a card for every example and announces the total', () => {
    render(<ExamplesGallery />);

    expect(screen.getByText(/Browse 4 ready-to-use configurations/)).toBeInTheDocument();
    expect(visibleSlugs()).toEqual([
      'getting-started',
      'redteam-chatbot',
      'redteam-mcp',
      'provider-python',
    ]);
    expect(screen.getByText('4 examples')).toBeInTheDocument();
  });

  it('narrows the grid as the search query changes', () => {
    render(<ExamplesGallery />);

    typeSearch('jailbreaks');

    expect(visibleSlugs()).toEqual(['redteam-chatbot']);
    expect(screen.getByText('Showing 1 of 4 examples')).toBeInTheDocument();
  });

  it('narrows the grid to the selected tag', async () => {
    const user = userEvent.setup();
    render(<ExamplesGallery />);

    await user.click(tagChip('Red Teaming'));

    expect(visibleSlugs()).toEqual(['redteam-chatbot', 'redteam-mcp']);
    expect(screen.getByText('Showing 2 of 4 examples')).toBeInTheDocument();
  });

  it('intersects the search query with the selected tag', async () => {
    const user = userEvent.setup();
    render(<ExamplesGallery />);

    await user.click(tagChip('Red Teaming'));
    typeSearch('mcp');

    expect(visibleSlugs()).toEqual(['redteam-mcp']);
  });

  it('shows an empty state that resets both filters', async () => {
    const user = userEvent.setup();
    render(<ExamplesGallery />);

    await user.click(tagChip('Providers'));
    typeSearch('jailbreaks');

    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0);
    expect(screen.getByText('No examples found matching your search.')).toBeInTheDocument();

    // The empty state carries its own reset button, rendered after the filter bar's.
    const resetButtons = screen.getAllByRole('button', { name: 'Clear filters' });
    expect(resetButtons).toHaveLength(2);
    await user.click(resetButtons[1] as HTMLButtonElement);

    expect(visibleSlugs()).toHaveLength(4);
    expect(searchBox()).toHaveValue('');
    expect(tagChip('All')).toBeInTheDocument();
  });

  it('opens the drawer for the clicked card and closes it again', async () => {
    const user = userEvent.setup();
    render(<ExamplesGallery />);

    expect(screen.queryByText('promptfoo init --example redteam-mcp')).toBeNull();

    const card = screen
      .getByRole('heading', { level: 3, name: 'MCP Server Scan' })
      .closest('button') as HTMLButtonElement;
    await user.click(card);

    expect(screen.getByText('promptfoo init --example redteam-mcp')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'MCP Server Scan' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitForDrawerToClose();

    expect(screen.queryByText('promptfoo init --example redteam-mcp')).toBeNull();
  });

  it('opens the drawer for whichever card was clicked last', async () => {
    const user = userEvent.setup();
    render(<ExamplesGallery />);

    await user.click(
      screen.getByRole('heading', { level: 3, name: 'MCP Server Scan' }).closest('button')!,
    );
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitForDrawerToClose();
    await user.click(
      screen.getByRole('heading', { level: 3, name: 'Python Provider' }).closest('button')!,
    );

    expect(screen.getByText('promptfoo init --example provider-python')).toBeInTheDocument();
    expect(screen.queryByText('promptfoo init --example redteam-mcp')).toBeNull();
  });

  it('mirrors the active filters into the query string so the view is shareable', async () => {
    const user = userEvent.setup();
    render(<ExamplesGallery />);

    typeSearch('mcp');
    await user.click(tagChip('Red Teaming'));

    expect(router.replace).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pathname: '/docs/examples',
        search: '?q=mcp&tag=Red+Teaming',
      }),
    );
  });

  it('drops the query string again once the filters are cleared', async () => {
    const user = userEvent.setup();
    render(<ExamplesGallery />);

    typeSearch('mcp');
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(router.replace).toHaveBeenLastCalledWith(
      expect.objectContaining({ pathname: '/docs/examples', search: '' }),
    );
  });

  it('restores the filters from the query string on load', () => {
    router.search = '?q=mcp&tag=Red+Teaming';

    render(<ExamplesGallery />);

    expect(searchBox()).toHaveValue('mcp');
    expect(visibleSlugs()).toEqual(['redteam-mcp']);
    expect(screen.getByText('Showing 1 of 4 examples')).toBeInTheDocument();
  });

  it('ignores an unknown tag in the query string instead of rendering a stale grid', () => {
    router.search = '?tag=Nonexistent';

    render(<ExamplesGallery />);

    expect(screen.getByText('No examples found matching your search.')).toBeInTheDocument();
  });

  it('links contributors to the examples directory', () => {
    render(<ExamplesGallery />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Want to contribute?' }),
    ).toBeInTheDocument();
    expect(screen.getByText('View on GitHub')).toBeInTheDocument();
  });
});
