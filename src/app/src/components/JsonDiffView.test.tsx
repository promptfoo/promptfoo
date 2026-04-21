import { mockClipboard } from '@app/tests/browserMocks';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { JsonDiffView } from './JsonDiffView';

describe('JsonDiffView', () => {
  it('does not render when values are identical', () => {
    const { container } = render(
      <JsonDiffView expected={{ name: 'Jane' }} actual={{ name: 'Jane' }} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders changed values and copies expected and actual JSON', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard({ writeText: writeText as Clipboard['writeText'] });

    render(<JsonDiffView expected={{ name: 'Jane' }} actual={{ name: 'John' }} />);

    expect(screen.getByText('1 difference found')).toBeInTheDocument();
    expect(screen.getByText('name')).toBeInTheDocument();
    expect(screen.getByText('expected: "Jane"')).toBeInTheDocument();
    expect(screen.getByText('actual: "John"')).toBeInTheDocument();

    const copyButtons = screen.getAllByRole('button', { name: 'Copy' });
    await user.click(copyButtons[0]);
    await user.click(copyButtons[1]);

    expect(writeText).toHaveBeenNthCalledWith(1, JSON.stringify({ name: 'Jane' }, null, 2));
    expect(writeText).toHaveBeenNthCalledWith(2, JSON.stringify({ name: 'John' }, null, 2));
  });

  it('renders added and removed values', () => {
    render(
      <JsonDiffView expected={{ removed: true, stable: 1 }} actual={{ added: false, stable: 1 }} />,
    );

    expect(screen.getByText('2 differences found')).toBeInTheDocument();
    expect(screen.getByText('removed')).toBeInTheDocument();
    expect(screen.getByText('removed: true')).toBeInTheDocument();
    expect(screen.getByText('added')).toBeInTheDocument();
    expect(screen.getByText('added: false')).toBeInTheDocument();
  });

  it('expands long diff summaries', async () => {
    const user = userEvent.setup();
    const expected = Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => [`key${index}`, index]),
    );
    const actual = Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => [`key${index}`, index + 100]),
    );

    render(<JsonDiffView expected={expected} actual={actual} />);

    expect(screen.getByText('12 differences found')).toBeInTheDocument();
    expect(screen.getByText('key0')).toBeInTheDocument();
    expect(screen.queryByText('key11')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '...and 2 more differences' }));

    expect(screen.getByText('key11')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /more differences/ })).not.toBeInTheDocument();
  });

  it('expands the full unified diff', async () => {
    const user = userEvent.setup();

    render(
      <JsonDiffView expected={{ age: 30, name: 'Jane' }} actual={{ age: 31, name: 'Jane' }} />,
    );

    await user.click(screen.getByRole('button', { name: /view full diff/i }));

    expect(screen.getByRole('button', { name: /hide full diff/i })).toBeInTheDocument();

    const pre = screen.getByText('"age": 30,').closest('pre');
    expect(pre).toBeInTheDocument();
    expect(within(pre!).getByText('"age": 30,')).toBeInTheDocument();
    expect(within(pre!).getByText('"age": 31,')).toBeInTheDocument();
    expect(within(pre!).getByText('"name": "Jane"')).toBeInTheDocument();
  });

  it('shows a fallback for objects that are too large to diff', () => {
    render(<JsonDiffView expected={{ value: 'x'.repeat(50_001) }} actual={{ value: 'small' }} />);

    expect(screen.getByText(/Objects too large for diff view/)).toBeInTheDocument();
  });

  it('shows a fallback when diff inputs cannot be stringified', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    render(<JsonDiffView expected={circular} actual={{ value: 'small' }} />);

    expect(screen.getByText(/Objects too large for diff view/)).toBeInTheDocument();
  });
});
