# Fix Plan: Markdown Re-rendering in Eval Results Table (Issue #969)

## Problem Statement

When users change the layout of the eval results table (e.g., toggling column visibility, adjusting settings), markdown content in result cells re-renders unnecessarily. This causes visible flickering, especially noticeable with images that appear to "reload" on every layout change.

**User Impact:**

- Jarring visual experience when adjusting table settings
- Images flash/flicker during layout changes
- Perceived performance degradation
- Unnecessary network requests if images aren't cached

**Video reference:** See original issue for reproduction video.

---

## Root Cause Analysis

### 1. Unstable `remarkPlugins` Array Prop

**Location:** `ResultsTable.tsx:763`, `EvalOutputCell.tsx:347`

```tsx
// Every render creates a NEW array instance
<ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
```

React's shallow comparison sees `[remarkGfm] !== [remarkGfm]` (different references) even though contents are identical. ReactMarkdown re-renders.

### 2. Unstable `components` Object Prop

**Location:** `EvalOutputCell.tsx:350-360`

```tsx
components={{
  img: ({ src, alt }) => (
    <img onClick={() => toggleLightbox(src)} ... />
  ),
}}
```

Three layers of instability:

- New `components` object literal each render
- New `img` function each render
- New arrow function `() => toggleLightbox(src)` each render

### 3. Unmemoized `toggleLightbox` Callback

**Location:** `EvalOutputCell.tsx:156-159`

```tsx
const toggleLightbox = (url?: string) => {
  setLightboxImage(url || null);
  setLightboxOpen(!lightboxOpen); // Also has stale closure issue
};
```

Not wrapped in `useCallback`, creates new function every render. Also uses `lightboxOpen` directly instead of functional update, risking stale closure bugs.

### 4. Inline ReactMarkdown in Cell Renderer

**Location:** `ResultsTable.tsx:760-766`

```tsx
const cellContent = renderMarkdown ? (
  <MarkdownErrorBoundary fallback={value}>
    <TruncatedText
      text={<ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>}
      maxLength={maxTextLength}
    />
  </MarkdownErrorBoundary>
) : (...);
```

The cell function inside `columnHelper.accessor` creates new JSX on every call. Combined with unstable props, this guarantees re-renders.

### 5. TruncatedText Dependency Chain

**Location:** `TruncatedText.tsx:49`

```tsx
const contentLen = React.useMemo(() => textLength(text), [text]);
```

When `text` is a ReactMarkdown element, new element = new reference = useMemo recalculates = potential cascade effects.

---

## Solution Design

### Principle: Stabilize Props Before Memoizing Components

`React.memo` only helps when props are stable. We must fix prop instability first.

### Phase 1: Create Stable Constants

Create a shared constants file for markdown configuration:

**New file:** `src/app/src/pages/eval/components/markdown-config.ts`

```tsx
import remarkGfm from 'remark-gfm';

// Stable array reference - never recreated
export const REMARK_PLUGINS = [remarkGfm] as const;

// Stable URL transform function
export const IDENTITY_URL_TRANSFORM = (url: string) => url;
```

### Phase 2: Fix EvalOutputCell.tsx

#### 2.1 Memoize `toggleLightbox`

```tsx
const toggleLightbox = React.useCallback((url?: string) => {
  setLightboxImage(url ?? null);
  setLightboxOpen((prev) => !prev); // Functional update for correctness
}, []);
```

#### 2.2 Create Memoized Markdown Components Factory

```tsx
import { REMARK_PLUGINS, IDENTITY_URL_TRANSFORM } from './markdown-config';

// Inside component, after toggleLightbox is defined:
const markdownComponents = React.useMemo(
  () => ({
    img: ({ src, alt }: { src?: string; alt?: string }) => (
      <img
        loading="lazy"
        src={src}
        alt={alt}
        onClick={() => toggleLightbox(src)}
        style={{ cursor: 'pointer' }}
      />
    ),
  }),
  [toggleLightbox],
);
```

#### 2.3 Memoize Markdown Output

```tsx
const markdownNode = React.useMemo(() => {
  if (!renderMarkdown || isJsonHandled) {
    return null;
  }
  return (
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
      urlTransform={IDENTITY_URL_TRANSFORM}
      components={markdownComponents}
    >
      {normalizedText}
    </ReactMarkdown>
  );
}, [renderMarkdown, isJsonHandled, normalizedText, markdownComponents]);
```

#### 2.4 Update Render Logic

```tsx
// Replace inline ReactMarkdown with memoized node
if (!isJsonHandled && renderMarkdown) {
  node = markdownNode;
}
```

### Phase 3: Fix ResultsTable.tsx Variable Cells

#### 3.1 Create Memoized Variable Cell Component

**New file:** `src/app/src/pages/eval/components/VariableMarkdownCell.tsx`

```tsx
import React from 'react';
import ReactMarkdown from 'react-markdown';
import { REMARK_PLUGINS } from './markdown-config';
import MarkdownErrorBoundary from './MarkdownErrorBoundary';
import TruncatedText from './TruncatedText';

interface VariableMarkdownCellProps {
  value: string;
  maxTextLength: number;
}

/**
 * Memoized markdown cell for variable columns.
 * Only re-renders when value or maxTextLength changes.
 */
const VariableMarkdownCell = React.memo(function VariableMarkdownCell({
  value,
  maxTextLength,
}: VariableMarkdownCellProps) {
  return (
    <MarkdownErrorBoundary fallback={value}>
      <TruncatedText
        text={<ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{value}</ReactMarkdown>}
        maxLength={maxTextLength}
      />
    </MarkdownErrorBoundary>
  );
});

export default VariableMarkdownCell;
```

#### 3.2 Update ResultsTable.tsx

```tsx
import VariableMarkdownCell from './VariableMarkdownCell';

// In the cell renderer (around line 760):
const cellContent = renderMarkdown ? (
  <VariableMarkdownCell value={value} maxTextLength={maxTextLength} />
) : (
  <TruncatedText text={value} maxLength={maxTextLength} />
);
```

### Phase 4: Additional Optimizations (Optional)

#### 4.1 Consider Memoizing TruncatedText

If performance profiling shows TruncatedText is still a bottleneck:

```tsx
// In TruncatedText.tsx, wrap export:
export default React.memo(TruncatedText);
```

#### 4.2 Consider Custom Comparison for Complex Props

For EvalOutputCell, if needed:

```tsx
const MemoizedEvalOutputCell = React.memo(EvalOutputCell, (prev, next) => {
  // Custom shallow comparison excluding functions
  return (
    prev.output === next.output &&
    prev.maxTextLength === next.maxTextLength &&
    prev.rowIndex === next.rowIndex &&
    prev.promptIndex === next.promptIndex &&
    // ... other relevant props
  );
});
```

---

## Implementation Checklist

### Files to Create

- [ ] `src/app/src/pages/eval/components/markdown-config.ts`
- [ ] `src/app/src/pages/eval/components/VariableMarkdownCell.tsx`

### Files to Modify

- [ ] `src/app/src/pages/eval/components/EvalOutputCell.tsx`
  - [ ] Import `REMARK_PLUGINS`, `IDENTITY_URL_TRANSFORM`
  - [ ] Memoize `toggleLightbox` with `useCallback`
  - [ ] Create memoized `markdownComponents` object
  - [ ] Create memoized `markdownNode`
  - [ ] Update render logic to use memoized node

- [ ] `src/app/src/pages/eval/components/ResultsTable.tsx`
  - [ ] Import `VariableMarkdownCell`
  - [ ] Replace inline markdown rendering with `VariableMarkdownCell`

### Cleanup

- [ ] Remove unused imports after changes
- [ ] Run `npm run l && npm run f` for linting/formatting

---

## Test Plan

### Unit Tests

#### Test 1: VariableMarkdownCell Memoization

**File:** `src/app/src/pages/eval/components/VariableMarkdownCell.test.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import VariableMarkdownCell from './VariableMarkdownCell';

describe('VariableMarkdownCell', () => {
  it('renders markdown content', () => {
    render(<VariableMarkdownCell value="**bold** text" maxTextLength={100} />);
    expect(screen.getByText('bold')).toBeInTheDocument();
  });

  it('does not re-render when props are unchanged', () => {
    const renderSpy = vi.fn();

    // Create a wrapper that tracks renders
    const TrackedCell = (props: { value: string; maxTextLength: number }) => {
      renderSpy();
      return <VariableMarkdownCell {...props} />;
    };

    const MemoizedTracked = React.memo(TrackedCell);

    const { rerender } = render(<MemoizedTracked value="test" maxTextLength={100} />);

    expect(renderSpy).toHaveBeenCalledTimes(1);

    // Re-render with same props
    rerender(<MemoizedTracked value="test" maxTextLength={100} />);

    // Should still be 1 due to memoization
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });

  it('re-renders when value changes', () => {
    const { rerender } = render(<VariableMarkdownCell value="original" maxTextLength={100} />);

    expect(screen.getByText('original')).toBeInTheDocument();

    rerender(<VariableMarkdownCell value="updated" maxTextLength={100} />);

    expect(screen.getByText('updated')).toBeInTheDocument();
  });
});
```

#### Test 2: EvalOutputCell Lightbox Stability

**File:** Add to existing `EvalOutputCell.test.tsx` or create new

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';

describe('EvalOutputCell markdown memoization', () => {
  it('maintains stable lightbox callback across renders', () => {
    // This test verifies the useCallback fix
    const onRating = vi.fn();

    const { rerender } = render(
      <EvalOutputCell
        output={{ text: '![img](http://example.com/image.png)', ... }}
        onRating={onRating}
        ...
      />
    );

    const img = screen.getByRole('img');
    fireEvent.click(img);

    // Lightbox should open
    expect(screen.getByClassName('lightbox')).toBeInTheDocument();

    // Re-render (simulating parent re-render)
    rerender(<EvalOutputCell ... />);

    // Image should still be there without flickering (no remount)
    expect(screen.getByRole('img')).toBeInTheDocument();
  });
});
```

#### Test 3: Markdown Config Constants

**File:** `src/app/src/pages/eval/components/markdown-config.test.ts`

```tsx
import { describe, it, expect } from 'vitest';
import { REMARK_PLUGINS, IDENTITY_URL_TRANSFORM } from './markdown-config';

describe('markdown-config', () => {
  it('REMARK_PLUGINS is a stable reference', () => {
    // Import twice to verify same reference
    const plugins1 = REMARK_PLUGINS;
    const plugins2 = REMARK_PLUGINS;

    expect(plugins1).toBe(plugins2);
  });

  it('IDENTITY_URL_TRANSFORM returns url unchanged', () => {
    const url = 'https://example.com/image.png';
    expect(IDENTITY_URL_TRANSFORM(url)).toBe(url);
  });

  it('IDENTITY_URL_TRANSFORM handles data URIs', () => {
    const dataUri = 'data:image/png;base64,iVBORw0KGgo=';
    expect(IDENTITY_URL_TRANSFORM(dataUri)).toBe(dataUri);
  });
});
```

### Integration Tests

#### Test 4: Table Layout Change Behavior

**File:** `test/app/pages/eval/ResultsTable.integration.test.tsx`

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

describe('ResultsTable markdown stability', () => {
  it('does not reload images when toggling column visibility', async () => {
    // Setup: render table with image content
    const mockData = createMockTableData({
      outputs: [{ text: '![test](http://example.com/test.png)' }],
    });

    render(<ResultsTable {...mockData} />);

    const img = screen.getByRole('img');
    const originalSrc = img.getAttribute('src');

    // Track if image element is replaced
    const imgRef = img;

    // Toggle a column visibility
    const columnToggle = screen.getByLabelText('Toggle column visibility');
    fireEvent.click(columnToggle);

    await waitFor(() => {
      // Image should be the SAME DOM element (not remounted)
      const currentImg = screen.getByRole('img');
      expect(currentImg).toBe(imgRef);
      expect(currentImg.getAttribute('src')).toBe(originalSrc);
    });
  });

  it('preserves scroll position when changing layout', async () => {
    // Render large table
    const mockData = createMockTableData({ rowCount: 100 });
    render(<ResultsTable {...mockData} />);

    // Scroll to middle
    const table = screen.getByRole('table');
    table.scrollTop = 500;

    // Change layout
    fireEvent.click(screen.getByLabelText('Toggle column'));

    await waitFor(() => {
      expect(table.scrollTop).toBe(500);
    });
  });
});
```

---

## QA Manual Testing Instructions

### Environment Setup

1. Create a test eval with markdown content including images:

```yaml
# test-config.yaml
prompts:
  - 'Generate an image of a cat'

providers:
  - openai:responses:gpt-4o # Or any provider that returns markdown

tests:
  - vars:
      topic: cats
    assert:
      - type: contains
        value: 'cat'
```

2. Or use an existing eval that has image outputs (e.g., from DALL-E, Gemini image generation)

### Test Cases

#### TC1: Column Visibility Toggle (Critical)

**Steps:**

1. Open eval results view with image content
2. Wait for images to fully load
3. Open column settings / visibility panel
4. Toggle any column visibility off then on

**Expected:** Images should NOT flicker or reload. The visual should remain stable.

**Before fix:** Images visibly flash/reload on each toggle.
**After fix:** Images remain static, no visual change.

#### TC2: Render Markdown Toggle

**Steps:**

1. Open eval results with markdown content (including images)
2. Find the "Render Markdown" toggle in settings
3. Toggle it off
4. Toggle it on again

**Expected:**

- When toggled off: Raw markdown syntax should display
- When toggled on: Rendered markdown with images should appear
- No unnecessary flickering during toggle

#### TC3: Table Resize/Scroll

**Steps:**

1. Open eval results with many rows containing images
2. Scroll through the table rapidly
3. Resize the browser window
4. Change column widths if possible

**Expected:** Images in visible cells should remain stable. No flickering.

#### TC4: Lightbox Functionality (Regression)

**Steps:**

1. Open eval results with image content
2. Click on an image in a result cell
3. Verify lightbox opens with full image
4. Close lightbox
5. Repeat with different images

**Expected:** Lightbox should open/close correctly. No regressions.

#### TC5: Variable Cell Markdown

**Steps:**

1. Create eval where input variables contain markdown (e.g., `**bold** text`)
2. Run eval and open results
3. Verify markdown renders in variable columns
4. Toggle column visibility

**Expected:** Variable markdown renders correctly and doesn't flicker on layout changes.

#### TC6: Performance Check

**Steps:**

1. Open React DevTools Profiler
2. Record while toggling column visibility
3. Check component render counts

**Expected:**

- ReactMarkdown components should NOT re-render when only layout changes
- Only the minimum necessary components should update

### Browser Compatibility

Test in:

- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

### Accessibility Check

- [ ] Verify images still have proper alt text
- [ ] Verify lightbox is keyboard accessible
- [ ] Verify screen reader announces markdown content correctly

---

## Rollback Plan

If issues are discovered post-deployment:

1. **Immediate rollback:** Revert the PR via GitHub
2. **Partial rollback:** If only one component is problematic:
   - The changes are isolated to specific components
   - Can revert individual files without affecting others

---

## Performance Metrics

### Before Fix (Baseline)

- Profile with React DevTools
- Count ReactMarkdown renders during column toggle
- Measure time for layout change

### After Fix (Target)

- ReactMarkdown render count: 0 for layout-only changes
- Layout change time: Same or faster
- Bundle size: No significant increase

---

## Future Considerations

1. **React Compiler:** When/if React Compiler is enabled, some manual memoization may become redundant. However, the stable constants (`REMARK_PLUGINS`) will still be beneficial.

2. **Virtualization:** For very large tables, consider virtualizing rows to further reduce render overhead.

3. **Image Caching:** Consider adding explicit cache headers or service worker caching for generated images.

---

## References

- [Issue #969](https://github.com/promptfoo/promptfoo/issues/969)
- [React.memo documentation](https://react.dev/reference/react/memo)
- [useCallback documentation](https://react.dev/reference/react/useCallback)
- [react-markdown performance](https://github.com/remarkjs/react-markdown#performance)
