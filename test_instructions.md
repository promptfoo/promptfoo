# Model Audit Persistent Storage - Test Instructions

This document provides comprehensive test instructions for the model audit persistent storage feature implemented in PR #5168.

## Prerequisites

1. Ensure you're on the feature branch:

```bash
git checkout feat/model-audit-persistent-storage
```

2. Install dependencies and build:

```bash
npm install
npm run build
```

3. Start the local development environment:

```bash
npm run dev
```

**Note:** All CLI commands use `npm run local --` to run the local development version instead of the globally installed version.

## Test Plan

**Note:** ModelAudit scans serialized model files (e.g., `.pkl`, `.h5`, `.pt`, `.onnx`, `.safetensors`), not Python source files. The test instructions use `.pkl` files as examples.

### 1. Database Migration Test

Verify the database migration creates the new table:

```bash
# Check if migration runs successfully
npm run db:migrate

# Verify table exists (optional - requires sqlite3)
sqlite3 ~/.promptfoo/promptfoo.db "SELECT name FROM sqlite_master WHERE type='table' AND name='model_audit_scans';"
```

### 2. CLI Tests

#### 2.1 Basic Model Scan (saves by default)

```bash
# Create a test model file (pickle format)
python -c "
import pickle
import numpy as np

# Create a simple model (sklearn-like)
class SimpleModel:
    def __init__(self):
        self.weights = np.random.rand(10, 10)

    def predict(self, X):
        return X @ self.weights

model = SimpleModel()
with open('test_model.pkl', 'wb') as f:
    pickle.dump(model, f)
"

# Run a basic scan (saves to database by default)
npm run local -- scan-model test_model.pkl

# Run a scan without saving to database
npm run local -- scan-model test_model.py --no-write
```

#### 2.2 Model Scan with Description

```bash
# Scan with description (saves by default)
npm run local -- scan-model test_model.pkl --description "Test scan of pickled model"

# Scan multiple files with description
npm run local -- scan-model test_model.pkl examples/ --description "Multi-path scan test"
```

#### 2.3 List Saved Scans

```bash
# List all scans
npm run local -- list scans

# List with limit
npm run local -- list scans -n 5

# List IDs only
npm run local -- list scans --ids-only
```

#### 2.4 Show Scan Details

```bash
# Get the scan ID from the list command above, then:
# Replace <scan-id> with actual ID like scan-ABC-2025-01-04T12:00:00
npm run local -- show scan <scan-id>

# Or use the shorthand
npm run local -- show <scan-id>

# Show the most recent scan
npm run local -- show scan latest
```

#### 2.5 Export Scan

```bash
# Export to file
npm run local -- export <scan-id> -o exported_scan.json

# Export to stdout
npm run local -- export <scan-id>

# Export the most recent scan
npm run local -- export latest -o latest_scan.json
```

#### 2.6 Import Scan

```bash
# Import the exported scan
npm run local -- import exported_scan.json

# Import with force (overwrites existing)
npm run local -- import exported_scan.json --force
```

#### 2.7 Delete Scan

```bash
# Delete specific scan
npm run local -- delete scan <scan-id>

# Delete all scans (will prompt for confirmation)
npm run local -- delete scan --all
```

### 3. Web UI Tests

Keep the dev server running (`npm run dev`) and open http://localhost:3000/model-audit

#### 3.1 Initial Page Load

1. Navigate to the Model Audit page
2. Verify the page loads without errors
3. Check that the installation status shows "Ready" (green checkmark)

#### 3.2 Run a Scan from UI

1. **Add a path to scan:**
   - Click "Add Path"
   - Enter a file path (e.g., `test_model.pkl`)
   - Verify the path is validated and added to the list

2. **Add a description:**
   - Enter a description in the "Scan Description" field
   - E.g., "UI test scan"

3. **Run the scan:**
   - Click "Run Security Scan"
   - Wait for the scan to complete
   - Verify results are displayed in the Results tab

4. **Check notification:**
   - Verify a snackbar notification appears showing the scan ID

#### 3.3 View Scan History

1. Click on the "History" tab
2. Verify your saved scans appear in the list
3. Check that the table shows:
   - Scan ID
   - Date
   - Path
   - Author
   - Issue count
   - Description

#### 3.4 View Historical Scan

1. In the History tab, click "View" on any scan
2. Verify it loads the scan results
3. Confirm you're redirected to the Results tab
4. Check that all scan details are displayed correctly

#### 3.5 Delete from History

1. In the History tab, click "Delete" on a scan
2. Confirm the deletion in the dialog
3. Verify the scan is removed from the list

### 4. API Tests

Test the API endpoints directly:

#### 4.1 List Scans API

```bash
# List scans with pagination
curl http://localhost:15500/api/model-audit/scans?limit=10&offset=0

# Test pagination validation
curl http://localhost:15500/api/model-audit/scans?limit=150&offset=-5
# Should clamp limit to 100 and offset to 0
```

#### 4.2 Get Specific Scan API

```bash
# Get scan details (replace with actual scan ID)
curl http://localhost:15500/api/model-audit/scans/<scan-id>

# Test invalid scan ID
curl http://localhost:15500/api/model-audit/scans/invalid-id
# Should return 400 error
```

#### 4.3 Delete Scan API

```bash
# Delete a scan (replace with actual scan ID)
curl -X DELETE http://localhost:15500/api/model-audit/scans/<scan-id>
```

### 5. Edge Cases and Error Handling

#### 5.1 Invalid Paths

```bash
# Non-existent file
npm run local -- scan-model /path/that/does/not/exist.py

# Empty path
npm run local -- scan-model ""
```

#### 5.2 Import/Export Edge Cases

```bash
# Create a malformed JSON file
echo '{"invalid": "json"' > bad.json
npm run local -- import bad.json

# Import eval instead of scan
npm run local -- export eval-123 -o eval.json
npm run local -- import eval.json
# Should handle eval import correctly
```

#### 5.3 Database Integrity

```bash
# Try to import duplicate scan ID
npm run local -- export <scan-id> -o scan1.json
npm run local -- import scan1.json
# Should fail with duplicate ID error

# Import with force
npm run local -- import scan1.json --force
# Should overwrite existing scan
```

### 6. Performance Tests

```bash
# Scan a large directory
npm run local -- scan-model /path/to/large/ml/project --description "Performance test"

# List many scans
# First create multiple scans
for i in {1..20}; do
  python -c "import pickle; pickle.dump({'model': $i}, open('model_$i.pkl', 'wb'))"
  npm run local -- scan-model model_$i.pkl --description "Test $i"
done

# Then list with pagination
npm run local -- list scans -n 10
```

### 7. Cleanup

```bash
# Remove test files
rm -f test_model.pkl model_*.pkl exported_scan.json eval.json bad.json

# Delete all test scans (optional)
npm run local -- delete scan --all
```

## Expected Behaviors

### Success Criteria

1. ✅ Scans save by default with unique IDs in format `scan-XXX-YYYY-MM-DDTHH:mm:ss`
2. ✅ The `--no-write` flag prevents saving to database
3. ✅ Scan results persist across application restarts
4. ✅ UI shows scan history with proper pagination
5. ✅ Export/import maintains data integrity
6. ✅ Delete operations work for individual and bulk deletion
7. ✅ API validates scan ID format (must start with 'scan-')
8. ✅ Pagination parameters are validated (limit 1-100, offset >= 0)
9. ✅ Type safety is maintained (no TypeScript errors)
10. ✅ ModelAudit and promptfoo versions are recorded with each scan
11. ✅ `latest` alias works for show and export commands

### Known Limitations

1. SQLite JSON queries for issue counting may be slow with very large result sets
2. Windows paths may need special handling (use forward slashes or escape backslashes)
3. ModelAudit must be installed separately (`pip install modelaudit`)

## Troubleshooting

If you encounter issues:

1. **ModelAudit not installed:**

   ```bash
   pip install modelaudit
   ```

2. **Database issues:**

   ```bash
   # Reset database (WARNING: deletes all data)
   rm ~/.promptfoo/promptfoo.db
   npm run db:migrate
   ```

3. **Build issues:**

   ```bash
   npm run build:clean
   npm run build
   ```

4. **Check logs:**
   - CLI logs appear in terminal
   - API logs appear in the dev server terminal
   - Browser console for UI errors

## Verification Checklist

- [ ] Database migration creates table successfully
- [ ] CLI scan-model command saves to database by default
- [ ] CLI scan-model --no-write prevents saving to database
- [ ] CLI list scans shows saved scans
- [ ] CLI show scan displays detailed results
- [ ] CLI export/import maintains data integrity
- [ ] CLI delete removes scans correctly
- [ ] Web UI can run and save scans
- [ ] Web UI displays scan history
- [ ] Web UI can view historical scans
- [ ] Web UI can delete scans
- [ ] API endpoints validate input correctly
- [ ] API pagination works as expected
- [ ] Error cases handled gracefully
- [ ] Performance acceptable with multiple scans
