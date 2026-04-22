import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

describe('Popover', () => {
  it('renders popover trigger', () => {
    render(
      <Popover>
        <PopoverTrigger>Open Popover</PopoverTrigger>
        <PopoverContent>Popover content</PopoverContent>
      </Popover>,
    );

    expect(screen.getByText('Open Popover')).toBeInTheDocument();
  });

  it('shows popover content on trigger click', async () => {
    const user = userEvent.setup();
    render(
      <Popover>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent>Popover content</PopoverContent>
      </Popover>,
    );

    const trigger = screen.getByText('Open');
    await user.click(trigger);

    expect(await screen.findByText('Popover content')).toBeInTheDocument();
  });

  it('applies custom className to content', async () => {
    const user = userEvent.setup();
    render(
      <Popover>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent className="custom-popover">Content</PopoverContent>
      </Popover>,
    );

    const trigger = screen.getByText('Open');
    await user.click(trigger);

    await screen.findByText('Content');
    const customElement = document.querySelector('.custom-popover');
    expect(customElement).toBeInTheDocument();
  });

  it('supports controlled open state', () => {
    const { rerender } = render(
      <Popover open={false} onOpenChange={vi.fn()}>
        <PopoverTrigger>Trigger</PopoverTrigger>
        <PopoverContent>Content</PopoverContent>
      </Popover>,
    );

    expect(screen.queryByText('Content')).not.toBeInTheDocument();

    rerender(
      <Popover open={true} onOpenChange={vi.fn()}>
        <PopoverTrigger>Trigger</PopoverTrigger>
        <PopoverContent>Content</PopoverContent>
      </Popover>,
    );

    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('closes on outside click', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Popover>
          <PopoverTrigger>Open</PopoverTrigger>
          <PopoverContent>Popover content</PopoverContent>
        </Popover>
        <div>Outside element</div>
      </div>,
    );

    const trigger = screen.getByText('Open');
    await user.click(trigger);

    expect(await screen.findByText('Popover content')).toBeInTheDocument();

    const outside = screen.getByText('Outside element');
    await user.click(outside);

    expect(screen.queryByText('Popover content')).not.toBeInTheDocument();
  });
});
