# Testing Model Scan Deduplication

This guide shows how to test the deduplication feature with real HuggingFace models.

---

## Prerequisites

1. **ModelAudit installed**:
   ```bash
   # Check if installed
   rye run modelaudit --version
   # Should show: modelaudit, version 0.2.13 (or later)
   ```

2. **Promptfoo built**:
   ```bash
   cd /Users/yashchhabria/projects/bothfoos/promptfoo-modelaudit_hash_check
   npm run build
   ```

---

## Method 1: Using the Built CLI Directly (Recommended)

```bash
cd /Users/yashchhabria/projects/bothfoos/promptfoo-modelaudit_hash_check

# Test with a small HuggingFace model
node dist/src/main.js scan-model hf://scikit-learn-examples/example
```

**Expected Output**:
```
Running model scan on: hf://scikit-learn-examples/example
[ModelAudit output...]
✓ Results saved to database with ID: scan-xxx-2025-10-28...
```

---

## Method 2: Using npm link

```bash
# Link the CLI globally
cd /Users/yashchhabria/projects/bothfoos/promptfoo-modelaudit_hash_check
npm link

# Now use it anywhere
promptfoo scan-model hf://openai-community/gpt2
```

---

## 🧪 Test Scenarios

### Test 1: First Scan (Should Proceed)

Scan a model that hasn't been scanned yet:

```bash
cd /Users/yashchhabria/projects/bothfoos/promptfoo-modelaudit_hash_check

# Small model for quick testing (~4MB)
node dist/src/main.js scan-model hf://scikit-learn-examples/example

# Or medium-sized model (~240MB) - takes longer
node dist/src/main.js scan-model hf://facebook/opt-125m
```

**What happens**:
1. ✅ Fetches HuggingFace metadata (revision SHA)
2. ✅ Checks database - no existing scan found
3. ✅ Downloads model from HuggingFace
4. ✅ Runs ModelAudit scan
5. ✅ Saves results with revision tracking

**Expected output includes**:
```
Running model scan on: hf://scikit-learn-examples/example
[Download progress...]
[Scan progress...]

Model Audit Summary
==================================================
✓ No issues found. X checks passed.
Scanned Y files (Z MB)
Duration: N seconds

✓ Results saved to database with ID: scan-abc-2025-10-28T...
```

---

### Test 2: Duplicate Scan (Should Skip)

Run the **exact same command** again:

```bash
# Same model as Test 1
node dist/src/main.js scan-model hf://scikit-learn-examples/example
```

**What happens**:
1. ✅ Fetches HuggingFace metadata
2. ✅ Checks database - **FOUND existing scan!**
3. ⚠️  **DEDUPLICATION TRIGGERED**
4. 🛑 **Exits early** (no download, no scan)

**Expected output**:
```
✓ Model already scanned
  Model: scikit-learn-examples/example
  Revision: f91a8fc15a48ff8cbedbc840b185d406059c3727
  Previous scan: 2025-10-28T...
  Scan ID: scan-abc-2025-10-28T...

Use --force to scan anyway, or view existing results with:
  promptfoo view scan-abc-2025-10-28T...
```

**No download happens! No scan happens! 🎉**

---

### Test 3: Force Override

Use the `--force` flag to override deduplication:

```bash
# Force rescan even though it was already scanned
node dist/src/main.js scan-model hf://scikit-learn-examples/example --force
```

**What happens**:
1. ✅ Skips deduplication check (due to --force)
2. ✅ Downloads and scans anyway
3. ✅ Creates new scan record (with updated revision info)

**Expected output**:
```
Running model scan on: hf://scikit-learn-examples/example
[Download and scan proceed normally...]
✓ Results saved to database with ID: scan-xyz-2025-10-28T...
```

---

### Test 4: Verify in Database

Check that revision tracking is working:

```bash
sqlite3 ~/.promptfoo/promptfoo.db

# Show recent scans with revision info
SELECT
  id,
  model_id,
  revision_sha,
  model_source,
  datetime(created_at/1000, 'unixepoch') as created
FROM model_audits
ORDER BY created_at DESC
LIMIT 5;
```

**Expected output**:
```
scan-abc-2025-10-28T23:50:00|scikit-learn-examples/example|f91a8fc15a48ff8cbedbc840b185d406059c3727|huggingface|2025-10-28 23:50:00
```

You should see:
- ✅ `model_id` populated
- ✅ `revision_sha` populated (40-character Git SHA)
- ✅ `model_source` = "huggingface"

---

## 🎯 Recommended Test Models

### Small Models (Fast Testing)
```bash
# ~4MB - Very quick
node dist/src/main.js scan-model hf://scikit-learn-examples/example

# ~10MB - Still quick
node dist/src/main.js scan-model hf://lysandre/tiny-vit-random
```

### Medium Models (Real-World Testing)
```bash
# ~240MB - Takes a few minutes
node dist/src/main.js scan-model hf://facebook/opt-125m

# ~500MB - GPT-2 model
node dist/src/main.js scan-model hf://openai-community/gpt2
```

### Large Models (Stress Testing)
```bash
# ~2GB+ - Only if you have time and bandwidth!
node dist/src/main.js scan-model hf://facebook/opt-1.3b
```

**Pro tip**: Start with small models for quick validation!

---

## 📊 Measuring Deduplication Benefit

Compare the time for first scan vs duplicate:

```bash
# First scan - Downloads and scans
time node dist/src/main.js scan-model hf://facebook/opt-125m
# Real time: ~3-5 minutes (download + scan)

# Duplicate scan - Deduplication kicks in
time node dist/src/main.js scan-model hf://facebook/opt-125m
# Real time: ~1 second (just API check!)

# That's 99%+ time savings! 🚀
```

---

## 🔍 Debug Mode

See detailed logging:

```bash
# Set debug environment variable
DEBUG=promptfoo:* node dist/src/main.js scan-model hf://scikit-learn-examples/example

# Or use verbose flag
node dist/src/main.js scan-model hf://scikit-learn-examples/example -v
```

---

## 🧹 Clean Up Test Scans

Remove test scans from database:

```bash
sqlite3 ~/.promptfoo/promptfoo.db

-- View test scans
SELECT id, model_id FROM model_audits WHERE model_id LIKE '%example%';

-- Delete specific scan
DELETE FROM model_audits WHERE id = 'scan-abc-2025-10-28T...';

-- Or delete all test scans
DELETE FROM model_audits WHERE model_id = 'scikit-learn-examples/example';
```

---

## ✅ Success Checklist

After testing, verify:

- [ ] First scan completes and saves to database
- [ ] Duplicate scan is detected and skipped
- [ ] `revision_sha` is populated in database
- [ ] `--force` flag overrides deduplication
- [ ] Time savings measured (99%+ for duplicate scans)
- [ ] No errors in console output
- [ ] Database queries work (`ModelAudit.findByRevision()`)

---

## 🐛 Troubleshooting

### Issue: "ModelAudit is not installed"

**Solution**: Install ModelAudit first:
```bash
cd /Users/yashchhabria/projects/modelaudit
pip install -e .
# Or using rye
rye sync
```

### Issue: "Failed to fetch HuggingFace metadata"

**Causes**:
- Private/deleted model
- Network issues
- HuggingFace API down

**Solution**: Try a different model or check network connection

### Issue: Deduplication not working

**Check**:
1. Migration applied?
   ```bash
   sqlite3 ~/.promptfoo/promptfoo.db "PRAGMA table_info(model_audits);"
   # Should show revision_sha column
   ```

2. Build up to date?
   ```bash
   cd /Users/yashchhabria/projects/bothfoos/promptfoo-modelaudit_hash_check
   npm run build
   ```

3. Using correct path?
   ```bash
   # Use the built version
   node dist/src/main.js scan-model ...
   ```

---

## 📝 Example Test Session

Complete test session from scratch:

```bash
# 1. Build the CLI
cd /Users/yashchhabria/projects/bothfoos/promptfoo-modelaudit_hash_check
npm run build

# 2. First scan (should proceed)
echo "=== Test 1: First Scan ==="
time node dist/src/main.js scan-model hf://scikit-learn-examples/example

# 3. Duplicate scan (should skip)
echo ""
echo "=== Test 2: Duplicate Scan (should skip) ==="
time node dist/src/main.js scan-model hf://scikit-learn-examples/example

# 4. Force scan (should proceed)
echo ""
echo "=== Test 3: Force Scan ==="
time node dist/src/main.js scan-model hf://scikit-learn-examples/example --force

# 5. Verify in database
echo ""
echo "=== Test 4: Database Verification ==="
sqlite3 ~/.promptfoo/promptfoo.db "SELECT id, model_id, revision_sha FROM model_audits WHERE model_id = 'scikit-learn-examples/example' ORDER BY created_at DESC LIMIT 3;"

# 6. Clean up
echo ""
echo "=== Cleanup ==="
sqlite3 ~/.promptfoo/promptfoo.db "DELETE FROM model_audits WHERE model_id = 'scikit-learn-examples/example';"
echo "✓ Test scans deleted"
```

Save this as `test-dedup.sh` and run with `bash test-dedup.sh`

---

## 🎉 What Success Looks Like

**First Scan**:
```
Running model scan on: hf://scikit-learn-examples/example
[Downloads model...]
[Runs scan...]
✓ Results saved to database
```

**Duplicate Scan**:
```
✓ Model already scanned
  Model: scikit-learn-examples/example
  Revision: f91a8fc15a48ff...
[Exits immediately - no download, no scan!]
```

**Time Comparison**:
- First scan: 2-3 minutes
- Duplicate scan: < 1 second
- **Savings: 99%+** 🚀

---

**Questions?** Check the implementation in:
- `src/commands/modelScan.ts` - Deduplication logic
- `src/models/modelAudit.ts` - Database queries
- `src/util/huggingfaceMetadata.ts` - HF API integration
