import { fireEvent, render, screen } from '@testing-library/react';
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
  // Regression: the flip target was a bare <div onClick>, so keyboard and
  // assistive-tech users could not reveal the images at all.
  it('exposes the flip target as a real control', () => {
    render(<ImageJailbreakPreview {...PROPS} />);
    const control = screen.getByRole('button');

    expect(control).toHaveAttribute('tabindex', '0');
    expect(control).toHaveAttribute('aria-expanded', 'false');
    expect(control).toHaveAccessibleName(/reveal/i);
    expect(control).toHaveAccessibleName(new RegExp(PROPS.title, 'i'));
  });

  it.each([['Enter'], [' ']])('flips on %j', (key) => {
    render(<ImageJailbreakPreview {...PROPS} />);
    const control = screen.getByRole('button');

    fireEvent.keyDown(control, { key });

    expect(control).toHaveAttribute('aria-expanded', 'true');
    expect(control).toHaveAccessibleName(/hide/i);
  });

  it('still flips on click, and back again', () => {
    render(<ImageJailbreakPreview {...PROPS} />);
    const control = screen.getByRole('button');

    fireEvent.click(control);
    expect(control).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(control);
    expect(control).toHaveAttribute('aria-expanded', 'false');
  });

  it('ignores keys that are not Enter or Space', () => {
    render(<ImageJailbreakPreview {...PROPS} />);
    const control = screen.getByRole('button');

    fireEvent.keyDown(control, { key: 'a' });
    fireEvent.keyDown(control, { key: 'Tab' });

    expect(control).toHaveAttribute('aria-expanded', 'false');
  });

  it('reveals every image only once flipped', () => {
    render(<ImageJailbreakPreview {...PROPS} />);
    const control = screen.getByRole('button');

    expect(screen.getByText(PROPS.title)).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(1);

    fireEvent.keyDown(control, { key: 'Enter' });

    expect(screen.getAllByRole('img')).toHaveLength(PROPS.images.length);
    for (const image of PROPS.images) {
      expect(screen.getByAltText(image.caption)).toBeInTheDocument();
    }
  });
});
