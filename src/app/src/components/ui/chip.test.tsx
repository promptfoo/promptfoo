import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Chip } from './chip';

describe('Chip', () => {
  it('forwards its ref to the rendered button element', () => {
    let node: HTMLAnchorElement | HTMLButtonElement | null = null;

    render(
      <Chip
        ref={(element) => {
          node = element;
        }}
        label="DEFAULTS"
      >
        Anthropic
      </Chip>,
    );

    expect(node).toBeInstanceOf(HTMLButtonElement);
  });

  it('forwards its ref to the rendered link element', () => {
    let node: HTMLAnchorElement | HTMLButtonElement | null = null;

    render(
      <Chip
        ref={(element) => {
          node = element;
        }}
        label="DOCS"
        href="/docs"
      >
        Learn more
      </Chip>,
    );

    expect(node).toBeInstanceOf(HTMLAnchorElement);
  });
});
