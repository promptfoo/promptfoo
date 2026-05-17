import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AudioPreviewButton } from './AudioPreviewButton';

describe('AudioPreviewButton', () => {
  it('does not intercept pointer input until the preview control is visible', async () => {
    const user = userEvent.setup();
    render(<AudioPreviewButton audioUrl="/audio.wav" hash="audio-1" />);

    const button = screen.getByRole('button', { name: 'Play audio preview' });
    expect(button).toHaveClass('pointer-events-none', 'opacity-0');

    await user.hover(button.parentElement!);

    expect(button).toHaveClass('pointer-events-auto', 'opacity-100');
  });

  it('keeps the preview control available on touch-only devices', () => {
    render(<AudioPreviewButton audioUrl="/audio.wav" hash="audio-1" />);

    expect(screen.getByRole('button', { name: 'Play audio preview' })).toHaveClass(
      '[@media(hover:none)]:pointer-events-auto',
      '[@media(hover:none)]:opacity-100',
    );
  });
});
