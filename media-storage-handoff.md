# Media Storage Project - Handoff Doc

## Problem

Audio/image/video data is stored as base64 in the database, causing:

- Database bloat (1MB+ per audio file)
- Slow query performance
- No deduplication

## Solution Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Strategy      │────▶│  File Storage   │────▶│   Database      │
│  (generates     │     │  (stores blob)  │     │  (stores ref)   │
│   audio/image)  │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │   UI fetches    │
                        │  /api/media/:key│
                        └─────────────────┘
```

## What's Done ✅

### Phase 1: OSS Local Storage

- `promptfoo/src/storage/` - Storage abstraction layer
  - `LocalFileSystemProvider` - Stores to `~/.promptfoo/media/`
  - Content-hash deduplication
  - `storeMedia()`, `retrieveMedia()` APIs
- `simpleAudio.ts`, `simpleImage.ts` - Strategies now store to file system
- `sanitizeMediaForStorage.ts` - Replaces base64 with `storageRef:` before DB save

### Phase 2: Cloud Org Config

- DB migration: `media_storage_enabled`, `media_storage_config` columns on `organizations`
- UI: Organization Settings → Media Storage page

### Phase 3: UI & Display

- `/api/media/:key` endpoint serves media files
- `@app/components/media/MediaPlayer.tsx` - Reusable components:
  - `AudioPlayer`, `ImageDisplay`, `VideoPlayer`
  - Handle both `storageRef:` and base64 data
- `@app/utils/mediaStorage.ts` - URL resolution utilities

### Hydra/Agentic + Audio

- `runtimeTransform.ts` returns base64 for API calls
- Sanitizer replaces with storageRef before DB save
- Tested with `hydra-audio-test.yaml`

## What's Remaining 🔲

### Phase 4: Cloud S3 Provider

```
server/src/storage/
├── s3Provider.ts        # S3 client with presigned URLs
└── mediaRoutes.ts       # Redirect to presigned URL
```

Tasks:

1. Add `@aws-sdk/client-s3` to server
2. Create `S3StorageProvider` implementing `MediaStorageProvider`
3. Update `/api/media/:key` to redirect to presigned S3 URL
4. Optional: Add `media_references` table for tracking/cleanup

### Configuration

```yaml
# Organization storage config (stored in DB)
mediaStorageConfig:
  provider: 's3'
  bucket: 'customer-bucket'
  region: 'us-east-1'
  accessKeyId: '***'
  secretAccessKey: '***'
```

## Key Files

| File                                                     | Purpose                       |
| -------------------------------------------------------- | ----------------------------- |
| `promptfoo/src/storage/index.ts`                         | Storage API exports           |
| `promptfoo/src/storage/localFileSystemProvider.ts`       | Local file system impl        |
| `promptfoo/src/util/sanitizeMediaForStorage.ts`          | Base64 → storageRef sanitizer |
| `promptfoo/src/server/routes/media.ts`                   | `/api/media/:key` endpoint    |
| `promptfoo/src/app/src/components/media/MediaPlayer.tsx` | UI components                 |
| `promptfoo/src/app/src/utils/mediaStorage.ts`            | URL resolution                |
| `server/src/db/schema.ts`                                | Org storage config columns    |
| `app/src/pages/organization/media-storage/`              | Settings UI                   |

## API Summary

### Backend (Save)

```typescript
import { storeMedia } from '../storage';

const { ref } = await storeMedia(buffer, {
  contentType: 'audio/mp3',
  mediaType: 'audio',
  evalId: 'eval-xxx',
});
// ref.key = "audio/abc123.mp3"
```

### Frontend (Render)

```tsx
import { AudioPlayer } from '@app/components/media';

// Handles both storageRef:xxx and base64
<AudioPlayer data={audioData} format="mp3" />
```

## Environment Variables

- `PROMPTFOO_MEDIA_PATH` - Custom storage path (default: `~/.promptfoo/media`)
- `PROMPTFOO_INLINE_MEDIA=true` - Disable storage, use legacy base64

## Testing

```bash
# Audio-only strategy
npm run local -- redteam run -c .local/audio-redteam-test/audio-only.yaml

# Hydra + audio
npm run local -- redteam run -c .local/audio-redteam-test/hydra-audio-test.yaml
```
