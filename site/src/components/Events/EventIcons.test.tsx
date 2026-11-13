import React from 'react';

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CalendarIcon, LocationIcon } from './EventIcons';

// These icons remain direct SVG children so page selectors and inherited colors apply.
describe('event detail icons', () => {
  it.each([
    ['calendar', CalendarIcon, 1],
    ['location', LocationIcon, 2],
  ] as const)(
    'preserves the %s outline and caller accessibility attributes',
    (_name, Icon, paths) => {
      const { container } = render(
        <div>
          <Icon className="event-detail" aria-hidden="true" />
        </div>,
      );
      const svg = container.querySelector('div > svg');
      expect(svg).toHaveAttribute('class', 'event-detail');
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
      expect(svg).toHaveAttribute('fill', 'none');
      expect(svg).toHaveAttribute('stroke', 'currentColor');
      expect(svg?.children).toHaveLength(paths);
      for (const path of svg?.children ?? []) {
        expect(path).toHaveAttribute('stroke-width', '2');
        expect(path).toHaveAttribute('stroke-linecap', 'round');
        expect(path).toHaveAttribute('stroke-linejoin', 'round');
      }
    },
  );

  it('keeps accessibility opt-in for pages that did not hide their icons', () => {
    const { container } = render(<CalendarIcon className="icon" />);
    expect(container.querySelector('svg')).not.toHaveAttribute('aria-hidden');
  });
});
