# Asset Storage: Sharing, Export, and Import Analysis

## Current Status

After analyzing the codebase, I've identified that **the asset storage system is NOT integrated with sharing, exporting, or importing functionality**. This is a critical gap that needs to be addressed.

## Current Behavior

### 1. Sharing (`promptfoo share`)

**What happens now:**
- When sharing an eval, the system sends the entire eval data including results to the remote server
- The `share.ts` file sends results in chunks, but it sends the **full result objects** including any base64 data
- Asset URLs like `asset://eval-123/result-456/asset-789` are sent as-is
- The remote server and web viewer won't be able to resolve these URLs

**Problems:**
- Remote servers cannot access local asset files
- Asset URLs are meaningless outside the local environment
- Shared evals with asset storage enabled will show broken images/audio

### 2. Export (`promptfoo export`)

**What happens now:**
- Export calls `eval.toEvaluateSummary()` which returns all results
- Results contain `output` fields with asset URLs (`asset://...`)
- The exported JSON does NOT include the actual asset files
- Asset metadata is lost

**Problems:**
- Exported evals are incomplete - missing actual image/audio data
- Cannot be imported on another machine
- Loss of data portability

### 3. Import (`promptfoo import`)

**What happens now:**
- Import expects complete result data in the JSON
- Asset URLs in imported data point to non-existent files
- No mechanism to import associated asset files

**Problems:**
- Imported evals with asset storage will have broken media
- No way to transfer assets between machines

## Required Fixes

### Option 1: Inline Assets During Export/Share (Recommended)

**Implementation:**
1. When exporting or sharing, detect asset URLs in results
2. Load the actual asset data and convert back to base64
3. Replace asset URLs with data URLs before sending/saving
4. This maintains backward compatibility

```typescript
// Example implementation in eval.ts
async toEvaluateSummary(): Promise<EvaluateSummaryV3> {
  const results = await this.getResults();
  
  // If asset storage is enabled, inline the assets
  if (isAssetStorageEnabled()) {
    const assetStore = getAssetStore();
    for (const result of results) {
      if (result.response?.output?.includes('asset://')) {
        // Convert asset URLs back to data URLs
        result.response.output = await this.inlineAssets(result.response.output);
      }
    }
  }
  
  return {
    version: 3,
    timestamp: new Date(this.createdAt).toISOString(),
    results,
    prompts: this.prompts,
    stats: await this.getStats(),
  };
}
```

### Option 2: Asset Bundle Export

**Implementation:**
1. Create a new export format (`.promptfoo` archive)
2. Include both JSON data and asset files
3. Use ZIP or TAR format
4. Update import to handle bundles

```typescript
// Example: Export as ZIP
async exportWithAssets(outputPath: string) {
  const zip = new JSZip();
  
  // Add eval data
  const evalData = await this.toResultsFile();
  zip.file('eval.json', JSON.stringify(evalData));
  
  // Add assets
  const assetPaths = await this.collectAssetPaths();
  for (const assetPath of assetPaths) {
    const data = await assetStore.load(...);
    zip.file(`assets/${assetPath}`, data);
  }
  
  // Save zip
  await zip.generateNodeStream().pipe(fs.createWriteStream(outputPath));
}
```

### Option 3: Remote Asset Upload

**Implementation:**
1. When sharing, upload assets to the remote server
2. Update asset URLs to point to remote locations
3. Requires API changes on the server side

## Immediate Workaround

Until this is properly fixed, users should:

1. **Disable asset storage when sharing/exporting:**
   ```bash
   PROMPTFOO_USE_ASSET_STORAGE=false promptfoo share
   ```

2. **Run migration in reverse before sharing:**
   ```bash
   # Convert assets back to base64 (not implemented yet)
   promptfoo assets migrate --reverse
   ```

## Implementation Priority

### High Priority:
1. **Fix Export/Share** - Implement Option 1 (inline assets) for backward compatibility
2. **Add warning** - Warn users when sharing/exporting with asset storage enabled
3. **Document limitations** - Update docs to explain current limitations

### Medium Priority:
1. **Asset bundle format** - Implement Option 2 for better portability
2. **Migration tools** - Add reverse migration capability

### Low Priority:
1. **Remote asset upload** - Requires server-side changes

## Code Changes Required

### 1. Update `toEvaluateSummary()` in `src/models/eval.ts`:
```typescript
async toEvaluateSummary(): Promise<EvaluateSummaryV3 | EvaluateSummaryV2> {
  // ... existing code ...
  
  // Inline assets for sharing/export
  if (isAssetStorageEnabled()) {
    results = await this.inlineAssetsInResults(results);
  }
  
  return {
    version: 3,
    timestamp: new Date(this.createdAt).toISOString(),
    results,
    prompts: this.prompts,
    stats,
  };
}

private async inlineAssetsInResults(results: EvaluateResult[]): Promise<EvaluateResult[]> {
  const assetStore = getAssetStore();
  const assetUrlRegex = /asset:\/\/([^\/]+)\/([^\/]+)\/([^)]+)/g;
  
  for (const result of results) {
    if (result.response?.output && typeof result.response.output === 'string') {
      const matches = [...result.response.output.matchAll(assetUrlRegex)];
      
      for (const match of matches) {
        const [fullMatch, evalId, resultId, assetId] = match;
        try {
          const metadata = await assetStore.getMetadata(evalId, resultId, assetId);
          const data = await assetStore.load(evalId, resultId, assetId);
          const dataUrl = `data:${metadata.mimeType};base64,${data.toString('base64')}`;
          
          result.response.output = result.response.output.replace(
            fullMatch,
            dataUrl
          );
        } catch (error) {
          logger.warn(`Failed to inline asset ${fullMatch}: ${error}`);
        }
      }
    }
  }
  
  return results;
}
```

### 2. Add Warning in `src/commands/share.ts`:
```typescript
if (isAssetStorageEnabled()) {
  logger.warn(
    chalk.yellow(
      'Warning: Asset storage is enabled. Large files will be inlined for sharing, which may take time.'
    )
  );
}
```

### 3. Update Import to Handle Data URLs:
The import should already handle data URLs correctly since they're just strings in the JSON.

## Testing Requirements

1. **Export with assets** - Verify assets are inlined
2. **Share with assets** - Verify remote viewer can see images/audio
3. **Import exported data** - Verify assets display correctly
4. **Large file handling** - Test with large images/audio
5. **Performance impact** - Measure time to inline assets

## Conclusion

The asset storage system currently breaks sharing and export functionality. The recommended immediate fix is to inline assets during export/share operations, converting asset URLs back to data URLs. This maintains backward compatibility while preserving the benefits of asset storage during normal operation.