import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './collapsible';

describe('Collapsible', () => {
  it('renders collapsible content when open', () => {
    render(
      <Collapsible defaultOpen>
        <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        <CollapsibleContent>Collapsible content</CollapsibleContent>
      </Collapsible>,
    );

    expect(screen.getByText('Collapsible content')).toBeInTheDocument();
  });

  it('hides content when closed', () => {
    render(
      <Collapsible>
        <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        <CollapsibleContent>Collapsible content</CollapsibleContent>
      </Collapsible>,
    );

    expect(screen.queryByText('Collapsible content')).not.toBeInTheDocument();
  });

  it('toggles content visibility on trigger click', async () => {
    const user = userEvent.setup();
    render(
      <Collapsible>
        <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        <CollapsibleContent>Collapsible content</CollapsibleContent>
      </Collapsible>,
    );

    const trigger = screen.getByText('Toggle');
    await user.click(trigger);

    expect(screen.getByText('Collapsible content')).toBeInTheDocument();

    await user.click(trigger);
    expect(screen.queryByText('Collapsible content')).not.toBeInTheDocument();
  });

  it('supports controlled open state', async () => {
    const user = userEvent.setup();
    let isOpen = false;
    const setIsOpen = (open: boolean) => {
      isOpen = open;
    };

    const { rerender } = render(
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        <CollapsibleContent>Content</CollapsibleContent>
      </Collapsible>,
    );

    expect(screen.queryByText('Content')).not.toBeInTheDocument();

    const trigger = screen.getByText('Toggle');
    await user.click(trigger);

    rerender(
      <Collapsible open={true} onOpenChange={setIsOpen}>
        <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        <CollapsibleContent>Content</CollapsibleContent>
      </Collapsible>,
    );

    expect(screen.getByText('Content')).toBeInTheDocument();
  });
});
