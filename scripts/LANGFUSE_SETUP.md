# Langfuse Setup for Development

This guide helps you set up Langfuse and populate it with test data for developing the Langfuse traces integration.

## Option 1: Langfuse Cloud (Recommended for Quick Start)

Langfuse Cloud is free for development and the easiest way to get started.

### Steps

1. **Create an account** at https://cloud.langfuse.com (sign up with GitHub/Google)

2. **Create a new project** (e.g., "promptfoo-dev")

3. **Get API keys**:
   - Go to **Settings** > **API Keys**
   - Click **Create new API keys**
   - Copy both the **Public Key** and **Secret Key**

4. **Set environment variables**:

   ```bash
   export LANGFUSE_PUBLIC_KEY="pk-lf-..."
   export LANGFUSE_SECRET_KEY="sk-lf-..."
   export LANGFUSE_HOST="https://cloud.langfuse.com"
   ```

   Or add to your `.env` file:

   ```
   LANGFUSE_PUBLIC_KEY=pk-lf-...
   LANGFUSE_SECRET_KEY=sk-lf-...
   LANGFUSE_HOST=https://cloud.langfuse.com
   ```

5. **Run the seed script**:

   ```bash
   npx ts-node scripts/langfuse-seed.ts
   ```

6. **View traces** at https://cloud.langfuse.com → Your Project → Traces

---

## Option 2: Local Docker (Self-Hosted)

Run Langfuse locally using Docker Compose for fully offline development.

### Prerequisites

- Docker Desktop installed and running
- ~2GB free disk space

### Steps

1. **Clone Langfuse**:

   ```bash
   git clone https://github.com/langfuse/langfuse.git /tmp/langfuse
   cd /tmp/langfuse
   ```

2. **Start Langfuse**:

   ```bash
   docker compose up -d
   ```

   This starts:
   - Langfuse Web UI on `http://localhost:3000`
   - PostgreSQL database
   - ClickHouse (analytics)
   - Redis (caching)
   - MinIO (blob storage)

3. **Create an account**:
   - Open http://localhost:3000
   - Sign up with any email/password (it's local)
   - Create a new project

4. **Get API keys**:
   - Go to **Settings** > **API Keys**
   - Create and copy your keys

5. **Set environment variables**:

   ```bash
   export LANGFUSE_PUBLIC_KEY="pk-lf-..."
   export LANGFUSE_SECRET_KEY="sk-lf-..."
   export LANGFUSE_HOST="http://localhost:3000"
   ```

6. **Run the seed script**:
   ```bash
   cd /path/to/promptfoo
   npx ts-node scripts/langfuse-seed.ts
   ```

### Stopping Local Langfuse

```bash
cd /tmp/langfuse
docker compose down        # Stop containers
docker compose down -v     # Stop and remove data
```

---

## Verifying the Setup

After running the seed script, you should see:

1. **~16 traces** in your Langfuse project
2. Traces with various **tags**: `seed-data`, `geography`, `programming`, `quality-issue`, etc.
3. A **multi-turn conversation** session: `session_conversation_001`
4. **Quality test traces** with issues like incorrect answers, incomplete responses

### Test Queries for Development

Use these filters in Langfuse UI or API calls:

| Filter                               | Purpose                                  |
| ------------------------------------ | ---------------------------------------- |
| `tags=seed-data`                     | All seed traces                          |
| `tags=quality-issue`                 | Traces with intentional quality problems |
| `tags=conversation`                  | Multi-turn conversation                  |
| `sessionId=session_conversation_001` | Specific session                         |
| `userId=user_alice`                  | Single user's traces                     |
| `tags=programming`                   | Programming-related traces               |

---

## Testing the Integration (Once Built)

After implementing the Langfuse traces integration, test with:

```yaml
# promptfooconfig.yaml
tests: langfuse://traces?tags=seed-data&limit=10

defaultTest:
  assert:
    - type: llm-rubric
      value: 'Response is helpful and accurate'
```

```bash
npm run local -- eval -c promptfooconfig.yaml --no-cache
```

---

## Troubleshooting

### "LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY must be set"

Ensure environment variables are exported in your current shell:

```bash
echo $LANGFUSE_PUBLIC_KEY  # Should show your key
```

### Connection refused (Docker)

1. Check Docker is running: `docker ps`
2. Check Langfuse is up: `docker compose -f /tmp/langfuse/docker-compose.yml ps`
3. Wait 30-60s after `docker compose up` for services to initialize

### Traces not appearing in UI

1. Wait 15-30 seconds (Langfuse processes events asynchronously)
2. Refresh the Traces page
3. Check the script output for errors

### Rate limiting (Cloud)

Langfuse Cloud has generous free tier limits. If you hit limits:

- Use local Docker instead
- Add delays between trace creation in the seed script
