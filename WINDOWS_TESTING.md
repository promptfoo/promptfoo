# Windows Testing Environment

This document explains how to set up a Windows development environment using Docker to test Windows-specific issues like the Unicode handling test timeout.

## Quick Setup

1. **Start the Windows environment:**

   ```bash
   ./scripts/setup-windows-dev.sh
   ```

2. **Run the failing Unicode test:**
   ```bash
   docker-compose -f docker-compose.windows.yml run --rm promptfoo-windows-test
   ```

## Manual Setup

### Prerequisites

- Docker Desktop with Windows container support enabled
- At least 8GB RAM available for the container

### Build and Run

1. **Build the Windows container:**

   ```bash
   docker-compose -f docker-compose.windows.yml build
   ```

2. **Start development environment:**

   ```bash
   docker-compose -f docker-compose.windows.yml up -d promptfoo-windows
   ```

3. **Access the container:**
   ```bash
   docker exec -it promptfoo-windows-dev powershell
   ```

## Testing the Unicode Issue

The failing test is in `test/providers/pythonCompletion.unicode.test.ts`. To debug:

### Run Specific Test

```bash
# Inside the container
npm test -- test/providers/pythonCompletion.unicode.test.ts --verbose

# Or with increased timeout
npm test -- test/providers/pythonCompletion.unicode.test.ts --testTimeout=30000
```

### Debug Python Execution

```powershell
# Inside the container, test Python Unicode handling directly
python -c "print('🔥 Unicode test: café résumé naïve')"
```

## Using Claude Code in the Container

1. **Install Claude Code in the container:**

   ```powershell
   # Inside the container
   npm install -g @anthropic/claude-code
   ```

2. **Start Claude Code:**

   ```powershell
   claude-code
   ```

3. **Alternative: Use Docker exec from host:**
   ```bash
   # From your Mac, execute Claude Code in the container
   docker exec -it promptfoo-windows-dev powershell -Command "claude-code"
   ```

## Container Services

- `promptfoo-windows`: Development server (port 3000)
- `promptfoo-windows-test`: Test runner service

## Troubleshooting

### Container Won't Start

- Ensure Docker Desktop is set to Windows container mode
- Check available memory (Windows containers require more RAM)
- Verify Docker Desktop is running

### Unicode Test Still Failing

Common Windows-specific issues:

1. **Encoding**: Windows may use different default encoding (CP1252 vs UTF-8)
2. **Line endings**: CRLF vs LF differences
3. **Python path**: Different Python executable paths on Windows
4. **Timeout**: Windows containers may be slower, need increased timeout

### Performance

- Windows containers are slower than Linux containers
- Consider increasing test timeouts for Windows-specific runs
- Use volume mounts carefully to avoid performance issues

## Cleanup

```bash
# Stop and remove containers
docker-compose -f docker-compose.windows.yml down

# Remove volumes
docker-compose -f docker-compose.windows.yml down -v

# Remove images
docker rmi $(docker images -f "reference=*promptfoo*" -q)
```
