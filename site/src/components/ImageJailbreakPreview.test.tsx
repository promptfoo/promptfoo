import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ImageJailbreakPreview from './ImageJailbreakPreview';

const PROPS = {
  title: 'Bypassing the safety filter',
  images: [
    { src: '/img/a.png', caption: 'first jailbreak prompt' },
    { src: '/img/b.png', caption: 'second jailbreak prompt' },
  ],
};

describe('ImageJailbreakPreview', () => {
  // Regression: the flip target was a bare <div onClick>, unreachable by keyboard.
  it('exposes the reveal control as a real button', () => {
    render(<ImageJailbreakPreview {...PROPS} />);
    const control = screen.getByRole('button');

    expect(control).toHaveAttribute('aria-expanded', 'false');
    expect(control).toHaveAccessibleName(new RegExp(PROPS.title, 'i'));
  });

  // A native <button> handles Enter and Space itself, so this also proves we did not
  // regress to a div that needs a hand-rolled key handler.
  it.each([['Enter'], [' ']])('reveals on %j', (key) => {
    render(<ImageJailbreakPreview {...PROPS} />);
    fireEvent.keyDown(screen.getByRole('button'), { key });
    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('button', { name: /hide/i })).toHaveAttribute('aria-expanded', 'true');
  });

  it('reveals on click and collapses again', () => {
    render(<ImageJailbreakPreview {...PROPS} />);

    fireEvent.click(screen.getByRole('button'));
    const hide = screen.getByRole('button', { name: /hide/i });
    expect(hide).toBeInTheDocument();

    fireEvent.click(hide);
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  });

  /**
   * The defect codex caught: descendants of a role="button" element are flattened in the
   * accessibility tree and an aria-label on it replaces their content, so a screen-reader
   * user could never read the captions they had just revealed. The revealed panel must be
   * a sibling of the control, not a child.
   */
  it('puts the revealed content outside the button', () => {
    const { container } = render(<ImageJailbreakPreview {...PROPS} />);
    fireEvent.click(screen.getByRole('button'));

    const panel = container.querySelector('[id]');
    expect(panel).toBeTruthy();

    for (const image of PROPS.images) {
      const img = screen.getByAltText(image.caption);
      expect(img).toBeInTheDocument();
      expect(img.closest('button')).toBeNull();
    }
  });

  it('associates the control with the panel it controls', () => {
    const { container } = render(<ImageJailbreakPreview {...PROPS} />);
    const controls = screen.getByRole('button').getAttribute('aria-controls');

    expect(controls).toBeTruthy();
    expect(container.querySelector(`#${CSS.escape(controls as string)}`)).toBeTruthy();
  });

  it('hides the concealed captions from assistive tech until revealed', () => {
    const { container } = render(<ImageJailbreakPreview {...PROPS} />);
    const panel = container.querySelector('[id]') as HTMLElement;

    // The panel stays in the DOM so CSS can transition it, but `hidden` keeps it out of
    // the accessibility tree — role queries respect that, alt-text queries do not.
    expect(panel).toHaveAttribute('hidden');
    expect(screen.queryByRole('img', { name: PROPS.images[0].caption })).not.toBeInTheDocument();

    // The blurred teaser itself is decorative: it must not announce the caption it conceals.
    const teaser = container.querySelector('img');
    expect(teaser).toHaveAttribute('alt', '');

    fireEvent.click(screen.getByRole('button'));
    expect(panel).not.toHaveAttribute('hidden');
    expect(screen.getByRole('img', { name: PROPS.images[0].caption })).toBeInTheDocument();
  });

  it('reveals every image once flipped', () => {
    const { container } = render(<ImageJailbreakPreview {...PROPS} />);
    fireEvent.click(screen.getByRole('button'));

    const panel = container.querySelector('[id]') as HTMLElement;
    expect(within(panel).getAllByRole('img')).toHaveLength(PROPS.images.length);
  });
});
