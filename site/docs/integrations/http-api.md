---
sidebar_label: HTTP API
description: Programmatic access to Promptfoo evaluation data via the HTTP API.
---

# HTTP API

Promptfoo exposes an HTTP API for programmatic access to evaluation data. Use it to build integrations, dashboards, or automation workflows.

:::note
The API is partially typed and relatively stable, but subject to change. Schemas are defined in [`src/server/apiSchemas.ts`](https://github.com/promptfoo/promptfoo/blob/main/src/server/apiSchemas.ts). Contributions welcome.
:::

## Getting Started

Start the server:

```bash
promptfoo view
```

The API is available at `http://localhost:3000/api`.

## Error Responses

All endpoints return errors in this format:

```json
{
  "error": "Error message describing what went wrong"
}
```

## Eval Endpoints

### Get Evaluation Table

```
GET /api/eval/:id/table
```

Retrieve paginated results in table format. This is the primary endpoint for fetching evaluation data.

**Query Parameters:**

| Parameter           | Type   | Description                                              |
| ------------------- | ------ | -------------------------------------------------------- |
| `limit`             | number | Results per page (default: 50)                           |
| `offset`            | number | Pagination offset (default: 0)                           |
| `filterMode`        | string | `all`, `failures`, `different`, `highlights`, or `errors`|
| `search`            | string | Search text                                              |
| `filter`            | string | Metadata filter (repeatable)                             |
| `comparisonEvalIds` | string | Compare with other evals (repeatable)                    |
| `format`            | string | `csv` or `json` for export                               |

**Example:**

```bash
# Get paginated results
curl "http://localhost:3000/api/eval/abc123/table?limit=100&offset=0"

# Export as CSV
curl "http://localhost:3000/api/eval/abc123/table?format=csv" -o results.csv

# Filter to failures only
curl "http://localhost:3000/api/eval/abc123/table?filterMode=failures"
```

### Query Results

```
GET /api/eval/:evalId/results
```

Retrieve evaluation results with optional filters. Useful for accessing manual ratings or building sync integrations.

**Query Parameters:**

| Parameter        | Type    | Description                               |
| ---------------- | ------- | ----------------------------------------- |
| `testIdx`        | integer | Filter by test index (0-based)            |
| `promptIdx`      | integer | Filter by prompt/provider index (0-based) |
| `hasHumanRating` | boolean | Only return results with manual ratings   |
| `success`        | boolean | Filter by pass (`true`) or fail (`false`) |

**Example:**

```bash
# Get all results
curl http://localhost:3000/api/eval/abc123/results

# Get results for test index 5
curl "http://localhost:3000/api/eval/abc123/results?testIdx=5"

# Get manually-rated results
curl "http://localhost:3000/api/eval/abc123/results?hasHumanRating=true"
```

**Response:**

```json
{
  "results": [
    {
      "id": "result-uuid",
      "evalId": "abc123",
      "testIdx": 0,
      "promptIdx": 0,
      "testCase": {
        "vars": { "question": "What is 2+2?" },
        "metadata": { "itemId": "q-001" }
      },
      "prompt": { "raw": "Answer: {{question}}", "label": "basic" },
      "provider": { "id": "openai:gpt-4" },
      "output": "4",
      "success": true,
      "score": 1.0,
      "latencyMs": 523,
      "cost": 0.002,
      "gradingResult": {
        "pass": true,
        "score": 1.0,
        "componentResults": []
      }
    }
  ],
  "count": 1
}
```

### Update Result Rating

```
POST /api/eval/:evalId/results/:id/rating
```

Update the manual rating for a specific result. Called when clicking thumbs up/down in the UI.

**Request Body:**

```json
{
  "pass": true,
  "score": 1.0,
  "reason": "Manual result",
  "componentResults": [
    {
      "pass": true,
      "score": 1.0,
      "assertion": { "type": "human" }
    }
  ]
}
```

### Get Metadata Keys

```
GET /api/eval/:id/metadata-keys
```

Retrieve all unique metadata keys from test cases in an evaluation.

**Query Parameters:**

| Parameter           | Type     | Description                        |
| ------------------- | -------- | ---------------------------------- |
| `comparisonEvalIds` | string[] | Include keys from comparison evals |

**Response:**

```json
{
  "keys": ["itemId", "category", "dataset"]
}
```

### Get Metadata Values

```
GET /api/eval/:id/metadata-values
```

Retrieve all unique values for a specific metadata key.

**Query Parameters:**

| Parameter | Type   | Required | Description               |
| --------- | ------ | -------- | ------------------------- |
| `key`     | string | Yes      | The metadata key to query |

**Example:**

```bash
curl "http://localhost:3000/api/eval/abc123/metadata-values?key=category"
```

**Response:**

```json
{
  "values": ["math", "science", "history"]
}
```

### Copy Evaluation

```
POST /api/eval/:id/copy
```

Create a copy of an evaluation with all its results.

**Request Body:**

```json
{
  "description": "Copy of original eval"
}
```

**Response:**

```json
{
  "id": "new-eval-id",
  "distinctTestCount": 50
}
```

### Update Author

```
PATCH /api/eval/:id/author
```

Update the author email for an evaluation.

**Request Body:**

```json
{
  "author": "user@example.com"
}
```

### Delete Evaluation

```
DELETE /api/eval/:id
```

Delete an evaluation and all its results.

### Bulk Delete

```
DELETE /api/eval
```

Delete multiple evaluations.

**Request Body:**

```json
{
  "ids": ["eval-1", "eval-2", "eval-3"]
}
```

## Job Endpoints

### Start Evaluation Job

```
POST /api/eval/job
```

Start an asynchronous evaluation job.

**Request Body:** An `EvaluateTestSuiteWithEvaluateOptions` object containing prompts, providers, and tests.

**Response:**

```json
{
  "id": "job-uuid"
}
```

### Get Job Status

```
GET /api/eval/job/:id
```

Check the status of a running evaluation job.

**Response (in progress):**

```json
{
  "status": "in-progress",
  "progress": 5,
  "total": 10,
  "logs": []
}
```

**Response (complete):**

```json
{
  "status": "complete",
  "result": { },
  "evalId": "abc123",
  "logs": []
}
```

**Response (error):**

```json
{
  "status": "error",
  "logs": ["Error message"]
}
```

## Working with Manual Ratings

When a user clicks thumbs up/down in the UI, a `human` assertion is added:

```json
{
  "gradingResult": {
    "componentResults": [
      {
        "assertion": { "type": "human" },
        "pass": true,
        "score": 1.0
      }
    ]
  }
}
```

To detect manually-rated results:

```javascript
const hasHumanRating = result.gradingResult?.componentResults?.some(
  (cr) => cr.assertion?.type === 'human'
);
```

## Test Case Metadata

Add identifiers to test cases for mapping results back to your data:

```yaml
tests:
  - vars:
      question: "What is 2+2?"
    metadata:
      itemId: "q-001"
      dataset: "math-v1"
```

Metadata is preserved in results and queryable via `/metadata-keys` and `/metadata-values`.

## Contributing

Routes are implemented in [`src/server/routes/`](https://github.com/promptfoo/promptfoo/tree/main/src/server/routes). Contributions to improve type coverage are welcome.
