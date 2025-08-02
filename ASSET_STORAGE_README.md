# Asset Storage Feature

## Overview

Promptfoo now supports storing large assets (images, audio) as files on disk instead of inline base64 in the database. This improves performance and reduces database size.

## Quick Start

1. Enable asset storage by setting the environment variable:

   ```bash
   export PROMPTFOO_USE_ASSET_STORAGE=true
   ```

2. Run your evaluations as normal. Images from providers like `openai:dall-e-3` will automatically be stored as files.

## Configuration

### Environment Variables

- `PROMPTFOO_USE_ASSET_STORAGE` - Enable/disable asset storage (default: `false`)
- `PROMPTFOO_MAX_ASSET_SIZE` - Maximum asset size in bytes (default: `52428800` / 50MB)
- `PROMPTFOO_ASSET_DISK_WARNING_THRESHOLD` - Disk space warning threshold percentage (default: `20`)
- `PROMPTFOO_ASSET_DISK_CRITICAL_THRESHOLD` - Disk space critical threshold percentage (default: `10`)

### Storage Location

Assets are stored in: `~/.promptfoo/assets/{evalId}/{resultId}/{assetId}`

## Features

### Automatic Image Handling

When enabled, images from supported providers are automatically stored as files:

```yaml
providers:
  - id: openai:dall-e-3
    config:
      response_format: b64_json # Will be stored as file
```

### Automatic Audio Handling

Audio from supported providers is also automatically stored as files:

```yaml
providers:
  - id: hyperbolic:audio:melo
    config:
      voice: 'EN-US' # Audio will be stored as file
```

### Asset URLs

Assets are referenced using a special URL format:

- Images: `![alt text](asset://eval-id/result-id/asset-id)`
- Audio: `[Audio](asset://eval-id/result-id/asset-id)`

These are automatically converted to API URLs when displayed in the UI.

### Monitoring

- **Disk Space Monitoring**: Automatic monitoring warns when disk space is low
- **Metrics Tracking**: Track saves, loads, and storage usage at `/api/assets/metrics`
- **Health Checks**: Asset storage health available at `/api/health/assets`

### Security

- Path traversal protection
- UUID validation for all IDs
- Secure file serving through API

## API Endpoints

### Get Asset

```
GET /api/eval/:evalId/result/:resultId/asset/:assetId
```

### Asset Metrics

```
GET /api/assets/metrics
```

Returns:

```json
{
  "saveAttempts": 10,
  "saveSuccesses": 10,
  "saveFailures": 0,
  "loadAttempts": 25,
  "loadSuccesses": 24,
  "loadFailures": 1,
  "totalBytesStored": 5242880,
  "largestAsset": 1048576,
  "saveSuccessRate": 1.0,
  "loadSuccessRate": 0.96,
  "averageAssetSize": 524288
}
```

### Health Check

```
GET /api/health/assets
```

Returns:

```json
{
  "enabled": true,
  "status": "healthy",
  "metrics": { ... }
}
```

## Migration

Currently, only new assets are stored as files. Existing base64 assets in the database remain unchanged. This allows for:

- Risk-free testing
- Gradual rollout
- No data migration required

## Fallback Behavior

If asset storage fails for any reason, the system automatically falls back to storing base64 in the database, ensuring no data loss.

## Performance Benefits

- **Faster Queries**: Database queries no longer need to load large base64 strings
- **Reduced Memory**: Results can be displayed without loading full images into memory
- **Better Caching**: Assets can be cached separately by the browser
- **Streaming**: Large assets can be streamed instead of loaded entirely

## Asset Cleanup

The asset storage system includes a cleanup utility to manage disk space.

### CLI Commands

```bash
# Show asset storage statistics
promptfoo assets stats

# Clean up old assets (dry run)
promptfoo assets cleanup --dry-run

# Clean up assets older than 30 days
promptfoo assets cleanup --max-age 30

# Clean up only orphaned files (missing metadata)
promptfoo assets cleanup --orphaned-only

# Clean up with custom age threshold
promptfoo assets cleanup --max-age 7
```

### Cleanup Options

- `--dry-run`: Show what would be deleted without actually deleting
- `--max-age <days>`: Delete assets older than specified days (default: 30)
- `--orphaned-only`: Only delete files without metadata

### Environment Variables

- `PROMPTFOO_ASSET_MAX_AGE_DAYS`: Default maximum age for cleanup (default: 30)

## Troubleshooting

### Images Not Loading

1. Check if asset storage is enabled: `echo $PROMPTFOO_USE_ASSET_STORAGE`
2. Check disk space: `df -h ~/.promptfoo/assets`
3. Check permissions: `ls -la ~/.promptfoo/assets/`
4. Check server logs for errors

### Disk Space Issues

If you're running low on disk space:

1. Check asset storage size: `promptfoo assets stats`
2. Find large evaluations: `du -sh ~/.promptfoo/assets/*/* | sort -h`
3. Run cleanup: `promptfoo assets cleanup --dry-run`
4. Archive or delete old evaluations as needed

### Performance Issues

1. Check metrics at `/api/assets/metrics`
2. Monitor disk I/O: `iostat -x 1`
3. Check file count: `find ~/.promptfoo/assets -type f | wc -l`
4. Run cleanup to remove old assets: `promptfoo assets cleanup`

## Future Enhancements

- Cloud storage support (S3, GCS)
- Asset deduplication
- Automatic cleanup of old assets
- CDN integration
- Asset compression
