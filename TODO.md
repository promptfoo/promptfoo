# Asset Storage Implementation for OpenAI Image Models

## Overview
Implement a generalized asset storage system in the promptfoo cache directory to handle base64 image data from OpenAI image models (gpt-image-1, DALL-E 2, DALL-E 3).

## Implementation Plan

### 1. Create Asset Storage System ✓
- [x] Create `src/util/assetStorage.ts` with utilities for storing/retrieving assets
- [x] Store assets in `~/.promptfoo/cache/assets/` directory
- [x] Generate unique UUIDs for each asset
- [x] Support multiple MIME types (image/png, image/jpeg, image/webp)

### 2. Update OpenAI Image Provider ✓
- [x] Modify `formatOutput` to detect base64 data
- [x] Save base64 images as files using asset storage
- [x] Return server-relative URLs instead of data URLs
- [x] Support all OpenAI image models (gpt-image-1, DALL-E 2, DALL-E 3)
- [x] Handle both URL and base64 response formats

### 3. Add Server Route ✓
- [x] Create `src/server/routes/assets.ts` for serving assets
- [x] Add `/assets/:filename` endpoint
- [x] Set proper cache headers (immutable assets)
- [x] Integrate with main server

### 4. Add Comprehensive Tests ✓
- [x] Unit tests for `assetStorage.ts`
- [x] Update existing OpenAI image tests
- [x] Add integration tests for asset serving
- [x] Test all image models and response formats

### 5. Update Documentation ✓
- [x] Document asset storage in OpenAI provider docs
- [x] Add section about base64 handling
- [x] Update examples to show asset storage

## Test Instructions

### Manual Testing

1. **Test gpt-image-1**:
   ```bash
   npm run local -- eval -c test-gpt-image-1-simple.yaml
   npm run local -- view
   # Check that images display properly in web viewer
   ```

2. **Test DALL-E with base64**:
   ```bash
   # Create a test config with response_format: b64_json
   npm run local -- eval -c test-dalle-base64.yaml
   npm run local -- view
   # Verify images are saved and displayed
   ```

3. **Check asset storage**:
   ```bash
   ls ~/.promptfoo/cache/assets/
   # Should see UUID-named image files
   ```

4. **Test asset serving**:
   ```bash
   # While running promptfoo view, open browser
   # Check Network tab - images should load from /assets/[uuid].png
   ```

### Automated Testing

1. **Run unit tests**:
   ```bash
   npm test -- test/util/assetStorage.test.ts
   npm test -- test/providers/openai/image.test.ts
   npm test -- test/server/routes/assets.test.ts
   ```

2. **Run integration tests**:
   ```bash
   npm test -- test/providers/openai/image.integration.test.ts
   ```

## Features Implemented

- ✓ Base64 image detection and conversion
- ✓ Asset storage in cache directory
- ✓ UUID-based file naming
- ✓ Support for PNG, JPEG, WebP formats
- ✓ Automatic MIME type detection
- ✓ Server endpoint for asset serving
- ✓ Cache headers for performance
- ✓ Works with all OpenAI image models
- ✓ Backward compatible with URL responses

## Future Enhancements

- [ ] Asset metadata storage
- [ ] Cleanup of old assets (leverage cache TTL)
- [ ] Support for video/audio assets
- [ ] Asset thumbnails
- [ ] Asset browser in web UI 