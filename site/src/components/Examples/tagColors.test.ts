import { describe, expect, it } from 'vitest';
import { TAG_COLORS } from './tagColors';

describe('TAG_COLORS', () => {
  it('maps the top-level example categories', () => {
    expect(TAG_COLORS['Getting Started']).toBe('#16a34a');
    expect(TAG_COLORS['Red Teaming']).toBe('#dc2626');
    expect(TAG_COLORS.Configuration).toBe('#2563eb');
    expect(TAG_COLORS.Evaluation).toBe('#7c3aed');
  });

  it('uses six-digit hex values', () => {
    for (const [tag, color] of Object.entries(TAG_COLORS)) {
      expect(color, `${tag} should be a six-digit hex color`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('gives every tag a distinct color so badges stay distinguishable', () => {
    const colors = Object.values(TAG_COLORS);

    expect(new Set(colors).size).toBe(colors.length);
  });

  it('never collides with the neutral fallback used for unmapped tags', () => {
    // ExampleCard/ExampleDrawer render `TAG_COLORS[tag] || '#6b7280'`, so a mapped tag
    // must not be indistinguishable from an unmapped one.
    expect(Object.values(TAG_COLORS)).not.toContain('#6b7280');
  });

  it('returns undefined for an unmapped tag so the fallback applies', () => {
    // 'Other' is the default tag generate-examples.mjs assigns to examples with no
    // .metadata.yaml, and it is deliberately not in the palette.
    expect(TAG_COLORS.Other).toBeUndefined();
    expect(TAG_COLORS['Not A Real Tag']).toBeUndefined();
  });
});
