import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AudioPreviewButton } from './AudioPreviewButton';

describe('AudioPreviewButton', () => {
  it('does not intercept pointer input until the preview control is visible', () => {
    render(<AudioPreviewButton audioUrl="/audio.wav" hash="audio-1" />);

    const button = screen.getByRole('button', { name: 'Play audio preview' });
    expect(button).toHaveClass('pointer-events-none', 'opacity-0');

    fireEvent.mouseEnter(button.parentElement!);

    expect(button).toHaveClass('pointer-events-auto', 'opacity-100');
  });
});
