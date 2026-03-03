import { describe, expect, it } from 'vitest';
import { checkBorderRequiresColor } from '../../scripts/style-lint/rules/borderRequiresColor';

describe('checkBorderRequiresColor', () => {
  it('reports when border width is present without border color', () => {
    const result = checkBorderRequiresColor(['rounded-lg', 'border', 'bg-card']);
    expect(result).toBeTruthy();
  });

  it('passes when border and border color are both present', () => {
    const result = checkBorderRequiresColor(['rounded-lg', 'border', 'border-border', 'bg-card']);
    expect(result).toBeNull();
  });

  it('passes when border width is explicitly zero', () => {
    const result = checkBorderRequiresColor(['border-0', 'shadow-none']);
    expect(result).toBeNull();
  });

  it('supports modifier prefixes on border color classes', () => {
    const result = checkBorderRequiresColor([
      'border',
      'hover:border-primary',
      'dark:border-border',
    ]);
    expect(result).toBeNull();
  });

  it('supports side border width and side border color', () => {
    const result = checkBorderRequiresColor(['border-b', 'border-b-border']);
    expect(result).toBeNull();
  });
});
