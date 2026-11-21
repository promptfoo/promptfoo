import * as React from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Dialog', () => {
  it('renders dialog trigger', () => {
    render(
      <Dialog>
        <DialogTrigger>Open Dialog</DialogTrigger>
        <DialogContent>Dialog content</DialogContent>
      </Dialog>,
    );

    expect(screen.getByRole('button', { name: 'Open Dialog' })).toBeInTheDocument();
  });

  it('opens dialog on trigger click', async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogTitle>Dialog Title</DialogTitle>
          <DialogDescription>Dialog description</DialogDescription>
        </DialogContent>
      </Dialog>,
    );

    const trigger = screen.getByRole('button', { name: 'Open' });
    await user.click(trigger);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Dialog Title')).toBeInTheDocument();
    expect(screen.getByText('Dialog description')).toBeInTheDocument();
  });

  it('associates an intentionally visible description with dialog content', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <Dialog defaultOpen>
        <DialogContent hideDescription={false}>
          <DialogTitle>Configured dialog</DialogTitle>
          <DialogDescription>Explains what saving these settings changes.</DialogDescription>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByRole('dialog', { name: 'Configured dialog' })).toHaveAccessibleDescription(
      'Explains what saving these settings changes.',
    );
    expect(warning).not.toHaveBeenCalled();
  });

  it('associates a visible description that uses a custom id', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <Dialog defaultOpen>
        <DialogContent hideDescription={false}>
          <DialogTitle>Custom description dialog</DialogTitle>
          <DialogDescription id="custom-dialog-description">
            Described with a caller-provided id.
          </DialogDescription>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByRole('dialog', { name: 'Custom description dialog' })).toHaveAttribute(
      'aria-describedby',
      'custom-dialog-description',
    );
    expect(
      screen.getByRole('dialog', { name: 'Custom description dialog' }),
    ).toHaveAccessibleDescription('Described with a caller-provided id.');
    expect(warning).not.toHaveBeenCalled();
  });

  it('associates an asChild description using the mounted child id', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <Dialog defaultOpen>
        <DialogContent hideDescription={false}>
          <DialogTitle>Slotted description dialog</DialogTitle>
          <DialogDescription asChild>
            <div id="slotted-dialog-description">Description rendered through a child.</div>
          </DialogDescription>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByRole('dialog', { name: 'Slotted description dialog' })).toHaveAttribute(
      'aria-describedby',
      'slotted-dialog-description',
    );
    expect(
      screen.getByRole('dialog', { name: 'Slotted description dialog' }),
    ).toHaveAccessibleDescription('Description rendered through a child.');
    expect(warning).not.toHaveBeenCalled();
  });

  it('updates the association when an asChild description id changes', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const renderDialog = (descriptionId: string) => (
      <Dialog defaultOpen>
        <DialogContent hideDescription={false}>
          <DialogTitle>Dynamic description dialog</DialogTitle>
          <DialogDescription asChild>
            <div id={descriptionId}>Description with a changing id.</div>
          </DialogDescription>
        </DialogContent>
      </Dialog>
    );
    const { rerender } = render(renderDialog('first-description-id'));

    expect(screen.getByRole('dialog', { name: 'Dynamic description dialog' })).toHaveAttribute(
      'aria-describedby',
      'first-description-id',
    );

    rerender(renderDialog('second-description-id'));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Dynamic description dialog' })).toHaveAttribute(
        'aria-describedby',
        'second-description-id',
      );
    });
    expect(document.getElementById('first-description-id')).not.toBeInTheDocument();
    expect(warning).not.toHaveBeenCalled();
  });

  it('keeps a callback ref stable across unrelated renders', () => {
    const ref = vi.fn();
    const renderDialog = (label: string) => (
      <Dialog defaultOpen>
        <DialogContent hideDescription={false}>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription ref={ref}>Stable description</DialogDescription>
        </DialogContent>
      </Dialog>
    );
    const { rerender, unmount } = render(renderDialog('First title'));
    const callsAfterMount = ref.mock.calls.length;
    rerender(renderDialog('Second title'));
    expect(ref).toHaveBeenCalledTimes(callsAfterMount);
    unmount();
    expect(ref.mock.calls[ref.mock.calls.length - 1]?.[0]).toBeNull();
  });

  it('allows description refs to update caller state without a render loop', () => {
    function StatefulDescription() {
      const [node, setNode] = React.useState<HTMLParagraphElement | null>(null);
      return (
        <Dialog defaultOpen>
          <DialogContent>
            <DialogTitle>Stateful description</DialogTitle>
            <DialogDescription ref={setNode}>Description</DialogDescription>
            <span>{node ? 'Ref attached' : 'Ref pending'}</span>
          </DialogContent>
        </Dialog>
      );
    }
    render(<StatefulDescription />);
    expect(screen.getByText('Ref attached')).toBeInTheDocument();
  });

  it('preserves content callback ref cleanup across rerenders and close', () => {
    const cleanup = vi.fn();
    const ref = vi.fn(() => cleanup);
    const renderDialog = (open: boolean) => (
      <Dialog open={open}>
        <DialogContent ref={ref}>
          <DialogTitle>Content ref</DialogTitle>
          <DialogDescription>Description</DialogDescription>
        </DialogContent>
      </Dialog>
    );
    const { rerender } = render(renderDialog(true));
    expect(ref).toHaveBeenCalledTimes(1);
    rerender(renderDialog(true));
    expect(ref).toHaveBeenCalledTimes(1);
    expect(cleanup).not.toHaveBeenCalled();
    rerender(renderDialog(false));
    expect(cleanup).toHaveBeenCalledTimes(1);
    rerender(renderDialog(true));
    expect(ref).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription('Description');
  });

  it('orders descriptions by their current DOM position and removes unmounted descriptions', async () => {
    const renderDialog = (descriptions: string[]) => (
      <Dialog defaultOpen>
        <DialogContent hideDescription={false}>
          <DialogTitle>Ordered descriptions</DialogTitle>
          {descriptions.map((description) => (
            <DialogDescription key={description}>{description}</DialogDescription>
          ))}
        </DialogContent>
      </Dialog>
    );
    const { rerender } = render(renderDialog(['B']));
    rerender(renderDialog(['A', 'B']));
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveAccessibleDescription('A B'));
    rerender(renderDialog(['B', 'A']));
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveAccessibleDescription('B A'));
    rerender(renderDialog([]));
    await waitFor(() => expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-describedby'));
  });

  it.each(['', 'two words'])('uses a valid fallback for description id %j', (id) => {
    render(
      <Dialog defaultOpen>
        <DialogContent hideDescription={false}>
          <DialogTitle>Invalid description id</DialogTitle>
          <DialogDescription id={id}>Accessible description</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription('Accessible description');
  });

  it.each(['', 'two words'])('uses a valid fallback for slotted description id %j', (id) => {
    render(
      <Dialog defaultOpen>
        <DialogContent hideDescription={false}>
          <DialogTitle>Invalid slotted id</DialogTitle>
          <DialogDescription asChild>
            <div id={id}>Accessible slotted description</div>
          </DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(
      'Accessible slotted description',
    );
  });

  it('keeps aria-describedby unset when visible descriptions are enabled but absent', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <Dialog defaultOpen>
        <DialogContent hideDescription={false}>
          <DialogTitle>Undescribed dialog</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByRole('dialog', { name: 'Undescribed dialog' })).not.toHaveAttribute(
      'aria-describedby',
    );
    expect(warning).not.toHaveBeenCalled();
  });

  it('uses the hidden fallback description when no visible description is mounted', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogTitle>Fallback description dialog</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    expect(
      screen.getByRole('dialog', { name: 'Fallback description dialog' }),
    ).toHaveAccessibleDescription('Dialog content');
    expect(warning).not.toHaveBeenCalled();
  });

  it('honors an explicit aria-describedby without rendering the hidden fallback', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <>
        <p id="external-dialog-description">External description</p>
        <Dialog defaultOpen>
          <DialogContent aria-describedby="external-dialog-description">
            <DialogTitle>Externally described dialog</DialogTitle>
            <DialogDescription>Internal description</DialogDescription>
          </DialogContent>
        </Dialog>
      </>,
    );

    expect(
      screen.getByRole('dialog', { name: 'Externally described dialog' }),
    ).toHaveAccessibleDescription('External description');
    expect(screen.queryByText('Dialog content')).not.toBeInTheDocument();
    expect(warning).not.toHaveBeenCalled();
  });

  it('closes dialog on close button click', async () => {
    const user = userEvent.setup();
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
          Dialog content
        </DialogContent>
      </Dialog>,
    );

    const closeButton = screen.getByRole('button', { name: 'Close' });
    await user.click(closeButton);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders dialog header', () => {
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Header Title</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByText('Header Title')).toBeInTheDocument();
  });

  it('renders dialog footer', () => {
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
          <DialogFooter>Footer content</DialogFooter>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByText('Footer content')).toBeInTheDocument();
  });

  it('supports controlled open state', () => {
    const { rerender } = render(
      <Dialog open={false} onOpenChange={vi.fn()}>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
          Content
        </DialogContent>
      </Dialog>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender(
      <Dialog open={true} onOpenChange={vi.fn()}>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
          Content
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('applies custom className to content', () => {
    render(
      <Dialog defaultOpen>
        <DialogContent className="custom-dialog">
          <DialogTitle>Title</DialogTitle>
          Content
        </DialogContent>
      </Dialog>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('custom-dialog');
  });

  it('renders overlay', () => {
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
          Content
        </DialogContent>
      </Dialog>,
    );

    const overlay = document.querySelector('[data-state="open"]');
    expect(overlay).toBeInTheDocument();
  });
});

describe('DialogTitle', () => {
  it('renders as heading', () => {
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogTitle>Test Title</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    const title = screen.getByText('Test Title');
    expect(title).toBeInTheDocument();
    expect(title).toHaveClass('text-lg', 'font-semibold');
  });
});

describe('DialogDescription', () => {
  it('renders description text', () => {
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
          <DialogDescription>Description text</DialogDescription>
        </DialogContent>
      </Dialog>,
    );

    const description = screen.getByText('Description text');
    expect(description).toBeInTheDocument();
    expect(description).toHaveClass('text-sm', 'text-muted-foreground');
  });
});
