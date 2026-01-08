# Media Library Page Design

A dedicated page for browsing, previewing, and downloading media assets (images, videos, audio) stored via promptfoo's blob storage system.

## Route & Navigation

**URL:** `/media`

- Canonical, concise, intuitive
- Add to sidebar navigation under "Results" section
- Route constant: `ROUTES.MEDIA = '/media'`

**Permalink Structure:** `/media?hash=<sha256-hash>`

- Deep-linking to specific media item opens it in detail view
- Shareable URLs for team collaboration
- Hash persists in URL when modal is open

## Page Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Media Library                                    [Download All]│
│  Browse generated images, videos, and audio                     │
├─────────────────────────────────────────────────────────────────┤
│  [All ▾] [Image ▾] [Video ▾] [Audio ▾]  │  Eval: [Select...▾]  │
│  ───────────────────────────────────────────────────────────────│
│                                                                 │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐              │
│  │      │  │  ▶   │  │      │  │  ♪   │  │      │              │
│  │ IMG  │  │VIDEO │  │ IMG  │  │AUDIO │  │ IMG  │              │
│  │      │  │      │  │      │  │      │  │      │              │
│  ├──────┤  ├──────┤  ├──────┤  ├──────┤  ├──────┤              │
│  │Eval 1│  │Eval 2│  │Eval 1│  │Eval 3│  │Eval 2│              │
│  │Row 3 │  │Row 1 │  │Row 5 │  │Row 2 │  │Row 1 │              │
│  └──────┘  └──────┘  └──────┘  └──────┘  └──────┘              │
│                                                                 │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐              │
│  │      │  │      │  │  📄  │  │      │  │  ▶   │              │
│  │ IMG  │  │ IMG  │  │ FILE │  │ IMG  │  │VIDEO │              │
│  │      │  │      │  │      │  │      │  │      │              │
│  ├──────┤  ├──────┤  ├──────┤  ├──────┤  ├──────┤              │
│  │Eval 3│  │Eval 1│  │Eval 2│  │Eval 3│  │Eval 1│              │
│  │Row 4 │  │Row 2 │  │Row 6 │  │Row 1 │  │Row 7 │              │
│  └──────┘  └──────┘  └──────┘  └──────┘  └──────┘              │
│                                                                 │
│                    [Loading more...]                            │
└─────────────────────────────────────────────────────────────────┘
```

## Card Design by Media Type

### Image Cards

```
┌────────────────────┐
│                    │
│    [Actual Image]  │  ← Native aspect ratio, object-fit: cover
│                    │
│                    │
├────────────────────┤
│ 🖼 image/png       │  ← Icon + mime type badge
│ Eval: My Test      │  ← Truncated eval description
│ Test #3, Prompt #1 │  ← Row context
└────────────────────┘
```

### Video Cards

```
┌────────────────────┐
│                    │
│    [Thumbnail]     │  ← First frame or provider thumbnail
│        ▶          │  ← Centered play indicator overlay
│    0:34           │  ← Duration badge (bottom-right)
├────────────────────┤
│ 🎬 video/mp4       │
│ Eval: Video Gen    │
│ Test #1, Prompt #2 │
└────────────────────┘
```

### Audio Cards

```
┌────────────────────┐
│                    │
│    ┌──────────┐    │  ← Waveform visualization (generated)
│    │ ♪♪♪♪♪♪♪♪ │    │     or simple audio icon pattern
│    └──────────┘    │
│            2:15    │  ← Duration badge
├────────────────────┤
│ 🔊 audio/mp3       │
│ Eval: TTS Test     │
│ Test #5            │
└────────────────────┘
```

### Unknown/Other File Cards

```
┌────────────────────┐
│                    │
│        📄         │  ← Large file icon
│                    │
│     1.2 MB         │  ← File size
├────────────────────┤
│ 📎 application/pdf │
│ Eval: Doc Gen      │
│ [Download]         │  ← Direct download button
└────────────────────┘
```

## Card Interactions

| Action                    | Behavior                                                          |
| ------------------------- | ----------------------------------------------------------------- |
| Hover                     | Subtle scale (1.02), shadow elevation, show download icon overlay |
| Click (image/video/audio) | Open detail modal                                                 |
| Click (unknown type)      | Trigger download                                                  |
| Right-click               | Browser context menu (save image, etc.)                           |
| Keyboard focus            | Visible focus ring, Enter to open                                 |

## Detail Modal

Full-screen modal with backdrop blur, keyboard navigation, and quick actions.

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                              [✕]    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                                                             │   │
│  │                                                             │   │
│  │                     [Full-size Media]                       │   │
│  │                                                             │   │
│  │                                                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ◀ Previous                                           Next ▶       │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  📋 Details                                                         │
│  ─────────────────────────────────────────────────────────────────  │
│  Type: image/png                    Size: 2.4 MB                   │
│  Hash: a1b2c3d4...                  Created: Dec 28, 2024          │
│                                                                     │
│  📊 Source Context                                                  │
│  ─────────────────────────────────────────────────────────────────  │
│  Eval: "Image generation quality test"              [View Eval →]  │
│  Test Row: #3 of 25                                                │
│  Prompt: #1                                                        │
│  Variables: { "style": "photorealistic", "subject": "cat" }        │
│                                                                     │
│  [⬇ Download]  [🔗 Copy Link]  [📋 Copy Hash]                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Modal Keyboard Navigation

| Key       | Action                   |
| --------- | ------------------------ |
| `←` / `→` | Previous / Next media    |
| `Escape`  | Close modal              |
| `D`       | Download current         |
| `C`       | Copy permalink           |
| `Space`   | Play/pause (video/audio) |

### Modal Features

- **Video:** Full playback controls, loop toggle, playback speed
- **Audio:** Waveform visualization, playback controls, transcript (if available)
- **Image:** Zoom on click, pan when zoomed
- **All:** Swipe gestures on touch devices

## Responsive Grid

```css
gridTemplateColumns: {
  xs: 'repeat(2, 1fr)',   /* Mobile: 2 columns */
  sm: 'repeat(3, 1fr)',   /* Tablet: 3 columns */
  md: 'repeat(4, 1fr)',   /* Desktop: 4 columns */
  lg: 'repeat(5, 1fr)',   /* Large: 5 columns */
  xl: 'repeat(6, 1fr)',   /* Extra large: 6 columns */
}
```

## Loading Strategy

### Infinite Scroll with Intersection Observer

- Load 30 items initially
- Fetch next 30 when user scrolls to bottom
- Show skeleton cards during load
- Maintain scroll position on filter change

### Skeleton Loading States

```
┌────────────────────┐
│ ░░░░░░░░░░░░░░░░░░ │  ← Animated shimmer
│ ░░░░░░░░░░░░░░░░░░ │
│ ░░░░░░░░░░░░░░░░░░ │
├────────────────────┤
│ ░░░░░░░░           │
│ ░░░░░░░░░░░        │
└────────────────────┘
```

### Image Loading

- Use native `loading="lazy"` for images below fold
- Show skeleton until `onLoad` fires
- Graceful fallback for failed loads (broken image icon)

## Filtering & Search

### Type Filter (Tabs or Segmented Control)

```
[All (156)] [Images (98)] [Videos (32)] [Audio (24)] [Other (2)]
```

### Eval Filter (Select Dropdown)

```
Eval: [All Evals                    ▾]
      ├─ All Evals
      ├─ Image generation test (Dec 28)
      ├─ Video quality eval (Dec 27)
      └─ TTS comparison (Dec 25)
```

### URL State Persistence

```
/media?type=video&eval=abc123&hash=def456
```

- Filters persist in URL for shareability
- Browser back/forward navigation works correctly

## Download Functionality

### Individual Download

- Download button in card hover overlay
- Download button in modal
- Right-click → Save as (browser native)

### Bulk Download

- "Download All" button in header (downloads filtered results)
- Creates ZIP file with organized structure:

```
media-export-2024-12-28/
├── images/
│   ├── a1b2c3d4.png
│   └── e5f6g7h8.jpg
├── videos/
│   └── i9j0k1l2.mp4
├── audio/
│   └── m3n4o5p6.mp3
└── manifest.json  ← Metadata mapping hash → eval context
```

### Download Progress

- Show progress modal for bulk downloads
- "Preparing download... 45/156 files"
- Cancel button

## Empty States

### No Media Found

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                          🖼️                                     │
│                                                                 │
│                  No media files yet                             │
│                                                                 │
│     Media generated by your evaluations will appear here.       │
│     Run an eval with an image, video, or audio provider         │
│     to get started.                                             │
│                                                                 │
│                    [View Providers Docs →]                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### No Results for Filter

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                          🔍                                     │
│                                                                 │
│              No videos found for this eval                      │
│                                                                 │
│                   [Clear Filters]                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Dark/Light Mode

### Light Mode

- Card background: `white`
- Card border: `gray-200`
- Hover shadow: `shadow-md`
- Text: `gray-900` primary, `gray-600` secondary

### Dark Mode

- Card background: `gray-800`
- Card border: `gray-700`
- Hover shadow: subtle glow
- Text: `gray-100` primary, `gray-400` secondary

## API Endpoint

### GET `/api/media`

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `type` | string | Filter by kind: `image`, `video`, `audio`, `other` |
| `evalId` | string | Filter by evaluation ID |
| `limit` | number | Items per page (default: 30, max: 100) |
| `offset` | number | Pagination offset |

**Response:**

```json
{
  "items": [
    {
      "hash": "a1b2c3d4e5f6...",
      "mimeType": "image/png",
      "sizeBytes": 2457600,
      "kind": "image",
      "createdAt": "2024-12-28T10:30:00Z",
      "url": "/api/blobs/a1b2c3d4e5f6...",
      "context": {
        "evalId": "eval-123",
        "evalDescription": "Image generation quality test",
        "testIdx": 3,
        "promptIdx": 1,
        "location": "response.output"
      }
    }
  ],
  "total": 156,
  "hasMore": true
}
```

## Component Architecture

```
src/app/src/
├── pages/
│   └── media/
│       ├── Media.tsx              # Main page component
│       ├── components/
│       │   ├── MediaGrid.tsx      # Responsive grid container
│       │   ├── MediaCard.tsx      # Individual media card
│       │   ├── MediaModal.tsx     # Detail view modal
│       │   ├── MediaFilters.tsx   # Type tabs + eval dropdown
│       │   ├── MediaEmptyState.tsx
│       │   └── BulkDownload.tsx   # Download all functionality
│       ├── hooks/
│       │   ├── useMediaItems.ts   # Data fetching + infinite scroll
│       │   └── useMediaFilters.ts # Filter state + URL sync
│       └── types.ts               # Page-specific types
├── components/
│   └── media/
│       └── MediaPlayer.tsx        # Existing (reuse in modal)
```

## Implementation Phases

### Phase 1: Core Gallery

- [ ] API endpoint `/api/media`
- [ ] MediaGrid with infinite scroll
- [ ] MediaCard for images (simplest)
- [ ] Basic filtering by type
- [ ] Route setup and navigation

### Phase 2: Full Media Support

- [ ] Video cards with thumbnails
- [ ] Audio cards with duration
- [ ] Unknown type cards with download
- [ ] MediaModal with full playback

### Phase 3: Polish

- [ ] Eval filter dropdown
- [ ] Bulk download with ZIP
- [ ] Keyboard navigation
- [ ] URL state persistence (permalinks)
- [ ] Empty states
- [ ] Dark mode refinements

### Phase 4: Enhancements

- [ ] Waveform visualization for audio
- [ ] Image zoom/pan in modal
- [ ] Touch gestures
- [ ] Copy to clipboard actions
